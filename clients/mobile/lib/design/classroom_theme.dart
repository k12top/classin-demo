import 'package:flutter/material.dart';

abstract final class ClassroomColors {
  static const obsidian = Color(0xFF090A0D);
  static const graphite = Color(0xFF15171C);
  static const surface = Color(0xFF1D2027);
  static const frost = Color(0xFFF4F6F8);
  static const mist = Color(0xFFA7AFBD);
  static const iris = Color(0xFF7B6FF2);
  static const signal = Color(0xFF32D49A);
  static const coral = Color(0xFFFF5E69);
}

abstract final class ClassroomTheme {
  static ThemeData dark() {
    const scheme = ColorScheme.dark(
      primary: ClassroomColors.iris,
      secondary: ClassroomColors.signal,
      surface: ClassroomColors.graphite,
      error: ClassroomColors.coral,
      onPrimary: ClassroomColors.frost,
      onSurface: ClassroomColors.frost,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: ClassroomColors.obsidian,
      fontFamily: 'sans-serif',
      appBarTheme: const AppBarTheme(
        backgroundColor: ClassroomColors.obsidian,
        foregroundColor: ClassroomColors.frost,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: ClassroomColors.graphite,
        modalBackgroundColor: ClassroomColors.graphite,
        showDragHandle: true,
      ),
    );
  }
}
