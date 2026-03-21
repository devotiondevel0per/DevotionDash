import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../providers/user_provider.dart';
import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/user_avatar.dart';

typedef _LiveChatFilterArgs = ({
  String status,
  String queue,
  String groupId,
  String search,
  int refreshNonce,
});

final liveChatDialogsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, _LiveChatFilterArgs>((ref, args) async {
      final api = ref.watch(apiClientProvider);
      final rows = await api.getLiveChatDialogs(
        status: args.status,
        queue: args.queue,
        groupId: args.groupId == 'all' ? null : args.groupId,
        search: args.search,
      );
      return rows
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    });

final liveChatGroupsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final api = ref.watch(apiClientProvider);
      final rows = await api.getLiveChatGroups();
      return rows
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    });

final liveChatOverviewProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
      final api = ref.watch(apiClientProvider);
      return api.getLiveChatOverview();
    });

final liveChatAgentStatusesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final api = ref.watch(apiClientProvider);
      final rows = await api.getLiveChatAgentStatuses();
      return rows
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    });

String _formatTime(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw).toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final msgDay = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(msgDay).inDays;
    if (diff == 0) return DateFormat('HH:mm').format(dt);
    if (diff < 7) return DateFormat('EEE').format(dt);
    return DateFormat('dd/MM').format(dt);
  } catch (_) {
    return '';
  }
}

Color _statusColor(String? status) {
  switch ((status ?? '').toLowerCase()) {
    case 'open':
    case 'opened':
      return const Color(0xFF10B981);
    case 'closed':
      return const Color(0xFF6B7280);
    default:
      return const Color(0xFF3B82F6);
  }
}

class LiveChatScreen extends ConsumerStatefulWidget {
  const LiveChatScreen({super.key});

  @override
  ConsumerState<LiveChatScreen> createState() => _LiveChatScreenState();
}

class _LiveChatScreenState extends ConsumerState<LiveChatScreen>
    with SingleTickerProviderStateMixin, AutoRefreshMixin {
  late final TabController _tabs;
  final _searchCtrl = TextEditingController();
  Timer? _searchDebounce;

  static const _tabDefs = [
    ('All', 'all'),
    ('Open', 'open'),
    ('Closed', 'closed'),
  ];

  String _queue = 'all';
  String _groupId = 'all';
  String _search = '';
  int _refreshNonce = 0;
  bool _creatingDialog = false;
  bool _updatingAgentStatus = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabDefs.length, vsync: this);
    startAutoRefresh(const Duration(seconds: 12), _hardRefresh);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _hardRefresh() async {
    ref.invalidate(liveChatOverviewProvider);
    ref.invalidate(liveChatGroupsProvider);
    ref.invalidate(liveChatAgentStatusesProvider);
    if (mounted) {
      setState(() => _refreshNonce++);
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() => _search = value.trim());
    });
  }

  Future<void> _updateMyAgentStatus(String status) async {
    if (_updatingAgentStatus) return;
    setState(() => _updatingAgentStatus = true);
    try {
      await ref.read(apiClientProvider).updateLiveChatAgentStatus(status);
      ref.invalidate(liveChatAgentStatusesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Agent status updated to $status.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update agent status: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _updatingAgentStatus = false);
    }
  }

  Future<void> _showCreateConversationSheet(
    List<Map<String, dynamic>> groups,
  ) async {
    if (_creatingDialog) return;
    final subjectCtrl = TextEditingController();
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final firstMessageCtrl = TextEditingController();
    var selectedGroupId = 'all';
    var assignToSelf = true;

    final created = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 8,
            bottom: MediaQuery.of(context).viewInsets.bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'New Live Chat',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Visitor name',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Visitor email',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: subjectCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Subject',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedGroupId,
                  decoration: const InputDecoration(
                    labelText: 'Queue',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: 'all',
                      child: Text('No queue'),
                    ),
                    ...groups.map(
                      (group) => DropdownMenuItem(
                        value: group['id']?.toString() ?? '',
                        child: Text(group['name']?.toString() ?? 'Queue'),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    setSheetState(() => selectedGroupId = value ?? 'all');
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: firstMessageCtrl,
                  minLines: 3,
                  maxLines: 6,
                  decoration: const InputDecoration(
                    labelText: 'First message',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Assign to me'),
                  subtitle: const Text(
                    'Turn this off to let the server auto-route or leave unassigned.',
                  ),
                  value: assignToSelf,
                  onChanged: (value) {
                    setSheetState(() => assignToSelf = value);
                  },
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () async {
                    Navigator.of(sheetContext).pop({
                      'subject': subjectCtrl.text.trim(),
                      'visitorName': nameCtrl.text.trim(),
                      'visitorEmail': emailCtrl.text.trim(),
                      'groupId': selectedGroupId == 'all'
                          ? null
                          : selectedGroupId,
                      'firstMessage': firstMessageCtrl.text.trim(),
                      'assignToSelf': assignToSelf,
                    });
                  },
                  icon: const Icon(Icons.support_agent_rounded),
                  label: const Text('Continue'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    subjectCtrl.dispose();
    nameCtrl.dispose();
    emailCtrl.dispose();
    firstMessageCtrl.dispose();

    if (created == null) return;
    final hasAnyIdentity =
        (created['subject']?.toString().isNotEmpty ?? false) ||
        (created['visitorName']?.toString().isNotEmpty ?? false) ||
        (created['visitorEmail']?.toString().isNotEmpty ?? false);
    if (!hasAnyIdentity) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Add at least a subject, visitor name, or visitor email.',
            ),
          ),
        );
      }
      return;
    }

    setState(() => _creatingDialog = true);
    try {
      final dialog = await ref.read(apiClientProvider).createLiveChatDialog({
        if (created['subject']?.toString().isNotEmpty ?? false)
          'subject': created['subject'],
        if (created['visitorName']?.toString().isNotEmpty ?? false)
          'visitorName': created['visitorName'],
        if (created['visitorEmail']?.toString().isNotEmpty ?? false)
          'visitorEmail': created['visitorEmail'],
        if (created['groupId'] != null) 'groupId': created['groupId'],
        if (created['firstMessage']?.toString().isNotEmpty ?? false)
          'firstMessage': created['firstMessage'],
        'assignToSelf': created['assignToSelf'] == true,
      });
      await _hardRefresh();
      if (!mounted) return;
      context.push(
        '/chat/${dialog['id']}',
        extra: {'dialog': dialog, 'isLiveChat': true},
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create live chat: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _creatingDialog = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(liveChatGroupsProvider);
    final overviewAsync = ref.watch(liveChatOverviewProvider);
    final statusesAsync = ref.watch(liveChatAgentStatusesProvider);
    final currentUser = ref.watch(userProfileProvider).value;
    final groupItems =
        groupsAsync.valueOrNull ?? const <Map<String, dynamic>>[];
    final statusItems =
        statusesAsync.valueOrNull ?? const <Map<String, dynamic>>[];
    final selectedGroupValue =
        groupItems.any((group) => group['id']?.toString() == _groupId)
        ? _groupId
        : 'all';
    Map<String, dynamic>? myStatus;
    if (currentUser != null) {
      for (final item in statusItems) {
        if (item['id']?.toString() == currentUser.id) {
          myStatus = item;
          break;
        }
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'LiveChat',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Agent status',
            onSelected: _updateMyAgentStatus,
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'online', child: Text('Online')),
              PopupMenuItem(value: 'away', child: Text('Away')),
              PopupMenuItem(value: 'offline', child: Text('Offline')),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Icon(
                    Icons.circle,
                    size: 10,
                    color: _statusColor(
                      myStatus?['agentStatus']?.toString() ?? 'online',
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _updatingAgentStatus
                        ? 'Updating'
                        : ((myStatus?['agentStatus']?.toString() ?? 'online')
                              .toUpperCase()),
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _hardRefresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'New conversation',
            onPressed: groupItems.isEmpty && groupsAsync.isLoading
                ? null
                : () => _showCreateConversationSheet(groupItems),
            icon: _creatingDialog
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.add_rounded),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          tabs: _tabDefs.map((t) => Tab(text: t.$1)).toList(),
        ),
      ),
      body: Column(
        children: [
          if (overviewAsync.hasValue)
            _OverviewStrip(
              data: overviewAsync.value ?? const <String, dynamic>{},
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: 'Search visitor, email, or subject',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                ChoiceChip(
                  label: const Text('All queues'),
                  selected: _queue == 'all',
                  onSelected: (_) => setState(() => _queue = 'all'),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Unassigned'),
                  selected: _queue == 'unassigned',
                  onSelected: (_) => setState(() => _queue = 'unassigned'),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Assigned'),
                  selected: _queue == 'assigned',
                  onSelected: (_) => setState(() => _queue = 'assigned'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: DropdownButtonFormField<String>(
              initialValue: selectedGroupValue,
              decoration: const InputDecoration(
                labelText: 'Queue group',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem(value: 'all', child: Text('All groups')),
                ...groupItems.map(
                  (group) => DropdownMenuItem(
                    value: group['id']?.toString() ?? '',
                    child: Text(group['name']?.toString() ?? 'Queue'),
                  ),
                ),
              ],
              onChanged: (value) {
                setState(() => _groupId = value ?? 'all');
              },
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: _tabDefs
                  .map(
                    (tab) => _LiveChatList(
                      filterArgs: (
                        status: tab.$2,
                        queue: _queue,
                        groupId: selectedGroupValue,
                        search: _search,
                        refreshNonce: _refreshNonce,
                      ),
                      onRefresh: _hardRefresh,
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _OverviewStrip extends StatelessWidget {
  final Map<String, dynamic> data;

  const _OverviewStrip({required this.data});

  @override
  Widget build(BuildContext context) {
    final totals = data['totals'] is Map
        ? Map<String, dynamic>.from(data['totals'] as Map)
        : <String, dynamic>{};
    final cards = [
      ('Open', '${totals['openDialogs'] ?? 0}'),
      ('Unassigned', '${totals['unassignedDialogs'] ?? 0}'),
      ('Messages Today', '${totals['messagesToday'] ?? 0}'),
      ('Avg Response', '${totals['avgFirstResponseMinutes'] ?? 0}m'),
    ];

    return SizedBox(
      height: 112,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        scrollDirection: Axis.horizontal,
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) => Container(
          width: 152,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: Theme.of(
                context,
              ).colorScheme.outline.withValues(alpha: 0.18),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                cards[i].$1,
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const Spacer(),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  cards[i].$2,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LiveChatList extends ConsumerWidget {
  final _LiveChatFilterArgs filterArgs;
  final Future<void> Function() onRefresh;

  const _LiveChatList({required this.filterArgs, required this.onRefresh});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(liveChatDialogsProvider(filterArgs));

    return async.when(
      loading: () => const ShimmerList(count: 8),
      error: (e, _) =>
          ErrorState(message: e.toString(), onRetry: () => onRefresh()),
      data: (items) {
        if (items.isEmpty) {
          return RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 120),
                EmptyState(
                  icon: Icons.support_agent_outlined,
                  title: 'No conversations',
                  subtitle: filterArgs.search.isNotEmpty
                      ? 'No live chats match your search'
                      : 'No live chat conversations for this view',
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: items.length,
            separatorBuilder: (_, __) =>
                const Divider(height: 1, indent: 72, endIndent: 16),
            itemBuilder: (ctx, i) {
              final item = items[i];
              return _LiveChatTile(
                item: item,
                onTap: () {
                  final id = item['id']?.toString() ?? '';
                  if (id.isNotEmpty) {
                    ctx.push(
                      '/chat/$id',
                      extra: {'dialog': item, 'isLiveChat': true},
                    );
                  }
                },
              );
            },
          ),
        );
      },
    );
  }
}

class _LiveChatTile extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;

  const _LiveChatTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    final visitorName = (item['subject'] ?? item['visitorName'] ?? 'Visitor')
        .toString();
    final status = (item['status'] ?? '').toString();
    final statusColor = _statusColor(status);

    final lastMsg = item['lastMessage'];
    final lastMsgText = lastMsg is Map
        ? (lastMsg['text'] ?? '').toString()
        : '';
    final lastMsgSender = lastMsg is Map
        ? (lastMsg['sender'] ?? '').toString()
        : '';
    final time = _formatTime(
      item['updatedAt']?.toString() ?? item['createdAt']?.toString(),
    );

    final assignedTo = item['assignedTo'] as List<dynamic>? ?? [];
    final assignedNames = assignedTo
        .whereType<Map>()
        .map((a) => a['name']?.toString() ?? '')
        .where((n) => n.isNotEmpty)
        .join(', ');
    final groupName = item['group'] is Map
        ? Map<String, dynamic>.from(item['group'] as Map)['name']?.toString()
        : null;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            UserAvatar(name: visitorName, radius: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          visitorName,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        time,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: cs.onSurface.withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    lastMsgText.isEmpty
                        ? 'No messages yet'
                        : (lastMsgSender.isEmpty
                              ? lastMsgText
                              : '$lastMsgSender: $lastMsgText'),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: cs.onSurface.withValues(alpha: 0.62),
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: statusColor.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Text(
                          status.isEmpty
                              ? 'Unknown'
                              : status[0].toUpperCase() + status.substring(1),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: statusColor,
                          ),
                        ),
                      ),
                      if (groupName != null && groupName.isNotEmpty)
                        _MiniChip(label: groupName),
                      if (assignedNames.isNotEmpty)
                        _MiniChip(label: 'Assigned: $assignedNames'),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  final String label;

  const _MiniChip({required this.label});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}
