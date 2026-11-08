import 'package:flutter/material.dart';

import '../../core/client/client_gateway.dart';
import '../../core/client/client_models.dart';

class ClientGroupsPage extends StatefulWidget {
  const ClientGroupsPage({required this.gateway, super.key});
  final ClientGateway gateway;
  @override
  State<ClientGroupsPage> createState() => _ClientGroupsPageState();
}

class _ClientGroupsPageState extends State<ClientGroupsPage> {
  List<ClientGroup> _groups = [];
  String? _selected;
  String _error = '';
  bool _loading = true, _allowed = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final identity = await widget.gateway.request('identity');
      final allowed =
          identity['user'] is Map &&
          (identity['user'] as Map)['role'] == 'teacher';
      final data = allowed
          ? await widget.gateway.request('groups')
          : <String, dynamic>{'groups': []};
      if (mounted) {
        setState(() {
          _allowed = allowed;
          _groups = ClientGroup.flatten(data['groups'] as List? ?? []);
          _loading = false;
          _error = '';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = '$error';
          _loading = false;
        });
      }
    }
  }

  Future<void> _create() async {
    final controller = TextEditingController();
    final name = await showAdaptiveDialog<String>(
      context: context,
      builder: (context) => AlertDialog.adaptive(
        title: const Text('新建学生分组'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 100,
          decoration: const InputDecoration(labelText: '分组名称'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('创建'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      await widget.gateway.request('createGroup', {'name': name});
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('学生与分组'),
      actions: [
        if (_allowed)
          IconButton(
            onPressed: _create,
            tooltip: '新建分组',
            icon: const Icon(Icons.group_add_outlined),
          ),
        IconButton(
          onPressed: _load,
          tooltip: '刷新分组',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator.adaptive())
        : Column(
            children: [
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    _error,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              Expanded(
                child: !_allowed
                    ? const Center(child: Text('学生与分组仅向教师开放。'))
                    : LayoutBuilder(
                        builder: (context, box) {
                          final group =
                              _groups
                                  .where((g) => g.id == _selected)
                                  .firstOrNull ??
                              _groups.firstOrNull;
                          final list = ListView(
                            children: [
                              if (_groups.isEmpty)
                                const Padding(
                                  padding: EdgeInsets.all(32),
                                  child: Text('还没有分组，点击右上角创建。'),
                                ),
                              for (final item in _groups)
                                ListTile(
                                  leading: const Icon(Icons.group_outlined),
                                  title: Text(item.name),
                                  subtitle: Text('${item.members.length} 名学生'),
                                  selected: group?.id == item.id,
                                  onTap: () {
                                    if (box.maxWidth >= 760) {
                                      setState(() => _selected = item.id);
                                    } else {
                                      Navigator.push<void>(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              ClientGroupMembersPage(
                                                gateway: widget.gateway,
                                                group: item,
                                              ),
                                        ),
                                      ).then((_) => _load());
                                    }
                                  },
                                  trailing: box.maxWidth < 760
                                      ? const Icon(Icons.chevron_right)
                                      : null,
                                ),
                            ],
                          );
                          return box.maxWidth < 760
                              ? list
                              : Row(
                                  children: [
                                    SizedBox(width: 260, child: list),
                                    const VerticalDivider(width: 1),
                                    Expanded(
                                      child: group == null
                                          ? const Center(
                                              child: Text('选择或创建学生分组'),
                                            )
                                          : ClientGroupMembersPage(
                                              key: ValueKey(group.id),
                                              gateway: widget.gateway,
                                              group: group,
                                              embedded: true,
                                            ),
                                    ),
                                  ],
                                );
                        },
                      ),
              ),
            ],
          ),
  );
}

class ClientGroupMembersPage extends StatefulWidget {
  const ClientGroupMembersPage({
    required this.gateway,
    required this.group,
    this.embedded = false,
    super.key,
  });
  final ClientGateway gateway;
  final ClientGroup group;
  final bool embedded;
  @override
  State<ClientGroupMembersPage> createState() => _ClientGroupMembersPageState();
}

class _ClientGroupMembersPageState extends State<ClientGroupMembersPage> {
  late ClientGroup _group = widget.group;
  final Set<String> _selected = {};
  String _query = '', _error = '';
  bool _busy = false;
  int _page = 0;
  @override
  void didUpdateWidget(covariant ClientGroupMembersPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.group != widget.group) {
      _group = widget.group;
      _selected.removeWhere((id) => !_group.members.any((m) => m.userId == id));
    }
  }

  Future<void> _reload() async {
    try {
      final data = await widget.gateway.request('groups');
      final group = ClientGroup.flatten(data['groups'] as List? ?? [])
          .where((g) => g.id == _group.id)
          .firstOrNull;
      if (mounted && group != null) setState(() => _group = group);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    }
  }

  Future<void> _remove() async {
    final confirm = await showAdaptiveDialog<bool>(
      context: context,
      builder: (context) => AlertDialog.adaptive(
        title: const Text('移出分组'),
        content: Text('将 ${_selected.length} 名学生移出此分组？不会删除学生账号。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认移出'),
          ),
        ],
      ),
    );
    if (confirm != true || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.gateway.request('removeMembers', {
        'groupId': _group.id,
        'userIds': _selected.toList(),
      });
      if (mounted) setState(() => _selected.clear());
      await _reload();
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _add() async {
    final added = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            _AddStudentsPage(gateway: widget.gateway, group: _group),
      ),
    );
    if (added == true) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final matches = _group.members
        .where(
          (m) =>
              m.name.toLowerCase().contains(_query.toLowerCase()) ||
              m.userId.toLowerCase().contains(_query.toLowerCase()),
        )
        .toList();
    final pages = (matches.length / 12).ceil().clamp(1, 999999).toInt(),
        page = _page.clamp(0, pages - 1).toInt(),
        visible = matches.skip(page * 12).take(12).toList();
    final body = Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            decoration: const InputDecoration(
              labelText: '搜索分组成员',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) => setState(() {
              _query = value;
              _page = 0;
            }),
          ),
        ),
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              _error,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        if (_selected.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(child: Text('已选 ${_selected.length} 人')),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() => _selected.clear()),
                  child: const Text('清空'),
                ),
                TextButton(
                  onPressed: _busy ? null : _remove,
                  child: const Text('移出分组'),
                ),
              ],
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (visible.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Text('没有匹配的学生'),
                  ),
                for (final member in visible)
                  CheckboxListTile(
                    value: _selected.contains(member.userId),
                    onChanged:
                        _busy ||
                            (!_selected.contains(member.userId) &&
                                _selected.length >= 100)
                        ? null
                        : (checked) => setState(() {
                            if (checked == true) {
                              _selected.add(member.userId);
                            } else {
                              _selected.remove(member.userId);
                            }
                          }),
                    secondary: CircleAvatar(
                      child: Text(
                        member.name.isEmpty
                            ? '?'
                            : member.name.characters.first,
                      ),
                    ),
                    title: Text(member.name),
                    subtitle: Text(member.userId),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
              ],
            ),
          ),
        ),
        if (pages > 1)
          SafeArea(
            top: false,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                IconButton(
                  onPressed: page == 0
                      ? null
                      : () => setState(() => _page = page - 1),
                  tooltip: '上一页',
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('${page + 1} / $pages'),
                IconButton(
                  onPressed: page == pages - 1
                      ? null
                      : () => setState(() => _page = page + 1),
                  tooltip: '下一页',
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
      ],
    );
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !widget.embedded,
        title: Text(_group.name),
        actions: [
          IconButton(
            onPressed: _busy ? null : _add,
            tooltip: '添加学生',
            icon: const Icon(Icons.person_add_outlined),
          ),
        ],
      ),
      body: body,
    );
  }
}

class _AddStudentsPage extends StatefulWidget {
  const _AddStudentsPage({required this.gateway, required this.group});
  final ClientGateway gateway;
  final ClientGroup group;
  @override
  State<_AddStudentsPage> createState() => _AddStudentsPageState();
}

class _AddStudentsPageState extends State<_AddStudentsPage> {
  final _controller = TextEditingController();
  List<Map<String, dynamic>> _users = [];
  final Map<String, Map<String, dynamic>> _selected = {};
  bool _busy = false;
  String _error = '';
  int _generation = 0;
  @override
  void dispose() {
    _generation++;
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    if (_controller.text.trim().isEmpty) return;
    final generation = ++_generation;
    setState(() => _busy = true);
    try {
      final data = await widget.gateway.request('searchStudents', {
        'query': _controller.text.trim(),
      });
      if (mounted && generation == _generation) {
        setState(
          () => _users = (data['users'] as List? ?? [])
              .map((u) => Map<String, dynamic>.from(u as Map))
              .toList(),
        );
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = '$error');
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    if (_selected.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.gateway.request('addMembers', {
        'groupId': widget.group.id,
        'members': _selected.values.toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('添加学生'),
      actions: [
        TextButton(
          onPressed: _busy || _selected.isEmpty ? null : _save,
          child: Text('添加 ${_selected.length}'),
        ),
      ],
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _controller,
            decoration: InputDecoration(
              labelText: '搜索学生姓名或账号',
              suffixIcon: IconButton(
                onPressed: _busy ? null : _search,
                tooltip: '搜索学生',
                icon: const Icon(Icons.search),
              ),
            ),
            onSubmitted: (_) => _search(),
          ),
        ),
        if (_error.isNotEmpty)
          Padding(padding: const EdgeInsets.all(16), child: Text(_error)),
        if (_busy) const LinearProgressIndicator(),
        Expanded(
          child: ListView(
            children: [
              for (final user in _users)
                Builder(
                  builder: (context) {
                    final id = '${user['id']}',
                        exists = widget.group.members.any(
                          (member) =>
                              sameClientUser(member.userId, id) ||
                              sameClientUser(
                                member.userId,
                                '${user['casdoorUuid'] ?? ''}',
                              ),
                        );
                    return CheckboxListTile(
                      value: exists || _selected.containsKey(id),
                      onChanged:
                          exists ||
                              _busy ||
                              (!_selected.containsKey(id) &&
                                  _selected.length >= 100)
                          ? null
                          : (checked) => setState(() {
                              if (checked == true) {
                                _selected[id] = {
                                  'userId': id,
                                  'userName':
                                      user['displayName'] ?? user['name'],
                                  'userAvatar': user['avatar'] ?? '',
                                };
                              } else {
                                _selected.remove(id);
                              }
                            }),
                      title: Text('${user['displayName'] ?? user['name']}'),
                      subtitle: Text(exists ? '已在分组' : '${user['name']}'),
                    );
                  },
                ),
            ],
          ),
        ),
      ],
    ),
  );
}
