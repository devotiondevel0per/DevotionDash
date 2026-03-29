import 'package:dio/dio.dart';
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

class _ProjectDetailData {
  final Map<String, dynamic> project;
  final List<Map<String, dynamic>> tasks;
  final List<Map<String, dynamic>> stages;

  const _ProjectDetailData({
    required this.project,
    required this.tasks,
    required this.stages,
  });
}

List<Map<String, dynamic>> _asRows(dynamic v) {
  final rows = v as List<dynamic>? ?? const [];
  return rows.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

final _projectProvider = FutureProvider.autoDispose.family<_ProjectDetailData, String>((
  ref,
  id,
) async {
  final api = ref.watch(apiClientProvider);
  final project = await api.getProject(id);
  try {
    final taskRes = await api.getProjectTasks(id);
    final tasks = _asRows(taskRes['items']);
    final stages = _asRows(taskRes['stages']);
    final resolvedStages = stages.isNotEmpty ? stages : _asRows(project['taskStages']);
    return _ProjectDetailData(project: project, tasks: tasks, stages: resolvedStages);
  } catch (_) {
    return _ProjectDetailData(
      project: project,
      tasks: _asRows(project['tasks']),
      stages: _asRows(project['taskStages']),
    );
  }
});

class ProjectDetailScreen extends ConsumerStatefulWidget {
  final String projectId;
  const ProjectDetailScreen({super.key, required this.projectId});

  @override
  ConsumerState<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen>
    with AutoRefreshMixin {
  @override
  void initState() {
    super.initState();
    startAutoRefresh(const Duration(seconds: 30), _refresh);
  }

  static const _projectStatuses = ['active', 'completed', 'archived'];
  static const _taskStatuses = ['todo', 'in_progress', 'done', 'cancelled'];
  static const _taskPriorities = ['low', 'normal', 'high'];

  String _s(dynamic v) => v?.toString() ?? '';
  Map<String, dynamic> _m(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : const {};
  List<Map<String, dynamic>> _rows(dynamic v) {
    final rows = v as List<dynamic>? ?? const [];
    return rows.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  String _label(String v) => v
      .replaceAll('-', '_')
      .split('_')
      .where((e) => e.isNotEmpty)
      .map((e) => '${e[0].toUpperCase()}${e.substring(1)}')
      .join(' ');

  String _err(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['error'] != null) return data['error'].toString();
      if (e.message?.isNotEmpty == true) return e.message!;
    }
    return e.toString();
  }

  void _refresh() => ref.invalidate(_projectProvider(widget.projectId));

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? Theme.of(context).colorScheme.error : null,
      ),
    );
  }

  Future<bool> _confirm(String title, String text, String ok) async {
    final val = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(ok)),
        ],
      ),
    );
    return val == true;
  }

  DateTime? _date(dynamic v) {
    final raw = _s(v);
    if (raw.isEmpty) return null;
    return DateTime.tryParse(raw)?.toLocal();
  }

  String _fmt(dynamic v) {
    final d = _date(v);
    return d == null ? '' : DateFormat('MMM d, y').format(d);
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'completed':
      case 'done':
        return const Color(0xFF10B981);
      case 'active':
      case 'in_progress':
        return const Color(0xFF3B82F6);
      case 'archived':
      case 'cancelled':
        return const Color(0xFF6B7280);
      default:
        return const Color(0xFFF59E0B);
    }
  }

  String _memberUserId(Map<String, dynamic> member) {
    final user = _m(member['user']);
    return _s(member['userId']).isNotEmpty ? _s(member['userId']) : _s(user['id']);
  }

  String _memberName(Map<String, dynamic> member) {
    final user = _m(member['user']);
    if (_s(user['fullname']).isNotEmpty) return _s(user['fullname']);
    if (_s(user['name']).isNotEmpty) return _s(user['name']);
    if (_s(member['fullname']).isNotEmpty) return _s(member['fullname']);
    return _s(member['name']);
  }

  int _progress(List<Map<String, dynamic>> tasks, Set<String> closedStageKeys) {
    if (tasks.isEmpty) return 0;
    final doneStatuses = <String>{...closedStageKeys, 'done', 'completed', 'closed', 'cancelled'};
    final done = tasks
        .where((t) => doneStatuses.contains(_s(t['status']).trim().toLowerCase()))
        .length;
    return ((done / tasks.length) * 100).round();
  }

  Color? _hexColor(String value) {
    final raw = value.trim().replaceFirst('#', '');
    if (raw.isEmpty) return null;
    final normalized = raw.length == 6 ? 'FF$raw' : raw;
    final parsed = int.tryParse(normalized, radix: 16);
    if (parsed == null) return null;
    return Color(parsed);
  }

  Future<DateTime?> _pickDate(DateTime? initial) {
    final now = DateTime.now();
    return showDatePicker(
      context: context,
      initialDate: initial ?? now,
      firstDate: DateTime(now.year - 10),
      lastDate: DateTime(now.year + 10),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_projectProvider(widget.projectId));
    final me = ref.watch(userProfileProvider).value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Project'),
        actions: [
          IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: async.when(
        loading: () => const ShimmerList(count: 6),
        error: (e, _) => ErrorState(message: _err(e), onRetry: _refresh),
        data: (detail) {
          final project = detail.project;
          final members = _rows(project['members']);
          final phases = _rows(project['phases']);
          final tasks = detail.tasks;
          final stageLabels = <String, String>{};
          final stageColors = <String, Color>{};
          final closedStageKeys = <String>{};
          for (final stage in detail.stages) {
            final key = _s(stage['key']).trim().toLowerCase();
            if (key.isEmpty) continue;
            final label = _s(stage['label']);
            if (label.isNotEmpty) stageLabels[key] = label;
            final color = _hexColor(_s(stage['color']));
            if (color != null) stageColors[key] = color;
            if (stage['isClosed'] == true) closedStageKeys.add(key);
          }
          final stageKeys = detail.stages
              .map((stage) => _s(stage['key']).trim().toLowerCase())
              .where((key) => key.isNotEmpty)
              .toList();
          final statusOptions = stageKeys.isEmpty ? _taskStatuses : stageKeys;
          Map<String, dynamic>? myMember;
          for (final m in members) {
            if (_memberUserId(m) == (me?.id ?? '')) {
              myMember = m;
              break;
            }
          }
          final canWrite = me?.isAdmin == true || myMember != null;
          final canManage = me?.isAdmin == true || _s(myMember?['role']) == 'manager';

          return _ProjectView(
            project: project,
            members: members,
            phases: phases,
            tasks: tasks,
            canWrite: canWrite,
            canManage: canManage,
            meId: me?.id ?? '',
            label: _label,
            statusColor: _statusColor,
            fmt: _fmt,
            memberName: _memberName,
            memberUserId: _memberUserId,
            progress: _progress(tasks, closedStageKeys),
            refresh: _refresh,
            snack: _snack,
            err: _err,
            confirm: _confirm,
            pickDate: _pickDate,
            projectStatuses: _projectStatuses,
            taskStatuses: statusOptions,
            taskPriorities: _taskPriorities,
            stageLabels: stageLabels,
            stageColors: stageColors,
            projectId: widget.projectId,
          );
        },
      ),
    );
  }
}

class _ProjectView extends ConsumerWidget {
  final Map<String, dynamic> project;
  final List<Map<String, dynamic>> members;
  final List<Map<String, dynamic>> phases;
  final List<Map<String, dynamic>> tasks;
  final bool canWrite;
  final bool canManage;
  final String meId;
  final String Function(String) label;
  final Color Function(String) statusColor;
  final String Function(dynamic) fmt;
  final String Function(Map<String, dynamic>) memberName;
  final String Function(Map<String, dynamic>) memberUserId;
  final int progress;
  final VoidCallback refresh;
  final void Function(String, {bool error}) snack;
  final String Function(Object) err;
  final Future<bool> Function(String, String, String) confirm;
  final Future<DateTime?> Function(DateTime?) pickDate;
  final List<String> projectStatuses;
  final List<String> taskStatuses;
  final List<String> taskPriorities;
  final Map<String, String> stageLabels;
  final Map<String, Color> stageColors;
  final String projectId;

  const _ProjectView({
    required this.project,
    required this.members,
    required this.phases,
    required this.tasks,
    required this.canWrite,
    required this.canManage,
    required this.meId,
    required this.label,
    required this.statusColor,
    required this.fmt,
    required this.memberName,
    required this.memberUserId,
    required this.progress,
    required this.refresh,
    required this.snack,
    required this.err,
    required this.confirm,
    required this.pickDate,
    required this.projectStatuses,
    required this.taskStatuses,
    required this.taskPriorities,
    required this.stageLabels,
    required this.stageColors,
    required this.projectId,
  });

  String _s(dynamic v) => v?.toString() ?? '';
  Map<String, dynamic> _m(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : const {};
  List<Map<String, dynamic>> _rows(dynamic v) {
    final rows = v as List<dynamic>? ?? const [];
    return rows.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<void> _editProject(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    final name = TextEditingController(text: _s(project['name']));
    final description = TextEditingController(text: _s(project['description']));
    var status = _s(project['status']).isNotEmpty ? _s(project['status']) : 'active';
    DateTime? start = DateTime.tryParse(_s(project['startDate']));
    DateTime? end = DateTime.tryParse(_s(project['endDate']));

    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
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
                decoration: const InputDecoration(labelText: 'Project name'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: description,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: status,
                items: projectStatuses
                    .map((e) => DropdownMenuItem(value: e, child: Text(label(e))))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setStateSheet(() => status = v);
                },
                decoration: const InputDecoration(labelText: 'Status'),
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(start == null ? 'Start date' : 'Start ${DateFormat('MMM d, y').format(start!)}'),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final d = await pickDate(start);
                  if (d != null) setStateSheet(() => start = d);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(end == null ? 'End date' : 'End ${DateFormat('MMM d, y').format(end!)}'),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final d = await pickDate(end);
                  if (d != null) setStateSheet(() => end = d);
                },
              ),
              Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, 'delete'),
                    child: const Text('Delete'),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.pop(context, 'cancel'),
                    child: const Text('Cancel'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, 'save'),
                    child: const Text('Save'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (action == null || action == 'cancel') return;
    try {
      if (action == 'delete') {
        final ok = await confirm('Delete project?', 'This cannot be undone.', 'Delete');
        if (!ok) return;
        await api.deleteProject(projectId);
        if (context.mounted) {
          snack('Project deleted');
          context.pop();
        }
        return;
      }
      if (name.text.trim().isEmpty) {
        snack('Project name is required', error: true);
        return;
      }
      await api.updateProject(projectId, {
        'name': name.text.trim(),
        'description': description.text.trim().isEmpty ? null : description.text.trim(),
        'status': status,
        'startDate': start?.toIso8601String(),
        'endDate': end?.toIso8601String(),
      });
      snack('Project updated');
      refresh();
    } catch (e) {
      snack(err(e), error: true);
    }
  }

  Future<void> _deletePhase(BuildContext context, WidgetRef ref, Map<String, dynamic> phase) async {
    final ok = await confirm('Delete phase?', 'This cannot be undone.', 'Delete');
    if (!ok) return;
    try {
      await ref.read(apiClientProvider).deleteProjectPhase(projectId, _s(phase['id']));
      snack('Phase deleted');
      refresh();
    } catch (e) {
      snack(err(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = _s(project['status']).isNotEmpty ? _s(project['status']) : 'active';
    return RefreshIndicator(
      onRefresh: () async => refresh(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _s(project['name']).isNotEmpty ? _s(project['name']) : 'Untitled project',
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      _Pill(text: label(status), color: statusColor(status)),
                    ],
                  ),
                  if (_s(project['description']).isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(_s(project['description'])),
                  ],
                  const SizedBox(height: 10),
                  LinearProgressIndicator(value: (progress / 100).clamp(0.0, 1.0)),
                  const SizedBox(height: 6),
                  Text('$progress% completed'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 10,
                    runSpacing: 6,
                    children: [
                      Text('${tasks.length} tasks'),
                      Text('${phases.length} phases'),
                      Text('${members.length} members'),
                      if (fmt(project['startDate']).isNotEmpty) Text('Start ${fmt(project['startDate'])}'),
                      if (fmt(project['endDate']).isNotEmpty) Text('Due ${fmt(project['endDate'])}'),
                    ],
                  ),
                  if (canManage) ...[
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerRight,
                      child: OutlinedButton.icon(
                        onPressed: () => _editProject(context, ref),
                        icon: const Icon(Icons.edit_rounded),
                        label: const Text('Edit Project'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          _ProjectActions(
            canWrite: canWrite,
            canManage: canManage,
            projectId: projectId,
            members: members,
            phases: phases,
            taskStatuses: taskStatuses,
            taskPriorities: taskPriorities,
            stageLabels: stageLabels,
            memberUserId: memberUserId,
            memberName: memberName,
            label: label,
            pickDate: pickDate,
            snack: snack,
            err: err,
            refresh: refresh,
          ),
          const SizedBox(height: 12),
          _TaskSection(
            tasks: tasks,
            canWrite: canWrite,
            projectId: projectId,
            members: members,
            phases: phases,
            statuses: taskStatuses,
            priorities: taskPriorities,
            label: label,
            statusColor: statusColor,
            stageLabels: stageLabels,
            stageColors: stageColors,
            memberName: memberName,
            memberUserId: memberUserId,
            pickDate: pickDate,
            snack: snack,
            err: err,
            refresh: refresh,
            confirm: confirm,
          ),
          const SizedBox(height: 12),
          _BlockCard(
            title: 'Phases',
            subtitle: '${phases.length}',
            child: phases.isEmpty
                ? const EmptyState(
                    icon: Icons.timeline_outlined,
                    title: 'No phases yet',
                    subtitle: 'Add phases to structure the project',
                  )
                : Column(
                    children: phases
                        .map(
                          (phase) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              tileColor: Theme.of(context).colorScheme.surfaceContainerLow,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              title: Text(_s(phase['name'])),
                              subtitle: Wrap(
                                spacing: 8,
                                children: [
                                  if (fmt(phase['startDate']).isNotEmpty) Text('Start ${fmt(phase['startDate'])}'),
                                  if (fmt(phase['endDate']).isNotEmpty) Text('End ${fmt(phase['endDate'])}'),
                                ],
                              ),
                              trailing: canManage
                                  ? IconButton(
                                      onPressed: () => _deletePhase(context, ref, phase),
                                      icon: const Icon(Icons.delete_outline_rounded),
                                    )
                                  : null,
                            ),
                          ),
                        )
                        .toList(),
                  ),
          ),
          const SizedBox(height: 12),
          _MemberSection(
            members: members,
            canManage: canManage,
            meId: meId,
            memberUserId: memberUserId,
            memberName: memberName,
            projectId: projectId,
            snack: snack,
            err: err,
            refresh: refresh,
          ),
        ],
      ),
    );
  }
}

class _ProjectActions extends ConsumerWidget {
  final bool canWrite;
  final bool canManage;
  final String projectId;
  final List<Map<String, dynamic>> members;
  final List<Map<String, dynamic>> phases;
  final List<String> taskStatuses;
  final List<String> taskPriorities;
  final Map<String, String> stageLabels;
  final String Function(Map<String, dynamic>) memberUserId;
  final String Function(Map<String, dynamic>) memberName;
  final String Function(String) label;
  final Future<DateTime?> Function(DateTime?) pickDate;
  final void Function(String, {bool error}) snack;
  final String Function(Object) err;
  final VoidCallback refresh;

  const _ProjectActions({
    required this.canWrite,
    required this.canManage,
    required this.projectId,
    required this.members,
    required this.phases,
    required this.taskStatuses,
    required this.taskPriorities,
    required this.stageLabels,
    required this.memberUserId,
    required this.memberName,
    required this.label,
    required this.pickDate,
    required this.snack,
    required this.err,
    required this.refresh,
  });

  String _s(dynamic v) => v?.toString() ?? '';
  List<Map<String, dynamic>> _rows(dynamic v) {
    final rows = v as List<dynamic>? ?? const [];
    return rows.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  String _statusLabel(String status) {
    final key = status.trim().toLowerCase();
    final stageLabel = stageLabels[key];
    if (stageLabel != null && stageLabel.isNotEmpty) return stageLabel;
    return label(status);
  }

  Future<void> _addPhase(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    DateTime? start;
    DateTime? end;
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
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
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Phase name')),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(start == null ? 'Start date' : 'Start ${DateFormat('MMM d, y').format(start!)}'),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final d = await pickDate(start);
                  if (d != null) setStateSheet(() => start = d);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(end == null ? 'End date' : 'End ${DateFormat('MMM d, y').format(end!)}'),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final d = await pickDate(end);
                  if (d != null) setStateSheet(() => end = d);
                },
              ),
              Row(
                children: [
                  const Spacer(),
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, {
                      'name': name.text.trim(),
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
    if (_s(payload['name']).isEmpty) {
      snack('Phase name is required', error: true);
      return;
    }
    try {
      await ref.read(apiClientProvider).createProjectPhase(projectId, payload);
      snack('Phase added');
      refresh();
    } catch (e) {
      snack(err(e), error: true);
    }
  }

  Future<void> _addMember(BuildContext context, WidgetRef ref) async {
    final existingIds = members.map(memberUserId).toSet();
    final team = _rows(await ref.read(apiClientProvider).getTeamUsers());
    final available = team.where((u) => !existingIds.contains(_s(u['id']))).toList();
    if (available.isEmpty) {
      snack('No users available to add');
      return;
    }
    var userId = _s(available.first['id']);
    var role = 'member';
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
        builder: (context, setStateSheet) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: userId,
                decoration: const InputDecoration(labelText: 'User'),
                items: available
                    .map((u) => DropdownMenuItem(
                          value: _s(u['id']),
                          child: Text(_s(u['fullname']).isNotEmpty ? _s(u['fullname']) : _s(u['name'])),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setStateSheet(() => userId = v);
                },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: const [
                  DropdownMenuItem(value: 'member', child: Text('Member')),
                  DropdownMenuItem(value: 'manager', child: Text('Manager')),
                ],
                onChanged: (v) {
                  if (v != null) setStateSheet(() => role = v);
                },
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Spacer(),
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, {'userId': userId, 'role': role}),
                    child: const Text('Add'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (payload == null) return;
    try {
      await ref.read(apiClientProvider).addProjectMember(projectId, payload);
      snack('Member added');
      refresh();
    } catch (e) {
      snack(err(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!canWrite && !canManage) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        if (canWrite)
          FilledButton.icon(
            onPressed: () => _TaskDialog.open(
              context: context,
              ref: ref,
              projectId: projectId,
              members: members,
              phases: phases,
              statuses: taskStatuses,
              priorities: taskPriorities,
              memberUserId: memberUserId,
              memberName: memberName,
              label: _statusLabel,
              pickDate: pickDate,
              snack: snack,
              err: err,
              refresh: refresh,
              confirm: (t, m, ok) => _confirmDialog(context, t, m, ok),
            ),
            icon: const Icon(Icons.add_task_rounded),
            label: const Text('Add Task'),
          ),
        if (canManage)
          OutlinedButton.icon(
            onPressed: () => _addPhase(context, ref),
            icon: const Icon(Icons.linear_scale_rounded),
            label: const Text('Add Phase'),
          ),
        if (canManage)
          OutlinedButton.icon(
            onPressed: () => _addMember(context, ref),
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('Add Member'),
          ),
      ],
    );
  }

  Future<bool> _confirmDialog(
    BuildContext context,
    String title,
    String message,
    String okText,
  ) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(okText)),
        ],
      ),
    );
    return result == true;
  }
}

class _TaskSection extends ConsumerStatefulWidget {
  final List<Map<String, dynamic>> tasks;
  final bool canWrite;
  final String projectId;
  final List<Map<String, dynamic>> members;
  final List<Map<String, dynamic>> phases;
  final List<String> statuses;
  final List<String> priorities;
  final String Function(String) label;
  final Color Function(String) statusColor;
  final Map<String, String> stageLabels;
  final Map<String, Color> stageColors;
  final String Function(Map<String, dynamic>) memberName;
  final String Function(Map<String, dynamic>) memberUserId;
  final Future<DateTime?> Function(DateTime?) pickDate;
  final void Function(String, {bool error}) snack;
  final String Function(Object) err;
  final VoidCallback refresh;
  final Future<bool> Function(String, String, String) confirm;

  const _TaskSection({
    required this.tasks,
    required this.canWrite,
    required this.projectId,
    required this.members,
    required this.phases,
    required this.statuses,
    required this.priorities,
    required this.label,
    required this.statusColor,
    required this.stageLabels,
    required this.stageColors,
    required this.memberName,
    required this.memberUserId,
    required this.pickDate,
    required this.snack,
    required this.err,
    required this.refresh,
    required this.confirm,
  });

  @override
  ConsumerState<_TaskSection> createState() => _TaskSectionState();
}

class _TaskSectionState extends ConsumerState<_TaskSection> {
  String _layout = 'list';

  String _s(dynamic v) => v?.toString() ?? '';
  Map<String, dynamic> _m(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : const {};

  Color _priorityColor(String value) {
    switch (value.trim().toLowerCase()) {
      case 'high':
        return const Color(0xFFDC2626);
      case 'low':
        return const Color(0xFF64748B);
      case 'normal':
      default:
        return const Color(0xFFF59E0B);
    }
  }

  String _statusLabel(String status) {
    final key = status.trim().toLowerCase();
    final stageLabel = widget.stageLabels[key];
    if (stageLabel != null && stageLabel.isNotEmpty) return stageLabel;
    return widget.label(status.isNotEmpty ? status : 'todo');
  }

  Color _taskStatusColor(String status) {
    final key = status.trim().toLowerCase();
    final stageColor = widget.stageColors[key];
    if (stageColor != null) return stageColor;
    return widget.statusColor(status);
  }

  Future<void> _updateStatus(WidgetRef ref, Map<String, dynamic> task, String next) async {
    try {
      await ref.read(apiClientProvider).updateProjectTask(
        widget.projectId,
        _s(task['id']),
        {'status': next},
      );
      widget.snack('Task status updated');
      widget.refresh();
    } catch (e) {
      widget.snack(widget.err(e), error: true);
    }
  }

  Future<void> _advanceStatus(WidgetRef ref, Map<String, dynamic> task) async {
    if (widget.statuses.isEmpty) return;
    final current = _s(task['status']).trim().toLowerCase();
    final idx = widget.statuses.indexOf(current);
    final next = idx == -1
        ? widget.statuses.first
        : widget.statuses[(idx + 1) % widget.statuses.length];
    await _updateStatus(ref, task, next);
  }

  Future<void> _editTask(BuildContext context, WidgetRef ref, Map<String, dynamic> task) {
    return _TaskDialog.open(
      context: context,
      ref: ref,
      projectId: widget.projectId,
      members: widget.members,
      phases: widget.phases,
      statuses: widget.statuses,
      priorities: widget.priorities,
      memberUserId: widget.memberUserId,
      memberName: widget.memberName,
      label: _statusLabel,
      pickDate: widget.pickDate,
      snack: widget.snack,
      err: widget.err,
      refresh: widget.refresh,
      confirm: widget.confirm,
      existing: task,
    );
  }

  List<PopupMenuEntry<String>> _menuItemsForTask(Map<String, dynamic> task) {
    final current = _s(task['status']).trim().toLowerCase();
    final stageItems = widget.statuses
        .where((stage) => stage.trim().toLowerCase() != current)
        .map(
          (stage) => PopupMenuItem<String>(
            value: 'status:$stage',
            child: Text('Move to ${_statusLabel(stage)}'),
          ),
        )
        .toList();
    return [
      const PopupMenuItem<String>(value: 'edit', child: Text('Edit')),
      const PopupMenuItem<String>(value: 'advance', child: Text('Advance status')),
      if (stageItems.isNotEmpty) const PopupMenuDivider(),
      ...stageItems,
    ];
  }

  void _onMenuSelected(BuildContext context, WidgetRef ref, Map<String, dynamic> task, String v) {
    if (v == 'edit') {
      _editTask(context, ref, task);
      return;
    }
    if (v == 'advance') {
      _advanceStatus(ref, task);
      return;
    }
    if (v.startsWith('status:')) {
      final next = v.substring('status:'.length);
      if (next.isNotEmpty) _updateStatus(ref, task, next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final showKanban = widget.statuses.isNotEmpty;
    final taskMap = <String, List<Map<String, dynamic>>>{};
    for (final status in widget.statuses) {
      taskMap[status] = <Map<String, dynamic>>[];
    }
    for (final task in widget.tasks) {
      final rawStatus = _s(task['status']).trim().toLowerCase();
      final status = taskMap.containsKey(rawStatus)
          ? rawStatus
          : (widget.statuses.isNotEmpty ? widget.statuses.first : rawStatus);
      taskMap.putIfAbsent(status, () => <Map<String, dynamic>>[]).add(task);
    }

    return _BlockCard(
      title: 'Tasks',
      subtitle: '${widget.tasks.length}',
      child: widget.tasks.isEmpty
          ? const EmptyState(
              icon: Icons.task_outlined,
              title: 'No tasks yet',
              subtitle: 'Create tasks for this project',
            )
          : Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    ChoiceChip(
                      label: const Text('List'),
                      selected: _layout == 'list',
                      onSelected: (_) => setState(() => _layout = 'list'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Kanban'),
                      selected: _layout == 'kanban',
                      onSelected: (_) => setState(() => _layout = 'kanban'),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (_layout == 'kanban' && showKanban)
                  SizedBox(
                    height: 430,
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: widget.statuses.map((status) {
                          final columnTasks = taskMap[status] ?? const <Map<String, dynamic>>[];
                          return Container(
                            width: 290,
                            margin: const EdgeInsets.only(right: 10),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.surfaceContainerLow,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              children: [
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          _statusLabel(status),
                                          style: Theme.of(context)
                                              .textTheme
                                              .labelLarge
                                              ?.copyWith(fontWeight: FontWeight.w700),
                                        ),
                                      ),
                                      Text('${columnTasks.length}'),
                                    ],
                                  ),
                                ),
                                Expanded(
                                  child: columnTasks.isEmpty
                                      ? const Center(
                                          child: Text(
                                            'No tasks',
                                            style: TextStyle(color: Colors.grey),
                                          ),
                                        )
                                      : ListView.builder(
                                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                                          itemCount: columnTasks.length,
                                          itemBuilder: (_, i) {
                                            final task = columnTasks[i];
                                            final due = DateTime.tryParse(_s(task['dueDate']))?.toLocal();
                                            return Card(
                                              margin: const EdgeInsets.only(bottom: 8),
                                              child: Padding(
                                                padding: const EdgeInsets.all(10),
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      _s(task['title']),
                                                      style: Theme.of(context)
                                                          .textTheme
                                                          .bodyMedium
                                                          ?.copyWith(fontWeight: FontWeight.w700),
                                                    ),
                                                    if (_s(task['description']).isNotEmpty) ...[
                                                      const SizedBox(height: 4),
                                                      Text(
                                                        _s(task['description']),
                                                        maxLines: 2,
                                                        overflow: TextOverflow.ellipsis,
                                                      ),
                                                    ],
                                                    const SizedBox(height: 8),
                                                    Wrap(
                                                      spacing: 6,
                                                      runSpacing: 4,
                                                      children: [
                                                        _Pill(
                                                          text: _statusLabel(_s(task['status'])),
                                                          color: _taskStatusColor(_s(task['status'])),
                                                        ),
                                                        _Pill(
                                                          text: widget.label(
                                                            _s(task['priority']).isNotEmpty
                                                                ? _s(task['priority'])
                                                                : 'normal',
                                                          ),
                                                          color: _priorityColor(_s(task['priority'])),
                                                        ),
                                                      ],
                                                    ),
                                                    const SizedBox(height: 8),
                                                    Row(
                                                      children: [
                                                        Expanded(
                                                          child: Text(
                                                            _s(_m(task['assignee'])['id']).isNotEmpty
                                                                ? widget.memberName(_m(task['assignee']))
                                                                : 'Unassigned',
                                                            maxLines: 1,
                                                            overflow: TextOverflow.ellipsis,
                                                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                                                          ),
                                                        ),
                                                        if (due != null)
                                                          Text(
                                                            DateFormat('MMM d').format(due),
                                                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                                                          ),
                                                        if (widget.canWrite)
                                                          PopupMenuButton<String>(
                                                            onSelected: (v) => _onMenuSelected(context, ref, task, v),
                                                            itemBuilder: (_) => _menuItemsForTask(task),
                                                          ),
                                                      ],
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            );
                                          },
                                        ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  )
                else
                  Column(
                    children: widget.tasks
                        .map(
                          (task) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              tileColor: Theme.of(context).colorScheme.surfaceContainerLow,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              title: Text(_s(task['title'])),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (_s(task['description']).isNotEmpty) Text(_s(task['description'])),
                                  const SizedBox(height: 4),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 4,
                                    children: [
                                      _Pill(
                                        text: _statusLabel(_s(task['status'])),
                                        color: _taskStatusColor(_s(task['status'])),
                                      ),
                                      _Pill(
                                        text: widget.label(
                                          _s(task['priority']).isNotEmpty ? _s(task['priority']) : 'normal',
                                        ),
                                        color: _priorityColor(_s(task['priority'])),
                                      ),
                                      if (_s(_m(task['assignee'])['id']).isNotEmpty)
                                        _Pill(
                                          text: widget.memberName(_m(task['assignee'])),
                                          color: const Color(0xFF0EA5E9),
                                        ),
                                      if (_s(task['dueDate']).isNotEmpty)
                                        Builder(
                                          builder: (_) {
                                            final due = DateTime.tryParse(_s(task['dueDate']))?.toLocal();
                                            if (due == null) return const SizedBox.shrink();
                                            return _Pill(
                                              text: DateFormat('MMM d, y').format(due),
                                              color: const Color(0xFFEA580C),
                                            );
                                          },
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                              trailing: widget.canWrite
                                  ? PopupMenuButton<String>(
                                      onSelected: (v) => _onMenuSelected(context, ref, task, v),
                                      itemBuilder: (_) => _menuItemsForTask(task),
                                    )
                                  : null,
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
    );
  }
}

class _TaskDialog {
  static String _s(dynamic v) => v?.toString() ?? '';
  static Map<String, dynamic> _m(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : const {};

  static Future<void> open({
    required BuildContext context,
    required WidgetRef ref,
    required String projectId,
    required List<Map<String, dynamic>> members,
    required List<Map<String, dynamic>> phases,
    required List<String> statuses,
    required List<String> priorities,
    required String Function(Map<String, dynamic>) memberUserId,
    required String Function(Map<String, dynamic>) memberName,
    required String Function(String) label,
    required Future<DateTime?> Function(DateTime?) pickDate,
    required void Function(String, {bool error}) snack,
    required String Function(Object) err,
    required VoidCallback refresh,
    required Future<bool> Function(String, String, String) confirm,
    Map<String, dynamic>? existing,
  }) async {
    final api = ref.read(apiClientProvider);
    final title = TextEditingController(text: _s(existing?['title']));
    final description = TextEditingController(text: _s(existing?['description']));
    var status = _s(existing?['status']).isNotEmpty ? _s(existing?['status']) : statuses.first;
    var priority =
        _s(existing?['priority']).isNotEmpty ? _s(existing?['priority']) : 'normal';
    status = status.trim().toLowerCase();
    priority = priority.trim().toLowerCase();
    if (!statuses.contains(status)) status = statuses.first;
    if (!priorities.contains(priority)) priority = priorities.first;
    var assigneeId = _s(existing?['assigneeId']).isNotEmpty
        ? _s(existing?['assigneeId'])
        : _s(_m(existing?['assignee'])['id']);
    var phaseId =
        _s(existing?['phaseId']).isNotEmpty ? _s(existing?['phaseId']) : _s(_m(existing?['phase'])['id']);
    DateTime? dueDate = _s(existing?['dueDate']).isNotEmpty
        ? DateTime.tryParse(_s(existing?['dueDate']))?.toLocal()
        : null;

    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
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
              TextField(controller: title, decoration: const InputDecoration(labelText: 'Task title')),
              const SizedBox(height: 8),
              TextField(
                controller: description,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: status,
                items: statuses
                    .map((e) => DropdownMenuItem(value: e, child: Text(label(e))))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setStateSheet(() => status = v);
                },
                decoration: const InputDecoration(labelText: 'Status'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: priority,
                items: priorities
                    .map((e) => DropdownMenuItem(value: e, child: Text(label(e))))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setStateSheet(() => priority = v);
                },
                decoration: const InputDecoration(labelText: 'Priority'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: assigneeId.isEmpty ? '' : assigneeId,
                items: [
                  const DropdownMenuItem(value: '', child: Text('Unassigned')),
                  ...members.map(
                    (m) => DropdownMenuItem(
                      value: memberUserId(m),
                      child: Text(memberName(m)),
                    ),
                  ),
                ],
                onChanged: (v) => setStateSheet(() => assigneeId = v ?? ''),
                decoration: const InputDecoration(labelText: 'Assignee'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: phaseId.isEmpty ? '' : phaseId,
                items: [
                  const DropdownMenuItem(value: '', child: Text('No phase')),
                  ...phases.map(
                    (p) => DropdownMenuItem(value: _s(p['id']), child: Text(_s(p['name']))),
                  ),
                ],
                onChanged: (v) => setStateSheet(() => phaseId = v ?? ''),
                decoration: const InputDecoration(labelText: 'Phase'),
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  dueDate == null ? 'Due date' : 'Due ${DateFormat('MMM d, y').format(dueDate!)}',
                ),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: () async {
                  final d = await pickDate(dueDate);
                  if (d != null) setStateSheet(() => dueDate = d);
                },
              ),
              Row(
                children: [
                  if (existing != null)
                    TextButton(
                      onPressed: () => Navigator.pop(context, 'delete'),
                      child: const Text('Delete'),
                    ),
                  const Spacer(),
                  TextButton(onPressed: () => Navigator.pop(context, 'cancel'), child: const Text('Cancel')),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, 'save'),
                    child: Text(existing == null ? 'Create' : 'Save'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (action == null || action == 'cancel') return;
    try {
      if (action == 'delete' && existing != null) {
        final ok = await confirm(
          'Delete task?',
          'This task will be permanently removed.',
          'Delete',
        );
        if (!ok) return;
        await api.deleteProjectTask(projectId, _s(existing['id']));
        snack('Task deleted');
      } else {
        if (title.text.trim().isEmpty) {
          snack('Task title is required', error: true);
          return;
        }
        final body = {
          'title': title.text.trim(),
          'description': description.text.trim().isEmpty ? null : description.text.trim(),
          'status': status,
          'priority': priority,
          'assigneeId': assigneeId.isEmpty ? null : assigneeId,
          'phaseId': phaseId.isEmpty ? null : phaseId,
          'dueDate': dueDate?.toIso8601String(),
        };
        if (existing == null) {
          await api.createProjectTask(projectId, body);
          snack('Task created');
        } else {
          await api.updateProjectTask(projectId, _s(existing['id']), body);
          snack('Task updated');
        }
      }
      refresh();
    } catch (e) {
      snack(err(e), error: true);
    }
  }
}

class _MemberSection extends ConsumerWidget {
  final List<Map<String, dynamic>> members;
  final bool canManage;
  final String meId;
  final String Function(Map<String, dynamic>) memberUserId;
  final String Function(Map<String, dynamic>) memberName;
  final String projectId;
  final void Function(String, {bool error}) snack;
  final String Function(Object) err;
  final VoidCallback refresh;

  const _MemberSection({
    required this.members,
    required this.canManage,
    required this.meId,
    required this.memberUserId,
    required this.memberName,
    required this.projectId,
    required this.snack,
    required this.err,
    required this.refresh,
  });

  String _s(dynamic v) => v?.toString() ?? '';
  Map<String, dynamic> _m(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : const {};

  Future<void> _remove(WidgetRef ref, Map<String, dynamic> member) async {
    try {
      await ref.read(apiClientProvider).deleteProjectMember(projectId, _s(member['id']));
      snack('Member removed');
      refresh();
    } catch (e) {
      snack(err(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _BlockCard(
      title: 'Members',
      subtitle: '${members.length}',
      child: members.isEmpty
          ? const EmptyState(
              icon: Icons.group_outlined,
              title: 'No members yet',
              subtitle: 'Add team members to collaborate',
            )
          : Column(
              children: members
                  .map(
                    (m) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        tileColor: Theme.of(context).colorScheme.surfaceContainerLow,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        leading: UserAvatar(
                          photoUrl: _s(_m(m['user'])['photoUrl']),
                          name: memberName(m),
                          radius: 18,
                        ),
                        title: Text(memberName(m)),
                        subtitle: Text(_s(m['role']).isEmpty ? 'Member' : _s(m['role'])),
                        trailing: canManage && memberUserId(m) != meId
                            ? IconButton(
                                onPressed: () => _remove(ref, m),
                                icon: const Icon(Icons.person_remove_outlined),
                              )
                            : null,
                      ),
                    ),
                  )
                  .toList(),
            ),
    );
  }
}

class _BlockCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;
  const _BlockCard({required this.title, required this.subtitle, required this.child});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                Text(subtitle),
              ],
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final Color color;
  const _Pill({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}
