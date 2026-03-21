import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final boardTopicsProvider = FutureProvider<List<dynamic>>((ref) {
  return ref.watch(apiClientProvider).getBoardTopics();
});

final _boardCategoriesProvider = FutureProvider<List<dynamic>>((ref) async {
  try {
    final res = await ref.watch(apiClientProvider).getBoardCategories();
    return res;
  } catch (_) {
    return [];
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

String _formatTime(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw).toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final msgDay = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(msgDay).inDays;
    if (diff == 0) return DateFormat('HH:mm').format(dt);
    if (diff < 7) return DateFormat('EEE').format(dt);
    return DateFormat('dd/MM/yy').format(dt);
  } catch (_) {
    return '';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class BoardScreen extends ConsumerStatefulWidget {
  const BoardScreen({super.key});

  @override
  ConsumerState<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends ConsumerState<BoardScreen> with AutoRefreshMixin {
  bool _showSearch = false;
  final _searchCtrl = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    startAutoRefresh(
      const Duration(seconds: 120),
      () => ref.invalidate(boardTopicsProvider),
    );
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchQuery = '';
        _searchCtrl.clear();
      }
    });
  }

  void _showCreateSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CreateTopicSheet(
        onCreated: () => ref.invalidate(boardTopicsProvider),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final async = ref.watch(boardTopicsProvider);

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search board…',
                  border: InputBorder.none,
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  filled: false,
                ),
                style: theme.textTheme.bodyLarge,
                onChanged: (v) => setState(() => _searchQuery = v),
              )
            : const Text('Board', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search_rounded),
            onPressed: _toggleSearch,
            tooltip: _showSearch ? 'Close' : 'Search',
          ),
        ],
      ),
      body: async.when(
        loading: () => const ShimmerList(count: 8),
        error: (e, _) => ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(boardTopicsProvider),
        ),
        data: (topics) {
          final filtered = _searchQuery.isEmpty
              ? topics
              : topics.where((t) {
                  final m = t as Map<String, dynamic>;
                  final title = (m['title'] ?? '').toString().toLowerCase();
                  return title.contains(_searchQuery.toLowerCase());
                }).toList();

          if (filtered.isEmpty) {
            return EmptyState(
              icon: Icons.dashboard_outlined,
              title: _searchQuery.isNotEmpty ? 'No results' : 'No topics yet',
              subtitle: _searchQuery.isNotEmpty
                  ? 'Try a different search term'
                  : 'Tap + to create the first topic',
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(boardTopicsProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (ctx, i) {
                final topic = filtered[i] as Map<String, dynamic>;
                return _TopicCard(
                  topic: topic,
                  onTap: () => ctx.push('/board/${topic['id']}'),
                );
              },
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateSheet,
        tooltip: 'New Topic',
        child: const Icon(Icons.add),
      ),
    );
  }
}

// ─── Topic card ───────────────────────────────────────────────────────────────

class _TopicCard extends StatelessWidget {
  final Map<String, dynamic> topic;
  final VoidCallback onTap;
  const _TopicCard({required this.topic, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    final title = (topic['title'] ?? '').toString();
    final description = (topic['description'] ?? '').toString();
    final isPinned = topic['isPinned'] == true;
    final isResolved = topic['isResolved'] == true;
    final time = _formatTime(topic['lastActivityAt']?.toString() ?? topic['createdAt']?.toString());

    final creator = topic['creator'] as Map<String, dynamic>?;
    final creatorName = creator != null
        ? (creator['fullname'] ?? creator['name'] ?? '').toString()
        : '';

    final category = topic['category'] as Map<String, dynamic>?;
    final categoryName = category != null ? (category['name'] ?? '').toString() : '';
    final categoryColor = _parseColor(category?['color']?.toString());

    final count = topic['_count'] as Map<String, dynamic>?;
    final postCount = (count?['posts'] ?? 0) as int;

    final posts = topic['posts'] as List<dynamic>?;
    final lastPostContent = (posts != null && posts.isNotEmpty)
        ? ((posts[0] as Map<String, dynamic>)['content'] ?? '').toString()
        : description;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Category + indicators row
              Row(
                children: [
                  if (categoryName.isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: categoryColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        categoryName,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: categoryColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  if (isPinned) ...[
                    Icon(Icons.push_pin_rounded, size: 14, color: cs.primary),
                    const SizedBox(width: 4),
                  ],
                  if (isResolved) ...[
                    Icon(Icons.check_circle_outline_rounded, size: 14, color: Colors.green.shade600),
                    const SizedBox(width: 4),
                  ],
                  const Spacer(),
                  Text(time, style: theme.textTheme.labelSmall?.copyWith(color: cs.onSurface.withValues(alpha: 0.45))),
                ],
              ),
              const SizedBox(height: 8),

              // Title
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),

              // Preview text
              if (lastPostContent.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(
                  lastPostContent,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: cs.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ],

              const SizedBox(height: 10),

              // Footer: author + reply count
              Row(
                children: [
                  Icon(Icons.person_outline, size: 14, color: cs.onSurface.withValues(alpha: 0.45)),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      creatorName,
                      style: theme.textTheme.labelSmall?.copyWith(color: cs.onSurface.withValues(alpha: 0.55)),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(Icons.chat_bubble_outline_rounded, size: 14, color: cs.onSurface.withValues(alpha: 0.45)),
                  const SizedBox(width: 4),
                  Text(
                    '$postCount',
                    style: theme.textTheme.labelSmall?.copyWith(color: cs.onSurface.withValues(alpha: 0.55)),
                  ),
                  const SizedBox(width: 6),
                  Icon(Icons.chevron_right, size: 16, color: cs.onSurface.withValues(alpha: 0.35)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
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
}

// ─── Create topic sheet ───────────────────────────────────────────────────────

class _CreateTopicSheet extends ConsumerStatefulWidget {
  final VoidCallback onCreated;
  const _CreateTopicSheet({required this.onCreated});

  @override
  ConsumerState<_CreateTopicSheet> createState() => _CreateTopicSheetState();
}

class _CreateTopicSheetState extends ConsumerState<_CreateTopicSheet> {
  final _titleCtrl = TextEditingController();
  final _contentCtrl = TextEditingController();
  bool _submitting = false;
  String? _selectedCategoryId;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _contentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    final content = _contentCtrl.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title is required')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).createBoardTopic({
        'title': title,
        if (content.isNotEmpty) 'description': content,
        if (_selectedCategoryId != null) 'categoryId': _selectedCategoryId,
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create topic: $e'),
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
    final theme = Theme.of(context);
    final categoriesAsync = ref.watch(_boardCategoriesProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            Text(
              'New Topic',
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),

            // Title
            TextField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                labelText: 'Title *',
                hintText: 'Enter topic title…',
              ),
              textCapitalization: TextCapitalization.sentences,
              maxLength: 200,
            ),
            const SizedBox(height: 12),

            // Content
            TextField(
              controller: _contentCtrl,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                hintText: 'Add more details…',
                alignLabelWithHint: true,
              ),
              minLines: 3,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),

            // Category picker
            categoriesAsync.when(
              data: (cats) {
                if (cats.isEmpty) return const SizedBox.shrink();
                return DropdownButtonFormField<String>(
                  initialValue: _selectedCategoryId,
                  decoration: const InputDecoration(labelText: 'Category'),
                  hint: const Text('Select category'),
                  items: [
                    const DropdownMenuItem<String>(
                      value: null,
                      child: Text('None'),
                    ),
                    ...cats.map((c) {
                      final cat = c as Map<String, dynamic>;
                      return DropdownMenuItem<String>(
                        value: cat['id']?.toString(),
                        child: Text(cat['name']?.toString() ?? ''),
                      );
                    }),
                  ],
                  onChanged: (v) => setState(() => _selectedCategoryId = v),
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 24),

            // Submit button
            FilledButton(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF8B5CF6),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Create Topic',
                      style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}
