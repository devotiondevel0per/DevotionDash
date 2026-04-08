import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _notificationsProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.getNotifications(page: 1);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFAA8038);

String _relativeTime(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('MMM d').format(dt);
  } catch (_) {
    return '';
  }
}

IconData _typeIcon(String? type) {
  switch ((type ?? '').toLowerCase()) {
    case 'task':
      return Icons.task_alt_rounded;
    case 'chat':
      return Icons.chat_bubble_outline_rounded;
    case 'servicedesk':
    case 'service_desk':
    case 'support':
      return Icons.support_agent_rounded;
    case 'document':
      return Icons.description_outlined;
    case 'board':
      return Icons.article_outlined;
    default:
      return Icons.notifications_outlined;
  }
}

Color _typeColor(String? type) {
  switch ((type ?? '').toLowerCase()) {
    case 'task':
      return const Color(0xFF3B82F6);
    case 'chat':
      return const Color(0xFF10B981);
    case 'servicedesk':
    case 'service_desk':
    case 'support':
      return const Color(0xFFF97316);
    case 'document':
      return const Color(0xFF8B5CF6);
    default:
      return _kPrimary;
  }
}

List<dynamic> _extractNotifications(Map<String, dynamic> data) {
  final raw = data['notifications'] ?? data['data'] ?? [];
  return raw as List<dynamic>;
}

int _extractUnread(Map<String, dynamic> data) {
  return (data['unreadCount'] ?? data['unread_count'] ?? 0) as int;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen>
    with SingleTickerProviderStateMixin, AutoRefreshMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() => setState(() {}));
    startAutoRefresh(
      const Duration(seconds: 30),
      () => ref.invalidate(_notificationsProvider),
    );
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _markAllRead() async {
    try {
      final api = ref.read(apiClientProvider);
      await api.markAllNotificationsRead();
      ref.invalidate(_notificationsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to mark all read: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_notificationsProvider);

    final unreadCount = async.value != null
        ? _extractUnread(async.value!)
        : 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications',
            style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          TextButton.icon(
            onPressed: unreadCount > 0 ? _markAllRead : null,
            icon: const Icon(Icons.done_all_rounded, size: 18),
            label: const Text('Mark all read'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          tabs: [
            const Tab(text: 'All'),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Unread'),
                  if (unreadCount > 0) ...[
                    const SizedBox(width: 6),
                    _UnreadBadge(count: unreadCount),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
      body: async.when(
        loading: () => const ShimmerList(count: 8),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_notificationsProvider),
        ),
        data: (data) {
          final all = _extractNotifications(data);
          final unread =
              all.where((n) => n['isRead'] == false).toList();

          return TabBarView(
            controller: _tabs,
            children: [
              _NotificationList(
                items: all,
                onRefresh: () async => ref.invalidate(_notificationsProvider),
                onMarkRead: (id) async {
                  final api = ref.read(apiClientProvider);
                  await api.markNotificationRead(id);
                  ref.invalidate(_notificationsProvider);
                },
              ),
              _NotificationList(
                items: unread,
                emptyTitle: 'All caught up!',
                emptySubtitle: 'No unread notifications',
                onRefresh: () async => ref.invalidate(_notificationsProvider),
                onMarkRead: (id) async {
                  final api = ref.read(apiClientProvider);
                  await api.markNotificationRead(id);
                  ref.invalidate(_notificationsProvider);
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── Notification list ────────────────────────────────────────────────────────

class _NotificationList extends StatelessWidget {
  final List<dynamic> items;
  final String emptyTitle;
  final String? emptySubtitle;
  final Future<void> Function() onRefresh;
  final Future<void> Function(String id) onMarkRead;

  const _NotificationList({
    required this.items,
    required this.onRefresh,
    required this.onMarkRead,
    this.emptyTitle = 'No notifications',
    this.emptySubtitle,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return EmptyState(
        icon: Icons.notifications_off_outlined,
        title: emptyTitle,
        subtitle: emptySubtitle ?? 'You\'re all caught up',
      );
    }

    return RefreshIndicator(
      color: _kPrimary,
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 16),
        itemBuilder: (ctx, i) {
          final item = items[i] as Map<String, dynamic>;
          return _NotificationCard(
            notification: item,
            onTap: () async {
              final id = item['id']?.toString() ?? '';
              if (id.isNotEmpty && item['isRead'] == false) {
                await onMarkRead(id);
              }
              final link = item['link']?.toString() ?? '';
              if (link.startsWith('/') && ctx.mounted) {
                ctx.push(link);
              }
            },
          );
        },
      ),
    );
  }
}

// ─── Notification card ────────────────────────────────────────────────────────

class _NotificationCard extends StatelessWidget {
  final Map<String, dynamic> notification;
  final VoidCallback onTap;

  const _NotificationCard({
    required this.notification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final type = notification['type']?.toString();
    final isRead = notification['isRead'] as bool? ?? true;
    final title =
        (notification['title'] ?? 'Notification').toString();
    final message =
        (notification['message'] ?? notification['body'] ?? '').toString();
    final time = _relativeTime(
        notification['createdAt']?.toString() ??
            notification['created_at']?.toString());
    final iconData = _typeIcon(type);
    final iconColor = _typeColor(type);

    return InkWell(
      onTap: onTap,
      child: Container(
        color: isRead
            ? Colors.transparent
            : _kPrimary.withValues(alpha: 0.04),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(iconData, size: 20, color: iconColor),
            ),
            const SizedBox(width: 12),
            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: isRead
                                ? FontWeight.w500
                                : FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (!isRead)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: _kPrimary,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  if (message.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      message,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (time.isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Text(
                      time,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.45),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Unread badge ─────────────────────────────────────────────────────────────

class _UnreadBadge extends StatelessWidget {
  final int count;
  const _UnreadBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: _kPrimary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

// ─── Error view ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline_rounded,
                size: 56, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text('Something went wrong',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.5),
                  ),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
              style: FilledButton.styleFrom(backgroundColor: _kPrimary),
            ),
          ],
        ),
      ),
    );
  }
}

