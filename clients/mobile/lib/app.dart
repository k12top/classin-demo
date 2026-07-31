import 'package:flutter/material.dart';

import 'design/classroom_theme.dart';
import 'features/classroom/classroom_launch_gate.dart';

class XiangyuClassroomApp extends StatelessWidget {
  const XiangyuClassroomApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '翔宇文淑课堂',
      debugShowCheckedModeBanner: false,
      theme: ClassroomTheme.dark(),
      home: const ClassroomLaunchGate(),
    );
  }
}
