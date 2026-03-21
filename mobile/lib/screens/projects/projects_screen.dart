import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final projectsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, queryKey) async {
  final query = queryKey.isEmpty ? <String, String>{} : Uri.splitQueryString(queryKey);
  final raw = await ref.watch(apiClientProvider).getProjects(
    search: query['search'],
    status: query['status'],
  );
  return raw
      .whereType<Map>()
      .map((row) => Map<String, dynamic>.from(row))
      .toList();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFEC4899);

String _formatDate(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    return DateFormat('MMM d, y').format(DateTime.parse(raw).toLocal());
  } catch (_) {
    return raw;
  }
}

Color _statusColor(String? status) {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
    case 'in_progress':
      return const Color(0xFF3B82F6);
    case 'completed':
      return const Color(0xFF10B981);
    case 'on_hold':
    case 'paused':
      return const Color(0xFFF59E0B);
    case 'cancelled':
    case 'archived':
      return const Color(0xFF6B7280);
    default:
      return const Color(0xFF6B7280);
  }
}

String _capitalize(String s) {
  if (s.isEmpty) return s;
  return s.replaceAll('_', ' ').split(' ').map((w) {
    if (w.isEmpty) return w;
    return w[0].toUpperCase() + w.substring(1);
  }).join(' ');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen>
    with AutoRefreshMixin {
  bool _showSearch = false;
  final _searchController = TextEditingController();
  String _search = '';
  String _status = 'all';

  @override
  void initState() {
    super.initState();
    startAutoRefresh(
      const Duration(seconds: 120),
      _refresh,
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Map<String, String> get _query => {
        if (_search.trim().isNotEmpty) 'search': _search.trim(),
        if (_status != 'all') 'status': _status,
      };

  String get _queryKey => Uri(queryParameters: _query).query;

  void _refresh() => ref.invalidate(projectsProvider(_queryKey));

  Future<void> _createProject() async {
    final name = TextEditingController();
    final description = TextEditingController();
    DateTime? start;
    DateTime? end;
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setStateSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(
                  labelText: 'Project name',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: description,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(start == null
                    ? 'Start date'
                    : 'Start ${DateFormat('MMM d, y').format(start!)}'),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: start ?? now,
                    firstDate: DateTime(now.year - 10),
                    lastDate: DateTime(now.year + 10),
                  );
                  if (picked != null) setStateSheet(() => start = picked);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(end == null
                    ? 'End date'
                    : 'End ${DateFormat('MMM d, y').format(end!)}'),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: end ?? now,
                    firstDate: DateTime(now.year - 10),
                    lastDate: DateTime(now.year + 10),
                  );
                  if (picked != null) setStateSheet(() => end = picked);
                },
              ),
              Row(
                children: [
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, {
                      'name': name.text.trim(),
                      'description': description.text.trim().isEmpty
                          ? null
                          : description.text.trim(),
                      'startDate': start?.toIso8601String(),
                      'endDate': end?.toIso8601String(),
                    }),
                    child: const Text('Create'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (payload == null) return;
    if ((payload['name']?.toString() ?? '').trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Project name is required')),
      );
      return;
    }
    try {
      await ref.read(apiClientProvider).createProject(payload);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Project created')));
      _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final projects = ref.watch(projectsProvider(_queryKey));

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search projects...',
                  border: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _search = v),
              )
            : const Text('Projects', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close_rounded : Icons.search_rounded),
            onPressed: () {
              setState(() {
                _showSearch = !_showSearch;
                if (!_showSearch) {
                  _search = '';
                  _searchController.clear();
                }
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: _createProject,
            tooltip: 'Create Project',
          ),
        ],
      ),
      body: projects.when(
        loading: () => const ShimmerList(count: 6),
        error: (e, _) => ErrorState(
          message: e.toString(),
          onRetry: _refresh,
        ),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.folder_special_outlined,
              title: 'No projects',
              subtitle: 'No projects found',
            );
          }

          return Column(
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Row(
                  children: [
                    for (final s in const ['all', 'active', 'completed', 'archived'])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(_capitalize(s)),
                          selected: _status == s,
                          onSelected: (_) {
                            setState(() => _status = s);
                            _refresh();
                          },
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  color: _kPrimary,
                  onRefresh: () async => _refresh(),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _ProjectCard(project: list[i]),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── Project card ─────────────────────────────────────────────────────────────

class _ProjectCard extends StatelessWidget {
  final Map<String, dynamic> project;
  const _ProjectCard({required this.project});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    final name = (project['name'] ?? 'Untitled').toString();
    final description = (project['description'] ?? '').toString();
    final status = (project['status'] ?? '').toString();
    final statusColor = _statusColor(status);

    final endDate = _formatDate(project['endDate']?.toString() ??
        project['end_date']?.toString() ??
        project['deadline']?.toString());

    final manager = project['manager'] ?? project['owner'];
    final managerName = manager is Map
        ? (manager['fullname'] ?? manager['name'] ?? '').toString()
        : '';

    final count = project['_count'] is Map
        ? Map<String, dynamic>.from(project['_count'] as Map)
        : null;
    final taskCount = count?['tasks'] ?? project['taskCount'];
    final phaseCount = count?['phases'] ?? project['phaseCount'];

    final progress = project['progress'];
    final progressVal =
        progress is num ? progress.toDouble() / 100.0 : null;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          final id = project['id']?.toString() ?? '';
          if (id.isNotEmpty) {
            context.push('/projects/$id');
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: _kPrimary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.folder_special_rounded,
                        color: _kPrimary, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700)),
                        if (description.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(description,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(
                                  color: cs.onSurface
                                      .withValues(alpha: 0.55))),
                        ],
                      ],
                    ),
                  ),
                  if (status.isNotEmpty)
                    _StatusChip(label: _capitalize(status), color: statusColor),
                ],
              ),

              // Progress bar
              if (progressVal != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: progressVal.clamp(0.0, 1.0),
                          backgroundColor:
                              cs.surfaceContainerHighest,
                          color: _kPrimary,
                          minHeight: 6,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${(progressVal * 100).round()}%',
                      style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: _kPrimary),
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 12),

              // Footer
              Wrap(
                spacing: 12,
                runSpacing: 6,
                children: [
                  if (managerName.isNotEmpty)
                    _MetaItem(
                        icon: Icons.person_outline_rounded,
                        label: managerName),
                  if (taskCount != null)
                    _MetaItem(
                        icon: Icons.task_alt_rounded,
                        label: '$taskCount tasks'),
                  if (phaseCount != null)
                    _MetaItem(
                        icon: Icons.linear_scale_rounded,
                        label: '$phaseCount phases'),
                  if (endDate.isNotEmpty)
                    _MetaItem(
                        icon: Icons.calendar_today_rounded,
                        label: endDate),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _MetaItem extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MetaItem({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5);
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
