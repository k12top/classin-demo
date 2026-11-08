import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';
import 'package:xiangyu_classroom/core/client/client_gateway.dart';

class DelayedController extends PlatformWebViewController {
  DelayedController()
    : super.implementation(const PlatformWebViewControllerCreationParams());
  final observed = Completer<void>(), script = Completer<void>();
  @override
  Future<String?> currentUrl() async => 'https://live.bytecome.com/courses';
  @override
  Future<void> runJavaScript(String javaScript) {
    observed.complete();
    return script.future;
  }
}

void main() {
  test('page invalidation safely rejects a request while script dispatch is still pending', () async {
    final platform = DelayedController();
    final gateway = WebViewClientGateway(
      WebViewController.fromPlatform(platform),
      Uri.parse('https://live.bytecome.com'),
    );
    final request = gateway.request('groups'),
        expectation = expectLater(request, throwsA(isA<ClientException>()));
    await platform.observed.future;
    gateway.invalidate();
    await expectation;
    platform.script.complete();
  });
}
