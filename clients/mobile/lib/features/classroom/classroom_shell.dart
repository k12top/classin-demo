import 'package:flutter/material.dart';

import '../../core/api/classroom_api.dart';
import '../../design/classroom_theme.dart';

class ClassroomShell extends StatelessWidget {
  const ClassroomShell({required this.bootstrap, super.key});

  final ClassroomBootstrap bootstrap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 680) {
          return _PhoneClassroom(bootstrap: bootstrap);
        }
        return _TabletClassroom(bootstrap: bootstrap);
      },
    );
  }
}

class _PhoneClassroom extends StatefulWidget {
  const _PhoneClassroom({required this.bootstrap});

  final ClassroomBootstrap bootstrap;

  @override
  State<_PhoneClassroom> createState() => _PhoneClassroomState();
}

class _PhoneClassroomState extends State<_PhoneClassroom> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _ClassroomAppBar(bootstrap: widget.bootstrap),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(child: _TeachingStage(bootstrap: widget.bootstrap)),
            const _MobileLiveRail(),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selected,
        onDestinationSelected: (index) {
          setState(() => _selected = index);
          if (index > 0) _showToolSheet(context, index);
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.play_circle_outline), label: '舞台'),
          NavigationDestination(icon: Icon(Icons.people_outline), label: '成员'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: '互动'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: '工具'),
        ],
      ),
    );
  }

  void _showToolSheet(BuildContext context, int index) {
    final title = switch (index) {
      1 => '成员与举手',
      2 => '聊天与字幕',
      _ => '课堂工具',
    };
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: 340,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                const Text('原生端会按服务端 capability 显示可用操作。学生只能举手和申请上台，教师与助教才能管理成员和互动。'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TabletClassroom extends StatelessWidget {
  const _TabletClassroom({required this.bootstrap});

  final ClassroomBootstrap bootstrap;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _ClassroomAppBar(bootstrap: bootstrap),
      body: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(flex: 7, child: _TeachingStage(bootstrap: bootstrap)),
              const SizedBox(width: 12),
              const SizedBox(width: 280, child: _TabletInspector()),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const _TeacherDock(),
    );
  }
}

class _ClassroomAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _ClassroomAppBar({required this.bootstrap});

  final ClassroomBootstrap bootstrap;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) {
    final isLive = bootstrap.runtimeStatus == 'live';
    return AppBar(
      titleSpacing: 16,
      title: Row(
        children: [
          const Icon(Icons.school_outlined, color: ClassroomColors.iris),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              bootstrap.courseName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          _StatusPill(live: isLive, label: isLive ? 'LIVE' : '待开始'),
        ],
      ),
      actions: const [
        Padding(
          padding: EdgeInsets.only(right: 12),
          child: Icon(Icons.settings_outlined),
        ),
      ],
    );
  }
}

class _TeachingStage extends StatelessWidget {
  const _TeachingStage({required this.bootstrap});

  final ClassroomBootstrap bootstrap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: ClassroomColors.graphite,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white12),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('教学舞台 · ${bootstrap.mode}', style: const TextStyle(color: ClassroomColors.mist)),
            ),
          ),
          const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.ondemand_video_outlined, size: 64, color: ClassroomColors.iris),
                SizedBox(height: 12),
                Text('媒体适配器将在此渲染教学内容'),
              ],
            ),
          ),
          Positioned(
            right: 16,
            bottom: 16,
            child: _StatusPill(
              live: bootstrap.runtimeStatus == 'live',
              label: 'r${bootstrap.revision}',
            ),
          ),
        ],
      ),
    );
  }
}

class _MobileLiveRail extends StatelessWidget {
  const _MobileLiveRail();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 88,
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: ClassroomColors.graphite,
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Row(
        children: [
          CircleAvatar(child: Text('T')),
          SizedBox(width: 10),
          Expanded(child: Text('Teaching Rail\n主讲与上台同学仅在需要时出现')),
          Icon(Icons.keyboard_arrow_up_rounded),
        ],
      ),
    );
  }
}

class _TabletInspector extends StatelessWidget {
  const _TabletInspector();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: ClassroomColors.graphite,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white12),
      ),
      child: const Padding(
        padding: EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('课堂检查器', style: TextStyle(fontWeight: FontWeight.w700)),
            SizedBox(height: 16),
            Text('成员 · 聊天 · 字幕 · 课件\n以单一覆盖层呈现，避免挤占教学舞台。'),
          ],
        ),
      ),
    );
  }
}

class _TeacherDock extends StatelessWidget {
  const _TeacherDock();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: const [
            _DockItem(icon: Icons.mic_none_outlined, label: '麦克风'),
            _DockItem(icon: Icons.videocam_outlined, label: '摄像头'),
            _DockItem(icon: Icons.screen_share_outlined, label: '共享'),
            _DockItem(icon: Icons.draw_outlined, label: '白板'),
            _DockItem(icon: Icons.menu_book_outlined, label: '课件'),
          ],
        ),
      ),
    );
  }
}

class _DockItem extends StatelessWidget {
  const _DockItem({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 11)),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.live, required this.label});

  final bool live;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: (live ? ClassroomColors.signal : ClassroomColors.iris).withValues(alpha: .16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: live ? ClassroomColors.signal : ClassroomColors.frost,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
