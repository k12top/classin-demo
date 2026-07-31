import 'package:flutter/material.dart';

import '../../core/api/classroom_api.dart';
import '../../core/config/classroom_config.dart';
import '../../design/classroom_theme.dart';
import 'classroom_shell.dart';

class ClassroomLaunchGate extends StatefulWidget {
  const ClassroomLaunchGate({super.key});

  @override
  State<ClassroomLaunchGate> createState() => _ClassroomLaunchGateState();
}

class _ClassroomLaunchGateState extends State<ClassroomLaunchGate> {
  final ClassroomConfig _config = ClassroomConfig.fromEnvironment();
  late Future<ClassroomBootstrap>? _bootstrap = _load();

  Future<ClassroomBootstrap>? _load() {
    if (!_config.isConfigured) return null;
    return ClassroomApi(_config).bootstrap();
  }

  @override
  Widget build(BuildContext context) {
    if (_bootstrap == null) return const _ConfigurationRequired();

    return FutureBuilder<ClassroomBootstrap>(
      future: _bootstrap,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _LoadingClassroom();
        }
        if (snapshot.hasError) {
          final error = snapshot.error;
          final message = error is ClassroomApiException
              ? error.message
              : '进入课堂失败，请稍后重试。';
          return _ClassroomError(
            message: message,
            onRetry: () => setState(() => _bootstrap = _load()),
          );
        }
        return ClassroomShell(bootstrap: snapshot.requireData);
      },
    );
  }
}

class _LoadingClassroom extends StatelessWidget {
  const _LoadingClassroom();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('正在准备在线课堂…'),
          ],
        ),
      ),
    );
  }
}

class _ConfigurationRequired extends StatelessWidget {
  const _ConfigurationRequired();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Icon(Icons.school_rounded, size: 48, color: ClassroomColors.iris),
              SizedBox(height: 20),
              Text('连接课堂', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
              SizedBox(height: 12),
              Text('请先通过系统浏览器完成登录，并由 App Link 传入课次和临时访问令牌。开发模式可使用 dart-define 注入配置。'),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClassroomError extends StatelessWidget {
  const _ClassroomError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off_rounded, color: ClassroomColors.coral, size: 44),
              const SizedBox(height: 16),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 20),
              FilledButton(onPressed: onRetry, child: const Text('重试')),
            ],
          ),
        ),
      ),
    );
  }
}
