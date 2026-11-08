import 'package:flutter/material.dart';

import 'design/classroom_theme.dart';
import 'features/workspace/client_workspace.dart';

class XiangyuClassroomApp extends StatelessWidget {
  const XiangyuClassroomApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '翔宇文淑课堂',
      debugShowCheckedModeBanner: false,
      theme: ClassroomTheme.light(),
      home: const ClientWorkspace(),
      darkTheme: ClassroomTheme.dark(),
      themeMode: ThemeMode.system,
    );
  }
}
