import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:html_editor_enhanced/html_editor.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/user_avatar.dart';
import 'task_editor_sheet.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _taskDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final res = await ref.watch(apiClientProvider).getTask(id);
  // API may return the task directly or wrapped in a 'task'/'data' key
  if (res.containsKey('task')) return res['task'] as Map<String, dynamic>;
  if (res.containsKey('data')) return res['data'] as Map<String, dynamic>;
  return res;
});

final _taskStagesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.watch(apiClientProvider).getTasks(limit: 1);
  if (res is Map && res['stages'] is List) {
    return (res['stages'] as List<dynamic>)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
  }
  return const [];
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFAA8038);

Color _parseHexColor(String? hex, {Color fallback = Colors.blueGrey}) {
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
    return _parseHexColor(stage['color']?.toString(), fallback: Colors.blueGrey);
  }
  switch ((status ?? '').toLowerCase()) {
    case 'opened':
      return Colors.blue;
    case 'completed':
      return Colors.green;
    case 'closed':
      return Colors.grey;
    default:
      return Colors.blueGrey;
  }
}

Color _priorityColor(String? priority) {
  switch ((priority ?? '').toLowerCase()) {
    case 'high':
    case 'urgent':
      return Colors.red;
    case 'medium':
    case 'normal':
      return Colors.orange;
    case 'low':
      return Colors.green;
    default:
      return Colors.grey;
  }
}

String _formatDate(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  try {
    final dt = DateTime.parse(raw).toLocal();
    return DateFormat('MMM d, yyyy').format(dt);
  } catch (_) {
    return raw;
  }
}

String _formatDateTime(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  try {
    final dt = DateTime.parse(raw).toLocal();
    return DateFormat('MMM d, yyyy · h:mm a').format(dt);
  } catch (_) {
    return raw;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

bool _hasHtmlContent(String value) {
  return RegExp(r'<[^>]+>').hasMatch(value);
}

DateTime _safeDateTime(String? raw) {
  if (raw == null || raw.trim().isEmpty) {
    return DateTime.fromMillisecondsSinceEpoch(0);
  }
  return DateTime.tryParse(raw)?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0);
}

class _CommentNode {
  _CommentNode(this.comment);
  final Map<String, dynamic> comment;
  final List<_CommentNode> replies = <_CommentNode>[];
}

String _formatFileSize(dynamic bytes) {
  final value = bytes is num ? bytes.toInt() : int.tryParse('${bytes ?? ''}') ?? 0;
  if (value <= 0) return '0 B';
  if (value < 1024) return '$value B';
  if (value < 1024 * 1024) return '${(value / 1024).toStringAsFixed(1)} KB';
  return '${(value / (1024 * 1024)).toStringAsFixed(1)} MB';
}

class TaskDetailScreen extends ConsumerStatefulWidget {
  const TaskDetailScreen({super.key, required this.taskId});

  final String taskId;

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  List<dynamic> _comments = [];
  List<_CommentNode> _commentTree = [];
  bool _commentsLoading = false;
  bool _sending = false;
  bool _canComment = false;
  bool _canChangeStatus = false;
  bool _canManageTask = false;
  bool _isNoteTask = false;
  int _authorEditWindowMinutes = 5;
  String _currentUserId = '';
  String? _editingCommentId;
  String? _deletingCommentId;
  bool _savingCommentEdit = false;
  bool _movingBucket = false;
  List<Map<String, dynamic>> _availableGroups = const [];
  final _editingCommentCtrl = TextEditingController();
  final _commentSearchCtrl = TextEditingController();
  String _commentSearch = '';
  List<PlatformFile> _pendingFiles = [];
  Map<String, dynamic>? _replyTarget;
  final Set<String> _collapsedThreadIds = <String>{};

  final _commentCtrl = TextEditingController();
  final HtmlEditorController _commentHtmlCtrl = HtmlEditorController();
  int _commentEditorResetKey = 0;
  final _commentFocus = FocusNode();
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadComments();
    _loadAvailableGroups();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    _editingCommentCtrl.dispose();
    _commentSearchCtrl.dispose();
    _commentFocus.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadComments() async {
    setState(() => _commentsLoading = true);
    try {
      final data = await ref
          .read(apiClientProvider)
          .getTaskComments(widget.taskId);
      final normalized = data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      final commentIds = normalized
          .map((item) => (item['id'] ?? '').toString())
          .where((id) => id.isNotEmpty)
          .toSet();
      setState(() {
        _comments = normalized;
        _commentTree = _buildCommentTree(normalized);
        _collapsedThreadIds.removeWhere((id) => !commentIds.contains(id));
      });
    } catch (_) {
      // Non-fatal — show empty comments
    } finally {
      setState(() => _commentsLoading = false);
    }
  }

  List<_CommentNode> _buildCommentTree(List<Map<String, dynamic>> comments) {
    final sorted = [...comments]
      ..sort((a, b) => _safeDateTime(a['createdAt']?.toString())
          .compareTo(_safeDateTime(b['createdAt']?.toString())));

    final nodes = <String, _CommentNode>{};
    for (final comment in sorted) {
      final id = (comment['id'] ?? '').toString();
      if (id.isEmpty) continue;
      nodes[id] = _CommentNode(comment);
    }

    final roots = <_CommentNode>[];
    for (final comment in sorted) {
      final id = (comment['id'] ?? '').toString();
      final node = nodes[id];
      if (node == null) continue;
      final parentId = (comment['parentCommentId'] ?? '').toString().trim();
      if (parentId.isEmpty) {
        roots.add(node);
        continue;
      }
      final parent = nodes[parentId];
      if (parent == null) {
        roots.add(node);
        continue;
      }
      parent.replies.add(node);
    }
    return roots;
  }

  bool _commentMatchesQuery(Map<String, dynamic> comment, String query) {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) return true;
    final content = _stripHtml((comment['content'] ?? comment['text'] ?? '').toString()).toLowerCase();
    final author = comment['user'] ?? comment['author'];
    final authorName = author is Map
        ? ((author['fullname'] ?? author['name'] ?? '').toString().toLowerCase())
        : '';
    final attachments = (comment['attachments'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => (item['fileName'] ?? '').toString().toLowerCase());
    return content.contains(normalized) ||
        authorName.contains(normalized) ||
        attachments.any((name) => name.contains(normalized));
  }

  _CommentNode? _filterCommentNode(_CommentNode node, String query) {
    if (query.trim().isEmpty) return node;
    final filteredReplies = node.replies
        .map((reply) => _filterCommentNode(reply, query))
        .whereType<_CommentNode>()
        .toList();
    final selfMatch = _commentMatchesQuery(node.comment, query);
    if (!selfMatch && filteredReplies.isEmpty) return null;
    final clone = _CommentNode(Map<String, dynamic>.from(node.comment));
    clone.replies.addAll(filteredReplies);
    return clone;
  }

  int _countVisibleComments(List<_CommentNode> nodes) {
    var total = 0;
    for (final node in nodes) {
      total += 1;
      total += _countVisibleComments(node.replies);
    }
    return total;
  }

  bool _withinAuthorEditWindow(String? createdAt) {
    final created = _safeDateTime(createdAt);
    final now = DateTime.now();
    final window = Duration(minutes: _authorEditWindowMinutes);
    return now.difference(created) <= window;
  }

  bool _canModifyComment(Map<String, dynamic> comment) {
    if (!_isNoteTask) return false;
    if (_canManageTask) return true;
    final author = comment['user'] ?? comment['author'];
    if (author is! Map) return false;
    final authorId = (author['id'] ?? '').toString();
    if (authorId.isEmpty || authorId != _currentUserId) return false;
    return _withinAuthorEditWindow(comment['createdAt']?.toString());
  }

  Future<void> _sendComment() async {
    if (!_canComment) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You can view this task, but commenting is disabled for your assignment')),
        );
      }
      return;
    }

    var draftText = await _commentHtmlCtrl.getText();
    if (draftText.trim().toLowerCase() == 'null') {
      draftText = '';
    }
    if (RegExp(r'^\s*<p>(<br>|&nbsp;|\s)*</p>\s*$', caseSensitive: false)
        .hasMatch(draftText)) {
      draftText = '';
    }
    draftText = draftText.trim();
    final filePaths = _pendingFiles
        .map((file) => file.path)
        .whereType<String>()
        .where((path) => path.isNotEmpty)
        .toList();
    if (draftText.isEmpty && filePaths.isEmpty) return;

    final text = draftText;
    final parentCommentId = (_replyTarget?['id'] ?? '').toString().trim();

    setState(() => _sending = true);
    try {
      final created = await ref.read(apiClientProvider).addTaskComment(
            widget.taskId,
            text,
            allowEmpty: filePaths.isNotEmpty,
            parentCommentId: parentCommentId.isNotEmpty ? parentCommentId : null,
          );
      final commentId = (created['id'] ?? '').toString();
      if (filePaths.isNotEmpty) {
        if (commentId.isEmpty) {
          throw Exception('Comment was created without an id');
        }
        await ref.read(apiClientProvider).uploadTaskFiles(
              widget.taskId,
              filePaths: filePaths,
              commentId: commentId,
            );
      }

      if (mounted) {
        setState(() {
          _pendingFiles = [];
          _replyTarget = null;
          _commentEditorResetKey += 1;
        });
      } else {
        _pendingFiles = [];
        _replyTarget = null;
        _commentEditorResetKey += 1;
      }
      await _loadComments();
      ref.invalidate(_taskDetailProvider(widget.taskId));
      // Scroll to bottom after comments reload
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollCtrl.hasClients) {
          _scrollCtrl.animateTo(
            _scrollCtrl.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send comment: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _changeStatus(String newStatus) async {
    if (!_canChangeStatus) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You do not have permission to change task status')),
        );
      }
      return;
    }
    try {
      await ref.read(apiClientProvider).updateTask(
        widget.taskId,
        {'status': newStatus},
      );
      ref.invalidate(_taskDetailProvider(widget.taskId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update status: $e')),
        );
      }
    }
  }

  Future<void> _loadAvailableGroups() async {
    try {
      final meta = await ref.read(apiClientProvider).getTasksMeta();
      final groupsRaw = meta['groups'];
      if (groupsRaw is! List || !mounted) return;
      final groups = groupsRaw
          .whereType<Map>()
          .map((entry) => Map<String, dynamic>.from(entry))
          .where((entry) => (entry['id'] ?? '').toString().isNotEmpty)
          .toList();
      setState(() => _availableGroups = groups);
    } catch (_) {
      // Non-fatal
    }
  }

  bool _isGroupBucketTask(Map<String, dynamic> task) {
    final assignedGroups = task['assignedGroups'];
    if (task['isGroupBucket'] is bool) {
      return task['isGroupBucket'] == true;
    }
    return assignedGroups is List && assignedGroups.isNotEmpty;
  }

  Future<void> _moveTaskToMain(Map<String, dynamic> task) async {
    final canEditTask = (task['canEditTask'] as bool?) ?? false;
    if (!canEditTask) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You do not have permission to move this task')),
        );
      }
      return;
    }
    setState(() => _movingBucket = true);
    try {
      await ref.read(apiClientProvider).updateTask(widget.taskId, {'groupIds': <String>[]});
      ref.invalidate(_taskDetailProvider(widget.taskId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Moved to Main tasks')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to move task: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _movingBucket = false);
    }
  }

  Future<void> _moveTaskToGroupBucket(Map<String, dynamic> task) async {
    final canEditTask = (task['canEditTask'] as bool?) ?? false;
    if (!canEditTask) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You do not have permission to move this task')),
        );
      }
      return;
    }
    if (_availableGroups.isEmpty) {
      await _loadAvailableGroups();
    }
    if (_availableGroups.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No group bucket available')),
        );
      }
      return;
    }
    String selectedGroupId = _availableGroups.first['id'].toString();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setStateDialog) => AlertDialog(
          title: const Text('Move To Group Bucket'),
          content: DropdownButtonFormField<String>(
            initialValue: selectedGroupId,
            decoration: const InputDecoration(
              labelText: 'Group Bucket',
              isDense: true,
            ),
            items: _availableGroups.map((group) {
              final id = (group['id'] ?? '').toString();
              final name = (group['name'] ?? '').toString();
              return DropdownMenuItem<String>(
                value: id,
                child: Text(name.isEmpty ? id : name),
              );
            }).toList(),
            onChanged: (value) {
              if (value == null || value.isEmpty) return;
              setStateDialog(() => selectedGroupId = value);
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Move'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;

    setState(() => _movingBucket = true);
    try {
      await ref.read(apiClientProvider).updateTask(widget.taskId, {
        'groupIds': <String>[selectedGroupId],
      });
      ref.invalidate(_taskDetailProvider(widget.taskId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Moved to Group Bucket')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to move task: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _movingBucket = false);
    }
  }

  Future<void> _startEditComment(Map<String, dynamic> comment) async {
    if (!_canModifyComment(comment)) return;
    final commentId = (comment['id'] ?? '').toString();
    if (commentId.isEmpty) return;
    final existing =
        (comment['content'] ?? comment['text'] ?? '').toString().trim();
    _editingCommentCtrl.text = existing;
    setState(() => _editingCommentId = commentId);
  }

  Future<void> _saveCommentEdit(String commentId) async {
    final next = _editingCommentCtrl.text.trim();
    if (next.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Comment cannot be empty')),
        );
      }
      return;
    }
    setState(() => _savingCommentEdit = true);
    try {
      await ref.read(apiClientProvider).updateTaskComment(
            widget.taskId,
            commentId,
            next,
          );
      _editingCommentCtrl.clear();
      setState(() => _editingCommentId = null);
      await _loadComments();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Comment updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update comment: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _savingCommentEdit = false);
      }
    }
  }

  Future<void> _deleteComment(Map<String, dynamic> comment) async {
    if (!_canModifyComment(comment)) return;
    final commentId = (comment['id'] ?? '').toString();
    if (commentId.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Comment'),
        content: const Text('Are you sure you want to delete this comment?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deletingCommentId = commentId);
    try {
      await ref.read(apiClientProvider).deleteTaskComment(widget.taskId, commentId);
      if (_editingCommentId == commentId) {
        _editingCommentCtrl.clear();
        _editingCommentId = null;
      }
      if ((_replyTarget?['id'] ?? '').toString() == commentId) {
        _replyTarget = null;
      }
      await _loadComments();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Comment deleted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete comment: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _deletingCommentId = null);
      }
    }
  }

  String _pendingFileKey(PlatformFile file) =>
      '${file.path ?? file.name}:${file.size}';

  Future<void> _pickCommentAttachments() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: false,
    );
    if (result == null || result.files.isEmpty) return;

    final picked = result.files
        .where((file) =>
            (file.path != null && file.path!.trim().isNotEmpty) ||
            file.name.trim().isNotEmpty)
        .toList();
    if (picked.isEmpty) return;

    if (mounted) {
      setState(() {
        final seen = _pendingFiles.map(_pendingFileKey).toSet();
        for (final file in picked) {
          if (seen.add(_pendingFileKey(file))) {
            _pendingFiles.add(file);
          }
        }
      });
    }
  }

  void _removePendingAttachment(PlatformFile file) {
    final target = _pendingFileKey(file);
    setState(() {
      _pendingFiles = _pendingFiles
          .where((candidate) => _pendingFileKey(candidate) != target)
          .toList();
    });
  }

  void _wrapSelectionWithTags(
    TextEditingController controller,
    String openTag,
    String closeTag, {
    String placeholder = 'text',
  }) {
    final value = controller.value;
    final text = value.text;
    var start = value.selection.start;
    var end = value.selection.end;
    if (start < 0 || end < 0) {
      start = text.length;
      end = text.length;
    }
    if (start > end) {
      final temp = start;
      start = end;
      end = temp;
    }
    final selected = start == end ? placeholder : text.substring(start, end);
    final replacement = '$openTag$selected$closeTag';
    final updated = text.replaceRange(start, end, replacement);
    final cursorOffset = start + replacement.length;
    controller.value = value.copyWith(
      text: updated,
      selection: TextSelection.collapsed(offset: cursorOffset),
      composing: TextRange.empty,
    );
  }

  Future<void> _insertLinkTag(TextEditingController controller) async {
    final labelCtrl = TextEditingController();
    final urlCtrl = TextEditingController(text: 'https://');
    final result = await showDialog<bool>(
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
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Insert'),
          ),
        ],
      ),
    );
    if (result != true) return;

    final label = labelCtrl.text.trim().isEmpty ? 'link' : labelCtrl.text.trim();
    final url = urlCtrl.text.trim();
    if (url.isEmpty) return;
    _wrapSelectionWithTags(
      controller,
      '<a href="$url">',
      '</a>',
      placeholder: label,
    );
  }

  void _insertBulletList(TextEditingController controller) {
    _wrapSelectionWithTags(
      controller,
      '<ul><li>',
      '</li></ul>',
      placeholder: 'List item',
    );
  }

  void _insertOrderedList(TextEditingController controller) {
    _wrapSelectionWithTags(
      controller,
      '<ol><li>',
      '</li></ol>',
      placeholder: 'Step 1',
    );
  }

  void _insertHeadingTag(TextEditingController controller) {
    _wrapSelectionWithTags(
      controller,
      '<h3>',
      '</h3>',
      placeholder: 'Heading',
    );
  }

  void _insertQuoteTag(TextEditingController controller) {
    _wrapSelectionWithTags(
      controller,
      '<blockquote>',
      '</blockquote>',
      placeholder: 'Quote',
    );
  }

  void _insertCodeBlock(TextEditingController controller) {
    _wrapSelectionWithTags(
      controller,
      '<pre><code>',
      '</code></pre>',
      placeholder: 'code',
    );
  }

  Future<void> _insertImageTag(TextEditingController controller) async {
    final urlCtrl = TextEditingController(text: 'https://');
    final altCtrl = TextEditingController(text: 'image');
    final result = await showDialog<bool>(
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
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Insert'),
          ),
        ],
      ),
    );
    if (result != true) return;

    final url = urlCtrl.text.trim();
    if (url.isEmpty) return;
    final alt = altCtrl.text.trim().isEmpty ? 'image' : altCtrl.text.trim();
    _wrapSelectionWithTags(
      controller,
      '<img src="$url" alt="$alt" />',
      '',
      placeholder: '',
    );
  }

  void _insertTableTemplate(TextEditingController controller) {
    const tableTemplate =
        '<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value 1</td><td>Value 2</td></tr></tbody></table>';
    _wrapSelectionWithTags(
      controller,
      '',
      '',
      placeholder: tableTemplate,
    );
  }

  String _stripHtml(String value) {
    return value
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll('&nbsp;', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  String _commentPreview(Map<String, dynamic> comment) {
    final raw = (comment['content'] ?? comment['text'] ?? '').toString();
    final plain = _stripHtml(raw);
    if (plain.isEmpty) return 'Attachment';
    if (plain.length <= 120) return plain;
    return '${plain.substring(0, 120)}...';
  }

  String _replyAuthor(Map<String, dynamic> comment) {
    final author = comment['user'] ?? comment['author'];
    if (author is Map) {
      final fullname = (author['fullname'] ?? '').toString().trim();
      final name = (author['name'] ?? '').toString().trim();
      if (fullname.isNotEmpty) return fullname;
      if (name.isNotEmpty) return name;
    }
    return 'Unknown';
  }

  void _setReplyTarget(Map<String, dynamic> comment) {
    setState(() => _replyTarget = Map<String, dynamic>.from(comment));
  }

  Future<void> _openAttachmentUrl(String? rawUrl) async {
    final fileUrl = resolveServerUrl(rawUrl);
    if (fileUrl == null) return;
    final uri = Uri.tryParse(fileUrl);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Widget _buildAttachmentTile(
    BuildContext context,
    Map<String, dynamic> item,
  ) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final fileName = (item['fileName'] ?? 'Attachment').toString();
    final mimeType = (item['mimeType'] ?? '').toString();
    final fileSize = _formatFileSize(item['fileSize']);
    final rawUrl = item['fileUrl']?.toString();

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: rawUrl == null ? null : () => _openAttachmentUrl(rawUrl),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: cs.surfaceContainerLow,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.attach_file_rounded),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      fileName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      [if (fileSize != '0 B') fileSize, if (mimeType.isNotEmpty) mimeType]
                          .join(' • '),
                      style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.open_in_new_rounded, size: 18),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _deleteTask() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Task'),
        content: const Text('Are you sure you want to delete this task? This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteTask(widget.taskId);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete task: $e')),
        );
      }
    }
  }

  int _countDescendants(_CommentNode node) {
    var total = node.replies.length;
    for (final reply in node.replies) {
      total += _countDescendants(reply);
    }
    return total;
  }

  void _toggleThread(String commentId) {
    setState(() {
      if (_collapsedThreadIds.contains(commentId)) {
        _collapsedThreadIds.remove(commentId);
      } else {
        _collapsedThreadIds.add(commentId);
      }
    });
  }

  Future<void> _openTaskEditor(Map<String, dynamic> task) async {
    final canEditTask = (task['canEditTask'] as bool?) ?? false;
    if (!canEditTask) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You do not have permission to edit this task')),
        );
      }
      return;
    }
    final currentUserId =
        (ref.read(authStateProvider).asData?.value?['id'] ?? '').toString();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => TaskEditorSheet(
        initialTask: task,
        currentUserId: currentUserId,
        onSaved: () {
          ref.invalidate(_taskDetailProvider(widget.taskId));
          _loadComments();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final taskAsync = ref.watch(_taskDetailProvider(widget.taskId));
    final stagesAsync = ref.watch(_taskStagesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Task Detail'),
        actions: [
          // Status change menu
          taskAsync.maybeWhen(
            data: (task) {
              final canChangeStatus = (task['canChangeStatus'] as bool?) ?? false;
              if (!canChangeStatus) return const SizedBox.shrink();
              return PopupMenuButton<String>(
                tooltip: 'Change Status',
                icon: const Icon(Icons.swap_horiz_rounded),
                onSelected: _changeStatus,
                itemBuilder: (_) {
                  final currentStatus = (task['status'] ?? '').toString();
                  final stages = stagesAsync.asData?.value ?? const <Map<String, dynamic>>[];
                  return stages
                      .where((stage) => (stage['key'] ?? '').toString().isNotEmpty)
                      .map((stage) {
                        final key = (stage['key'] ?? '').toString();
                        final label = (stage['label'] ?? key).toString();
                        return PopupMenuItem(
                          value: key,
                          enabled: key != currentStatus,
                          child: Text(label),
                        );
                      })
                      .toList();
                },
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),
          // More menu
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (action) {
              final task = taskAsync.asData?.value;
              if (task == null) return;
              if (action == 'edit') _openTaskEditor(task);
              if (action == 'delete') _deleteTask();
              if (action == 'move-main') {
                _moveTaskToMain(task);
              }
              if (action == 'move-group') {
                _moveTaskToGroupBucket(task);
              }
            },
            itemBuilder: (_) {
              final task = taskAsync.asData?.value;
              final canEditTask = (task?['canEditTask'] as bool?) ?? false;
              final canDelete = (task?['canDelete'] as bool?) ?? false;
              final isGroupBucket = task != null ? _isGroupBucketTask(task) : false;
              final items = <PopupMenuEntry<String>>[
                PopupMenuItem(
                  value: isGroupBucket ? 'move-main' : 'move-group',
                  enabled: canEditTask && !_movingBucket,
                  child: ListTile(
                    leading: Icon(
                      isGroupBucket ? Icons.inbox_rounded : Icons.move_to_inbox_rounded,
                    ),
                    title: Text(isGroupBucket ? 'Move to Main' : 'Move to Group Bucket'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                PopupMenuItem(
                  value: 'edit',
                  enabled: canEditTask,
                  child: ListTile(
                    leading: Icon(Icons.edit_outlined),
                    title: Text('Edit'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ];
              if (canDelete) {
                items.add(
                  const PopupMenuItem(
                    value: 'delete',
                    child: ListTile(
                      leading: Icon(Icons.delete_outline, color: Colors.red),
                      title: Text('Delete', style: TextStyle(color: Colors.red)),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                );
              }
              return items;
            },
          ),
        ],
      ),
      body: taskAsync.when(
        loading: () => _buildShimmer(),
        error: (e, _) => ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(_taskDetailProvider(widget.taskId)),
        ),
        data: (task) {
          final authUser = ref.watch(authStateProvider).asData?.value;
          _currentUserId = (authUser?['id'] ?? '').toString();
          _canComment = (task['canComment'] as bool?) ?? true;
          _canChangeStatus = (task['canChangeStatus'] as bool?) ?? false;
          _canManageTask = (task['canDelete'] as bool?) ?? false;
          _isNoteTask = ((task['type'] ?? '').toString().toLowerCase() == 'note');
          final windowRaw = task['conversationAuthorEditDeleteWindowMinutes'];
          final windowMinutes = windowRaw is num
              ? windowRaw.toInt()
              : int.tryParse('${windowRaw ?? ''}') ?? 5;
          _authorEditWindowMinutes = windowMinutes.clamp(1, 1440);
          return _buildContent(
            context,
            task,
            stagesAsync.asData?.value ?? const <Map<String, dynamic>>[],
          );
        },
      ),
      bottomNavigationBar: _buildCommentBar(),
    );
  }

  // ─── Shimmer ─────────────────────────────────────────────────────────────

  Widget _buildShimmer() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ShimmerBox(width: double.infinity, height: 28),
          const SizedBox(height: 12),
          Row(
            children: [
              ShimmerBox(width: 80, height: 26, borderRadius: 13),
              const SizedBox(width: 8),
              ShimmerBox(width: 60, height: 26, borderRadius: 13),
            ],
          ),
          const SizedBox(height: 24),
          ShimmerBox(width: 140, height: 14),
          const SizedBox(height: 8),
          ShimmerBox(width: double.infinity, height: 14),
          const SizedBox(height: 6),
          ShimmerBox(width: double.infinity, height: 14),
          const SizedBox(height: 6),
          ShimmerBox(width: 200, height: 14),
          const SizedBox(height: 24),
          ShimmerList(count: 3, shrinkWrap: true, physics: const NeverScrollableScrollPhysics()),
        ],
      ),
    );
  }

  // ─── Main content ─────────────────────────────────────────────────────────

  Widget _buildContent(
    BuildContext context,
    Map<String, dynamic> task,
    List<Map<String, dynamic>> stages,
  ) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    final title = (task['title'] ?? task['subject'] ?? 'Untitled') as String;
    final status = task['status'] as String?;
    final statusLabel = _statusLabel(status, stages);
    final statusColor = _statusColor(status, stages);
    final priority = task['priority'] as String?;
    final dueDate = task['dueDate'] as String?;
    final createdAt = task['createdAt'] as String?;
    final content =
        (task['content'] ?? task['description'] ?? '') as String;

    final creator = task['creator'] as Map<String, dynamic>?;
    final assignees = (task['assignees'] as List<dynamic>?) ?? [];
    final attachments = (task['attachments'] as List<dynamic>?) ?? [];

    return RefreshIndicator(
      color: _kPrimary,
      onRefresh: () async {
        ref.invalidate(_taskDetailProvider(widget.taskId));
        await _loadComments();
      },
      child: ListView(
        controller: _scrollCtrl,
        padding: const EdgeInsets.all(20),
        children: [
          // ── Title ──────────────────────────────────────────────────────
          Text(title,
              style: tt.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),

          // ── Status + Priority chips ────────────────────────────────────
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (status != null)
                _StatusChip(label: statusLabel, color: statusColor),
              if (priority != null)
                _PriorityBadge(priority: priority),
            ],
          ),
          if (stages.isNotEmpty && status != null) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: stages.any((stage) => (stage['key'] ?? '').toString() == status)
                  ? status
                  : null,
              decoration: const InputDecoration(
                labelText: 'Stage',
                isDense: true,
                prefixIcon: Icon(Icons.swap_horiz_rounded),
              ),
              items: stages
                  .where((stage) => (stage['key'] ?? '').toString().isNotEmpty)
                  .map((stage) {
                final key = (stage['key'] ?? '').toString();
                final label = (stage['label'] ?? key).toString();
                return DropdownMenuItem<String>(
                  value: key,
                  child: Text(label),
                );
              }).toList(),
              onChanged: _canChangeStatus
                  ? (next) {
                      if (next != null && next != status) {
                        _changeStatus(next);
                      }
                    }
                  : null,
            ),
          ],
          const SizedBox(height: 20),

          // ── Dates ─────────────────────────────────────────────────────
          _InfoRow(
            icon: Icons.calendar_today_outlined,
            label: 'Due',
            value: _formatDate(dueDate),
            valueColor: dueDate != null &&
                    DateTime.tryParse(dueDate)?.isBefore(DateTime.now()) == true
                ? Colors.red
                : null,
          ),
          const SizedBox(height: 8),
          _InfoRow(
            icon: Icons.access_time_rounded,
            label: 'Created',
            value: _formatDateTime(createdAt),
          ),

          // ── Creator ───────────────────────────────────────────────────
          if (creator != null) ...[
            const SizedBox(height: 20),
            const _SectionHeader(title: 'Creator'),
            const SizedBox(height: 10),
            _UserRow(user: creator),
          ],

          // ── Assignees ─────────────────────────────────────────────────
          if (assignees.isNotEmpty) ...[
            const SizedBox(height: 20),
            const _SectionHeader(title: 'Assignees'),
            const SizedBox(height: 10),
            ...assignees.map((a) {
              final entry = a is Map ? Map<String, dynamic>.from(a as Map) : <String, dynamic>{};
              final user = (entry['user'] is Map)
                  ? Map<String, dynamic>.from(entry['user'] as Map)
                  : entry;
              final assigneeCanComment = (entry['canComment'] as bool?) ?? true;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(child: _UserRow(user: user)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: assigneeCanComment
                            ? const Color(0xFF16A34A).withValues(alpha: 0.12)
                            : const Color(0xFF6B7280).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        assigneeCanComment ? 'Can Comment' : 'View Only',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: assigneeCanComment
                              ? const Color(0xFF166534)
                              : const Color(0xFF4B5563),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],

          // ── Description ───────────────────────────────────────────────
          if (content.isNotEmpty) ...[
            const SizedBox(height: 20),
            const _SectionHeader(title: 'Description'),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cs.surfaceContainerLow,
                borderRadius: BorderRadius.circular(12),
              ),
              child: _hasHtmlContent(content)
                  ? Html(
                      data: content,
                      style: {
                        'body': Style(
                          margin: Margins.zero,
                          padding: HtmlPaddings.zero,
                          color: cs.onSurface,
                          fontSize: FontSize((tt.bodyMedium?.fontSize ?? 14)),
                          lineHeight: LineHeight(1.55),
                        ),
                        'table': Style(
                          border: Border.all(color: cs.outlineVariant),
                        ),
                        'th': Style(
                          backgroundColor: cs.surfaceContainerHighest,
                          padding: HtmlPaddings.all(8),
                        ),
                        'td': Style(
                          padding: HtmlPaddings.all(8),
                        ),
                        'img': Style(width: Width.auto()),
                      },
                      onLinkTap: (url, _, __) => _openAttachmentUrl(url),
                    )
                  : Text(
                      content,
                      style: tt.bodyMedium?.copyWith(height: 1.55),
                    ),
            ),
          ],

          // ── Comments ──────────────────────────────────────────────────
          const SizedBox(height: 24),
          const _SectionHeader(title: 'Comments'),
          const SizedBox(height: 10),
          _buildComments(context),
          if (attachments.isNotEmpty) ...[
            const SizedBox(height: 24),
            _SectionHeader(title: 'General Attachments (${attachments.length})'),
            const SizedBox(height: 10),
            ...attachments.map((attachment) {
              final item = attachment as Map<String, dynamic>;
              return _buildAttachmentTile(context, item);
            }),
          ],

          // Bottom padding so last comment isn't hidden under input bar
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildComments(BuildContext context) {
    final query = _commentSearch.trim();
    final filteredTree = query.isEmpty
        ? _commentTree
        : _commentTree
            .map((node) => _filterCommentNode(node, query))
            .whereType<_CommentNode>()
            .toList();
    final visibleCount = _countVisibleComments(filteredTree);

    if (_commentsLoading) {
      return const ShimmerList(
        count: 3,
        shrinkWrap: true,
        physics: NeverScrollableScrollPhysics(),
      );
    }
    if (_comments.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: Text('No comments yet', style: TextStyle(color: Colors.grey)),
        ),
      );
    }
    if (_commentTree.isEmpty) {
      return const SizedBox.shrink();
    }

    Widget renderNode(_CommentNode node, int depth) {
      final comment = node.comment;
      final text = (comment['content'] ?? comment['text'] ?? '').toString();
      final author = (comment['user'] ?? comment['author']) as Map<String, dynamic>?;
      final createdAt = comment['createdAt']?.toString();
      final attachments = (comment['attachments'] as List<dynamic>?) ?? const [];
      final canModify = _canModifyComment(comment);
      final commentId = (comment['id'] ?? '').toString();
      final isEditing = _editingCommentId == commentId;
      final isDeleting = _deletingCommentId == commentId;
      final indent = (depth * 14).toDouble();
      final hasReplies = node.replies.isNotEmpty;
      final descendants = hasReplies ? _countDescendants(node) : 0;
      final collapsed = hasReplies && commentId.isNotEmpty && _collapsedThreadIds.contains(commentId);

      return Padding(
        padding: EdgeInsets.only(bottom: 14, left: indent),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: depth == 0
                  ? Theme.of(context).dividerColor.withValues(alpha: 0.35)
                  : _kPrimary.withValues(alpha: 0.22),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  UserAvatar(
                    name: author?['fullname'] ?? author?['name'] ?? '?',
                    photoUrl: author?['photoUrl'] as String?,
                    radius: 16,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                author?['fullname'] ?? author?['name'] ?? 'Unknown',
                                style: Theme.of(context)
                                    .textTheme
                                    .labelLarge
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                            ),
                            Text(
                              _formatDateTime(createdAt),
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall
                                  ?.copyWith(color: Colors.grey),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        if (isEditing) ...[
                          TextField(
                            controller: _editingCommentCtrl,
                            minLines: 2,
                            maxLines: 6,
                            enabled: !_savingCommentEdit,
                            decoration: const InputDecoration(
                              hintText: 'Edit comment...',
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              TextButton(
                                onPressed: _savingCommentEdit
                                    ? null
                                    : () {
                                        _editingCommentCtrl.clear();
                                        setState(() => _editingCommentId = null);
                                      },
                                child: const Text('Cancel'),
                              ),
                              const SizedBox(width: 8),
                              FilledButton(
                                onPressed: _savingCommentEdit
                                    ? null
                                    : () => _saveCommentEdit(
                                          (comment['id'] ?? '').toString(),
                                        ),
                                child: _savingCommentEdit
                                    ? const SizedBox(
                                        width: 14,
                                        height: 14,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text('Save'),
                              ),
                            ],
                          ),
                        ] else ...[
                          if (text.isNotEmpty)
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: Theme.of(context)
                                    .colorScheme
                                    .surfaceContainerLow,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: _hasHtmlContent(text)
                                  ? Html(
                                      data: text,
                                      style: {
                                        'body': Style(
                                          margin: Margins.zero,
                                          padding: HtmlPaddings.zero,
                                          color: Theme.of(context).colorScheme.onSurface,
                                          fontSize: FontSize(
                                            Theme.of(context).textTheme.bodyMedium?.fontSize ?? 14,
                                          ),
                                        ),
                                        'img': Style(width: Width.auto()),
                                      },
                                      onLinkTap: (url, _, __) => _openAttachmentUrl(url),
                                    )
                                  : Text(
                                      text,
                                      style: Theme.of(context).textTheme.bodyMedium,
                                    ),
                            ),
                          if (attachments.isNotEmpty)
                            ...attachments.map((attachment) {
                              final item = attachment as Map<String, dynamic>;
                              return _buildAttachmentTile(context, item);
                            }),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 4,
                            runSpacing: 0,
                            children: [
                              if (_canComment)
                                TextButton.icon(
                                  onPressed: _sending ? null : () => _setReplyTarget(comment),
                                  icon: const Icon(Icons.reply_rounded, size: 16),
                                  label: const Text('Reply'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: _kPrimary,
                                    visualDensity: VisualDensity.compact,
                                    minimumSize: const Size(0, 28),
                                    padding: const EdgeInsets.symmetric(horizontal: 8),
                                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  ),
                                ),
                              if (canModify)
                                TextButton(
                                  onPressed: _sending || isDeleting
                                      ? null
                                      : () => _startEditComment(comment),
                                  style: TextButton.styleFrom(
                                    foregroundColor: _kPrimary,
                                    visualDensity: VisualDensity.compact,
                                    minimumSize: const Size(0, 28),
                                    padding: const EdgeInsets.symmetric(horizontal: 8),
                                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  ),
                                  child: const Text('Edit'),
                                ),
                              if (canModify)
                                TextButton.icon(
                                  onPressed: _sending || isDeleting
                                      ? null
                                      : () => _deleteComment(comment),
                                  icon: isDeleting
                                      ? const SizedBox(
                                          width: 14,
                                          height: 14,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.red,
                                          ),
                                        )
                                      : const Icon(Icons.delete_outline_rounded, size: 16),
                                  label: const Text('Delete'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: Colors.red,
                                    visualDensity: VisualDensity.compact,
                                    minimumSize: const Size(0, 28),
                                    padding: const EdgeInsets.symmetric(horizontal: 8),
                                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (hasReplies) ...[
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: commentId.isEmpty ? null : () => _toggleThread(commentId),
                    icon: Icon(
                      collapsed ? Icons.unfold_more_rounded : Icons.unfold_less_rounded,
                      size: 16,
                    ),
                    label: Text(
                      collapsed
                          ? 'Show replies ($descendants)'
                          : 'Hide replies ($descendants)',
                    ),
                    style: TextButton.styleFrom(
                      foregroundColor: _kPrimary,
                      visualDensity: VisualDensity.compact,
                      minimumSize: const Size(0, 28),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ),
              ],
              if (hasReplies && !collapsed) ...[
                const SizedBox(height: 8),
                ...node.replies.map((reply) => renderNode(reply, depth + 1)),
              ],
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        TextField(
          controller: _commentSearchCtrl,
          onChanged: (value) => setState(() => _commentSearch = value),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search_rounded, size: 18),
            hintText: 'Search in this conversation...',
            isDense: true,
            suffixIcon: query.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    tooltip: 'Clear',
                    onPressed: () {
                      _commentSearchCtrl.clear();
                      setState(() => _commentSearch = '');
                    },
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            query.isEmpty
                ? 'Showing ${_comments.length} messages'
                : 'Showing $visibleCount of ${_comments.length} messages',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
        const SizedBox(height: 8),
        if (filteredTree.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'No conversation messages match your search.',
              style: TextStyle(color: Colors.grey),
            ),
          )
        else
          ...filteredTree.map((node) => renderNode(node, 0)),
      ],
    );
  }

  // ─── Sticky comment input bar ─────────────────────────────────────────────

  Widget _buildComposerToolbar() {
    final disabled = _sending || !_canComment;
    final iconColor = disabled ? Colors.grey : _kPrimary;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Heading',
            onPressed: disabled ? null : () => _insertHeadingTag(_commentCtrl),
            icon: Icon(Icons.title_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Bold',
            onPressed: disabled
                ? null
                : () => _wrapSelectionWithTags(_commentCtrl, '<b>', '</b>'),
            icon: Icon(Icons.format_bold_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Italic',
            onPressed: disabled
                ? null
                : () => _wrapSelectionWithTags(_commentCtrl, '<i>', '</i>'),
            icon: Icon(Icons.format_italic_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Underline',
            onPressed: disabled
                ? null
                : () => _wrapSelectionWithTags(_commentCtrl, '<u>', '</u>'),
            icon: Icon(Icons.format_underline_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Bullet List',
            onPressed: disabled ? null : () => _insertBulletList(_commentCtrl),
            icon: Icon(Icons.format_list_bulleted_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Numbered List',
            onPressed: disabled ? null : () => _insertOrderedList(_commentCtrl),
            icon: Icon(Icons.format_list_numbered_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Quote',
            onPressed: disabled ? null : () => _insertQuoteTag(_commentCtrl),
            icon: Icon(Icons.format_quote_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Code Block',
            onPressed: disabled ? null : () => _insertCodeBlock(_commentCtrl),
            icon: Icon(Icons.code_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Insert Link',
            onPressed: disabled ? null : () => _insertLinkTag(_commentCtrl),
            icon: Icon(Icons.link_rounded, color: iconColor),
          ),
          IconButton(
            tooltip: 'Insert Image',
            onPressed: disabled ? null : () => _insertImageTag(_commentCtrl),
            icon: Icon(Icons.image_outlined, color: iconColor),
          ),
          IconButton(
            tooltip: 'Insert Table',
            onPressed: disabled ? null : () => _insertTableTemplate(_commentCtrl),
            icon: Icon(Icons.table_chart_rounded, color: iconColor),
          ),
        ],
      ),
    );
  }

  Widget _buildCommentBar() {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      child: Container(
        padding: EdgeInsets.only(
          left: 12,
          right: 8,
          top: 8,
          bottom: MediaQuery.of(context).viewInsets.bottom > 0 ? 8 : 12,
        ),
        decoration: BoxDecoration(
          color: cs.surface,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 8,
              offset: const Offset(0, -2),
            )
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!_canComment) ...[
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  'You can view this task, but commenting is disabled for your assignment.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF8A651E)),
                ),
              ),
            ],
            if (_replyTarget != null) ...[
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: _kPrimary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Replying to ${_replyAuthor(_replyTarget!)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                                  color: const Color(0xFF8A651E),
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _commentPreview(_replyTarget!),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                  color: const Color(0xFF8A651E),
                                ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Cancel reply',
                      onPressed: _sending || !_canComment ? null : () => setState(() => _replyTarget = null),
                      icon: const Icon(Icons.close_rounded, size: 18),
                      color: const Color(0xFF8A651E),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
            ],
            if (_pendingFiles.isNotEmpty) ...[
              SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _pendingFiles.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 6),
                  itemBuilder: (_, index) {
                    final file = _pendingFiles[index];
                    return InputChip(
                      visualDensity: VisualDensity.compact,
                      label: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 180),
                        child: Text(
                          file.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      onDeleted: _sending
                          || !_canComment
                          ? null
                          : () => _removePendingAttachment(file),
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
            ],
            IgnorePointer(
              ignoring: _sending || !_canComment,
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: cs.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: HtmlEditor(
                  key: ValueKey('task-comment-editor-$_commentEditorResetKey'),
                  controller: _commentHtmlCtrl,
                  htmlEditorOptions: HtmlEditorOptions(
                    hint: 'Add a comment or attach files...',
                    shouldEnsureVisible: true,
                    adjustHeightForKeyboard: true,
                  ),
                  htmlToolbarOptions: const HtmlToolbarOptions(
                    toolbarType: ToolbarType.nativeExpandable,
                    initiallyExpanded: true,
                    defaultToolbarButtons: [
                      StyleButtons(),
                      FontSettingButtons(fontSizeUnit: false),
                      FontButtons(clearAll: true),
                      ColorButtons(),
                      ListButtons(listStyles: true),
                      ParagraphButtons(
                        textDirection: false,
                        lineHeight: false,
                        caseConverter: false,
                      ),
                      InsertButtons(
                        audio: false,
                        video: false,
                        otherFile: false,
                        table: true,
                        hr: true,
                      ),
                      OtherButtons(
                        fullscreen: false,
                        help: false,
                        copy: false,
                        paste: false,
                        codeview: true,
                        undo: true,
                        redo: true,
                      ),
                    ],
                  ),
                  otherOptions: OtherOptions(
                    height: 220,
                    decoration: BoxDecoration(),
                  ),
                ),
              ),
            ),
            Row(
              children: [
                IconButton(
                  tooltip: 'Attach files',
                  onPressed: _sending || !_canComment ? null : _pickCommentAttachments,
                  icon: const Icon(Icons.attach_file_rounded, color: _kPrimary),
                ),
                const Spacer(),
                _sending
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                strokeWidth: 2.5, color: _kPrimary)),
                      )
                    : IconButton(
                        onPressed: _canComment ? _sendComment : null,
                        icon: const Icon(Icons.send_rounded, color: _kPrimary),
                        tooltip: 'Send comment',
                      ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Reusable sub-widgets ──────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (label.trim().isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({required this.priority});
  final String priority;

  @override
  Widget build(BuildContext context) {
    final color = _priorityColor(priority);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        priority[0].toUpperCase() + priority.substring(1),
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, size: 16, color: cs.onSurfaceVariant),
        const SizedBox(width: 6),
        Text('$label: ',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: cs.onSurfaceVariant)),
        Text(
          value,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: valueColor,
              ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w700,
          ),
    );
  }
}

class _UserRow extends StatelessWidget {
  const _UserRow({required this.user});
  final Map<String, dynamic> user;

  @override
  Widget build(BuildContext context) {
    final name =
        (user['fullname'] ?? user['name'] ?? 'Unknown') as String;
    final photoUrl = user['photoUrl'] as String?;
    return Row(
      children: [
        UserAvatar(name: name, photoUrl: photoUrl, radius: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(name,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500)),
        ),
      ],
    );
  }
}
