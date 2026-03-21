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

final chatDialogsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  return ref.watch(apiClientProvider).getChatDialogs();
});

final chatGroupsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  return ref.watch(apiClientProvider).getChatGroups();
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

String _formatLastSeen(String? raw) {
  if (raw == null || raw.isEmpty) return 'Last seen unavailable';
  final dt = DateTime.tryParse(raw)?.toLocal();
  if (dt == null) return 'Last seen unavailable';
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 2) return 'Online';
  if (diff.inMinutes < 60) return 'Last seen ${diff.inMinutes}m ago';
  if (diff.inHours < 24) return 'Last seen ${diff.inHours}h ago';
  return 'Last seen ${diff.inDays}d ago';
}

bool _isUserOnline(Map<String, dynamic>? user) {
  if (user == null) return false;
  final status = user['agentStatus']?.toString().toLowerCase();
  if (status == 'online') return true;
  if (status == 'offline') return false;
  final lastActivity = user['lastActivity']?.toString();
  final dt = DateTime.tryParse(lastActivity ?? '')?.toLocal();
  if (dt == null) return false;
  return DateTime.now().difference(dt).inMinutes < 2;
}

Color _userStatusColor(Map<String, dynamic>? user, ColorScheme cs) {
  if (user == null) return cs.outline;
  final status = user['agentStatus']?.toString().toLowerCase();
  if (status == 'away') return Colors.amber.shade600;
  if (_isUserOnline(user)) return Colors.green.shade500;
  return cs.outline;
}

String _displayUserName(Map<String, dynamic>? user) {
  if (user == null) return 'Chat';
  final fullname = user['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final name = user['name']?.toString().trim() ?? '';
  return name.isNotEmpty ? name : 'Chat';
}

String _messagePreviewFromPayload(Map<String, dynamic> payload) {
  final type = payload['type']?.toString().toLowerCase() ?? '';
  if (type == 'deleted') return 'Message removed by administrator';

  final text = payload['text']?.toString().trim() ?? '';
  if (text.isNotEmpty) return text;

  final attachments = payload['attachments'] as List<dynamic>? ?? const [];
  if (attachments.isEmpty) return '';
  if (attachments.length > 1) return '${attachments.length} attachments';

  final attachment = attachments.first;
  if (attachment is Map<String, dynamic>) {
    final kind = attachment['kind']?.toString().toLowerCase() ?? '';
    switch (kind) {
      case 'image':
        return 'Image';
      case 'video':
        return 'Video';
      case 'audio':
        return 'Voice note';
      default:
        return attachment['fileName']?.toString() ?? 'Attachment';
    }
  }
  return 'Attachment';
}

Map<String, dynamic>? _peerUser(
  Map<String, dynamic> dialog, [
  String? currentUserId,
]) {
  final members = dialog['members'] as List<dynamic>? ?? const [];
  Map<String, dynamic>? fallback;

  for (final rawMember in members) {
    if (rawMember is! Map<String, dynamic>) continue;
    final user = rawMember['user'] as Map<String, dynamic>?;
    if (user == null) continue;
    fallback ??= user;
    if (currentUserId == null || currentUserId.isEmpty) continue;
    final userId = rawMember['userId']?.toString() ?? user['id']?.toString();
    if (userId != currentUserId) {
      return user;
    }
  }

  return fallback;
}

String? _peerUserId(
  Map<String, dynamic> dialog, [
  String? currentUserId,
]) {
  final members = dialog['members'] as List<dynamic>? ?? const [];
  for (final rawMember in members) {
    if (rawMember is! Map<String, dynamic>) continue;
    final userId = rawMember['userId']?.toString() ??
        (rawMember['user'] as Map<String, dynamic>?)?['id']?.toString();
    if (userId == null || userId.isEmpty) continue;
    if (currentUserId == null || currentUserId.isEmpty || userId != currentUserId) {
      return userId;
    }
  }
  return null;
}

bool _shouldHideDialog(Map<String, dynamic> dialog, [String? currentUserId]) {
  if (dialog['isExternal'] == true) return false;
  if (dialog['groupId'] != null || dialog['organizationId'] != null) return false;

  final subject = dialog['subject']?.toString().trim() ?? '';
  if (subject.isNotEmpty) return false;

  final peerId = _peerUserId(dialog, currentUserId);
  return peerId == null || peerId.isEmpty;
}

String _dialogTitle(Map<String, dynamic> dialog, [String? currentUserId]) {
  final subject = dialog['subject']?.toString().trim() ?? '';
  if (subject.isNotEmpty) return subject;
  return _displayUserName(_peerUser(dialog, currentUserId));
}

String _lastMessagePreview(Map<String, dynamic> dialog) {
  final messages = dialog['messages'] as List<dynamic>? ?? const [];
  if (messages.isEmpty) return '';
  final msg = messages.first;
  if (msg is! Map<String, dynamic>) return '';
  final payload = msg['payload'];
  if (payload is Map<String, dynamic>) {
    return _messagePreviewFromPayload(payload);
  }
  return '';
}

String _lastMessageTime(Map<String, dynamic> dialog) {
  final messages = dialog['messages'] as List<dynamic>? ?? const [];
  if (messages.isNotEmpty) {
    final msg = messages.first;
    if (msg is Map<String, dynamic>) {
      return _formatTime(msg['createdAt']?.toString());
    }
  }
  return _formatTime(dialog['updatedAt']?.toString());
}

String? _avatarPhotoUrl(Map<String, dynamic> dialog, [String? currentUserId]) {
  return _peerUser(dialog, currentUserId)?['photoUrl']?.toString();
}

String? _dialogGroupId(Map<String, dynamic> dialog) {
  final direct = dialog['groupId']?.toString();
  if (direct != null && direct.isNotEmpty) return direct;
  final group = dialog['group'];
  if (group is Map<String, dynamic>) {
    final id = group['id']?.toString();
    if (id != null && id.isNotEmpty) return id;
  }
  return null;
}

String? _dialogGroupName(Map<String, dynamic> dialog) {
  final group = dialog['group'];
  if (group is Map<String, dynamic>) {
    final name = group['name']?.toString().trim();
    if (name != null && name.isNotEmpty) return name;
  }
  return null;
}

Set<String> _existingDirectPeerIds(List<dynamic> dialogs, String? currentUserId) {
  if (currentUserId == null || currentUserId.isEmpty) return const <String>{};

  final ids = <String>{};
  for (final item in dialogs) {
    if (item is! Map<String, dynamic>) continue;
    if (_shouldHideDialog(item, currentUserId)) continue;
    if (item['groupId'] != null || item['organizationId'] != null) continue;
    final subject = item['subject']?.toString().trim() ?? '';
    if (subject.isNotEmpty) continue;
    final peerId = _peerUserId(item, currentUserId);
    if (peerId != null && peerId.isNotEmpty) {
      ids.add(peerId);
    }
  }
  return ids;
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> with AutoRefreshMixin {
  final _searchCtrl = TextEditingController();
  bool _showSearch = false;
  String _searchQuery = '';
  String _activeGroupId = 'all';

  @override
  void initState() {
    super.initState();
    startAutoRefresh(const Duration(seconds: 30), () {
      ref.invalidate(chatDialogsProvider);
      ref.invalidate(chatGroupsProvider);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchQuery = '';
        _searchCtrl.clear();
      }
    });
  }

  Future<void> _showNewChatSheet(BuildContext context) async {
    final result = await showModalBottomSheet<Map<String, dynamic>?>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _NewChatSheet(),
    );
    if (!mounted || result == null) return;

    ref.invalidate(chatDialogsProvider);
    final dialogId = result['dialogId']?.toString() ?? '';
    final dialog = result['dialog'] is Map
        ? Map<String, dynamic>.from(result['dialog'] as Map)
        : null;
    if (dialogId.isNotEmpty) {
      context.push('/chat/$dialogId', extra: {'dialog': dialog});
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search conversations...',
                  border: InputBorder.none,
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
                style: theme.textTheme.bodyLarge,
                onChanged: (value) => setState(() => _searchQuery = value),
              )
            : const Text('Chat', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search_rounded),
            onPressed: _toggleSearch,
            tooltip: _showSearch ? 'Close search' : 'Search',
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => _showNewChatSheet(context),
            tooltip: 'New chat',
          ),
        ],
      ),
      body: Column(
        children: [
          _GroupFilterBar(
            activeGroupId: _activeGroupId,
            onChanged: (value) => setState(() => _activeGroupId = value),
          ),
          Expanded(
            child: _DialogsList(
              searchQuery: _searchQuery,
              activeGroupId: _activeGroupId,
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupFilterBar extends ConsumerWidget {
  final String activeGroupId;
  final ValueChanged<String> onChanged;

  const _GroupFilterBar({
    required this.activeGroupId,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncGroups = ref.watch(chatGroupsProvider);

    return asyncGroups.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (groups) {
        if (groups.isEmpty) return const SizedBox.shrink();

        return SizedBox(
          height: 50,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            scrollDirection: Axis.horizontal,
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: const Text('All chats'),
                  selected: activeGroupId == 'all',
                  onSelected: (_) => onChanged('all'),
                ),
              ),
              for (final rawGroup in groups)
                if (rawGroup is Map)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(
                        (rawGroup['name'] ?? 'Group').toString(),
                      ),
                      selected: activeGroupId ==
                          (rawGroup['id']?.toString() ?? ''),
                      onSelected: (_) =>
                          onChanged(rawGroup['id']?.toString() ?? 'all'),
                    ),
                  ),
            ],
          ),
        );
      },
    );
  }
}

class _DialogsList extends ConsumerWidget {
  final String searchQuery;
  final String activeGroupId;

  const _DialogsList({
    required this.searchQuery,
    required this.activeGroupId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(chatDialogsProvider);
    final currentUserId = ref.watch(userProfileProvider).value?.id;

    return async.when(
      loading: () => const ShimmerList(count: 8),
      error: (error, _) => ErrorState(
        message: error.toString(),
        onRetry: () => ref.invalidate(chatDialogsProvider),
      ),
      data: (dialogs) {
        final filtered = _filter(dialogs, searchQuery, activeGroupId, currentUserId);
        if (filtered.isEmpty) {
          return EmptyState(
            icon: Icons.chat_bubble_outline_rounded,
            title: searchQuery.isNotEmpty ? 'No results' : 'No conversations yet',
            subtitle: searchQuery.isNotEmpty
                ? 'Try a different search term'
                : 'Tap the compose icon to start a new chat',
          );
        }

        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(chatDialogsProvider);
            ref.invalidate(chatGroupsProvider);
          },
          child: ListView.separated(
            itemCount: filtered.length,
            separatorBuilder: (_, __) =>
                const Divider(height: 1, indent: 72, endIndent: 16),
            itemBuilder: (ctx, index) {
              final dialog = filtered[index];
              return _DialogTile(
                dialog: dialog,
                currentUserId: currentUserId,
                onTap: () {
                  final id = dialog['id']?.toString() ?? '';
                  if (id.isNotEmpty) {
                    ctx.push('/chat/$id', extra: {'dialog': dialog});
                  }
                },
              );
            },
          ),
        );
      },
    );
  }

  List<Map<String, dynamic>> _filter(
    List<dynamic> list,
    String query,
    String groupId,
    String? currentUserId,
  ) {
    final lower = query.trim().toLowerCase();

    return list
        .whereType<Map<String, dynamic>>()
        .where((dialog) {
          if (_shouldHideDialog(dialog, currentUserId)) return false;

          if (groupId != 'all' && _dialogGroupId(dialog) != groupId) {
            return false;
          }

          if (lower.isEmpty) return true;

          final haystack = [
            _dialogTitle(dialog, currentUserId),
            _lastMessagePreview(dialog),
            _dialogGroupName(dialog) ?? '',
            _displayUserName(_peerUser(dialog, currentUserId)),
          ].join(' ').toLowerCase();

          return haystack.contains(lower);
        })
        .toList();
  }
}

class _DialogTile extends StatelessWidget {
  final Map<String, dynamic> dialog;
  final String? currentUserId;
  final VoidCallback onTap;

  const _DialogTile({
    required this.dialog,
    required this.onTap,
    this.currentUserId,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final title = _dialogTitle(dialog, currentUserId);
    final lastMsg = _lastMessagePreview(dialog);
    final time = _lastMessageTime(dialog);
    final unread = (dialog['unreadCount'] as int?) ?? 0;
    final photoUrl = _avatarPhotoUrl(dialog, currentUserId);
    final peer = _peerUser(dialog, currentUserId);
    final groupName = _dialogGroupName(dialog);
    final subtitle = lastMsg.isNotEmpty
        ? lastMsg
        : (peer != null ? _formatLastSeen(peer['lastActivity']?.toString()) : 'No messages yet');
    final isDirect = dialog['groupId'] == null &&
        dialog['organizationId'] == null &&
        groupName == null &&
        ((dialog['subject']?.toString().trim() ?? '').isEmpty);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            Stack(
              children: [
                UserAvatar(
                  name: title,
                  photoUrl: photoUrl,
                  radius: 26,
                ),
                if (isDirect && peer != null)
                  Positioned(
                    right: 1,
                    bottom: 1,
                    child: _StatusDot(
                      color: _userStatusColor(peer, cs),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (isDirect && peer != null)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: _userStatusColor(peer, cs),
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      Expanded(
                        child: Text(
                          title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight:
                                unread > 0 ? FontWeight.w700 : FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (groupName != null && groupName.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        _DialogMetaChip(label: groupName),
                      ],
                      const SizedBox(width: 8),
                      Text(
                        time,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: unread > 0
                              ? cs.primary
                              : cs.onSurface.withValues(alpha: 0.5),
                          fontWeight:
                              unread > 0 ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          subtitle,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: unread > 0
                                ? cs.onSurface.withValues(alpha: 0.85)
                                : cs.onSurface.withValues(alpha: 0.55),
                            fontWeight:
                                unread > 0 ? FontWeight.w500 : FontWeight.normal,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (unread > 0) ...[
                        const SizedBox(width: 8),
                        _UnreadBadge(count: unread),
                      ],
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

class _StatusDot extends StatelessWidget {
  final Color color;

  const _StatusDot({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(
          color: Theme.of(context).colorScheme.surface,
          width: 2,
        ),
      ),
    );
  }
}

class _DialogMetaChip extends StatelessWidget {
  final String label;

  const _DialogMetaChip({required this.label});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall,
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  final int count;

  const _UnreadBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFFE81313);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: primaryColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }
}

class _NewChatSheet extends ConsumerStatefulWidget {
  const _NewChatSheet();

  @override
  ConsumerState<_NewChatSheet> createState() => _NewChatSheetState();
}

class _NewChatSheetState extends ConsumerState<_NewChatSheet> {
  final _directSearchCtrl = TextEditingController();
  final _groupTitleCtrl = TextEditingController();
  final _groupSearchCtrl = TextEditingController();

  List<dynamic> _users = [];
  List<dynamic> _groups = [];
  bool _loading = false;
  bool _submittingDirect = false;
  bool _submittingGroup = false;
  String _directQuery = '';
  String _groupQuery = '';
  String _selectedGroupId = 'none';
  final Set<String> _selectedMemberIds = <String>{};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _directSearchCtrl.dispose();
    _groupTitleCtrl.dispose();
    _groupSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      final results = await Future.wait([
        api.getChatUsers(),
        api.getChatGroups(),
      ]);
      if (!mounted) return;
      setState(() {
        _users = results[0] as List<dynamic>;
        _groups = results[1] as List<dynamic>;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  List<dynamic> _filteredDirectUsers(
    String? currentUserId,
    Set<String> existingDirectUserIds,
  ) {
    final lower = _directQuery.trim().toLowerCase();
    return _users.where((rawUser) {
      final user = rawUser as Map<String, dynamic>;
      final userId = user['id']?.toString() ?? '';
      if (userId.isEmpty || userId == currentUserId) return false;
      if (existingDirectUserIds.contains(userId)) return false;

      if (lower.isEmpty) return true;

      final haystack = [
        user['name']?.toString() ?? '',
        user['fullname']?.toString() ?? '',
        user['email']?.toString() ?? '',
        user['department']?.toString() ?? '',
        user['position']?.toString() ?? '',
      ].join(' ').toLowerCase();
      return haystack.contains(lower);
    }).toList();
  }

  List<dynamic> _filteredGroupUsers(String? currentUserId) {
    final lower = _groupQuery.trim().toLowerCase();
    return _users.where((rawUser) {
      final user = rawUser as Map<String, dynamic>;
      final userId = user['id']?.toString() ?? '';
      if (userId.isEmpty || userId == currentUserId) return false;

      if (lower.isEmpty) return true;

      final haystack = [
        user['name']?.toString() ?? '',
        user['fullname']?.toString() ?? '',
        user['email']?.toString() ?? '',
        user['department']?.toString() ?? '',
        user['position']?.toString() ?? '',
      ].join(' ').toLowerCase();
      return haystack.contains(lower);
    }).toList();
  }

  String _userSubtitle(Map<String, dynamic> user) {
    final position = user['position']?.toString().trim() ?? '';
    final department = user['department']?.toString().trim() ?? '';
    final presence = _formatLastSeen(user['lastActivity']?.toString());
    final parts = <String>[
      if (position.isNotEmpty) position,
      if (department.isNotEmpty) department,
      presence,
    ];
    return parts.join(' | ');
  }

  Future<void> _openDirectChat(String userId) async {
    if (_submittingDirect) return;
    setState(() => _submittingDirect = true);
    try {
      final dialog = await ref.read(apiClientProvider).createChatDialog(
            memberIds: [userId],
          );
      final dialogId = dialog['id']?.toString() ?? '';
      if (!mounted || dialogId.isEmpty) return;
      ref.invalidate(chatDialogsProvider);
      Navigator.of(context).pop({
        'dialogId': dialogId,
        'dialog': dialog,
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open chat: $error')),
      );
    } finally {
      if (mounted) setState(() => _submittingDirect = false);
    }
  }

  Future<void> _createGroupChat() async {
    if (_submittingGroup) return;

    final subject = _groupTitleCtrl.text.trim();
    if (subject.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Group chat title is required.')),
      );
      return;
    }
    if (_selectedMemberIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one other member.')),
      );
      return;
    }

    setState(() => _submittingGroup = true);
    try {
      final dialog = await ref.read(apiClientProvider).createChatDialog(
            memberIds: _selectedMemberIds.toList(),
            subject: subject,
            groupId: _selectedGroupId == 'none' ? null : _selectedGroupId,
          );
      final dialogId = dialog['id']?.toString() ?? '';
      if (!mounted || dialogId.isEmpty) return;
      ref.invalidate(chatDialogsProvider);
      Navigator.of(context).pop({
        'dialogId': dialogId,
        'dialog': dialog,
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not create group chat: $error')),
      );
    } finally {
      if (mounted) setState(() => _submittingGroup = false);
    }
  }

  Future<void> _showCreateChannelDialog() async {
    final nameCtrl = TextEditingController();
    final descriptionCtrl = TextEditingController();
    bool creating = false;

    try {
      await showDialog<void>(
        context: context,
        builder: (dialogContext) {
          return StatefulBuilder(
            builder: (context, setDialogState) => AlertDialog(
              title: const Text('New Channel'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Channel name',
                    ),
                    autofocus: true,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: descriptionCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                    ),
                    minLines: 2,
                    maxLines: 4,
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: creating
                      ? null
                      : () => Navigator.of(dialogContext).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: creating
                      ? null
                      : () async {
                          final name = nameCtrl.text.trim();
                          if (name.isEmpty) return;
                          setDialogState(() => creating = true);
                          try {
                            final created = await ref
                                .read(apiClientProvider)
                                .createChatGroup(
                                  name: name,
                                  description: descriptionCtrl.text.trim(),
                                );
                            if (!mounted) return;
                            setState(() {
                              _groups = [
                                ..._groups,
                                created,
                              ]..sort((a, b) {
                                  final aMap =
                                      Map<String, dynamic>.from(a as Map);
                                  final bMap =
                                      Map<String, dynamic>.from(b as Map);
                                  final aName =
                                      aMap['name']?.toString().toLowerCase() ??
                                          '';
                                  final bName =
                                      bMap['name']?.toString().toLowerCase() ??
                                          '';
                                  return aName.compareTo(bName);
                                });
                              _selectedGroupId =
                                  created['id']?.toString() ?? 'none';
                            });
                            ref.invalidate(chatGroupsProvider);
                            if (dialogContext.mounted) {
                              Navigator.of(dialogContext).pop();
                            }
                          } catch (error) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content:
                                    Text('Could not create channel: $error'),
                              ),
                            );
                            setDialogState(() => creating = false);
                          }
                        },
                  child: creating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Create'),
                ),
              ],
            ),
          );
        },
      );
    } finally {
      nameCtrl.dispose();
      descriptionCtrl.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final currentUser = ref.watch(userProfileProvider).value;
    final currentUserId = currentUser?.id;
    final existingDialogs = ref.watch(chatDialogsProvider).value ?? const [];
    final existingDirectUserIds =
        _existingDirectPeerIds(existingDialogs, currentUserId);
    final directUsers = _filteredDirectUsers(currentUserId, existingDirectUserIds);
    final groupUsers = _filteredGroupUsers(currentUserId);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.82,
        child: DefaultTabController(
          length: 2,
          child: Column(
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'New Chat',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Refresh',
                      onPressed: _loading ? null : _loadData,
                      icon: const Icon(Icons.refresh_rounded),
                    ),
                  ],
                ),
              ),
              const TabBar(
                tabs: [
                  Tab(text: 'Direct'),
                  Tab(text: 'Group'),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : TabBarView(
                        children: [
                          Column(
                            children: [
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 16),
                                child: TextField(
                                  controller: _directSearchCtrl,
                                  decoration: const InputDecoration(
                                    hintText: 'Search people...',
                                    prefixIcon: Icon(Icons.search_rounded),
                                    isDense: true,
                                  ),
                                  onChanged: (value) =>
                                      setState(() => _directQuery = value),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Expanded(
                                child: directUsers.isEmpty
                                    ? Padding(
                                        padding: const EdgeInsets.all(32),
                                        child: Center(
                                          child: Text(
                                            _users.isEmpty
                                                ? 'No users found'
                                                : 'No new people to chat with',
                                          ),
                                        ),
                                      )
                                    : ListView.builder(
                                        itemCount: directUsers.length,
                                        itemBuilder: (ctx, index) {
                                          final user = directUsers[index]
                                              as Map<String, dynamic>;
                                          final name = _displayUserName(user);
                                          final photoUrl =
                                              user['photoUrl'] as String?;
                                          final email =
                                              user['email']?.toString() ?? '';
                                          final online = _isUserOnline(user);

                                          return ListTile(
                                            leading: Stack(
                                              children: [
                                                UserAvatar(
                                                  name: name,
                                                  photoUrl: photoUrl,
                                                  radius: 20,
                                                ),
                                                Positioned(
                                                  right: 0,
                                                  bottom: 0,
                                                  child: _StatusDot(
                                                    color: _userStatusColor(
                                                      user,
                                                      theme.colorScheme,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                            title: Row(
                                              children: [
                                                Expanded(child: Text(name)),
                                                Text(
                                                  online ? 'Online' : '',
                                                  style: theme
                                                      .textTheme.labelSmall
                                                      ?.copyWith(
                                                    color:
                                                        Colors.green.shade600,
                                                  ),
                                                ),
                                              ],
                                            ),
                                            subtitle: Text(
                                              [
                                                if (email.isNotEmpty) email,
                                                _userSubtitle(user),
                                              ].join(' | '),
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            onTap: _submittingDirect
                                                ? null
                                                : () => _openDirectChat(
                                                      user['id']?.toString() ??
                                                          '',
                                                    ),
                                          );
                                        },
                                      ),
                              ),
                            ],
                          ),
                          Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                child: TextField(
                                  controller: _groupTitleCtrl,
                                  decoration: const InputDecoration(
                                    labelText: 'Group chat title',
                                    hintText: 'Team coordination',
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: DropdownButtonFormField<String>(
                                        value: _selectedGroupId,
                                        decoration: const InputDecoration(
                                          labelText: 'Channel',
                                        ),
                                        items: [
                                          const DropdownMenuItem(
                                            value: 'none',
                                            child: Text('No channel'),
                                          ),
                                          ..._groups
                                              .whereType<Map>()
                                              .map((group) {
                                            final item = Map<String, dynamic>.from(group);
                                            final id =
                                                item['id']?.toString() ?? '';
                                            return DropdownMenuItem(
                                              value: id,
                                              child: Text(
                                                item['name']?.toString() ??
                                                    'Channel',
                                              ),
                                            );
                                          }),
                                        ],
                                        onChanged: (value) => setState(
                                          () => _selectedGroupId =
                                              value ?? 'none',
                                        ),
                                      ),
                                    ),
                                    if (currentUser?.isAdmin == true) ...[
                                      const SizedBox(width: 12),
                                      OutlinedButton.icon(
                                        onPressed: _showCreateChannelDialog,
                                        icon: const Icon(Icons.add_rounded),
                                        label: const Text('Channel'),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                child: TextField(
                                  controller: _groupSearchCtrl,
                                  decoration: const InputDecoration(
                                    hintText: 'Search members...',
                                    prefixIcon: Icon(Icons.search_rounded),
                                    isDense: true,
                                  ),
                                  onChanged: (value) =>
                                      setState(() => _groupQuery = value),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    '${_selectedMemberIds.length} member${_selectedMemberIds.length == 1 ? '' : 's'} selected',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.65),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Expanded(
                                child: groupUsers.isEmpty
                                    ? const Center(
                                        child: Text('No members available'),
                                      )
                                    : ListView.builder(
                                        itemCount: groupUsers.length,
                                        itemBuilder: (ctx, index) {
                                          final user = groupUsers[index]
                                              as Map<String, dynamic>;
                                          final userId =
                                              user['id']?.toString() ?? '';
                                          final selected =
                                              _selectedMemberIds.contains(userId);

                                          return CheckboxListTile(
                                            value: selected,
                                            onChanged: (value) {
                                              setState(() {
                                                if (value == true) {
                                                  _selectedMemberIds.add(userId);
                                                } else {
                                                  _selectedMemberIds
                                                      .remove(userId);
                                                }
                                              });
                                            },
                                            secondary: Stack(
                                              children: [
                                                UserAvatar(
                                                  name: _displayUserName(user),
                                                  photoUrl:
                                                      user['photoUrl'] as String?,
                                                  radius: 18,
                                                ),
                                                Positioned(
                                                  right: 0,
                                                  bottom: 0,
                                                  child: _StatusDot(
                                                    color: _userStatusColor(
                                                      user,
                                                      theme.colorScheme,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                            title: Text(_displayUserName(user)),
                                            subtitle: Text(
                                              _userSubtitle(user),
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            controlAffinity:
                                                ListTileControlAffinity.trailing,
                                          );
                                        },
                                      ),
                              ),
                              SafeArea(
                                top: false,
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    8,
                                    16,
                                    12,
                                  ),
                                  child: SizedBox(
                                    width: double.infinity,
                                    child: FilledButton.icon(
                                      onPressed: _submittingGroup
                                          ? null
                                          : _createGroupChat,
                                      icon: _submittingGroup
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child:
                                                  CircularProgressIndicator(
                                                strokeWidth: 2,
                                                color: Colors.white,
                                              ),
                                            )
                                          : const Icon(Icons.group_add_rounded),
                                      label: Text(
                                        _submittingGroup
                                            ? 'Creating...'
                                            : 'Create group chat',
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
