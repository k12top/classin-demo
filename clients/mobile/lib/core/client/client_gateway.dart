import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:webview_flutter/webview_flutter.dart';

abstract interface class ClientGateway {
  Future<Map<String, dynamic>> request(
    String operation, [
    Map<String, dynamic> args = const {},
  ]);
}

class ClientException implements Exception {
  const ClientException(this.message);
  final String message;
  @override
  String toString() => message;
}

String clientCommandId() => List.generate(
  24,
  (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
).join();
Uri clientOrigin(String value) {
  final uri = Uri.parse(value);
  if (uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      (uri.scheme != 'https' &&
          !(uri.scheme == 'http' &&
              ['localhost', '127.0.0.1', '::1'].contains(uri.host)))) {
    throw const ClientException('请配置 HTTPS 课堂地址。');
  }
  return Uri.parse(uri.origin);
}

bool trustedClientPage(Uri? page, Uri origin) =>
    page != null &&
    page.scheme == origin.scheme &&
    page.host == origin.host &&
    page.port == origin.port;
String? clientSession(Uri? uri, Uri origin) =>
    trustedClientPage(uri, origin) && uri?.path == '/classroom'
    ? uri!.queryParameters['sessionId'] ?? uri.queryParameters['courseId']
    : null;

class ClientRequest {
  const ClientRequest(this.path, {this.body});
  final String path;
  final Map<String, dynamic>? body;
  static ClientRequest build(
    String operation,
    Map<String, dynamic> args,
    Uri page,
    Uri origin,
  ) {
    if (!trustedClientPage(page, origin)) {
      throw const ClientException('请先在工作区登录，再使用人员管理。');
    }
    final sessionId = clientSession(page, origin),
        shareAccess = page.queryParameters['shareAccess'];
    switch (operation) {
      case 'identity':
        return const ClientRequest('/api/auth/me');
      case 'groups':
        return const ClientRequest('/api/groups');
      case 'searchStudents':
        return ClientRequest(
          '/api/users/search?role=student&q=${Uri.encodeQueryComponent('${args['query'] ?? ''}'.trim())}',
        );
      case 'createGroup':
        final name = '${args['name'] ?? ''}'.trim();
        if (name.isEmpty || name.length > 100) {
          throw const ClientException('分组名称为 1–100 个字符。');
        }
        return ClientRequest(
          '/api/groups',
          body: {'action': 'create', 'name': name},
        );
      case 'addMembers':
      case 'removeMembers':
        final members = args[operation == 'addMembers' ? 'members' : 'userIds'];
        if (args['groupId'] is! String ||
            (args['groupId'] as String).isEmpty ||
            members is! List ||
            members.isEmpty ||
            members.length > 100) {
          throw const ClientException('请在分组中选择 1–100 名学生。');
        }
        return ClientRequest(
          '/api/groups',
          body: {
            'action': operation,
            'groupId': args['groupId'],
            if (operation == 'addMembers')
              'members': members
            else
              'userIds': members,
          },
        );
      case 'runtime':
      case 'command':
        if (sessionId == null ||
            sessionId.isEmpty ||
            (args['sessionId'] != null && args['sessionId'] != sessionId)) {
          throw const ClientException('课堂已切换，请重新打开花名册。');
        }
        final path =
            '/api/sessions/${Uri.encodeComponent(sessionId)}/classroom/';
        if (operation == 'runtime') {
          return ClientRequest(
            '${path}state?scope=runtime${shareAccess == null ? '' : '&shareAccess=${Uri.encodeQueryComponent(shareAccess)}'}',
          );
        }
        const actions = {
          'inviteStage',
          'removeStage',
          'setMediaAllowed',
          'setWhiteboardWritable',
          'giveReward',
          'acknowledgeHand',
          'muteAllMicrophones',
          'unmuteAllMicrophones',
          'removeAllStudentsFromStage',
        };
        if (args['action'] is! Map ||
            !actions.contains((args['action'] as Map)['type']) ||
            args['commandId'] is! String) {
          throw const ClientException('不支持此成员操作。');
        }
        return ClientRequest(
          '${path}actions',
          body: {
            'action': args['action'],
            'commandId': args['commandId'],
            if (args['expectedRevision'] is int)
              'expectedRevision': args['expectedRevision'],
            if (shareAccess != null) 'shareAccess': shareAccess,
          },
        );
      default:
        throw const ClientException('不支持此客户端操作。');
    }
  }
}

/// Fixed same-origin requests reuse HttpOnly login cookies; tokens never cross the bridge.
class WebViewClientGateway implements ClientGateway {
  WebViewClientGateway(this.controller, this.origin);
  final WebViewController controller;
  final Uri origin;
  final Map<String, Completer<Map<String, dynamic>>> _pending = {};
  void invalidate() {
    for (final pending in _pending.values) {
      if (!pending.isCompleted) {
        pending.completeError(const ClientException('页面已切换，请重新操作。'));
      }
    }
    _pending.clear();
  }

  Future<void> receive(JavaScriptMessage message) async {
    final page = Uri.tryParse(await controller.currentUrl() ?? '');
    if (!trustedClientPage(page, origin)) return;
    try {
      final value = jsonDecode(message.message) as Map<String, dynamic>,
          pending = _pending.remove(value['id']);
      if (pending == null) return;
      if (value['ok'] == true) {
        pending.complete(Map<String, dynamic>.from(value['data'] as Map));
      } else if (value['status'] == 401) {
        pending.complete({'user': null});
      } else {
        pending.completeError(
          ClientException(value['error'] as String? ?? '请求未确认，请刷新后重试。'),
        );
      }
    } catch (_) {
      /* Unrelated frame messages cannot resolve a pending request. */
    }
  }

  @override
  Future<Map<String, dynamic>> request(
    String operation, [
    Map<String, dynamic> args = const {},
  ]) async {
    final page = Uri.tryParse(await controller.currentUrl() ?? '');
    if (page == null) throw const ClientException('工作区还未就绪。');
    final spec = ClientRequest.build(operation, args, page, origin),
        id = clientCommandId(),
        pending = Completer<Map<String, dynamic>>();
    _pending[id] = pending;
    final payload = jsonEncode({
      'id': id,
      'path': spec.path,
      'body': spec.body,
    });
    try {
      final response = pending.future.timeout(
        const Duration(seconds: 18),
        onTimeout: () => throw const ClientException('网络较慢，请刷新检查操作结果。'),
      );
      final values = await Future.wait<dynamic>([
        controller.runJavaScript(
          '''void(async()=>{const q=$payload;try{if(location.origin!==${jsonEncode(origin.origin)}||location.pathname+location.search!==${jsonEncode(page.path + (page.hasQuery ? '?${page.query}' : ''))})throw Error('页面来源已改变');const r=await fetch(q.path,{method:q.body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:q.body?{'Content-Type':'application/json'}:{},body:q.body?JSON.stringify(q.body):undefined,signal:AbortSignal.timeout(15000)});const data=await r.json();ClassroomClientReply.postMessage(JSON.stringify({id:q.id,ok:r.ok,status:r.status,data,error:data.error}));}catch(e){ClassroomClientReply.postMessage(JSON.stringify({id:q.id,ok:false,error:'网络请求未确认，请刷新后重试。'}));}})();''',
        ),
        response,
      ], eagerError: true);
      return values[1] as Map<String, dynamic>;
    } finally {
      _pending.remove(id);
      if (!pending.isCompleted) {
        pending.completeError(const ClientException('页面请求已取消。'));
      }
    }
  }
}
