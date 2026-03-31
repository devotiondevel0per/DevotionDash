import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../modules.dart';
import '../services/api_client.dart';
import '../services/branding_service.dart';
import '../providers/user_provider.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/user_avatar.dart';
import '../utils/auto_refresh.dart';
import '../utils/breakpoints.dart';

// ─── Providers ───────────────────────────────────────────────────────────────

final homeStatsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  return ref.watch(apiClientProvider).getHomeStats();
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> with AutoRefreshMixin {
  @override
  void initState() {
    super.initState();
    startAutoRefresh(const Duration(seconds: 60), () {
      ref.invalidate(homeStatsProvider);
      ref.invalidate(userProfileProvider);
      ref.invalidate(permissionsProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(userProfileProvider);
    final statsAsync = ref.watch(homeStatsProvider);
    final permsAsync = ref.watch(permissionsProvider);
    final branding =
        ref.watch(appBrandingProvider).asData?.value ?? AppBranding.fallback();
    final cols = Breakpoints.gridColumns(context);
    final padding = Breakpoints.pagePadding(context);
    final cs = Theme.of(context).colorScheme;
    final fallbackModules = mobileModulesForAccess(
      accessibleModules: const [
        'home',
        'tasks',
        'projects',
        'documents',
        'board',
        'contacts',
        'team',
        'chat',
        'livechat',
        'servicedesk',
      ],
      isAdmin: false,
    ).where((module) => module.id != 'home').toList();

    final visibleModules = permsAsync.when(
      data: (perms) {
        final modules = mobileModulesForAccess(
          accessibleModules: perms.accessibleModules,
          isAdmin: perms.isAdmin,
        ).where((module) => module.id != 'home').toList();
        return modules.isEmpty ? fallbackModules : modules;
      },
      loading: () => fallbackModules,
      error: (_, __) => fallbackModules,
    );
    final dashboardTitleFontSize = Breakpoints.isPhone(context) ? 26.0 : 30.0;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: Breakpoints.isPhone(context) ? 68 : 74,
        title: Text(
          branding.appName,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: dashboardTitleFontSize,
            height: 1.05,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/notifications'),
          ),
          userAsync.when(
            data: (user) => user != null
                ? GestureDetector(
                    onTap: () => context.push('/profile'),
                    child: Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: UserAvatar(
                        photoUrl: user.photoUrl,
                        name: user.displayName,
                        radius: 18,
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(homeStatsProvider);
          ref.invalidate(userProfileProvider);
        },
        child: CustomScrollView(
          slivers: [
            // ── Greeting ─────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(padding, 20, padding, 8),
                child: userAsync.when(
                  data: (user) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _greeting(),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        user?.displayName ?? 'Welcome',
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  loading: () => const ShimmerBox(width: 200, height: 44),
                  error: (_, __) => const SizedBox.shrink(),
                ),
              ),
            ),

            // ── Stats Row ─────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: statsAsync.when(
                loading: () => Padding(
                  padding: EdgeInsets.symmetric(horizontal: padding),
                  child: const Row(
                    children: [
                      Expanded(
                        child: ShimmerBox(width: double.infinity, height: 80),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: ShimmerBox(width: double.infinity, height: 80),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: ShimmerBox(width: double.infinity, height: 80),
                      ),
                    ],
                  ),
                ),
                error: (_, __) => Padding(
                  padding: EdgeInsets.symmetric(horizontal: padding),
                  child: Row(
                    children: [
                      Expanded(
                        child: _StatCard(
                          label: 'Open Tasks',
                          value: '0',
                          icon: Icons.task_alt_rounded,
                          color: const Color(0xFF3B82F6),
                          onTap: () => context.go('/tasks'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _StatCard(
                          label: 'Messages',
                          value: '0',
                          icon: Icons.chat_bubble_rounded,
                          color: const Color(0xFF10B981),
                          onTap: () => context.go('/chat'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _StatCard(
                          label: 'Open Tickets',
                          value: '0',
                          icon: Icons.support_agent_rounded,
                          color: const Color(0xFF8B5CF6),
                          onTap: () => context.go('/servicedesk'),
                        ),
                      ),
                    ],
                  ),
                ),
                data: (stats) {
                  return Padding(
                    padding: EdgeInsets.symmetric(horizontal: padding),
                    child: Row(
                      children: [
                        Expanded(
                          child: _StatCard(
                            label: 'Open Tasks',
                            value: '${stats['activeTasks'] ?? 0}',
                            icon: Icons.task_alt_rounded,
                            color: const Color(0xFF3B82F6),
                            onTap: () => context.go('/tasks'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _StatCard(
                            label: 'Messages',
                            value:
                                '${stats['unreadMessages'] ?? stats['activeDialogs'] ?? 0}',
                            icon: Icons.chat_bubble_rounded,
                            color: const Color(0xFF10B981),
                            onTap: () => context.go('/chat'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _StatCard(
                            label: 'Open Tickets',
                            value: '${stats['openRequests'] ?? 0}',
                            icon: Icons.support_agent_rounded,
                            color: const Color(0xFF8B5CF6),
                            onTap: () => context.go('/servicedesk'),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            // ── Recent Tasks ──────────────────────────────────────────────
            statsAsync.when(
              loading: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
              error: (_, __) =>
                  const SliverToBoxAdapter(child: SizedBox.shrink()),
              data: (stats) {
                final recentTasks =
                    (stats['recentTasks'] as List<dynamic>?) ?? [];
                if (recentTasks.isEmpty) {
                  return const SliverToBoxAdapter(child: SizedBox.shrink());
                }
                return SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(padding, 20, padding, 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Recent Tasks',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            TextButton(
                              onPressed: () => context.push('/tasks'),
                              child: const Text('See all'),
                            ),
                          ],
                        ),
                        ...recentTasks.take(3).map((t) {
                          final task = t as Map<String, dynamic>;
                          final status = task['status']?.toString() ?? 'opened';
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  color: _statusColor(status),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              title: Text(
                                task['title'] ?? task['subject'] ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: (task['due'] ?? task['dueDate']) != null
                                  ? Text(
                                      _formatDate(
                                        (task['due'] ?? task['dueDate'])
                                            .toString(),
                                      ),
                                      style: const TextStyle(fontSize: 12),
                                    )
                                  : null,
                              trailing: const Icon(
                                Icons.chevron_right,
                                size: 18,
                              ),
                              onTap: () => context.push('/tasks/${task['id']}'),
                              dense: true,
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                );
              },
            ),

            // ── Modules Grid ──────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(padding, 16, padding, 4),
                child: Text(
                  'Modules',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(padding, 8, padding, 24),
              sliver: SliverGrid(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => _ModuleTile(module: visibleModules[i]),
                  childCount: visibleModules.length,
                ),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning,';
    if (h < 17) return 'Good afternoon,';
    return 'Good evening,';
  }
}

Color _statusColor(String status) {
  switch (status.toLowerCase()) {
    case 'opened':
    case 'open':
      return const Color(0xFF3B82F6);
    case 'completed':
      return const Color(0xFF10B981);
    case 'closed':
      return const Color(0xFF6B7280);
    case 'events':
      return const Color(0xFFF59E0B);
    case 'notes':
      return const Color(0xFF8B5CF6);
    default:
      return const Color(0xFF3B82F6);
  }
}

String _formatDate(String raw) {
  try {
    final dt = DateTime.parse(raw).toLocal();
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return 'Today';
    }
    return '${dt.day}/${dt.month}/${dt.year}';
  } catch (_) {
    return raw;
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(height: 6),
              Text(
                value,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
              Text(
                label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Module Tile ──────────────────────────────────────────────────────────────

class _ModuleTile extends StatelessWidget {
  final AppModuleDefinition module;
  const _ModuleTile({required this.module});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.go(module.route),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: module.color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(module.icon, color: module.color, size: 26),
              ),
              const SizedBox(height: 10),
              Text(
                module.label,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
