import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';
import '../../widgets/user_avatar.dart';
import '../../widgets/shimmer_loading.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final boardTopicDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  return ref.watch(apiClientProvider).getBoardTopic(id);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

String _formatDateTime(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw).toLocal();
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('MMM d, y').format(dt);
  } catch (_) {
    return '';
  }
}

Color _parseColor(String? hex) {
  if (hex == null || hex.isEmpty) return const Color(0xFF6B7280);
  try {
    final clean = hex.replaceAll('#', '');
    return Color(int.parse('FF$clean', radix: 16));
  } catch (_) {
    return const Color(0xFF6B7280);
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class BoardDetailScreen extends ConsumerStatefulWidget {
  final String topicId;
  const BoardDetailScreen({super.key, required this.topicId});

  @override
  ConsumerState<BoardDetailScreen> createState() => _BoardDetailScreenState();
}

class _BoardDetailScreenState extends ConsumerState<BoardDetailScreen> {
  final _replyCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _replyCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitReply() async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).createBoardPost(widget.topicId, text);
      _replyCtrl.clear();
      ref.invalidate(boardTopicDetailProvider(widget.topicId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to post reply: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(boardTopicDetailProvider(widget.topicId));

    return Scaffold(
      appBar: AppBar(
        title: async.value != null
            ? Text(
                (async.value!['title'] ?? 'Topic').toString(),
                style: const TextStyle(fontWeight: FontWeight.bold),
                overflow: TextOverflow.ellipsis,
              )
            : const Text('Topic',
                style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () =>
                ref.invalidate(boardTopicDetailProvider(widget.topicId)),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: async.when(
        loading: () => const _TopicShimmer(),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () =>
              ref.invalidate(boardTopicDetailProvider(widget.topicId)),
        ),
        data: (topic) => _TopicBody(
          topic: topic,
          replyCtrl: _replyCtrl,
          submitting: _submitting,
          onSubmitReply: _submitReply,
          onRefresh: () async =>
              ref.invalidate(boardTopicDetailProvider(widget.topicId)),
        ),
      ),
    );
  }
}

// ─── Topic body ───────────────────────────────────────────────────────────────

class _TopicBody extends StatelessWidget {
  final Map<String, dynamic> topic;
  final TextEditingController replyCtrl;
  final bool submitting;
  final VoidCallback onSubmitReply;
  final Future<void> Function() onRefresh;

  const _TopicBody({
    required this.topic,
    required this.replyCtrl,
    required this.submitting,
    required this.onSubmitReply,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final posts = (topic['posts'] as List<dynamic>?) ?? [];
    final isPinned = topic['isPinned'] == true;
    final isResolved = topic['isResolved'] == true;
    final category = topic['category'] as Map<String, dynamic>?;
    final categoryName =
        category != null ? (category['name'] ?? '').toString() : '';
    final categoryColor = _parseColor(category?['color']?.toString());
    final creator = topic['creator'] as Map<String, dynamic>?;
    final createdAt = _formatDateTime(topic['createdAt']?.toString());

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              children: [
                // ── Topic header card ──
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Category + badges
                        if (categoryName.isNotEmpty || isPinned || isResolved)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                if (categoryName.isNotEmpty)
                                  _CategoryBadge(
                                      name: categoryName,
                                      color: categoryColor),
                                if (isPinned)
                                  _BadgeChip(
                                      icon: Icons.push_pin_rounded,
                                      label: 'Pinned',
                                      color: Theme.of(context).colorScheme.primary),
                                if (isResolved)
                                  _BadgeChip(
                                      icon: Icons.check_circle_outline_rounded,
                                      label: 'Resolved',
                                      color: Colors.green.shade600),
                              ],
                            ),
                          ),

                        // Title
                        Text(
                          (topic['title'] ?? '').toString(),
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),

                        // Description
                        if ((topic['description'] ?? '').toString().isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            topic['description'].toString(),
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurface
                                      .withValues(alpha: 0.7),
                                  height: 1.5,
                                ),
                          ),
                        ],

                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 10),

                        // Creator + date
                        if (creator != null)
                          _AuthorRow(
                            author: creator,
                            time: createdAt,
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // ── Posts heading ──
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text(
                    '${posts.length} ${posts.length == 1 ? 'Reply' : 'Replies'}',
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 4),

                // ── Posts list ──
                if (posts.isEmpty)
                  _EmptyReplies()
                else
                  ...posts.map((p) {
                    final post = p as Map<String, dynamic>;
                    return _PostCard(post: post);
                  }),

                const SizedBox(height: 8),
              ],
            ),
          ),
        ),

        // ── Reply input bar ──
        _ReplyInputBar(
          controller: replyCtrl,
          submitting: submitting,
          onSubmit: onSubmitReply,
        ),
      ],
    );
  }
}

// ─── Post card ────────────────────────────────────────────────────────────────

class _PostCard extends StatelessWidget {
  final Map<String, dynamic> post;
  const _PostCard({required this.post});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final author = post['author'] as Map<String, dynamic>?;
    final authorName = author != null
        ? (author['fullname'] ?? author['name'] ?? 'Unknown').toString()
        : 'Unknown';
    final authorPhoto = author?['photoUrl']?.toString();
    final content = (post['content'] ?? '').toString();
    final time = _formatDateTime(post['createdAt']?.toString());

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          UserAvatar(name: authorName, photoUrl: authorPhoto, radius: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      authorName,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      time,
                      style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.45)),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: const BorderRadius.only(
                      topRight: Radius.circular(12),
                      bottomLeft: Radius.circular(12),
                      bottomRight: Radius.circular(12),
                    ),
                  ),
                  child: Text(
                    content,
                    style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Author row ───────────────────────────────────────────────────────────────

class _AuthorRow extends StatelessWidget {
  final Map<String, dynamic> author;
  final String time;
  const _AuthorRow({required this.author, required this.time});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name =
        (author['fullname'] ?? author['name'] ?? 'Unknown').toString();
    final photoUrl = author['photoUrl']?.toString();
    return Row(
      children: [
        UserAvatar(name: name, photoUrl: photoUrl, radius: 14),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            name,
            style: theme.textTheme.bodySmall
                ?.copyWith(fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (time.isNotEmpty)
          Text(
            time,
            style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.45)),
          ),
      ],
    );
  }
}

// ─── Empty replies ────────────────────────────────────────────────────────────

class _EmptyReplies extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.chat_bubble_outline_rounded,
                size: 40,
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.25)),
            const SizedBox(height: 8),
            Text(
              'No replies yet — be the first to reply!',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.5)),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Reply input bar ──────────────────────────────────────────────────────────

class _ReplyInputBar extends StatelessWidget {
  final TextEditingController controller;
  final bool submitting;
  final VoidCallback onSubmit;

  const _ReplyInputBar({
    required this.controller,
    required this.submitting,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
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
            Expanded(
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  hintText: 'Write a reply…',
                  hintStyle: TextStyle(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.45),
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
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  )
                : IconButton.filled(
                    onPressed: onSubmit,
                    icon: const Icon(Icons.send_rounded, size: 18),
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFF8B5CF6),
                      foregroundColor: Colors.white,
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}

// ─── Badges ───────────────────────────────────────────────────────────────────

class _CategoryBadge extends StatelessWidget {
  final String name;
  final Color color;
  const _CategoryBadge({required this.name, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        name,
        style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

class _BadgeChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _BadgeChip(
      {required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────

class _TopicShimmer extends StatelessWidget {
  const _TopicShimmer();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        ShimmerBox(width: double.infinity, height: 180),
        SizedBox(height: 12),
        ShimmerBox(width: double.infinity, height: 80),
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
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF8B5CF6)),
            ),
          ],
        ),
      ),
    );
  }
}
