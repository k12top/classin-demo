import 'dart:convert';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xiangyu_classroom/core/client/client_gateway.dart';
import 'package:xiangyu_classroom/core/client/client_models.dart';
import 'package:xiangyu_classroom/features/workspace/client_members_panel.dart';
import 'package:xiangyu_classroom/features/workspace/client_groups_page.dart';

class FakeGateway implements ClientGateway {
  String? user = 'teacher';
  final calls = <Map<String, dynamic>>[];
  final members = <Map<String, dynamic>>[
    {
      'userId': 'teacher',
      'displayName': '陈老师',
      'role': 'teacher',
      'online': true,
    },
    {
      'userId': 'student',
      'displayName': '李明',
      'role': 'student',
      'online': true,
      'onStage': false,
      'microphoneAllowed': false,
      'cameraAllowed': false,
      'handRaisedAt': '2026-11-08T01:00:00Z',
    },
    {
      'userId': 'away',
      'displayName': '暂离学生',
      'role': 'student',
      'online': false,
    },
  ];
  final groupMembers = <Map<String, dynamic>>[
    {'userId': 'student', 'userName': '李明'},
    {'userId': 'second', 'userName': '小林'},
  ];
  @override
  Future<Map<String, dynamic>> request(
    String operation, [
    Map<String, dynamic> args = const {},
  ]) async {
    calls.add({'operation': operation, ...args});
    switch (operation) {
      case 'identity':
        return {
          'user': user == null
              ? null
              : {
                  'userId': user,
                  'role': user == 'teacher' ? 'teacher' : 'student',
                },
        };
      case 'runtime':
        return jsonDecode(
          jsonEncode({
            'runtime': {'revision': 4, 'status': 'live', 'members': members},
          }),
        ) as Map<String, dynamic>;
      case 'command':
        final action = args['action'] as Map;
        if (action['type'] == 'inviteStage') {
          members[1]['stageState'] = 'invited';
        }
        return {'ok': true};
      case 'groups':
        return jsonDecode(
          jsonEncode({
            'groups': [
              {'id': 'group', 'name': '算法基础班', 'members': groupMembers},
            ],
          }),
        ) as Map<String, dynamic>;
      case 'removeMembers':
        groupMembers.removeWhere(
          (member) => (args['userIds'] as List).contains(member['userId']),
        );
        return {'ok': true};
      default:
        return {'ok': true};
    }
  }
}

class SlowGateway extends FakeGateway {
  final waiting = Completer<void>();
  int runtimeRequests = 0;
  @override
  Future<Map<String, dynamic>> request(
    String operation, [
    Map<String, dynamic> args = const {},
  ]) async {
    if (operation == 'runtime') {
      runtimeRequests++;
      await waiting.future;
    }
    return super.request(operation, args);
  }
}

void main() {
  testWidgets(
    'slow roster requests survive the polling interval without starvation',
    (tester) async {
      final gateway = SlowGateway();
      await tester.pumpWidget(
        MaterialApp(
          home: ClientMembersPanel(gateway: gateway, sessionId: 'lesson'),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 7));
      expect(gateway.runtimeRequests, 1);
      gateway.waiting.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text('李明'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test('fixed operations and trusted page are required', () {
    final origin = clientOrigin('https://live.bytecome.com');
    expect(
      () => clientOrigin('http://example.com'),
      throwsA(isA<ClientException>()),
    );
    expect(
      () => ClientRequest.build(
        'groups',
        {},
        Uri.parse('https://evil.example'),
        origin,
      ),
      throwsA(isA<ClientException>()),
    );
    expect(clientSession(Uri.parse('about:blank'), origin), isNull);
    expect(
      () => ClientRequest.build(
        'command',
        {
          'commandId': 'fixed',
          'action': {'type': 'endClass'},
        },
        Uri.parse('https://live.bytecome.com/classroom?sessionId=lesson'),
        origin,
      ),
      throwsA(isA<ClientException>()),
    );
    final spec = ClientRequest.build(
      'command',
      {
        'commandId': 'fixed',
        'expectedRevision': 4,
        'action': {'type': 'inviteStage', 'targetUserId': 'student'},
      },
      Uri.parse('https://live.bytecome.com/classroom?sessionId=lesson'),
      origin,
    );
    expect(spec.body!['commandId'], 'fixed');
    expect(spec.body!['expectedRevision'], 4);
  });
  test('roster filtering keeps absent members and role permissions', () {
    final members = FakeGateway().members.map(ClientMember.fromJson).toList();
    expect(filterClientMembers(members, filter: 'hands').map((m) => m.userId), [
      'student',
    ]);
    expect(filterClientMembers(members, filter: 'away').map((m) => m.userId), [
      'away',
    ]);
    expect(filterClientMembers(members).first.role, 'teacher');
    expect(
      ClientRuntime(members: members, status: 'live').canManage('teacher'),
      isTrue,
    );
    expect(
      ClientRuntime(members: members, status: 'live').canManage('student'),
      isFalse,
    );
    expect(
      ClientRuntime(members: members, status: 'ended').canManage('teacher'),
      isFalse,
    );
  });
  testWidgets(
    'phone teacher invite sends revision and stable command identity',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fake = FakeGateway();
      await tester.pumpWidget(
        MaterialApp(
          home: ClientMembersPanel(gateway: fake, sessionId: 'lesson'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('邀请上台'), findsOneWidget);
      await tester.tap(find.text('邀请上台'));
      await tester.pumpAndSettle();
      final call = fake.calls.firstWhere((c) => c['operation'] == 'command');
      expect(call['expectedRevision'], 4);
      expect(call['sessionId'], 'lesson');
      expect((call['action'] as Map)['targetUserId'], 'student');
      expect('${call['commandId']}'.length, 48);
      expect(find.text('取消邀请'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('student roster is read-only and logout clears prior names', (
    tester,
  ) async {
    final fake = FakeGateway()..user = 'student';
    await tester.pumpWidget(
      MaterialApp(
        home: ClientMembersPanel(gateway: fake, sessionId: 'lesson'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('邀请上台'), findsNothing);
    expect(find.text('全体静音'), findsNothing);
    expect(find.text('陈老师'), findsOneWidget);
    fake.user = null;
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.text('陈老师'), findsNothing);
    expect(find.text('请先在工作区登录。'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('phone groups use navigation and confirmed batch removal', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final fake = FakeGateway();
    await tester.pumpWidget(MaterialApp(home: ClientGroupsPage(gateway: fake)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('算法基础班'));
    await tester.pumpAndSettle();
    expect(find.text('李明'), findsOneWidget);
    await tester.tap(find.text('李明'));
    await tester.pump();
    await tester.tap(find.text('移出分组'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认移出'));
    await tester.pumpAndSettle();
    final call = fake.calls.firstWhere(
      (c) => c['operation'] == 'removeMembers',
    );
    expect(call['groupId'], 'group');
    expect(call['userIds'], ['student']);
    expect(find.text('李明'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'tablet uses master-detail; students do not fetch teacher groups',
    (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fake = FakeGateway();
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: ClientGroupsPage(gateway: fake),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('李明'), findsOneWidget);
      expect(tester.takeException(), isNull);
      final student = FakeGateway()..user = 'student';
      await tester.pumpWidget(
        MaterialApp(
          home: ClientGroupsPage(
            key: const ValueKey('student'),
            gateway: student,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(student.calls.where((c) => c['operation'] == 'groups'), isEmpty);
      expect(find.text('学生与分组仅向教师开放。'), findsOneWidget);
    },
  );
}
