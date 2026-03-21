import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../widgets/user_avatar.dart';
import '../../widgets/shimmer_loading.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _sdDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.getServiceDeskRequest(id);
  // API may wrap in 'request' or 'data'
  if (res.containsKey('request')) return res['request'] as Map<String, dynamic>;
  if (res.containsKey('data')) return res['data'] as Map<String, dynamic>;
  return res;
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

String _formatDateTime(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  try {
    final dt = DateTime.parse(raw).toLocal();
    return DateFormat('MMM d, y · h:mm a').format(dt);
  } catch (_) {
    return raw;
  }
}

String _capitalize(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

String _statusDisplay(String? s) =>
    (s ?? '').replaceAll('_', ' ').split(' ').map(_capitalize).join(' ');

bool _isHttpUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  return uri != null && (uri.scheme == 'http' || uri.scheme == 'https');
}

bool _isCommentAssetUrl(String value) {
  final candidate = value.trim();
  return candidate.startsWith('/uploads/') || _isHttpUrl(candidate);
}

String? _resolvedCommentUrl(String value) {
  if (!_isCommentAssetUrl(value)) return null;
  return resolveServerUrl(value);
}

List<dynamic> _extractComments(Map<String, dynamic> req) {
  final raw = req['comments'] ?? req['notes'] ?? [];
  return raw as List<dynamic>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class ServiceDeskDetailScreen extends ConsumerStatefulWidget {
  final String id;
  const ServiceDeskDetailScreen({super.key, required this.id});

  @override
  ConsumerState<ServiceDeskDetailScreen> createState() =>
      _ServiceDeskDetailScreenState();
}

class _ServiceDeskDetailScreenState
    extends ConsumerState<ServiceDeskDetailScreen> {
  final _commentCtrl = TextEditingController();
  bool _submitting = false;
  bool _uploadingFiles = false;

  static const _statuses = [
    ('open', 'Open'),
    ('in_progress', 'In Progress'),
    ('pending', 'Pending'),
    ('resolved', 'Resolved'),
    ('closed', 'Closed'),
  ];

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _changeStatus(String newStatus, String statusLabel) async {
    // Show mandatory comment dialog
    final commentCtrl = TextEditingController();
    final confirmed = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Change to "$statusLabel"'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('A comment is required when changing status:'),
            const SizedBox(height: 12),
            TextField(
              controller: commentCtrl,
              decoration: const InputDecoration(
                hintText: 'Add a comment…',
                border: OutlineInputBorder(),
              ),
              minLines: 2,
              maxLines: 4,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, commentCtrl.text.trim()),
            style: FilledButton.styleFrom(backgroundColor: _kPrimary),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    commentCtrl.dispose();
    if (confirmed == null || confirmed.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(apiClientProvider)
          .updateServiceDeskRequest(widget.id, {
            'status': newStatus,
            'comment': confirmed,
          });
      ref.invalidate(_sdDetailProvider(widget.id));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update status: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submitComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.addServiceDeskComment(widget.id, text);
      _commentCtrl.clear();
      ref.invalidate(_sdDetailProvider(widget.id));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to add comment: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _appendCommentLines(List<String> lines) {
    if (lines.isEmpty) return;
    final current = _commentCtrl.text;
    final needsPrefix = current.isNotEmpty && !current.endsWith('\n');
    final addition = '${needsPrefix ? '\n' : ''}${lines.join('\n')}\n';
    _commentCtrl.value = TextEditingValue(
      text: '$current$addition',
      selection: TextSelection.collapsed(
        offset: current.length + addition.length,
      ),
    );
  }

  Future<void> _uploadAttachments() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: false,
    );
    if (result == null || result.files.isEmpty) return;

    final paths = result.files
        .map((file) => file.path)
        .whereType<String>()
        .where((path) => path.isNotEmpty)
        .toList();
    if (paths.isEmpty) return;

    setState(() => _uploadingFiles = true);
    try {
      final uploaded = await ref.read(apiClientProvider).uploadServiceDeskFiles(
            widget.id,
            filePaths: paths,
          );
      final lines = <String>[];
      for (final item in uploaded) {
        if (item is! Map) continue;
        final file = Map<String, dynamic>.from(item);
        final fileName = (file['fileName'] ?? 'Attachment').toString();
        final fileUrl = file['fileUrl']?.toString() ?? '';
        if (fileUrl.isEmpty) continue;
        final mimeType = (file['mimeType'] ?? '').toString();
        final isImage =
            file['isImage'] == true || mimeType.startsWith('image/');
        lines.add(
          isImage ? '![$fileName]($fileUrl)' : '[$fileName]($fileUrl)',
        );
      }
      if (lines.isEmpty) return;

      _appendCommentLines(lines);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              lines.length == 1
                  ? 'Attachment added to comment'
                  : '${lines.length} attachments added to comment',
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to upload attachment: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingFiles = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_sdDetailProvider(widget.id));

    return Scaffold(
      appBar: AppBar(
        title: async.value != null
            ? Text(
                (async.value!['title'] ??
                        async.value!['subject'] ??
                        'Request')
                    .toString(),
                style: const TextStyle(fontWeight: FontWeight.bold),
                overflow: TextOverflow.ellipsis,
              )
            : const Text('Request',
                style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (async.value != null)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              tooltip: 'Change status',
              onSelected: (value) {
                final label = _statuses
                    .firstWhere((s) => s.$1 == value,
                        orElse: () => (value, value))
                    .$2;
                _changeStatus(value, label);
              },
              itemBuilder: (_) => _statuses.map((s) {
                final current =
                    (async.value!['status'] ?? '').toString().toLowerCase();
                return PopupMenuItem<String>(
                  value: s.$1,
                  enabled: s.$1 != current,
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: _statusColor(s.$1),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(s.$2),
                      if (s.$1 == current) ...[
                        const Spacer(),
                        const Icon(Icons.check, size: 16),
                      ],
                    ],
                  ),
                );
              }).toList(),
            ),
        ],
      ),
      body: async.when(
        loading: () => const _DetailShimmer(),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_sdDetailProvider(widget.id)),
        ),
        data: (req) => _DetailBody(
          request: req,
          commentCtrl: _commentCtrl,
          submitting: _submitting,
          uploadingFiles: _uploadingFiles,
          onSubmitComment: _submitComment,
          onAttachFile: _uploadAttachments,
          onRefresh: () async => ref.invalidate(_sdDetailProvider(widget.id)),
        ),
      ),
    );
  }
}

// ─── Detail body ─────────────────────────────────────────────────────────────

class _DetailBody extends StatelessWidget {
  final Map<String, dynamic> request;
  final TextEditingController commentCtrl;
  final bool submitting;
  final bool uploadingFiles;
  final VoidCallback onSubmitComment;
  final VoidCallback onAttachFile;
  final Future<void> Function() onRefresh;

  const _DetailBody({
    required this.request,
    required this.commentCtrl,
    required this.submitting,
    required this.uploadingFiles,
    required this.onSubmitComment,
    required this.onAttachFile,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = (request['status'] ?? '').toString();
    final priority = (request['priority'] ?? '').toString();
    final subject =
        (request['title'] ?? request['subject'] ?? 'Untitled').toString();
    final description =
        (request['description'] ?? request['body'] ?? '').toString();
    final createdAt = _formatDateTime(
        request['createdAt']?.toString() ??
            request['created_at']?.toString());
    final updatedAt = _formatDateTime(
        request['updatedAt']?.toString() ??
            request['updated_at']?.toString());

    final requester = request['requester'];
    final requesterName = requester is Map
        ? (requester['fullname'] ?? requester['name'] ?? '').toString()
        : '';
    final requesterEmail =
        requester is Map ? (requester['email'] ?? '').toString() : '';
    final requesterPhoto = requester is Map
        ? (requester['photoUrl'] ?? requester['avatar'])?.toString()
        : null;

    final comments = _extractComments(request);
    final statusColor = _statusColor(status);
    final priorityColor = _priorityColor(priority);

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: _kPrimary,
            onRefresh: onRefresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              children: [
                // ── Header card ──
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          subject,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Status + Priority row
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _StatusChip(
                                label: _statusDisplay(status),
                                color: statusColor),
                            if (priority.isNotEmpty && priority != 'null')
                              _PriorityBadge(
                                  label: priority, color: priorityColor),
                          ],
                        ),
                        const SizedBox(height: 14),
                        const Divider(height: 1),
                        const SizedBox(height: 14),
                        // Requester
                        if (requesterName.isNotEmpty) ...[
                          _SectionLabel('Requester'),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              UserAvatar(
                                photoUrl: requesterPhoto,
                                name: requesterName,
                                radius: 18,
                              ),
                              const SizedBox(width: 10),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(requesterName,
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                              fontWeight: FontWeight.w600)),
                                  if (requesterEmail.isNotEmpty)
                                    Text(
                                      requesterEmail,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                        color: theme.colorScheme.onSurface
                                            .withValues(alpha: 0.6),
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          const Divider(height: 1),
                          const SizedBox(height: 14),
                        ],
                        // Dates
                        _DateRow(
                            icon: Icons.calendar_today_rounded,
                            label: 'Created',
                            value: createdAt),
                        const SizedBox(height: 6),
                        _DateRow(
                            icon: Icons.update_rounded,
                            label: 'Updated',
                            value: updatedAt),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // ── Description card ──
                if (description.isNotEmpty) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SectionLabel('Description'),
                          const SizedBox(height: 10),
                          Text(
                            description,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              height: 1.55,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // ── Comments section ──
                _SectionLabel('Comments (${comments.length})'),
                const SizedBox(height: 8),
                if (comments.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: Text(
                        'No comments yet — be the first to comment.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.5),
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  ...comments.map((c) {
                    final comment = c as Map<String, dynamic>;
                    return _CommentCard(comment: comment);
                  }),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),

        // ── Comment input bar ──
        _CommentInputBar(
          controller: commentCtrl,
          submitting: submitting,
          uploadingFiles: uploadingFiles,
          onSubmit: onSubmitComment,
          onAttach: onAttachFile,
        ),
      ],
    );
  }
}

// ─── Comment card ─────────────────────────────────────────────────────────────

class _CommentCard extends StatelessWidget {
  final Map<String, dynamic> comment;
  const _CommentCard({required this.comment});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sender = comment['author'] ?? comment['user'] ?? comment['sender'];
    final senderName = sender is Map
        ? (sender['fullname'] ?? sender['name'] ?? 'Unknown').toString()
        : (comment['senderName'] ?? 'Unknown').toString();
    final senderPhoto = sender is Map
        ? (sender['photoUrl'] ?? sender['avatar'])?.toString()
        : null;
    final text =
        (comment['content'] ?? comment['text'] ?? comment['body'] ?? '')
            .toString();
    final time = _formatDateTime(
        comment['createdAt']?.toString() ??
            comment['created_at']?.toString());

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          UserAvatar(photoUrl: senderPhoto, name: senderName, radius: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(senderName,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        )),
                    const SizedBox(width: 8),
                    Text(
                      time,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.45),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: const BorderRadius.only(
                      topRight: Radius.circular(12),
                      bottomLeft: Radius.circular(12),
                      bottomRight: Radius.circular(12),
                    ),
                  ),
                  child: _CommentContent(content: text),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Comment input bar ────────────────────────────────────────────────────────

class _CommentInputBar extends StatelessWidget {
  final TextEditingController controller;
  final bool submitting;
  final bool uploadingFiles;
  final VoidCallback onSubmit;
  final VoidCallback onAttach;

  const _CommentInputBar({
    required this.controller,
    required this.submitting,
    required this.uploadingFiles,
    required this.onSubmit,
    required this.onAttach,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: Container(
        padding: EdgeInsets.fromLTRB(
            12, 8, 12, MediaQuery.of(context).viewInsets.bottom > 0 ? 8 : 8),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outlineVariant,
              width: 1,
            ),
          ),
        ),
        child: Row(
          children: [
            IconButton(
              onPressed: uploadingFiles || submitting ? null : onAttach,
              icon: uploadingFiles
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.attach_file_rounded),
              color: _kPrimary,
              tooltip: 'Add attachment',
            ),
            Expanded(
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  hintText: 'Add a comment…',
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: theme.colorScheme.surfaceContainerHighest,
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 10),
                  isDense: true,
                ),
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
              ),
            ),
            const SizedBox(width: 8),
            submitting
                ? const SizedBox(
                    width: 40,
                    height: 40,
                    child: Center(
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child:
                            CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  )
                : IconButton.filled(
                    onPressed: uploadingFiles ? null : onSubmit,
                    icon: const Icon(Icons.send_rounded, size: 18),
                    style: IconButton.styleFrom(
                      backgroundColor: _kPrimary,
                      foregroundColor: Colors.white,
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

class _CommentContent extends StatelessWidget {
  const _CommentContent({required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    final lines = content.split(RegExp(r'\r?\n'));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < lines.length; index++) ...[
          if (index > 0) const SizedBox(height: 6),
          _CommentLine(line: lines[index]),
        ],
      ],
    );
  }
}

class _CommentLine extends StatelessWidget {
  const _CommentLine({required this.line});

  final String line;

  @override
  Widget build(BuildContext context) {
    final trimmed = line.trim();
    final theme = Theme.of(context);

    if (trimmed.isEmpty) {
      return const SizedBox(height: 8);
    }

    final imageMatch =
        RegExp(r'^!\[([^\]]*)\]\(([^)]+)\)$').firstMatch(trimmed);
    if (imageMatch != null) {
      final alt = imageMatch.group(1) ?? 'Attachment';
      final url = _resolvedCommentUrl(imageMatch.group(2) ?? '');
      if (url != null) {
        return _CommentImage(url: url, alt: alt);
      }
    }

    final linkMatch = RegExp(r'^\[([^\]]+)\]\(([^)]+)\)$').firstMatch(trimmed);
    if (linkMatch != null) {
      final label = linkMatch.group(1) ?? 'Open attachment';
      final url = _resolvedCommentUrl(linkMatch.group(2) ?? '');
      if (url != null) {
        return _CommentLink(label: label, url: url);
      }
    }

    final directUrl = _resolvedCommentUrl(trimmed);
    if (directUrl != null) {
      return _CommentLink(label: trimmed, url: directUrl);
    }

    return Text(
      line,
      style: theme.textTheme.bodySmall?.copyWith(height: 1.45),
    );
  }
}

class _CommentLink extends StatelessWidget {
  const _CommentLink({
    required this.label,
    required this.url,
  });

  final String label;
  final String url;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () async {
        final uri = Uri.tryParse(url);
        if (uri != null) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.link_rounded, size: 16, color: _kPrimary),
            const SizedBox(width: 8),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: _kPrimary,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _CommentImage extends StatelessWidget {
  const _CommentImage({
    required this.url,
    required this.alt,
  });

  final String url;
  final String alt;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () async {
            final uri = Uri.tryParse(url);
            if (uri != null) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            }
          },
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.network(
              url,
              width: 220,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _CommentLink(
                label: alt,
                url: url,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          alt,
          style: Theme.of(context).textTheme.labelSmall,
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: Theme.of(context)
                .colorScheme
                .onSurface
                .withValues(alpha: 0.7),
          ),
    );
  }
}

class _DateRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _DateRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted =
        theme.colorScheme.onSurface.withValues(alpha: 0.55);
    return Row(
      children: [
        Icon(icon, size: 15, color: muted),
        const SizedBox(width: 6),
        Text(label,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: muted, fontWeight: FontWeight.w500)),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            value,
            style: theme.textTheme.bodySmall,
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    if (label.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600, color: color),
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
        Icon(Icons.flag_rounded, size: 14, color: color),
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

// ─── Detail shimmer ───────────────────────────────────────────────────────────

class _DetailShimmer extends StatelessWidget {
  const _DetailShimmer();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        ShimmerBox(width: double.infinity, height: 160),
        SizedBox(height: 12),
        ShimmerBox(width: double.infinity, height: 100),
        SizedBox(height: 12),
        ShimmerBox(width: double.infinity, height: 80),
        SizedBox(height: 12),
        ShimmerBox(width: double.infinity, height: 80),
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
