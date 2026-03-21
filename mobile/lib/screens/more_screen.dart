import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../modules.dart';
import '../services/auth_service.dart';
import '../providers/user_provider.dart';
import '../widgets/user_avatar.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final userAsync = ref.watch(userProfileProvider);
    final permissions = ref.watch(permissionsProvider).valueOrNull;
    final primaryRoutes = const {'/home', '/tasks', '/chat', '/livechat'};
    final moduleItems = permissions == null
        ? <_MoreItem>[]
        : mobileModulesForAccess(
            accessibleModules: permissions.accessibleModules,
            isAdmin: permissions.isAdmin,
          )
            .where((module) => !primaryRoutes.contains(module.route) && module.id != 'home')
            .map(
              (module) => _MoreItem(
                module.label,
                module.icon,
                module.route,
                module.color,
              ),
            )
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('More', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        children: [
          // User header card
          userAsync.when(
            data: (user) => user != null ? InkWell(
              onTap: () => context.push('/profile'),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Row(
                  children: [
                    UserAvatar(photoUrl: user.photoUrl, name: user.displayName, radius: 28),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user.displayName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                          if (user.email != null)
                            Text(user.email!, style: theme.textTheme.bodySmall?.copyWith(color: cs.onSurface.withValues(alpha: 0.55))),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, color: cs.onSurface.withValues(alpha: 0.4)),
                  ],
                ),
              ),
            ) : const SizedBox.shrink(),
            loading: () => const SizedBox(height: 56),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const Divider(height: 24),

          // Menu items
          ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.person_rounded, color: Color(0xFF3B82F6), size: 22),
            ),
            title: const Text('Profile', style: TextStyle(fontWeight: FontWeight.w500)),
            trailing: Icon(Icons.chevron_right, color: cs.onSurface.withValues(alpha: 0.35), size: 20),
            onTap: () => context.push('/profile'),
          ),
          ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.notifications_rounded, color: Color(0xFFF59E0B), size: 22),
            ),
            title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.w500)),
            trailing: Icon(Icons.chevron_right, color: cs.onSurface.withValues(alpha: 0.35), size: 20),
            onTap: () => context.push('/notifications'),
          ),
          ...moduleItems.map((item) => ListTile(
            leading: Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(item.icon, color: item.color, size: 22),
            ),
            title: Text(item.label, style: const TextStyle(fontWeight: FontWeight.w500)),
            trailing: Icon(Icons.chevron_right, color: cs.onSurface.withValues(alpha: 0.35), size: 20),
            onTap: () => context.push(item.route),
          )),

          const Divider(height: 24),

          // Sign out
          ListTile(
            leading: Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.logout_rounded, color: Colors.red, size: 22),
            ),
            title: const Text('Sign Out', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w500)),
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Sign Out'),
                  content: const Text('Are you sure you want to sign out?'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      style: FilledButton.styleFrom(backgroundColor: Colors.red),
                      child: const Text('Sign Out'),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                await ref.read(authStateProvider.notifier).logout();
              }
            },
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _MoreItem {
  final String label;
  final IconData icon;
  final String route;
  final Color color;
  const _MoreItem(this.label, this.icon, this.route, this.color);
}
