class ClassroomConfig {
  const ClassroomConfig({
    required this.apiBaseUrl,
    required this.sessionId,
    required this.accessToken,
    this.shareAccess,
  });

  factory ClassroomConfig.fromEnvironment() {
    return const ClassroomConfig(
      apiBaseUrl: String.fromEnvironment('CLASSROOM_API_BASE_URL'),
      sessionId: String.fromEnvironment('CLASSROOM_SESSION_ID'),
      accessToken: String.fromEnvironment('CLASSROOM_ACCESS_TOKEN'),
      shareAccess: String.fromEnvironment('CLASSROOM_SHARE_ACCESS'),
    );
  }

  final String apiBaseUrl;
  final String sessionId;
  final String accessToken;
  final String shareAccess;

  bool get isConfigured =>
      apiBaseUrl.startsWith('https://') &&
      sessionId.isNotEmpty &&
      accessToken.isNotEmpty;
}
