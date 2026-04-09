import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/user_avatar.dart';

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
  bool _commentsLoading = false;
  bool _sending = false;
  bool _canComment = false;
  List<PlatformFile> _pendingFiles = [];
  Map<String, dynamic>? _replyTarget;

  final _commentCtrl = TextEditingController();
  final _commentFocus = FocusNode();
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadComments();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
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
      setState(() => _comments = data);
    } catch (_) {
      // Non-fatal — show empty comments
    } finally {
      setState(() => _commentsLoading = false);
    }
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

    final draftText = _commentCtrl.text.trim();
    final filePaths = _pendingFiles
        .map((file) => file.path)
        .whereType<String>()
        .where((path) => path.isNotEmpty)
        .toList();
    if (draftText.isEmpty && filePaths.isEmpty) return;

    final text = _replyTarget != null
        ? '${_replyPrefix(_replyTarget!)}$draftText'.trim()
        : draftText;

    setState(() => _sending = true);
    try {
      final created = await ref.read(apiClientProvider).addTaskComment(
            widget.taskId,
            text,
            allowEmpty: filePaths.isNotEmpty,
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

      _commentCtrl.clear();
      if (mounted) {
        setState(() {
          _pendingFiles = [];
          _replyTarget = null;
        });
      } else {
        _pendingFiles = [];
        _replyTarget = null;
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

  String _replyPrefix(Map<String, dynamic> comment) {
    final author = _replyAuthor(comment);
    final preview = _commentPreview(comment);
    return 'Replying to $author:\n"$preview"\n\n';
  }

  void _setReplyTarget(Map<String, dynamic> comment) {
    setState(() => _replyTarget = Map<String, dynamic>.from(comment));
    _commentFocus.requestFocus();
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
            data: (task) => PopupMenuButton<String>(
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
            ),
            orElse: () => const SizedBox.shrink(),
          ),
          // More menu
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (action) {
              if (action == 'delete') _deleteTask();
            },
            itemBuilder: (_) {
              final task = taskAsync.asData?.value;
              final canDelete = (task?['canDelete'] as bool?) ?? false;
              final items = <PopupMenuEntry<String>>[
                const PopupMenuItem(
                  value: 'edit',
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
          _canComment = (task['canComment'] as bool?) ?? true;
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
              onChanged: (next) {
                if (next != null && next != status) {
                  _changeStatus(next);
                }
              },
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
              final user = (a['user'] ?? a) as Map<String, dynamic>;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _UserRow(user: user),
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
              child: Text(content,
                  style: tt.bodyMedium?.copyWith(height: 1.55)),
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
    return Column(
      children: _comments.map((c) {
        final comment = c as Map<String, dynamic>;
        final text =
            (comment['content'] ?? comment['text'] ?? '') as String;
        final author = (comment['user'] ?? comment['author'])
            as Map<String, dynamic>?;
        final createdAt = comment['createdAt'] as String?;
        final attachments =
            (comment['attachments'] as List<dynamic>?) ?? const [];

        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              UserAvatar(
                name: author?['fullname'] ?? author?['name'] ?? '?',
                photoUrl: author?['photoUrl'] as String?,
                radius: 18,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          author?['fullname'] ?? author?['name'] ?? 'Unknown',
                          style: Theme.of(context)
                              .textTheme
                              .labelLarge
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        Text(
                          _formatDateTime(createdAt),
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(color: Colors.grey),
                        ),
                      ],
                    ),
                    if (text.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerLow,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(text,
                            style: Theme.of(context).textTheme.bodyMedium),
                      ),
                    ],
                    if (attachments.isNotEmpty)
                      ...attachments.map((attachment) {
                        final item = attachment as Map<String, dynamic>;
                        return _buildAttachmentTile(context, item);
                      }),
                    if (_canComment) ...[
                      const SizedBox(height: 4),
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
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // ─── Sticky comment input bar ─────────────────────────────────────────────

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
            Row(
              children: [
                IconButton(
                  tooltip: 'Attach files',
                  onPressed: _sending || !_canComment ? null : _pickCommentAttachments,
                  icon: const Icon(Icons.attach_file_rounded, color: _kPrimary),
                ),
                Expanded(
                  child: TextField(
                    controller: _commentCtrl,
                    focusNode: _commentFocus,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.newline,
                    decoration: InputDecoration(
                      hintText: 'Add a comment or attach files...',
                      filled: true,
                      fillColor: cs.surfaceContainerLow,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    enabled: !_sending && _canComment,
                  ),
                ),
                const SizedBox(width: 6),
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
