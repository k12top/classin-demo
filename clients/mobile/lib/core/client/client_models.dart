class ClientMember {
  const ClientMember({
    required this.userId,
    required this.name,
    this.role = 'student',
    this.online = false,
    this.onStage = false,
    this.stageState = '',
    this.microphoneAllowed = false,
    this.cameraAllowed = false,
    this.whiteboardWritable = false,
    this.handRaisedAt,
    this.rewards = 0,
  });
  factory ClientMember.fromJson(Map<String, dynamic> value) => ClientMember(
    userId: value['userId'] as String? ?? '',
    name:
        (value['displayName'] ??
                value['userName'] ??
                value['username'] ??
                value['userId'] ??
                '')
            as String,
    role: value['role'] as String? ?? 'student',
    online: value['online'] == true,
    onStage: value['onStage'] == true,
    stageState: value['stageState'] as String? ?? '',
    microphoneAllowed: value['microphoneAllowed'] == true,
    cameraAllowed: value['cameraAllowed'] == true,
    whiteboardWritable: value['whiteboardWritable'] == true,
    handRaisedAt: value['handRaisedAt'] as String?,
    rewards: (value['rewardCount'] as num?)?.toInt() ?? 0,
  );
  final String userId, name, role, stageState;
  final bool online,
      onStage,
      microphoneAllowed,
      cameraAllowed,
      whiteboardWritable;
  final String? handRaisedAt;
  final int rewards;
  bool get handRaised => online && handRaisedAt != null;
  String get status => !online
      ? '暂离'
      : onStage
      ? '台上'
      : stageState == 'invited'
      ? '等待上台'
      : '台下';
  String get roleLabel => switch (role) {
    'teacher' => '教师',
    'assistant' => '助教',
    _ => '学生',
  };
}

class ClientRuntime {
  const ClientRuntime({
    required this.members,
    this.revision = 0,
    this.status = 'waiting',
  });
  factory ClientRuntime.fromJson(Map<String, dynamic> value) => ClientRuntime(
    members: (value['members'] as List? ?? [])
        .map(
          (item) =>
              ClientMember.fromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList(),
    revision: (value['revision'] as num?)?.toInt() ?? 0,
    status: value['status'] as String? ?? 'waiting',
  );
  final List<ClientMember> members;
  final int revision;
  final String status;
  bool canManage(String userId) =>
      status != 'ended' &&
      members.any(
        (member) =>
            sameClientUser(member.userId, userId) &&
            ['teacher', 'assistant'].contains(member.role),
      );
}

bool sameClientUser(String first, String second) =>
    first.isNotEmpty &&
    second.isNotEmpty &&
    first.split('/').last == second.split('/').last;
List<ClientMember> filterClientMembers(
  List<ClientMember> members, {
  String query = '',
  String filter = 'all',
}) {
  const roles = ['teacher', 'assistant', 'student'];
  final result = members
      .where(
        (member) =>
            member.name.toLowerCase().contains(query.toLowerCase()) &&
            switch (filter) {
              'hands' => member.handRaised,
              'stage' => member.online && member.onStage,
              'away' => !member.online,
              _ => true,
            },
      )
      .toList();
  result.sort((a, b) {
    if (a.online != b.online) return a.online ? -1 : 1;
    final role = roles.indexOf(a.role).compareTo(roles.indexOf(b.role));
    if (role != 0) return role;
    if (a.handRaised != b.handRaised) return a.handRaised ? -1 : 1;
    if (a.handRaised && b.handRaised) {
      return a.handRaisedAt!.compareTo(b.handRaisedAt!);
    }
    return a.name.compareTo(b.name);
  });
  return result;
}

class ClientGroup {
  const ClientGroup({
    required this.id,
    required this.name,
    required this.members,
  });
  final String id, name;
  final List<ClientMember> members;
  static List<ClientGroup> flatten(
    List<dynamic> values, [
    String prefix = '',
  ]) => values.expand((item) {
    final value = Map<String, dynamic>.from(item as Map),
        name = prefix.isEmpty
            ? '${value['name']}'
            : '$prefix / ${value['name']}';
    return [
      ClientGroup(
        id: '${value['id']}',
        name: name,
        members: (value['members'] as List? ?? [])
            .map(
              (member) => ClientMember.fromJson(
                Map<String, dynamic>.from(member as Map),
              ),
            )
            .toList(),
      ),
      ...flatten(value['children'] as List? ?? [], name),
    ];
  }).toList();
}
