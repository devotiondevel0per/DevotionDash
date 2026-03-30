import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../modules.dart';
import '../providers/user_provider.dart';

class ModuleGuard extends ConsumerWidget {
  const ModuleGuard({
    super.key,
    required this.moduleId,
    required this.child,
  });

  final String moduleId;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final permissionsAsync = ref.watch(permissionsProvider);

    return permissionsAsync.when(
      loading: () => const _GuardLoadingView(),
      error: (_, __) => _AccessDeniedView(moduleId: moduleId),
      data: (permissions) {
        if (permissions.canAccess(moduleId)) {
          return child;
        }
        return _AccessDeniedView(moduleId: moduleId);
      },
    );
  }
}

class _GuardLoadingView extends StatelessWidget {
  const _GuardLoadingView();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class _AccessDeniedView extends StatelessWidget {
  const _AccessDeniedView({required this.moduleId});

  final String moduleId;

  @override
  Widget build(BuildContext context) {
    AppModuleDefinition? module;
    for (final item in appModules) {
      if (item.id == moduleId) {
        module = item;
        break;
      }
    }
    final label = module?.label ?? 'This module';
    final color = module?.color ?? Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Access Restricted'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.lock_outline_rounded,
                  size: 34,
                  color: color,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                '$label is not available for this account.',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Your mobile access now follows the same module permissions exposed by the ZedDash server.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => context.go('/home'),
                child: const Text('Go Home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
