import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/user_provider.dart';
import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/user_avatar.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _teamProvider =
    FutureProvider.family<List<dynamic>, String>((ref, search) async {
  final api = ref.watch(apiClientProvider);
  return api.getTeamUsers(search: search.isEmpty ? null : search);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFE81313);

String _userName(Map<String, dynamic> user) =>
    (user['fullname'] ?? user['name'] ?? user['displayName'] ?? 'Unknown')
        .toString();

String _userRole(Map<String, dynamic> user) =>
    (user['role'] ?? user['position'] ?? '').toString();

String _userDepartment(Map<String, dynamic> user) =>
    (user['department'] ?? '').toString();

String _userEmail(Map<String, dynamic> user) =>
    (user['email'] ?? '').toString();

String _userPhone(Map<String, dynamic> user) =>
    (user['phoneWork'] ?? user['phoneMobile'] ?? '').toString();

String? _userPhoto(Map<String, dynamic> user) =>
    (user['photoUrl'] ?? user['avatar'] ?? user['photo'])?.toString();

bool _userIsActive(Map<String, dynamic> user) {
  final workState = user['workState']?.toString();
  if (workState != null) return workState == 'online';
  final v = user['isActive'] ?? user['isOnline'] ?? user['active'];
  if (v is bool) return v;
  if (v is int) return v == 1;
  return false;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> with AutoRefreshMixin {
  bool _showSearch = false;
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    startAutoRefresh(
      const Duration(seconds: 120),
      () => ref.invalidate(_teamProvider),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchQuery = '';
        _searchController.clear();
      }
    });
  }

  void _showMemberSheet(BuildContext context, Map<String, dynamic> user) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _MemberSheet(user: user),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final async = ref.watch(_teamProvider(_searchQuery));

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search team members…',
                  border: InputBorder.none,
                  hintStyle: TextStyle(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  filled: false,
                ),
                style: theme.textTheme.bodyLarge,
                onChanged: (v) => setState(() => _searchQuery = v),
              )
            : const Text('Team', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search_rounded),
            onPressed: _toggleSearch,
            tooltip: _showSearch ? 'Close search' : 'Search',
          ),
        ],
      ),
      body: async.when(
        loading: () => const ShimmerGrid(count: 6, crossAxisCount: 2),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_teamProvider(_searchQuery)),
        ),
        data: (users) {
          if (users.isEmpty) {
            return EmptyState(
              icon: Icons.group_outlined,
              title: _searchQuery.isNotEmpty ? 'No results' : 'No team members',
              subtitle: _searchQuery.isNotEmpty
                  ? 'Try a different search term'
                  : 'No team members found',
            );
          }

          return RefreshIndicator(
            color: _kPrimary,
            onRefresh: () async => ref.invalidate(_teamProvider(_searchQuery)),
            child: LayoutBuilder(
              builder: (ctx, constraints) {
                // 2 columns on phone (<600), 3 on tablet
                final crossAxis = constraints.maxWidth >= 600 ? 3 : 2;
                return GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxis,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.85,
                  ),
                  itemCount: users.length,
                  itemBuilder: (ctx, i) {
                    final user = users[i] as Map<String, dynamic>;
                    return _TeamMemberCard(
                      user: user,
                      onTap: () => _showMemberSheet(ctx, user),
                    );
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

// ─── Team member card ─────────────────────────────────────────────────────────

class _TeamMemberCard extends StatelessWidget {
  final Map<String, dynamic> user;
  final VoidCallback onTap;

  const _TeamMemberCard({required this.user, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = _userName(user);
    final role = _userRole(user);
    final department = _userDepartment(user);
    final photo = _userPhoto(user);
    final isActive = _userIsActive(user);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Avatar with online status dot
              Stack(
                children: [
                  UserAvatar(photoUrl: photo, name: name, radius: 30),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: isActive
                            ? const Color(0xFF10B981)
                            : theme.colorScheme.surfaceContainerHighest,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: theme.colorScheme.surface,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                name,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (role.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  role,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: _kPrimary,
                    fontWeight: FontWeight.w500,
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (department.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  department,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Member profile bottom sheet ─────────────────────────────────────────────

class _MemberSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> user;
  const _MemberSheet({required this.user});

  @override
  ConsumerState<_MemberSheet> createState() => _MemberSheetState();
}

class _MemberSheetState extends ConsumerState<_MemberSheet> {
  bool _sending = false;

  Future<void> _openChat() async {
    final userId = (widget.user['id'] ?? '').toString();
    if (userId.isEmpty) return;
    final currentUserId = ref.read(userProfileProvider).value?.id;
    if (currentUserId != null && currentUserId == userId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('You cannot start a chat with yourself.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() => _sending = true);
    try {
      final api = ref.read(apiClientProvider);
      final dialog = await api.createChatDialog(memberIds: [userId]);
      final dialogId = (dialog['id'] ?? '').toString();
      if (dialogId.isNotEmpty && mounted) {
        Navigator.of(context).pop();
        context.push('/chat/$dialogId', extra: {'dialog': dialog, 'isLiveChat': false});
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to open chat: $e'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = _userName(widget.user);
    final role = _userRole(widget.user);
    final department = _userDepartment(widget.user);
    final email = _userEmail(widget.user);
    final phone = _userPhone(widget.user);
    final photo = _userPhoto(widget.user);
    final isActive = _userIsActive(widget.user);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Stack(
              alignment: Alignment.bottomRight,
              children: [
                UserAvatar(photoUrl: photo, name: name, radius: 42),
                Container(
                  width: 18, height: 18,
                  decoration: BoxDecoration(
                    color: isActive ? const Color(0xFF10B981) : theme.colorScheme.surfaceContainerHighest,
                    shape: BoxShape.circle,
                    border: Border.all(color: theme.colorScheme.surface, width: 2.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
            if (role.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(role, style: theme.textTheme.bodyMedium?.copyWith(color: _kPrimary, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: isActive ? const Color(0xFF10B981).withValues(alpha: 0.12) : theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                isActive ? 'Online' : 'Offline',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isActive ? const Color(0xFF10B981) : theme.colorScheme.onSurfaceVariant),
              ),
            ),
            const SizedBox(height: 20),
            _InfoRow(icon: Icons.business_outlined, label: 'Department', value: department.isNotEmpty ? department : '—'),
            _InfoRow(icon: Icons.email_outlined, label: 'Email', value: email.isNotEmpty ? email : '—'),
            _InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: phone.isNotEmpty ? phone : '—'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _sending ? null : _openChat,
                icon: _sending
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.chat_bubble_outline_rounded),
                label: const Text('Send Message'),
                style: FilledButton.styleFrom(
                  backgroundColor: _kPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon,
              size: 18,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          const SizedBox(width: 12),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
              fontWeight: FontWeight.w500,
            ),
            // Fixed width so values align
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500),
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
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
