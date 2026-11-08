import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../../core/client/client_gateway.dart';
import 'client_groups_page.dart';
import 'client_members_panel.dart';

class ClientWorkspace extends StatefulWidget {
  const ClientWorkspace({super.key});
  @override
  State<ClientWorkspace> createState() => _ClientWorkspaceState();
}

class _ClientWorkspaceState extends State<ClientWorkspace> {
  late final Uri _origin;
  late final WebViewController _controller;
  late final WebViewClientGateway _gateway;
  Uri? _page;
  String _error = '';
  int _progress = 0, _selected = 0;
  bool _members = false;
  @override
  void initState() {
    super.initState();
    _origin = clientOrigin(
      const String.fromEnvironment(
        'CLASSROOM_WEB_URL',
        defaultValue: 'https://live.xiangyuwenshu.cn',
      ),
    );
    final params = WebViewPlatform.instance is WebKitWebViewPlatform
        ? WebKitWebViewControllerCreationParams(
            allowsInlineMediaPlayback: true,
            mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
          )
        : const PlatformWebViewControllerCreationParams();
    _controller = WebViewController.fromPlatformCreationParams(
      params,
      onPermissionRequest: _permission,
    );
    _gateway = WebViewClientGateway(_controller, _origin);
    _controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'ClassroomClientReply',
        onMessageReceived: (message) => unawaited(_gateway.receive(message)),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onUrlChange: (change) {
            final next = Uri.tryParse(change.url ?? '');
            if (clientSession(next, _origin) != clientSession(_page, _origin)) {
              _gateway.invalidate();
            }
            if (mounted) {
              setState(() {
                _page = next;
                _members = false;
              });
            }
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            return uri != null && ['http', 'https'].contains(uri.scheme)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
          onPageStarted: (url) {
            _gateway.invalidate();
            if (mounted) {
              setState(() {
                _page = Uri.tryParse(url);
                _progress = 0;
                _error = '';
                _members = false;
              });
            }
          },
          onProgress: (value) {
            if (mounted) setState(() => _progress = value);
          },
          onPageFinished: (url) {
            if (mounted) setState(() => _page = Uri.tryParse(url));
          },
          onWebResourceError: (error) {
            if (mounted && error.isForMainFrame == true) {
              setState(() => _error = '课堂页面加载失败，请检查网络后重试。');
            }
          },
        ),
      )
      ..loadRequest(_origin);
    if (_controller.platform case final AndroidWebViewController android) {
      unawaited(android.setMediaPlaybackRequiresUserGesture(false));
    }
  }

  @override
  void dispose() {
    _gateway.invalidate();
    super.dispose();
  }

  Future<void> _permission(WebViewPermissionRequest request) async {
    final uri = Uri.tryParse(await _controller.currentUrl() ?? '');
    if (!trustedClientPage(uri, _origin) || !mounted) {
      await request.deny();
      return;
    }
    final allowed = await showAdaptiveDialog<bool>(
      context: context,
      builder: (context) => AlertDialog.adaptive(
        title: const Text('课堂音视频权限'),
        content: const Text('允许当前课堂使用所请求的摄像头或麦克风？你可以随时在课堂中关闭。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('暂不允许'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('继续'),
          ),
        ],
      ),
    );
    if (allowed != true) {
      await request.deny();
      return;
    }
    var granted = true;
    for (final type in request.types) {
      if (type == WebViewPermissionResourceType.camera) {
        granted = await Permission.camera.request().isGranted && granted;
      } else if (type == WebViewPermissionResourceType.microphone) {
        granted = await Permission.microphone.request().isGranted && granted;
      } else {
        granted = false;
      }
    }
    if (granted &&
        trustedClientPage(
          Uri.tryParse(await _controller.currentUrl() ?? ''),
          _origin,
        )) {
      await request.grant();
    } else {
      await request.deny();
    }
  }

  Future<void> _navigate(int value) async {
    if (value == 0) {
      setState(() => _members = false);
      return;
    }
    if (value == 1) {
      final session = clientSession(_page, _origin);
      if (session == null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('请先进入课堂，再查看花名册。')));
        return;
      }
      if (MediaQuery.sizeOf(context).width >= 760) {
        setState(() => _members = !_members);
        return;
      }
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        constraints: const BoxConstraints(maxWidth: 600),
        builder: (context) => SizedBox(
          height: MediaQuery.sizeOf(context).height * .8,
          child: ClientMembersPanel(
            gateway: _gateway,
            sessionId: session,
            onClose: () => Navigator.pop(context),
          ),
        ),
      );
    } else {
      setState(() => _selected = value);
      await Navigator.push<void>(
        context,
        MaterialPageRoute(builder: (_) => ClientGroupsPage(gateway: _gateway)),
      );
      if (mounted) setState(() => _selected = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = clientSession(_page, _origin),
        ios = Theme.of(context).platform == TargetPlatform.iOS;
    final web = Column(
      children: [
        if (_progress < 100) LinearProgressIndicator(value: _progress / 100),
        if (_error.isNotEmpty)
          MaterialBanner(
            content: Text(_error),
            actions: [
              TextButton(
                onPressed: () => _controller.reload(),
                child: const Text('重新加载'),
              ),
            ],
          ),
        Expanded(child: WebViewWidget(controller: _controller)),
      ],
    );
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (!didPop && await _controller.canGoBack()) {
          await _controller.goBack();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          toolbarHeight: 48,
          title: Text(session == null ? '课堂工作区' : '在线课堂'),
          actions: [
            IconButton(
              onPressed: () => _controller.reload(),
              tooltip: '重新加载页面',
              icon: Icon(ios ? CupertinoIcons.refresh : Icons.refresh),
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: LayoutBuilder(
            builder: (context, box) => Row(
              children: [
                Expanded(child: web),
                if (_members && session != null && box.maxWidth >= 760)
                  SizedBox(
                    width: 360,
                    child: ClientMembersPanel(
                      key: ValueKey(session),
                      gateway: _gateway,
                      sessionId: session,
                      onClose: () => setState(() => _members = false),
                    ),
                  ),
              ],
            ),
          ),
        ),
        bottomNavigationBar: ios
            ? CupertinoTabBar(
                currentIndex: _selected,
                onTap: _navigate,
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(CupertinoIcons.videocam),
                    label: '课堂',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(CupertinoIcons.person_2),
                    label: '花名册',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(CupertinoIcons.person_3),
                    label: '学生分组',
                  ),
                ],
              )
            : NavigationBar(
                selectedIndex: _selected,
                onDestinationSelected: _navigate,
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.school_outlined),
                    label: '课堂',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.people_outline),
                    label: '花名册',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.groups_outlined),
                    label: '学生分组',
                  ),
                ],
              ),
      ),
    );
  }
}
