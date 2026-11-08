import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/client/client_gateway.dart';
import '../../core/client/client_models.dart';

class ClientMembersPanel extends StatefulWidget {
  const ClientMembersPanel({
    required this.gateway,
    required this.sessionId,
    this.onClose,
    super.key,
  });
  final ClientGateway gateway;
  final String sessionId;
  final VoidCallback? onClose;
  @override
  State<ClientMembersPanel> createState() => _ClientMembersPanelState();
}

class _ClientMembersPanelState extends State<ClientMembersPanel> {
  ClientRuntime? _runtime;
  String _userId = '', _query = '', _filter = 'all', _error = '';
  bool _busy = false;
  int _generation = 0;
  Timer? _poll;
  Future<void>? _loadFuture;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!_busy &&
          _loadFuture == null &&
          (ModalRoute.of(context)?.isCurrent ?? true)) {
        unawaited(_load());
      }
    });
  }

  @override
  void dispose() {
    _generation++;
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() {
    if (!mounted) return Future.value();
    return _loadFuture ??= _loadOnce().whenComplete(() => _loadFuture = null);
  }

  Future<void> _loadOnce() async {
    final generation = ++_generation;
    try {
      final identity = await widget.gateway.request('identity');
      if (identity['user'] is! Map) {
        if (mounted && generation == _generation) {
          setState(() {
            _runtime = null;
            _userId = '';
            _error = '请先在工作区登录。';
          });
        }
        return;
      }
      final userId = '${(identity['user'] as Map)['userId']}';
      if (mounted && generation == _generation && userId != _userId) {
        setState(() {
          _runtime = null;
          _userId = userId;
        });
      }
      final data = await widget.gateway.request('runtime', {
        'sessionId': widget.sessionId,
      });
      if (mounted && generation == _generation) {
        setState(() {
          _userId = '${(identity['user'] as Map)['userId']}';
          _runtime = ClientRuntime.fromJson(
            Map<String, dynamic>.from(data['runtime'] as Map),
          );
          _error = '';
        });
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = '$error');
      }
    }
  }

  Future<void> _command(Map<String, dynamic> action) async {
    if (_busy || !(_runtime?.canManage(_userId) ?? false)) return;
    _generation++;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await widget.gateway.request('command', {
        'sessionId': widget.sessionId,
        'commandId': clientCommandId(),
        'expectedRevision': _runtime!.revision,
        'action': action,
      });
      await _loadFuture;
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeAll() async {
    final confirmed = await showAdaptiveDialog<bool>(
      context: context,
      builder: (context) => AlertDialog.adaptive(
        title: const Text('全体下台'),
        content: const Text('所有台上学生将回到台下。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认下台'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _command({'type': 'removeAllStudentsFromStage'});
    }
  }

  @override
  Widget build(BuildContext context) {
    final members = _runtime?.members ?? <ClientMember>[],
        visible = filterClientMembers(members, query: _query, filter: _filter),
        canManage = _runtime?.canManage(_userId) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('课堂花名册'),
        leading: widget.onClose == null
            ? null
            : IconButton(
                onPressed: widget.onClose,
                tooltip: '关闭花名册',
                icon: const Icon(Icons.close),
              ),
        actions: [
          IconButton(
            onPressed: _busy ? null : _load,
            tooltip: '刷新花名册',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _error,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                  TextButton(onPressed: _load, child: const Text('重试')),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: '搜索成员姓名',
                labelText: '搜索课堂成员',
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                for (final item in [
                  ('all', '全部', members.length),
                  ('hands', '举手', members.where((m) => m.handRaised).length),
                  (
                    'stage',
                    '台上',
                    members.where((m) => m.online && m.onStage).length,
                  ),
                  ('away', '暂离', members.where((m) => !m.online).length),
                ])
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ChoiceChip(
                      label: Text('${item.$2} ${item.$3}'),
                      selected: _filter == item.$1,
                      onSelected: (_) => setState(() => _filter = item.$1),
                    ),
                  ),
              ],
            ),
          ),
          if (canManage)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _command({'type': 'muteAllMicrophones'}),
                    icon: const Icon(Icons.mic_off),
                    label: const Text('全体静音'),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _busy ? null : _removeAll,
                    child: const Text('全体下台'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _runtime == null && _error.isEmpty
                ? const Center(child: CircularProgressIndicator.adaptive())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      itemCount: visible.isEmpty ? 1 : visible.length,
                      itemBuilder: (context, index) {
                        if (visible.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.all(32),
                            child: Text('暂无匹配成员', textAlign: TextAlign.center),
                          );
                        }
                        final member = visible[index];
                        return Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 10,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: CircleAvatar(
                                  child: Text(
                                    member.name.isEmpty
                                        ? '?'
                                        : member.name.characters.first,
                                  ),
                                ),
                                title: Text(member.name),
                                subtitle: Text(
                                  '${member.roleLabel} · ${member.status}${member.handRaised ? ' · 举手' : ''}',
                                ),
                                trailing: member.handRaised
                                    ? const Icon(Icons.front_hand_outlined)
                                    : null,
                              ),
                              if (canManage &&
                                  member.role == 'student' &&
                                  member.online)
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 4,
                                  children: [
                                    TextButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _command({
                                              'type':
                                                  member.onStage ||
                                                      member.stageState ==
                                                          'invited'
                                                  ? 'removeStage'
                                                  : 'inviteStage',
                                              'targetUserId': member.userId,
                                            }),
                                      child: Text(
                                        member.onStage
                                            ? '下台'
                                            : member.stageState == 'invited'
                                            ? '取消邀请'
                                            : '邀请上台',
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _command({
                                              'type': 'setMediaAllowed',
                                              'targetUserId': member.userId,
                                              'microphoneAllowed':
                                                  !member.microphoneAllowed,
                                              'cameraAllowed':
                                                  member.cameraAllowed,
                                            }),
                                      child: Text(
                                        member.microphoneAllowed
                                            ? '静音'
                                            : '允许发言',
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _command({
                                              'type': 'setWhiteboardWritable',
                                              'targetUserId': member.userId,
                                              'writable':
                                                  !member.whiteboardWritable,
                                            }),
                                      child: Text(
                                        member.whiteboardWritable
                                            ? '取消板书授权'
                                            : '授权板书',
                                      ),
                                    ),
                                    TextButton.icon(
                                      onPressed: _busy
                                          ? null
                                          : () => _command({
                                              'type': 'giveReward',
                                              'targetUserIds': [member.userId],
                                            }),
                                      icon: const Icon(
                                        Icons.emoji_events_outlined,
                                      ),
                                      label: Text('${member.rewards}'),
                                    ),
                                  ],
                                ),
                              const Divider(height: 12),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                '在线 ${members.where((m) => m.online).length} / ${members.length}${_busy ? ' · 正在提交…' : ''}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
