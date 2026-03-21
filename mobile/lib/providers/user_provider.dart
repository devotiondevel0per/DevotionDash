import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../modules.dart';

// ─── Models ──────────────────────────────────────────────────────────────────

class UserProfile {
  final String id;
  final String name;
  final String? fullname;
  final String? email;
  final bool isAdmin;
  final String? photoUrl;
  final String? department;
  final String? position;

  const UserProfile({
    required this.id,
    required this.name,
    this.fullname,
    this.email,
    required this.isAdmin,
    this.photoUrl,
    this.department,
    this.position,
  });

  String get displayName => (fullname?.isNotEmpty == true ? fullname! : name).trim();
  String get initials {
    final parts = displayName.split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return displayName.isNotEmpty ? displayName[0].toUpperCase() : '?';
  }

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: j['id'] ?? '',
        name: j['name'] ?? j['login'] ?? '',
        fullname: j['fullname'],
        email: j['email'],
        isAdmin: j['isAdmin'] == true,
        photoUrl: j['photoUrl'],
        department: j['department'],
        position: j['position'],
      );
}

class AppPermissions {
  final List<String> accessibleModules;
  final bool isAdmin;

  const AppPermissions({required this.accessibleModules, required this.isAdmin});

  bool canAccess(String moduleId) => isAdmin || accessibleModules.contains(moduleId);

  factory AppPermissions.fromJson(Map<String, dynamic> j) {
    final modules = (j['accessibleModules'] as List<dynamic>?)?.cast<String>() ?? [];
    return AppPermissions(
      accessibleModules: modules,
      isAdmin: j['isAdmin'] == true,
    );
  }

  factory AppPermissions.admin() => const AppPermissions(
        accessibleModules: [
          'home',
          'tasks',
          'projects',
          'documents',
          'email',
          'board',
          'leads',
          'clients',
          'contacts',
          'team',
          'calendar',
          'chat',
          'livechat',
          'servicedesk',
          'products',
          'accounting',
          'ebank',
          'telephony',
          'search',
          'administration',
        ],
        isAdmin: true,
      );

  factory AppPermissions.empty() => const AppPermissions(accessibleModules: [], isAdmin: false);
}

// ─── Providers ───────────────────────────────────────────────────────────────

final userProfileProvider = FutureProvider<UserProfile?>((ref) async {
  const storage = FlutterSecureStorage();
  final userJson = await storage.read(key: 'auth_user');
  if (userJson == null) return null;
  try {
    final map = jsonDecode(userJson) as Map<String, dynamic>;
    // Try to get full profile from API
    try {
      final api = ref.watch(apiClientProvider);
      final profile = await api.getProfile();
      return UserProfile.fromJson(profile);
    } catch (_) {
      return UserProfile.fromJson(map);
    }
  } catch (_) {
    return null;
  }
});

final permissionsProvider = FutureProvider<AppPermissions>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.value;
  if (user == null) return AppPermissions.empty();
  if (user.isAdmin) return AppPermissions.admin();
  try {
    final api = ref.watch(apiClientProvider);
    final data = await api.getPermissions();
    return AppPermissions.fromJson(data);
  } catch (_) {
    final mobileEnabled = appModules
        .where((module) => module.mobileEnabled && module.id == 'home')
        .map((module) => module.id)
        .toList();
    return AppPermissions(accessibleModules: mobileEnabled, isAdmin: false);
  }
});
