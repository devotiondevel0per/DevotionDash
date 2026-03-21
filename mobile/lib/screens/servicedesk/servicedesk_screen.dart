import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _serviceDeskProvider =
    FutureProvider.family<List<dynamic>, String>((ref, status) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.getServiceDeskRequests(
    status: status.isEmpty ? null : status,
  );
  if (res is List) return res;
  if (res is Map) {
    final raw = res['requests'] ?? res['data'] ?? [];
    return raw as List<dynamic>;
  }
  return [];
});

final _serviceDeskGroupsProvider = FutureProvider<List<dynamic>>((ref) async {
  return ref.watch(apiClientProvider).getServiceDeskGroups();
});

final _serviceDeskUsersProvider = FutureProvider<List<dynamic>>((ref) async {
  return ref.watch(apiClientProvider).getTeamUsers();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFE81313);

Color _statusColor(String? status) {
  switch ((status ?? '').toLowerCase()) {
    case 'open':
    case 'opened':
    case 'new':
      return const Color(0xFF3B82F6);
    case 'in_progress':
    case 'inprogress':
    case 'in progress':
      return const Color(0xFFF97316);
    case 'closed':
    case 'resolved':
      return const Color(0xFF6B7280);
    case 'pending':
      return const Color(0xFF8B5CF6);
    default:
      return const Color(0xFF6B7280);
  }
}

Color _priorityColor(String? priority) {
  switch ((priority ?? '').toLowerCase()) {
    case 'urgent':
      return const Color(0xFFDC2626);
    case 'high':
      return const Color(0xFFEF4444);
    case 'normal':
    case 'medium':
      return const Color(0xFFF59E0B);
    case 'low':
      return const Color(0xFF10B981);
    default:
      return const Color(0xFF6B7280);
  }
}

String _formatDate(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw).toLocal();
    return DateFormat('MMM d, y').format(dt);
  } catch (_) {
    return raw;
  }
}

String _requestSubject(Map<String, dynamic> req) =>
    (req['title'] ?? req['subject'] ?? 'Untitled').toString();

String _requesterName(Map<String, dynamic> req) {
  final r = req['requester'];
  if (r is Map) return (r['fullname'] ?? r['name'] ?? '').toString();
  return '';
}

String _capitalize(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

// ─── Tab definitions ──────────────────────────────────────────────────────────

const _kTabs = [
  ('All', ''),
  ('Open', 'open'),
  ('In Progress', 'in_progress'),
  ('Closed', 'closed'),
];

// ─── Screen ───────────────────────────────────────────────────────────────────

class ServiceDeskScreen extends ConsumerStatefulWidget {
  const ServiceDeskScreen({super.key});

  @override
  ConsumerState<ServiceDeskScreen> createState() => _ServiceDeskScreenState();
}

class _ServiceDeskScreenState extends ConsumerState<ServiceDeskScreen>
    with SingleTickerProviderStateMixin, AutoRefreshMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _kTabs.length, vsync: this);
    startAutoRefresh(const Duration(seconds: 60), () {
      for (final t in _kTabs) { ref.invalidate(_serviceDeskProvider(t.$2)); }
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  void _openCreateSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CreateRequestSheet(
        onCreated: () {
          for (final t in _kTabs) {
            ref.invalidate(_serviceDeskProvider(t.$2));
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Service Desk',
            style: TextStyle(fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          tabs: _kTabs.map((t) => Tab(text: t.$1)).toList(),
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: _kTabs
            .map((t) => _RequestList(
                  status: t.$2,
                  onRefresh: () async =>
                      ref.invalidate(_serviceDeskProvider(t.$2)),
                ))
            .toList(),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateSheet,
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Request'),
      ),
    );
  }
}

// ─── Request list ─────────────────────────────────────────────────────────────

class _RequestList extends ConsumerWidget {
  final String status;
  final Future<void> Function() onRefresh;

  const _RequestList({required this.status, required this.onRefresh});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_serviceDeskProvider(status));

    return async.when(
      loading: () => const ShimmerList(count: 8),
      error: (e, _) => _ErrorView(
        message: e.toString(),
        onRetry: () => ref.invalidate(_serviceDeskProvider(status)),
      ),
      data: (requests) {
        if (requests.isEmpty) {
          return EmptyState(
            icon: Icons.support_agent_rounded,
            title: 'No requests',
            subtitle: status.isEmpty
                ? 'No service desk requests found'
                : 'No requests with this status',
          );
        }

        return RefreshIndicator(
          color: _kPrimary,
          onRefresh: onRefresh,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            itemCount: requests.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (ctx, i) {
              final req = requests[i] as Map<String, dynamic>;
              return _RequestCard(
                request: req,
                onTap: () {
                  final id = req['id']?.toString() ?? '';
                  if (id.isNotEmpty) ctx.push('/servicedesk/$id');
                },
              );
            },
          ),
        );
      },
    );
  }
}

// ─── Request card ─────────────────────────────────────────────────────────────

class _RequestCard extends StatelessWidget {
  final Map<String, dynamic> request;
  final VoidCallback onTap;

  const _RequestCard({required this.request, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final subject = _requestSubject(request);
    final status = (request['status'] ?? '').toString();
    final priority = (request['priority'] ?? '').toString();
    final requester = _requesterName(request);
    final createdAt = _formatDate(
        request['createdAt']?.toString() ?? request['created_at']?.toString());

    final statusColor = _statusColor(status);
    final priorityColor = _priorityColor(priority);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title row
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      subject,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(label: status, color: statusColor),
                ],
              ),
              const SizedBox(height: 10),
              // Meta row
              Wrap(
                spacing: 10,
                runSpacing: 6,
                children: [
                  if (priority.isNotEmpty && priority != 'null')
                    _PriorityBadge(label: priority, color: priorityColor),
                  if (requester.isNotEmpty)
                    _MetaItem(
                        icon: Icons.person_outline_rounded,
                        label: requester),
                  if (createdAt.isNotEmpty)
                    _MetaItem(
                        icon: Icons.calendar_today_rounded,
                        label: createdAt),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Shared chip/badge widgets ────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    if (label.isEmpty || label == 'null') return const SizedBox.shrink();
    final display =
        label.replaceAll('_', ' ').split(' ').map(_capitalize).join(' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        display,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

class _PriorityBadge extends StatelessWidget {
  final String label;
  final Color color;
  const _PriorityBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.flag_rounded, size: 13, color: color),
        const SizedBox(width: 3),
        Text(
          _capitalize(label),
          style: TextStyle(
              fontSize: 12, color: color, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }
}

class _MetaItem extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MetaItem({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final c =
        Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: c),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 12, color: c)),
      ],
    );
  }
}

// ─── Create request sheet ─────────────────────────────────────────────────────

class _CreateRequestSheet extends ConsumerStatefulWidget {
  final VoidCallback? onCreated;
  const _CreateRequestSheet({this.onCreated});

  @override
  ConsumerState<_CreateRequestSheet> createState() =>
      _CreateRequestSheetState();
}

class _CreateRequestSheetState extends ConsumerState<_CreateRequestSheet> {
  final _formKey = GlobalKey<FormState>();
  final _subjectCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _organizationCtrl = TextEditingController();
  String _groupId = '';
  String _categoryId = '';
  String _assigneeId = '';
  String _priority = 'normal';
  bool _loading = false;

  @override
  void dispose() {
    _subjectCtrl.dispose();
    _descCtrl.dispose();
    _organizationCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.createServiceDeskRequest({
        'title': _subjectCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'priority': _priority,
        if (_groupId.isNotEmpty) 'groupId': _groupId,
        if (_categoryId.isNotEmpty) 'categoryId': _categoryId,
        if (_assigneeId.isNotEmpty) 'assigneeId': _assigneeId,
        if (_organizationCtrl.text.trim().isNotEmpty)
          'organizationId': _organizationCtrl.text.trim(),
      });
      if (mounted) {
        Navigator.of(context).pop();
        widget.onCreated?.call();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Request created successfully'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create request: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final groups = ref.watch(_serviceDeskGroupsProvider).valueOrNull ?? const [];
    final users = ref.watch(_serviceDeskUsersProvider).valueOrNull ?? const [];
    Map<String, dynamic>? selectedGroup;
    for (final group in groups) {
      final item = group as Map<String, dynamic>;
      if ((item['id'] ?? '').toString() == _groupId) {
        selectedGroup = item;
        break;
      }
    }
    final categories = (selectedGroup?['categories'] as List<dynamic>?) ?? const [];

    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text(
                'New Request',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),
              // Subject
              TextFormField(
                controller: _subjectCtrl,
                decoration: const InputDecoration(
                  labelText: 'Subject *',
                  prefixIcon: Icon(Icons.title_rounded),
                ),
                textCapitalization: TextCapitalization.sentences,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Subject is required' : null,
              ),
              const SizedBox(height: 14),
              // Description
              TextFormField(
                controller: _descCtrl,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  prefixIcon: Icon(Icons.notes_rounded),
                  alignLabelWithHint: true,
                ),
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _groupId.isEmpty ? null : _groupId,
                decoration: const InputDecoration(
                  labelText: 'Group',
                  prefixIcon: Icon(Icons.groups_rounded),
                ),
                items: groups.map((group) {
                  final item = group as Map<String, dynamic>;
                  return DropdownMenuItem<String>(
                    value: item['id']?.toString() ?? '',
                    child: Text((item['name'] ?? 'Unnamed group').toString()),
                  );
                }).toList(),
                onChanged: (value) => setState(() {
                  _groupId = value ?? '';
                  _categoryId = '';
                }),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _categoryId.isEmpty ? null : _categoryId,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  prefixIcon: Icon(Icons.category_outlined),
                ),
                items: categories.map((category) {
                  final item = category as Map<String, dynamic>;
                  return DropdownMenuItem<String>(
                    value: item['id']?.toString() ?? '',
                    child: Text((item['name'] ?? 'Unnamed category').toString()),
                  );
                }).toList(),
                onChanged: (value) => setState(() => _categoryId = value ?? ''),
              ),
              const SizedBox(height: 14),
              // Priority
              DropdownButtonFormField<String>(
                initialValue: _priority,
                decoration: const InputDecoration(
                  labelText: 'Priority',
                  prefixIcon: Icon(Icons.flag_rounded),
                ),
                items: const [
                  DropdownMenuItem(value: 'low', child: Text('Low')),
                  DropdownMenuItem(value: 'normal', child: Text('Normal')),
                  DropdownMenuItem(value: 'high', child: Text('High')),
                  DropdownMenuItem(value: 'urgent', child: Text('Urgent')),
                ],
                onChanged: (v) => setState(() => _priority = v ?? 'normal'),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _assigneeId.isEmpty ? null : _assigneeId,
                decoration: const InputDecoration(
                  labelText: 'Assignee',
                  prefixIcon: Icon(Icons.person_add_alt_rounded),
                ),
                items: users.map((user) {
                  final item = user as Map<String, dynamic>;
                  final label = (item['fullname'] ?? item['name'] ?? item['email'] ?? 'Unknown')
                      .toString();
                  return DropdownMenuItem<String>(
                    value: item['id']?.toString() ?? '',
                    child: Text(label),
                  );
                }).toList(),
                onChanged: (value) => setState(() => _assigneeId = value ?? ''),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _organizationCtrl,
                decoration: const InputDecoration(
                  labelText: 'Organization ID',
                  prefixIcon: Icon(Icons.business_outlined),
                ),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: _kPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Submit Request',
                        style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
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
