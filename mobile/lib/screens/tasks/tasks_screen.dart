import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';
import 'task_editor_sheet.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

/// Family param: tab key — '', 'personal', 'assigned', 'completed'.
final tasksProvider =
    FutureProvider.family<List<dynamic>, ({String key, String search})>((ref, query) async {
  final api = ref.watch(apiClientProvider);
  final key = query.key;

  // Map tab keys to the correct server params:
  //  ''          → view=overview (creator or assignee, all statuses)
  //  'personal'  → view=personal (tasks I created)
  //  'assigned'  → view=assigned (tasks assigned to me)
  //  'completed' → view=overview + status=completed
  String view = 'overview';
  String? category;
  switch (key) {
    case 'personal':
      view = 'personal';
      break;
    case 'assigned':
      view = 'assigned';
      break;
    case 'groups':
      view = 'groups';
      break;
    case 'all':
      view = 'all';
      break;
    case 'completed':
      view = 'overview';
      category = 'closed';
      break;
    default:
      view = 'overview';
  }

  final res = await api.getTasks(
    view: view,
    category: category,
    search: query.search.trim().isEmpty ? null : query.search.trim(),
    limit: 50,
  );
  if (res is List) return res;
  if (res is Map) {
    final raw = res['items'] ?? res['data'] ?? res['tasks'] ?? [];
    return raw as List<dynamic>;
  }
  return [];
});

final taskStagesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.getTasks(limit: 1);
  if (res is Map && res['stages'] is List) {
    return (res['stages'] as List<dynamic>)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
  }
  return const [];
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

Color _parseHexColor(String? hex, {Color fallback = const Color(0xFF6B7280)}) {
  if (hex == null) return fallback;
  final normalized = hex.replaceAll('#', '').trim();
  if (normalized.length != 6) return fallback;
  final value = int.tryParse(normalized, radix: 16);
  if (value == null) return fallback;
  return Color(0xFF000000 | value);
}

Map<String, dynamic>? _findStage(String? status, List<Map<String, dynamic>> stages) {
  if (status == null || status.isEmpty) return null;
  for (final stage in stages) {
    if ((stage['key'] ?? '').toString().toLowerCase() == status.toLowerCase()) {
      return stage;
    }
  }
  return null;
}

String _humanizeStatus(String status) {
  final words = status.replaceAll('_', ' ').trim().split(RegExp(r'\s+'));
  return words
      .where((word) => word.isNotEmpty)
      .map((word) => word[0].toUpperCase() + word.substring(1))
      .join(' ');
}

String _statusLabel(String? status, List<Map<String, dynamic>> stages) {
  final value = (status ?? '').trim();
  if (value.isEmpty) return '';
  final stage = _findStage(value, stages);
  final label = (stage?['label'] ?? '').toString().trim();
  if (label.isNotEmpty) return label;
  return _humanizeStatus(value);
}

Color _statusColor(String? status, List<Map<String, dynamic>> stages) {
  final stage = _findStage(status, stages);
  if (stage != null) {
    return _parseHexColor(stage['color']?.toString(), fallback: const Color(0xFF6B7280));
  }
  switch ((status ?? '').toLowerCase()) {
    case 'opened':
      return const Color(0xFF3B82F6);
    case 'completed':
      return const Color(0xFF10B981);
    case 'closed':
      return const Color(0xFF6B7280);
    default:
      return const Color(0xFF6B7280);
  }
}

Color _priorityColor(String? priority) {
  switch ((priority ?? '').toLowerCase()) {
    case 'high':
      return const Color(0xFFEF4444);
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

String _taskTitle(Map<String, dynamic> task) =>
    (task['title'] ?? task['subject'] ?? 'Untitled').toString();

String _plainText(String value) {
  return value
      .replaceAll(RegExp(r'<[^>]+>'), ' ')
      .replaceAll('&nbsp;', ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String _assigneeName(Map<String, dynamic> task) {
  final assignees = task['assignees'];
  if (assignees is List && assignees.isNotEmpty) {
    final a = assignees.first;
    if (a is Map) {
      final user = a['user'] as Map<String, dynamic>?;
      if (user != null) {
        return (user['fullname'] ?? user['name'] ?? '').toString();
      }
      return (a['fullname'] ?? a['name'] ?? '').toString();
    }
  }
  return '';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen>
    with SingleTickerProviderStateMixin, AutoRefreshMixin {
  late final TabController _tabs;
  final _searchController = TextEditingController();
  bool _showSearch = false;
  String _searchQuery = '';

  // Tab definitions: label + task view key
  static const _tabDefs = [
    ('Overview', 'overview'),
    ('Personal', 'personal'),
    ('Assigned', 'assigned'),
    ('Group Bucket', 'groups'),
    ('All', 'all'),
    ('Completed', 'completed'),
  ];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabDefs.length, vsync: this);
    startAutoRefresh(const Duration(seconds: 60), () {
      for (final t in _tabDefs) {
        ref.invalidate(tasksProvider((key: t.$2, search: _searchQuery)));
      }
      ref.invalidate(taskStagesProvider);
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search tasks…',
                  border: InputBorder.none,
                  hintStyle: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  filled: false,
                ),
                style: theme.textTheme.bodyLarge,
                onChanged: (v) => setState(() => _searchQuery = v),
              )
            : const Text('Tasks', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search_rounded),
            onPressed: _toggleSearch,
            tooltip: _showSearch ? 'Close search' : 'Search',
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
      body: TabBarView(
        controller: _tabs,
        children: _tabDefs
            .map((t) => _TaskList(tabKey: t.$2, searchQuery: _searchQuery))
            .toList(),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateSheet(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Task'),
      ),
    );
  }

  void _showCreateSheet(BuildContext context) {
    final currentUserId =
        (ref.read(authStateProvider).asData?.value?['id'] ?? '').toString();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => TaskEditorSheet(
        currentUserId: currentUserId,
        onSaved: () {
          // Invalidate all tab providers to refresh
          for (final t in _tabDefs) {
            ref.invalidate(tasksProvider((key: t.$2, search: _searchQuery)));
          }
          ref.invalidate(taskStagesProvider);
        },
      ),
    );
  }
}

// ─── Task list tab ────────────────────────────────────────────────────────────

class _TaskList extends ConsumerWidget {
  final String tabKey;
  final String searchQuery;

  const _TaskList({required this.tabKey, required this.searchQuery});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tasksProvider((key: tabKey, search: searchQuery)));
    final stages = ref.watch(taskStagesProvider).asData?.value ?? const <Map<String, dynamic>>[];

    return async.when(
      loading: () => const ShimmerList(count: 8),
      error: (e, st) => _ErrorView(
        message: e.toString(),
        onRetry: () => ref.invalidate(tasksProvider((key: tabKey, search: searchQuery))),
      ),
      data: (list) {
        final filtered = _filter(list, searchQuery, stages);
        if (filtered.isEmpty) {
          return EmptyState(
            icon: Icons.task_alt_rounded,
            title: searchQuery.isNotEmpty ? 'No results' : 'No tasks here',
            subtitle: searchQuery.isNotEmpty
                ? 'Try a different search term'
                : 'Create a task using the button below',
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(tasksProvider((key: tabKey, search: searchQuery)));
            ref.invalidate(taskStagesProvider);
          },
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            itemCount: filtered.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (ctx, i) {
              final task = filtered[i] as Map<String, dynamic>;
              return _TaskCard(
                task: task,
                stages: stages,
                onTap: () {
                  final id = task['id']?.toString() ?? '';
                  if (id.isNotEmpty) ctx.push('/tasks/$id');
                },
              );
            },
          ),
        );
      },
    );
  }

  List<dynamic> _filter(List<dynamic> list, String q, List<Map<String, dynamic>> stages) {
    var filtered = list;
    if (tabKey == 'completed') {
      final closedKeys = stages
          .where((stage) => stage['isClosed'] == true)
          .map((stage) => (stage['key'] ?? '').toString())
          .where((key) => key.isNotEmpty)
          .toSet();
      if (closedKeys.isEmpty) {
        closedKeys.addAll(const {'completed', 'closed'});
      }
      filtered = list.where((item) {
        if (item is! Map<String, dynamic>) return false;
        final stageKey = (item['status'] ?? '').toString();
        return closedKeys.contains(stageKey);
      }).toList();
    }

    if (q.isEmpty) return filtered;
    final lower = q.toLowerCase();
    return filtered.where((t) {
      final task = t as Map<String, dynamic>;
      final title = _taskTitle(task).toLowerCase();
      final description =
          _plainText('${task['description'] ?? task['content'] ?? ''}')
              .toLowerCase();
      final searchMatchText =
          _plainText('${task['searchMatchText'] ?? ''}').toLowerCase();
      return title.contains(lower) ||
          description.contains(lower) ||
          searchMatchText.contains(lower);
    }).toList();
  }
}

// ─── Task card ────────────────────────────────────────────────────────────────

class _TaskCard extends StatelessWidget {
  final Map<String, dynamic> task;
  final List<Map<String, dynamic>> stages;
  final VoidCallback onTap;

  const _TaskCard({
    required this.task,
    required this.stages,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = (task['status'] ?? '').toString();
    final statusLabel = _statusLabel(status, stages);
    final priority = (task['priority'] ?? '').toString();
    final dueDate = _formatDate(task['dueDate']?.toString());
    final assignee = _assigneeName(task);
    final searchMatchText = _plainText('${task['searchMatchText'] ?? ''}');
    final statusColor = _statusColor(status, stages);
    final priorityColor = _priorityColor(priority);

    // Determine if overdue
    bool isOverdue = false;
    if (task['dueDate'] != null && status.toLowerCase() != 'completed') {
      try {
        final due = DateTime.parse(task['dueDate'].toString());
        isOverdue = due.isBefore(DateTime.now());
      } catch (_) {}
    }

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
                      _taskTitle(task),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Status chip
                  _StatusChip(label: statusLabel, color: statusColor),
                ],
              ),
              const SizedBox(height: 10),
              if (searchMatchText.isNotEmpty) ...[
                Text(
                  'Match: $searchMatchText',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF8A651E),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
              ],
              // Meta row
              Wrap(
                spacing: 12,
                runSpacing: 6,
                children: [
                  if (dueDate.isNotEmpty)
                    _MetaItem(
                      icon: Icons.calendar_today_rounded,
                      label: dueDate,
                      color: isOverdue ? const Color(0xFFEF4444) : null,
                    ),
                  if (assignee.isNotEmpty)
                    _MetaItem(
                      icon: Icons.person_outline_rounded,
                      label: assignee,
                    ),
                  if (priority.isNotEmpty && priority != 'null')
                    _PriorityBadge(label: priority, color: priorityColor),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    if (label.isEmpty || label == 'null') return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label[0].toUpperCase() + label.substring(1),
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
          label[0].toUpperCase() + label.substring(1),
          style: TextStyle(
            fontSize: 12,
            color: color,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _MetaItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;
  const _MetaItem({required this.icon, required this.label, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55);
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
                size: 56,
                color: Theme.of(context).colorScheme.error),
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
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Create task bottom sheet ─────────────────────────────────────────────────

const _kRed = Color(0xFFAA8038);

class _CreateTaskSheet extends ConsumerStatefulWidget {
  final VoidCallback? onCreated;
  const _CreateTaskSheet({this.onCreated});

  @override
  ConsumerState<_CreateTaskSheet> createState() => _CreateTaskSheetState();
}

class _CreateTaskSheetState extends ConsumerState<_CreateTaskSheet> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  // Fields matching the server software exactly
  String _type = 'task';       // task | event | note
  String _status = 'opened';   // opened | completed | closed
  String _priority = 'normal'; // high | normal | low
  bool _isPrivate = false;
  DateTime? _dueDate;
  List<Map<String, dynamic>> _assignees = [];

  List<dynamic> _teamUsers = [];
  List<Map<String, dynamic>> _stages = const [];
  bool _loadingUsers = false;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadTeamUsers();
    _loadStages();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadTeamUsers() async {
    setState(() => _loadingUsers = true);
    try {
      final users = await ref.read(apiClientProvider).getTeamUsers();
      if (mounted) setState(() => _teamUsers = users);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingUsers = false);
    }
  }

  Future<void> _loadStages() async {
    try {
      final res = await ref.read(apiClientProvider).getTasks(limit: 1);
      if (res is Map && res['stages'] is List && mounted) {
        final stages = (res['stages'] as List<dynamic>)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        if (stages.isNotEmpty) {
          setState(() {
            _stages = stages;
            final firstKey = (_stages.first['key'] ?? '').toString();
            if (firstKey.isNotEmpty) {
              _status = firstKey;
            }
          });
        }
      }
    } catch (_) {
      // Keep fallback statuses when workflow metadata is unavailable.
    }
  }

  void _setDue(DateTime? d) => setState(() => _dueDate = d);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate:
          _dueDate ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
    if (picked != null) _setDue(picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).createTask({
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'type': _type,
        'status': _status,
        'priority': _priority,
        'isPrivate': _isPrivate,
        if (_dueDate != null) 'dueDate': _dueDate!.toIso8601String(),
        if (_assignees.isNotEmpty) 'assignees': _assignees,
      });
      if (mounted) {
        Navigator.of(context).pop();
        widget.onCreated?.call();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Task created'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: $e'),
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
    final cs = theme.colorScheme;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dueDateStr =
        _dueDate != null ? DateFormat('MMM d, y').format(_dueDate!) : null;
    final stageOptions = _stages.isNotEmpty
        ? _stages
        : const [
            {'key': 'opened', 'label': 'Opened'},
            {'key': 'completed', 'label': 'Completed'},
            {'key': 'closed', 'label': 'Closed'},
          ];

    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Drag handle
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: cs.onSurface.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // ── Header (matches web dialog)
              Row(
                children: [
                  const Icon(Icons.task_alt_rounded, color: _kRed, size: 22),
                  const SizedBox(width: 8),
                  Text('Create New Task',
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Subject, responsible users, status, deadline, rich text, and attachments.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: cs.onSurface.withValues(alpha: 0.5)),
              ),
              const SizedBox(height: 20),

              // ── Subject *
              TextFormField(
                controller: _titleCtrl,
                decoration: const InputDecoration(
                  labelText: 'Subject *',
                  prefixIcon: Icon(Icons.title_rounded),
                ),
                textCapitalization: TextCapitalization.sentences,
                autofocus: true,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Subject is required' : null,
              ),
              const SizedBox(height: 14),

              // ── Type  +  Status
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _type,
                      decoration:
                          const InputDecoration(labelText: 'Type', isDense: true),
                      items: const [
                        DropdownMenuItem(value: 'task', child: Text('Task')),
                        DropdownMenuItem(value: 'event', child: Text('Event')),
                        DropdownMenuItem(value: 'note', child: Text('Note')),
                      ],
                      onChanged: (v) => setState(() => _type = v ?? 'task'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _status,
                      decoration: const InputDecoration(
                          labelText: 'Status', isDense: true),
                      items: stageOptions.map((stage) {
                        final key = (stage['key'] ?? '').toString();
                        final label = (stage['label'] ?? key).toString();
                        return DropdownMenuItem(
                          value: key,
                          child: Text(label),
                        );
                      }).toList(),
                      onChanged: (v) => setState(() => _status = v ?? _status),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // ── Priority  +  Deadline button
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _priority,
                      decoration: const InputDecoration(
                          labelText: 'Priority', isDense: true),
                      items: const [
                        DropdownMenuItem(value: 'high', child: Text('High')),
                        DropdownMenuItem(
                            value: 'normal', child: Text('Normal')),
                        DropdownMenuItem(value: 'low', child: Text('Low')),
                      ],
                      onChanged: (v) =>
                          setState(() => _priority = v ?? 'normal'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickDate,
                      icon: Icon(Icons.calendar_today_rounded,
                          size: 16,
                          color: _dueDate != null ? _kRed : cs.onSurface),
                      label: Text(
                        dueDateStr ?? 'Deadline',
                        style: TextStyle(
                            color: _dueDate != null ? _kRed : cs.onSurface),
                        overflow: TextOverflow.ellipsis,
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 16),
                        alignment: Alignment.centerLeft,
                        side: BorderSide(
                          color: _dueDate != null
                              ? _kRed.withValues(alpha: 0.4)
                              : cs.outline,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // ── Quick deadline shortcuts (Today / Tomorrow / In 3 Days / Next Week / Clear)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _DeadlineChip('Today', today, _dueDate,
                        () => _setDue(today)),
                    const SizedBox(width: 8),
                    _DeadlineChip(
                        'Tomorrow',
                        today.add(const Duration(days: 1)),
                        _dueDate,
                        () => _setDue(today.add(const Duration(days: 1)))),
                    const SizedBox(width: 8),
                    _DeadlineChip(
                        'In 3 Days',
                        today.add(const Duration(days: 3)),
                        _dueDate,
                        () => _setDue(today.add(const Duration(days: 3)))),
                    const SizedBox(width: 8),
                    _DeadlineChip(
                        'Next Week',
                        today.add(const Duration(days: 7)),
                        _dueDate,
                        () => _setDue(today.add(const Duration(days: 7)))),
                    if (_dueDate != null) ...[
                      const SizedBox(width: 8),
                      _ClearChip(() => _setDue(null)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // ── Description (HTML supported, like the web editor)
              TextFormField(
                controller: _descCtrl,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  hintText: 'Write description (HTML supported).',
                  alignLabelWithHint: true,
                  prefixIcon: Padding(
                    padding: EdgeInsets.only(bottom: 72),
                    child: Icon(Icons.notes_rounded),
                  ),
                ),
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 20),

              // ── Assigned to
              Text('Assigned to',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              _AssigneeSelector(
                users: _teamUsers,
                loading: _loadingUsers,
                assignees: _assignees,
                onToggle: (id, checked) => setState(() {
                  final index = _assignees.indexWhere((item) => item['userId'] == id);
                  if (checked) {
                    if (index < 0) {
                      _assignees = [..._assignees, {'userId': id, 'canComment': true}];
                    }
                  } else if (index >= 0) {
                    _assignees = [..._assignees]..removeAt(index);
                  }
                }),
                onSetCanComment: (id, canComment) => setState(() {
                  _assignees = _assignees
                      .map((item) => item['userId'] == id
                          ? {...item, 'canComment': canComment}
                          : item)
                      .toList();
                }),
              ),
              const SizedBox(height: 14),
              Text(
                'Comment access is controlled per selected assignee.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: cs.onSurface.withValues(alpha: 0.6)),
              ),
              const SizedBox(height: 10),

              // ── Private task (matches web "Private task" checkbox)
              Container(
                decoration: BoxDecoration(
                  border:
                      Border.all(color: cs.outline.withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: CheckboxListTile(
                  title: const Text('Private task',
                      style: TextStyle(fontWeight: FontWeight.w500)),
                  subtitle: const Text('Only visible to you and assignees',
                      style: TextStyle(fontSize: 12)),
                  value: _isPrivate,
                  activeColor: _kRed,
                  checkColor: Colors.white,
                  onChanged: (v) =>
                      setState(() => _isPrivate = v ?? false),
                ),
              ),
              const SizedBox(height: 24),

              // ── Cancel / Add buttons (matches web Cancel + Add)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                          padding:
                              const EdgeInsets.symmetric(vertical: 14)),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: _loading ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: _kRed,
                        foregroundColor: Colors.white,
                        padding:
                            const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: _loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.add_rounded),
                      label: const Text('Add',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Deadline quick-select chip
class _DeadlineChip extends StatelessWidget {
  final String label;
  final DateTime target;
  final DateTime? selected;
  final VoidCallback onTap;

  const _DeadlineChip(this.label, this.target, this.selected, this.onTap);

  bool get _active =>
      selected != null &&
      selected!.year == target.year &&
      selected!.month == target.month &&
      selected!.day == target.day;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: _active ? _kRed : _kRed.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: _active ? _kRed : _kRed.withValues(alpha: 0.3)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: _active ? Colors.white : _kRed,
          ),
        ),
      ),
    );
  }
}

class _ClearChip extends StatelessWidget {
  final VoidCallback onTap;
  const _ClearChip(this.onTap);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.grey.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.grey.withValues(alpha: 0.3)),
        ),
        child: const Text('Clear',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.grey)),
      ),
    );
  }
}

// ── Assignees selector widget
class _AssigneeSelector extends StatelessWidget {
  final List<dynamic> users;
  final bool loading;
  final List<Map<String, dynamic>> assignees;
  final void Function(String id, bool checked) onToggle;
  final void Function(String id, bool canComment) onSetCanComment;

  const _AssigneeSelector({
    required this.users,
    required this.loading,
    required this.assignees,
    required this.onToggle,
    required this.onSetCanComment,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (loading) {
      return const Center(
          child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2)));
    }
    if (users.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text('No team members found',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: cs.onSurface.withValues(alpha: 0.5))),
      );
    }

    return Container(
      constraints: const BoxConstraints(maxHeight: 210),
      decoration: BoxDecoration(
        border: Border.all(color: cs.outline.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: ListView.separated(
          shrinkWrap: true,
          physics: const ClampingScrollPhysics(),
          itemCount: users.length,
          separatorBuilder: (_, __) => Divider(
              height: 1,
              color: cs.outline.withValues(alpha: 0.2),
              indent: 56),
          itemBuilder: (_, i) {
            final user = users[i] as Map<String, dynamic>;
            final id = user['id']?.toString() ?? '';
            final fullname = user['fullname']?.toString() ?? '';
            final name = fullname.isNotEmpty
                ? fullname
                : '${user['name'] ?? ''} ${user['surname'] ?? ''}'.trim();
            final email = user['email']?.toString() ?? '';
            Map<String, dynamic>? assigneeEntry;
            for (final item in assignees) {
              if (item['userId'] == id) {
                assigneeEntry = item;
                break;
              }
            }
            final isSelected = assigneeEntry != null;
            final canComment = (assigneeEntry?['canComment'] as bool?) ?? true;

            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              child: Column(
                children: [
                  CheckboxListTile(
                    dense: true,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                    secondary: CircleAvatar(
                      radius: 16,
                      backgroundColor: _kRed.withValues(alpha: 0.12),
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : '?',
                        style: const TextStyle(
                            fontSize: 13,
                            color: _kRed,
                            fontWeight: FontWeight.bold),
                      ),
                    ),
                    title: Text(name.isEmpty ? email : name,
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w500)),
                    subtitle: email.isNotEmpty
                        ? Text(email,
                            style: const TextStyle(fontSize: 11),
                            overflow: TextOverflow.ellipsis)
                        : null,
                    value: isSelected,
                    activeColor: _kRed,
                    checkColor: Colors.white,
                    onChanged: (v) => onToggle(id, v ?? false),
                  ),
                  if (isSelected)
                    Padding(
                      padding: const EdgeInsets.only(left: 56, right: 8, bottom: 6),
                      child: Row(
                        children: [
                          const Text('Comment access:', style: TextStyle(fontSize: 12)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              key: ValueKey('comment-access-$id-$canComment'),
                              initialValue: canComment ? 'comment' : 'view',
                              decoration: const InputDecoration(
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              ),
                              items: const [
                                DropdownMenuItem(value: 'comment', child: Text('Can Comment')),
                                DropdownMenuItem(value: 'view', child: Text('View Only')),
                              ],
                              onChanged: (value) => onSetCanComment(id, value != 'view'),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
