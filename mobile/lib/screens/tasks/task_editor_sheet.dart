import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:html_editor_enhanced/html_editor.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';

const _kTaskEditorPrimary = Color(0xFFAA8038);

class TaskEditorSheet extends ConsumerStatefulWidget {
  const TaskEditorSheet({
    super.key,
    this.initialTask,
    this.currentUserId,
    this.onSaved,
  });

  final Map<String, dynamic>? initialTask;
  final String? currentUserId;
  final VoidCallback? onSaved;

  @override
  ConsumerState<TaskEditorSheet> createState() => _TaskEditorSheetState();
}

class _TaskEditorSheetState extends ConsumerState<TaskEditorSheet> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final HtmlEditorController _descHtmlCtrl = HtmlEditorController();
  String _initialDescriptionHtml = '';

  String _type = 'task';
  String _status = 'opened';
  String _priority = 'normal';
  bool _isPrivate = false;
  DateTime? _dueDate;
  bool _hadInitialDueDate = false;
  List<Map<String, dynamic>> _assignees = <Map<String, dynamic>>[];

  List<dynamic> _teamUsers = <dynamic>[];
  List<Map<String, dynamic>> _stages = const [];
  bool _loadingUsers = false;
  bool _saving = false;

  bool get _isEdit {
    final id = (widget.initialTask?['id'] ?? '').toString().trim();
    return id.isNotEmpty;
  }

  String get _taskId => (widget.initialTask?['id'] ?? '').toString().trim();
  String get _currentUserId => (widget.currentUserId ?? '').trim();

  @override
  void initState() {
    super.initState();
    _seedFromInitialTask();
    _loadTeamUsers();
    _loadStages();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  void _seedFromInitialTask() {
    final task = widget.initialTask;
    if (task == null) return;

    _titleCtrl.text = _asTaskString(task['title'] ?? task['subject']);
    _descCtrl.text = _asTaskString(task['content'] ?? task['description']);
    _initialDescriptionHtml = _descCtrl.text;

    final type = _asTaskString(task['type']);
    if (type.isNotEmpty) _type = type;

    final status = _asTaskString(task['status']);
    if (status.isNotEmpty) _status = status;

    final priority = _asTaskString(task['priority']);
    if (priority.isNotEmpty) _priority = priority;

    _isPrivate = task['isPrivate'] == true;

    final dueRaw = _asTaskString(task['dueDate']);
    final dueParsed = dueRaw.isEmpty ? null : DateTime.tryParse(dueRaw)?.toLocal();
    _dueDate = dueParsed;
    _hadInitialDueDate = dueParsed != null;

    final rawAssignees = task['assignees'];
    if (rawAssignees is List) {
      _assignees = rawAssignees
          .whereType<Map>()
          .map((entry) {
            final map = Map<String, dynamic>.from(entry);
            final userId = _asTaskString(map['userId'] ?? map['id'] ?? map['user']?['id']);
            if (userId.isEmpty) return null;
            return <String, dynamic>{
              'userId': userId,
              'canComment': map['canComment'] != false,
            };
          })
          .whereType<Map<String, dynamic>>()
          .toList();
    }
    _ensureCreatorAssignee();
  }

  void _ensureCreatorAssignee() {
    if (_isEdit) return;
    if (_currentUserId.isEmpty) return;
    final hasCreator = _assignees.any(
      (item) => _asTaskString(item['userId']) == _currentUserId,
    );
    if (hasCreator) return;
    _assignees = <Map<String, dynamic>>[
      {'userId': _currentUserId, 'canComment': true},
      ..._assignees,
    ];
  }

  String _asTaskString(dynamic value) {
    if (value == null) return '';
    return value.toString().trim();
  }

  Future<void> _loadTeamUsers() async {
    setState(() => _loadingUsers = true);
    try {
      final users = await ref.read(apiClientProvider).getTeamUsers();
      if (!mounted) return;
      setState(() => _teamUsers = users);
    } catch (_) {
      // Non-fatal.
    } finally {
      if (mounted) setState(() => _loadingUsers = false);
    }
  }

  Future<void> _loadStages() async {
    try {
      final res = await ref.read(apiClientProvider).getTasks(limit: 1);
      if (res is! Map || res['stages'] is! List || !mounted) return;
      final stages = (res['stages'] as List<dynamic>)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where((item) => _asTaskString(item['key']).isNotEmpty)
          .toList();
      if (stages.isEmpty) return;
      setState(() {
        _stages = stages;
        final hasCurrent = _stages.any((item) => _asTaskString(item['key']) == _status);
        if (!hasCurrent) _status = _asTaskString(_stages.first['key']);
      });
    } catch (_) {
      // Keep fallback statuses.
    }
  }

  void _setDue(DateTime? value) => setState(() => _dueDate = value);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 4)),
    );
    if (picked != null) _setDue(picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    _ensureCreatorAssignee();
    setState(() => _saving = true);
    try {
      var descriptionHtml = await _descHtmlCtrl.getText();
      if (descriptionHtml.trim().toLowerCase() == 'null') {
        descriptionHtml = '';
      }
      if (RegExp(r'^\s*<p>(<br>|&nbsp;|\s)*</p>\s*$', caseSensitive: false)
          .hasMatch(descriptionHtml)) {
        descriptionHtml = '';
      }
      if (descriptionHtml.trim().isEmpty) {
        descriptionHtml = _descCtrl.text.trim();
      }
      final payload = <String, dynamic>{
        'title': _titleCtrl.text.trim(),
        'description': descriptionHtml.trim(),
        'type': _type,
        'status': _status,
        'priority': _priority,
        'isPrivate': _isPrivate,
        'assignees': _assignees,
      };

      if (_dueDate != null) {
        payload['dueDate'] = _dueDate!.toIso8601String();
      } else if (_isEdit && _hadInitialDueDate) {
        payload['dueDate'] = null;
      }

      if (_isEdit) {
        await ref.read(apiClientProvider).updateTask(_taskId, payload);
      } else {
        await ref.read(apiClientProvider).createTask(payload);
      }

      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onSaved?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isEdit ? 'Task updated' : 'Task created'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed: $e'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _wrapSelectionWithTags(
    String openTag,
    String closeTag, {
    String placeholder = 'text',
  }) {
    final value = _descCtrl.value;
    final text = value.text;
    var start = value.selection.start;
    var end = value.selection.end;
    if (start < 0 || end < 0) {
      start = text.length;
      end = text.length;
    }
    if (start > end) {
      final tmp = start;
      start = end;
      end = tmp;
    }
    final selected = start == end ? placeholder : text.substring(start, end);
    final replacement = '$openTag$selected$closeTag';
    final next = text.replaceRange(start, end, replacement);
    _descCtrl.value = value.copyWith(
      text: next,
      selection: TextSelection.collapsed(offset: start + replacement.length),
      composing: TextRange.empty,
    );
  }

  Future<void> _insertLinkTag() async {
    final labelCtrl = TextEditingController();
    final urlCtrl = TextEditingController(text: 'https://');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Insert Link'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: labelCtrl,
              decoration: const InputDecoration(labelText: 'Label'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: urlCtrl,
              decoration: const InputDecoration(labelText: 'URL'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Insert')),
        ],
      ),
    );
    if (ok != true) return;
    final label = labelCtrl.text.trim().isEmpty ? 'link' : labelCtrl.text.trim();
    final url = urlCtrl.text.trim();
    if (url.isEmpty) return;
    _wrapSelectionWithTags('<a href="$url">', '</a>', placeholder: label);
  }

  Future<void> _insertImageTag() async {
    final urlCtrl = TextEditingController(text: 'https://');
    final altCtrl = TextEditingController(text: 'image');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Insert Image'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: urlCtrl,
              decoration: const InputDecoration(labelText: 'Image URL'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: altCtrl,
              decoration: const InputDecoration(labelText: 'Alt text'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Insert')),
        ],
      ),
    );
    if (ok != true) return;
    final url = urlCtrl.text.trim();
    if (url.isEmpty) return;
    final alt = altCtrl.text.trim().isEmpty ? 'image' : altCtrl.text.trim();
    _wrapSelectionWithTags('<img src="$url" alt="$alt" />', '', placeholder: '');
  }

  void _insertBulletList() {
    _wrapSelectionWithTags('<ul><li>', '</li></ul>', placeholder: 'List item');
  }

  void _insertOrderedList() {
    _wrapSelectionWithTags('<ol><li>', '</li></ol>', placeholder: 'Step 1');
  }

  void _insertHeading() {
    _wrapSelectionWithTags('<h3>', '</h3>', placeholder: 'Heading');
  }

  void _insertQuote() {
    _wrapSelectionWithTags('<blockquote>', '</blockquote>', placeholder: 'Quote');
  }

  void _insertCodeBlock() {
    _wrapSelectionWithTags('<pre><code>', '</code></pre>', placeholder: 'code');
  }

  void _insertTableTemplate() {
    const tableTemplate =
        '<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value 1</td><td>Value 2</td></tr></tbody></table>';
    _wrapSelectionWithTags(tableTemplate, '', placeholder: '');
  }

  Widget _buildEditorToolbar() {
    final iconColor = _saving ? Colors.grey : _kTaskEditorPrimary;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Heading',
            onPressed: _saving ? null : _insertHeading,
            icon: Icon(Icons.title_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Bold',
            onPressed: _saving ? null : () => _wrapSelectionWithTags('<b>', '</b>'),
            icon: Icon(Icons.format_bold_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Italic',
            onPressed: _saving ? null : () => _wrapSelectionWithTags('<i>', '</i>'),
            icon: Icon(Icons.format_italic_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Underline',
            onPressed: _saving ? null : () => _wrapSelectionWithTags('<u>', '</u>'),
            icon: Icon(Icons.format_underline_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Bullet List',
            onPressed: _saving ? null : _insertBulletList,
            icon: Icon(Icons.format_list_bulleted_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Numbered List',
            onPressed: _saving ? null : _insertOrderedList,
            icon: Icon(Icons.format_list_numbered_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Quote',
            onPressed: _saving ? null : _insertQuote,
            icon: Icon(Icons.format_quote_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Code Block',
            onPressed: _saving ? null : _insertCodeBlock,
            icon: Icon(Icons.code_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Insert Link',
            onPressed: _saving ? null : _insertLinkTag,
            icon: Icon(Icons.link_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Insert Image',
            onPressed: _saving ? null : _insertImageTag,
            icon: Icon(Icons.image_outlined, color: iconColor),
          ),
          IconButton(
            tooltip: 'Insert Table',
            onPressed: _saving ? null : _insertTableTemplate,
            icon: Icon(Icons.table_chart_rounded, color: iconColor),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dueDateStr = _dueDate != null ? DateFormat('MMM d, y').format(_dueDate!) : null;
    final stageOptions = _stages.isNotEmpty
        ? _stages
        : const [
            {'key': 'opened', 'label': 'Opened'},
            {'key': 'completed', 'label': 'Completed'},
            {'key': 'closed', 'label': 'Closed'},
          ];

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
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
              Row(
                children: [
                  const Icon(Icons.task_alt_rounded, color: _kTaskEditorPrimary, size: 22),
                  const SizedBox(width: 8),
                  Text(
                    _isEdit ? 'Edit Task' : 'Create New Task',
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Subject, responsible users, status, deadline, rich text, and attachments.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: cs.onSurface.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _titleCtrl,
                decoration: const InputDecoration(
                  labelText: 'Subject *',
                  prefixIcon: Icon(Icons.title_rounded),
                ),
                validator: (value) =>
                    (value == null || value.trim().isEmpty) ? 'Subject is required' : null,
                autofocus: !_isEdit,
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _type,
                      decoration: const InputDecoration(
                        labelText: 'Type',
                        isDense: true,
                      ),
                      items: const [
                        DropdownMenuItem(value: 'task', child: Text('Task')),
                        DropdownMenuItem(value: 'event', child: Text('Event')),
                        DropdownMenuItem(value: 'note', child: Text('Note')),
                      ],
                      onChanged: _saving ? null : (value) => setState(() => _type = value ?? 'task'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _status,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                        isDense: true,
                      ),
                      items: stageOptions.map((stage) {
                        final key = _asTaskString(stage['key']);
                        final label = _asTaskString(stage['label']).isEmpty
                            ? key
                            : _asTaskString(stage['label']);
                        return DropdownMenuItem<String>(value: key, child: Text(label));
                      }).toList(),
                      onChanged: _saving ? null : (value) => setState(() => _status = value ?? _status),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _priority,
                      decoration: const InputDecoration(
                        labelText: 'Priority',
                        isDense: true,
                      ),
                      items: const [
                        DropdownMenuItem(value: 'high', child: Text('High')),
                        DropdownMenuItem(value: 'normal', child: Text('Normal')),
                        DropdownMenuItem(value: 'low', child: Text('Low')),
                      ],
                      onChanged: _saving ? null : (value) => setState(() => _priority = value ?? 'normal'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _saving ? null : _pickDate,
                      icon: Icon(
                        Icons.calendar_today_rounded,
                        size: 16,
                        color: _dueDate != null ? _kTaskEditorPrimary : cs.onSurface,
                      ),
                      label: Text(
                        dueDateStr ?? 'Deadline',
                        style: TextStyle(
                          color: _dueDate != null ? _kTaskEditorPrimary : cs.onSurface,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
                        alignment: Alignment.centerLeft,
                        side: BorderSide(
                          color: _dueDate != null
                              ? _kTaskEditorPrimary.withValues(alpha: 0.4)
                              : cs.outline,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _DeadlineChip('Today', today, _dueDate, _saving ? null : () => _setDue(today)),
                    const SizedBox(width: 8),
                    _DeadlineChip(
                      'Tomorrow',
                      today.add(const Duration(days: 1)),
                      _dueDate,
                      _saving ? null : () => _setDue(today.add(const Duration(days: 1))),
                    ),
                    const SizedBox(width: 8),
                    _DeadlineChip(
                      'In 3 Days',
                      today.add(const Duration(days: 3)),
                      _dueDate,
                      _saving ? null : () => _setDue(today.add(const Duration(days: 3))),
                    ),
                    const SizedBox(width: 8),
                    _DeadlineChip(
                      'Next Week',
                      today.add(const Duration(days: 7)),
                      _dueDate,
                      _saving ? null : () => _setDue(today.add(const Duration(days: 7))),
                    ),
                    if (_dueDate != null) ...[
                      const SizedBox(width: 8),
                      _ClearChip(_saving ? null : () => _setDue(null)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Description',
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                'HTML editor with links, images, tables, and long-form notes.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: cs.onSurface.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 6),
              IgnorePointer(
                ignoring: _saving,
                child: HtmlEditor(
                  controller: _descHtmlCtrl,
                  htmlEditorOptions: HtmlEditorOptions(
                    hint: 'Write description...',
                    initialText: _initialDescriptionHtml,
                    shouldEnsureVisible: true,
                    adjustHeightForKeyboard: true,
                  ),
                  htmlToolbarOptions: const HtmlToolbarOptions(
                    toolbarType: ToolbarType.nativeScrollable,
                  ),
                  otherOptions: OtherOptions(
                    height: 300,
                    decoration: BoxDecoration(),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Assigned to',
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              _AssigneeSelector(
                users: _teamUsers,
                loading: _loadingUsers,
                assignees: _assignees,
                currentUserId: _currentUserId,
                isCreate: !_isEdit,
                disabled: _saving,
                onToggle: (id, checked) => setState(() {
                  if (!_isEdit && id == _currentUserId && !checked) {
                    return;
                  }
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
                style: theme.textTheme.bodySmall?.copyWith(
                  color: cs.onSurface.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 10),
              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: cs.outline.withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: CheckboxListTile(
                  title: const Text('Private task', style: TextStyle(fontWeight: FontWeight.w500)),
                  subtitle: const Text(
                    'Only visible to you and assignees',
                    style: TextStyle(fontSize: 12),
                  ),
                  value: _isPrivate,
                  activeColor: _kTaskEditorPrimary,
                  onChanged: _saving ? null : (value) => setState(() => _isPrivate = value ?? false),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: _kTaskEditorPrimary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Icon(_isEdit ? Icons.save_rounded : Icons.add_rounded),
                      label: Text(
                        _isEdit ? 'Save' : 'Add',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
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

class _DeadlineChip extends StatelessWidget {
  const _DeadlineChip(this.label, this.target, this.selected, this.onTap);

  final String label;
  final DateTime target;
  final DateTime? selected;
  final VoidCallback? onTap;

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
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: _active ? _kTaskEditorPrimary : _kTaskEditorPrimary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: _active ? _kTaskEditorPrimary : _kTaskEditorPrimary.withValues(alpha: 0.32),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: _active ? Colors.white : _kTaskEditorPrimary,
          ),
        ),
      ),
    );
  }
}

class _ClearChip extends StatelessWidget {
  const _ClearChip(this.onTap);
  final VoidCallback? onTap;

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
        child: const Text(
          'Clear',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Colors.grey),
        ),
      ),
    );
  }
}

class _AssigneeSelector extends StatelessWidget {
  const _AssigneeSelector({
    required this.users,
    required this.loading,
    required this.assignees,
    required this.currentUserId,
    required this.isCreate,
    required this.onToggle,
    required this.onSetCanComment,
    required this.disabled,
  });

  final List<dynamic> users;
  final bool loading;
  final List<Map<String, dynamic>> assignees;
  final String currentUserId;
  final bool isCreate;
  final bool disabled;
  final void Function(String id, bool checked) onToggle;
  final void Function(String id, bool canComment) onSetCanComment;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (users.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(
          'No team members found',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: cs.onSurface.withValues(alpha: 0.5),
          ),
        ),
      );
    }

    return Container(
      constraints: const BoxConstraints(maxHeight: 220),
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
            indent: 56,
          ),
          itemBuilder: (_, index) {
            final user = users[index] is Map
                ? Map<String, dynamic>.from(users[index] as Map)
                : <String, dynamic>{};
            final id = (user['id'] ?? '').toString();
            final fullname = (user['fullname'] ?? '').toString();
            final name = fullname.isNotEmpty
                ? fullname
                : '${user['name'] ?? ''} ${user['surname'] ?? ''}'.trim();
            final email = (user['email'] ?? '').toString();
            Map<String, dynamic>? assigneeEntry;
            for (final item in assignees) {
              if (item['userId'] == id) {
                assigneeEntry = item;
                break;
              }
            }
            final isCreatorLocked =
                isCreate && currentUserId.isNotEmpty && id == currentUserId;
            final isSelected = assigneeEntry != null || isCreatorLocked;
            final canComment = (assigneeEntry?['canComment'] as bool?) ?? true;

            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              child: Column(
                children: [
                  CheckboxListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                    secondary: CircleAvatar(
                      radius: 16,
                      backgroundColor: _kTaskEditorPrimary.withValues(alpha: 0.12),
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : '?',
                        style: const TextStyle(
                          fontSize: 13,
                          color: _kTaskEditorPrimary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    title: Text(
                      name.isEmpty ? email : name,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                    subtitle: email.isNotEmpty
                        ? Text(
                            isCreatorLocked
                                ? '$email • Creator (locked while creating)'
                                : email,
                            style: const TextStyle(fontSize: 11),
                            overflow: TextOverflow.ellipsis,
                          )
                        : null,
                    value: isSelected,
                    activeColor: _kTaskEditorPrimary,
                    onChanged: (disabled || isCreatorLocked)
                        ? null
                        : (value) => onToggle(id, value ?? false),
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
                              onChanged: disabled
                                  ? null
                                  : (value) => onSetCanComment(id, value != 'view'),
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
