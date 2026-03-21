import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';

import 'api_client.dart';
import '../utils/platform_support.dart';

const _storage = FlutterSecureStorage();

// ─── Auth state notifier (can be invalidated after login/logout) ─────────────

class AuthNotifier extends AsyncNotifier<Map<String, dynamic>?> {
  @override
  Future<Map<String, dynamic>?> build() async {
    final token = await _storage.read(key: 'auth_token');
    final userJson = await _storage.read(key: 'auth_user');
    if (token == null || userJson == null) return null;
    return jsonDecode(userJson) as Map<String, dynamic>;
  }

  Future<void> login(String login, String password, {String? otp}) async {
    final api = ref.read(apiClientProvider);
    try {
      final res = await api.mobileLogin({
        'login': login,
        'password': password,
        if (otp != null) 'otp': otp,
      });
      await _storage.write(key: 'auth_token', value: res['token'] as String);
      await _storage.write(key: 'auth_user', value: jsonEncode(res['user']));
      state = AsyncData(res['user'] as Map<String, dynamic>);
      // Register FCM token with server (best-effort)
      try {
        if (PlatformSupport.supportsPushTokenRegistration) {
          final fcmToken = await FirebaseMessaging.instance.getToken();
          if (fcmToken != null) {
            await api.registerFcmToken(
              fcmToken,
              platform: PlatformSupport.notificationPlatformName,
            );
          }
        }
      } catch (e) {
        debugPrint('[FCM] Token registration failed: $e');
      }
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final body = e.response?.data;
      final serverMsg = body is Map ? body['error'] ?? body['message'] : null;
      if (status == 401) {
        final requires2FA = body is Map && body['requires2FA'] == true;
        throw Exception(requires2FA ? 'requires2FA' : 'Invalid credentials');
      }
      throw Exception('Server error $status: ${serverMsg ?? e.message}');
    }
  }

  Future<void> logout() async {
    // Unregister FCM token before clearing storage
    try {
      final api = ref.read(apiClientProvider);
      if (PlatformSupport.supportsPushTokenRegistration) {
        final fcmToken = await FirebaseMessaging.instance.getToken();
        if (fcmToken != null) await api.unregisterFcmToken(fcmToken);
      }
    } catch (e) {
      debugPrint('[FCM] Token unregister failed: $e');
    }
    await _storage.deleteAll();
    state = const AsyncData(null);
  }

  Future<String?> getToken() => _storage.read(key: 'auth_token');
}

final authStateProvider =
    AsyncNotifierProvider<AuthNotifier, Map<String, dynamic>?>(
      AuthNotifier.new,
    );

// ─── Convenience service provider (for token reads) ──────────────────────────

class AuthService {
  Future<String?> getToken() => _storage.read(key: 'auth_token');
  Future<void> logout() async => _storage.deleteAll();
}

final authServiceProvider = Provider<AuthService>((ref) => AuthService());
