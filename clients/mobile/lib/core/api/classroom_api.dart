import 'dart:convert';
import 'dart:io';

import '../config/classroom_config.dart';

class ClassroomBootstrap {
  const ClassroomBootstrap({
    required this.courseName,
    required this.sessionId,
    required this.mode,
    required this.teacherName,
    required this.runtimeStatus,
    required this.revision,
    required this.canShareScreen,
    required this.canManageStage,
  });

  factory ClassroomBootstrap.fromJson(Map<String, dynamic> json) {
    final course = json['course'] is Map
        ? Map<String, dynamic>.from(json['course'] as Map)
        : const <String, dynamic>{};
    final runtime = json['runtime'] is Map
        ? Map<String, dynamic>.from(json['runtime'] as Map)
        : const <String, dynamic>{};
    final capabilities = json['capabilities'] is Map
        ? Map<String, dynamic>.from(json['capabilities'] as Map)
        : const <String, dynamic>{};

    return ClassroomBootstrap(
      courseName: course['name'] as String? ?? '课堂',
      sessionId: course['sessionId'] as String? ?? '',
      mode: json['mode'] as String? ?? 'smallClass',
      teacherName: course['teacherName'] as String? ?? '',
      runtimeStatus: runtime['status'] as String? ?? 'waiting',
      revision: runtime['revision'] as int? ?? 0,
      canShareScreen: capabilities['canShareScreen'] == true,
      canManageStage: capabilities['canManageStage'] == true,
    );
  }

  final String courseName;
  final String sessionId;
  final String mode;
  final String teacherName;
  final String runtimeStatus;
  final int revision;
  final bool canShareScreen;
  final bool canManageStage;
}

class ClassroomApi {
  const ClassroomApi(this.config);

  final ClassroomConfig config;

  Future<ClassroomBootstrap> bootstrap() async {
    final base = config.apiBaseUrl.replaceFirst(RegExp(r'/$'), '');
    final uri = Uri.parse('$base/api/classroom/session');
    final client = HttpClient();

    try {
      final request = await client.postUrl(uri);
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer ${config.accessToken}');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({
        'sessionId': config.sessionId,
        if (config.shareAccess.isNotEmpty) 'shareAccess': config.shareAccess,
      }));

      final response = await request.close();
      final body = await utf8.decodeStream(response);
      final json = jsonDecode(body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ClassroomApiException(
          json['error'] as String? ?? '无法进入课堂（${response.statusCode}）',
        );
      }
      return ClassroomBootstrap.fromJson(json);
    } on SocketException {
      throw const ClassroomApiException('网络不可用，请检查连接后重试。');
    } on FormatException {
      throw const ClassroomApiException('课堂服务返回了无法识别的数据。');
    } finally {
      client.close(force: true);
    }
  }
}

class ClassroomApiException implements Exception {
  const ClassroomApiException(this.message);

  final String message;

  @override
  String toString() => message;
}
