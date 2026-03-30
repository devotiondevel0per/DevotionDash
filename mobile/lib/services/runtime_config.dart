import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

class RuntimeConfig {
  RuntimeConfig._({
    required this.serverUrl,
    required this.fallbackAppName,
    required this.fallbackTagline,
  });

  final String serverUrl;
  final String fallbackAppName;
  final String fallbackTagline;

  static late final RuntimeConfig instance;

  static Future<void> init() async {
    final envServerUrl = const String.fromEnvironment('ZEDDASH_SERVER_URL').trim();
    final envAppName = const String.fromEnvironment('ZEDDASH_APP_NAME').trim();
    final envTagline = const String.fromEnvironment('ZEDDASH_APP_TAGLINE').trim();

    Map<String, dynamic> fileConfig = const {};
    try {
      final raw = await rootBundle.loadString('assets/config/runtime.json');
      final parsed = jsonDecode(raw);
      if (parsed is Map<String, dynamic>) {
        fileConfig = parsed;
      }
    } catch (_) {
      // Keep file config empty and fall through to environment values.
    }

    final configuredServerUrl = _normalizeBaseUrl(
      envServerUrl.isNotEmpty
          ? envServerUrl
          : (fileConfig['serverUrl']?.toString() ?? ''),
    );

    if (configuredServerUrl.isEmpty) {
      throw StateError(
        'Missing ZedDash server URL. Configure assets/config/runtime.json or pass --dart-define=ZEDDASH_SERVER_URL=...',
      );
    }

    instance = RuntimeConfig._(
      serverUrl: configuredServerUrl,
      fallbackAppName: envAppName.isNotEmpty
          ? envAppName
          : (fileConfig['fallbackAppName']?.toString().trim().isNotEmpty == true
              ? fileConfig['fallbackAppName'].toString().trim()
              : 'ZedDash'),
      fallbackTagline: envTagline.isNotEmpty
          ? envTagline
          : (fileConfig['fallbackTagline']?.toString().trim().isNotEmpty == true
              ? fileConfig['fallbackTagline'].toString().trim()
              : 'Workspace'),
    );
  }

  String get apiBaseUrl => '$serverUrl/api';

  String resolveUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return serverUrl;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return '$serverUrl$trimmed';
    }
    return '$serverUrl/$trimmed';
  }

  static String _normalizeBaseUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    return trimmed.endsWith('/') ? trimmed.substring(0, trimmed.length - 1) : trimmed;
  }
}
