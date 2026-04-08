import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../providers/user_provider.dart';
import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/shimmer_loading.dart';

@immutable
class _BoardQuery {
  final String search;
  final String categoryId;
  final String status;
  final String visibility;
  final String sort;
  final bool mineOnly;

  const _BoardQuery({
    this.search = '',
    this.categoryId = 'all',
    this.status = 'all',
    this.visibility = 'all',
    this.sort = 'recent',
    this.mineOnly = false,
  });

  @override
  bool operator ==(Object other) =>
      other is _BoardQuery &&
      other.search == search &&
      other.categoryId == categoryId &&
      other.status == status &&
      other.visibility == visibility &&
      other.sort == sort &&
      other.mineOnly == mineOnly;

  @override
  int get hashCode =>
      Object.hash(search, categoryId, status, visibility, sort, mineOnly);
}

final boardTopicsProvider =
    FutureProvider.family<List<dynamic>, _BoardQuery>((ref, query) {
  return ref.watch(apiClientProvider).getBoardTopics(
        search: query.search,
        categoryId: query.categoryId,
        status: query.status,
        visibility: query.visibility,
        sort: query.sort,
        mineOnly: query.mineOnly,
        limit: 300,
      );
});

final _boardCategoriesProvider = FutureProvider<List<dynamic>>((ref) async {
  try {
    return await ref.watch(apiClientProvider).getBoardCategories();
  } catch (_) {
    return [];
  }
});

final _boardMetaProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  try {
    return await ref.watch(apiClientProvider).getBoardMeta();
  } catch (_) {
    return const {};
  }
});

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

Color _parseColor(String? hex) {
  if (hex == null || hex.isEmpty) return const Color(0xFF6B7280);
  try {
    final clean = hex.replaceAll('#', '');
    return Color(int.parse('FF$clean', radix: 16));
  } catch (_) {
    return const Color(0xFF6B7280);
  }
}

class BoardScreen extends ConsumerStatefulWidget {
  const BoardScreen({super.key});

  @override
  ConsumerState<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends ConsumerState<BoardScreen>
    with AutoRefreshMixin {
  bool _showSearch = false;
  final _searchCtrl = TextEditingController();
  String _searchQuery = '';
  String _activeCategoryId = 'all';
  String _status = 'all';
  String _visibility = 'all';
  String _sort = 'recent';
  bool _mineOnly = false;

  _BoardQuery _query() => _BoardQuery(
        search: _searchQuery.trim(),
        categoryId: _activeCategoryId,
        status: _status,
        visibility: _visibility,
        sort: _sort,
        mineOnly: _mineOnly,
      );

  @override
  void initState() {
    super.initState();
    startAutoRefresh(
      const Duration(seconds: 120),
      () => ref.invalidate(boardTopicsProvider(_query())),
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
        ref.invalidate(boardTopicsProvider(_query()));
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
        onCreated: () => ref.invalidate(boardTopicsProvider(_query())),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _query();
    final async = ref.watch(boardTopicsProvider(query));
    final categories =
        ref.watch(_boardCategoriesProvider).asData?.value ?? const <dynamic>[];
    final visibilityOptions = _visibilityOptionsFromMeta(
      ref.watch(_boardMetaProvider).asData?.value ?? const {},
    );

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search board...',
                  border: InputBorder.none,
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
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
      body: Column(
        children: [
          _BoardFilters(
            categories: categories,
            activeCategoryId: _activeCategoryId,
            onCategoryChanged: (value) {
              if (value == _activeCategoryId) return;
              setState(() => _activeCategoryId = value);
            },
            status: _status,
            onStatusChanged: (value) {
              if (value == _status) return;
              setState(() => _status = value);
            },
            visibility: _visibility,
            visibilityOptions: visibilityOptions,
            onVisibilityChanged: (value) {
              if (value == _visibility) return;
              setState(() => _visibility = value);
            },
            sort: _sort,
            onSortChanged: (value) {
              if (value == _sort) return;
              setState(() => _sort = value);
            },
            mineOnly: _mineOnly,
            onMineOnlyChanged: (value) {
              if (value == _mineOnly) return;
              setState(() => _mineOnly = value);
            },
          ),
          Expanded(
            child: async.when(
              loading: () => const ShimmerList(count: 8),
              error: (e, _) => ErrorState(
                message: e.toString(),
                onRetry: () => ref.invalidate(boardTopicsProvider(query)),
              ),
              data: (topics) {
                if (topics.isEmpty) {
                  final hasFilter = query.search.isNotEmpty ||
                      query.categoryId != 'all' ||
                      query.status != 'all' ||
                      query.visibility != 'all' ||
                      query.mineOnly;
                  return EmptyState(
                    icon: Icons.dashboard_outlined,
                    title: hasFilter ? 'No topics match filters' : 'No topics yet',
                    subtitle: hasFilter
                        ? 'Try adjusting filters or search'
                        : 'Tap + to create the first topic',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(boardTopicsProvider(query)),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: topics.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final topic = topics[i] as Map<String, dynamic>;
                      return _TopicCard(
                        topic: topic,
                        onTap: () {
                          ctx.push('/board/${topic['id']}').then((_) {
                            if (!mounted) return;
                            ref.invalidate(boardTopicsProvider(_query()));
                          });
                        },
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateSheet,
        tooltip: 'New Topic',
        child: const Icon(Icons.add),
      ),
    );
  }
}

class _OptionItem {
  final String value;
  final String label;
  const _OptionItem(this.value, this.label);
}

List<_OptionItem> _visibilityOptionsFromMeta(Map<String, dynamic> meta) {
  final raw = (meta['visibilityOptions'] as List<dynamic>?) ?? const [];
  final parsed = raw.map((item) {
    final map = item as Map<String, dynamic>;
    final value = (map['value'] ?? '').toString();
    final label = (map['label'] ?? value).toString();
    return _OptionItem(value, label);
  }).where((item) => item.value.isNotEmpty).toList();

  if (parsed.isNotEmpty) {
    return [const _OptionItem('all', 'All visibility'), ...parsed];
  }
  return const [
    _OptionItem('all', 'All visibility'),
    _OptionItem('organization', 'Organization'),
    _OptionItem('team', 'Team'),
    _OptionItem('private', 'Private'),
    _OptionItem('public', 'Public'),
  ];
}

class _BoardFilters extends StatelessWidget {
  final List<dynamic> categories;
  final String activeCategoryId;
  final ValueChanged<String> onCategoryChanged;
  final String status;
  final ValueChanged<String> onStatusChanged;
  final String visibility;
  final List<_OptionItem> visibilityOptions;
  final ValueChanged<String> onVisibilityChanged;
  final String sort;
  final ValueChanged<String> onSortChanged;
  final bool mineOnly;
  final ValueChanged<bool> onMineOnlyChanged;

  const _BoardFilters({
    required this.categories,
    required this.activeCategoryId,
    required this.onCategoryChanged,
    required this.status,
    required this.onStatusChanged,
    required this.visibility,
    required this.visibilityOptions,
    required this.onVisibilityChanged,
    required this.sort,
    required this.onSortChanged,
    required this.mineOnly,
    required this.onMineOnlyChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color:
                Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.45),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    selected: activeCategoryId == 'all',
                    label: const Text('All'),
                    onSelected: (_) => onCategoryChanged('all'),
                  ),
                ),
                ...categories.map((item) {
                  final cat = item as Map<String, dynamic>;
                  final id = cat['id']?.toString() ?? '';
                  final name = cat['name']?.toString() ?? '';
                  if (id.isEmpty || name.isEmpty) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      selected: activeCategoryId == id,
                      label: Text(name),
                      onSelected: (_) => onCategoryChanged(id),
                    ),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                SizedBox(
                  width: 150,
                  child: DropdownButtonFormField<String>(
                    initialValue: status,
                    decoration: const InputDecoration(
                      labelText: 'Status',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'all', child: Text('All')),
                      DropdownMenuItem(value: 'open', child: Text('Open')),
                      DropdownMenuItem(value: 'resolved', child: Text('Resolved')),
                    ],
                    onChanged: (v) => onStatusChanged(v ?? 'all'),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 185,
                  child: DropdownButtonFormField<String>(
                    initialValue: visibility,
                    decoration: const InputDecoration(
                      labelText: 'Visibility',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: visibilityOptions
                        .map(
                          (option) => DropdownMenuItem<String>(
                            value: option.value,
                            child: Text(option.label),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => onVisibilityChanged(v ?? 'all'),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 180,
                  child: DropdownButtonFormField<String>(
                    initialValue: sort,
                    decoration: const InputDecoration(
                      labelText: 'Sort',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'recent', child: Text('Latest activity')),
                      DropdownMenuItem(value: 'most_replies', child: Text('Most replies')),
                      DropdownMenuItem(value: 'oldest', child: Text('Oldest first')),
                    ],
                    onChanged: (v) => onSortChanged(v ?? 'recent'),
                  ),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  selected: mineOnly,
                  label: const Text('My Topics'),
                  onSelected: onMineOnlyChanged,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

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
    final time = _formatTime(
      topic['lastActivityAt']?.toString() ?? topic['createdAt']?.toString(),
    );

    final creator = topic['creator'] as Map<String, dynamic>?;
    final creatorName =
        creator != null ? (creator['fullname'] ?? creator['name'] ?? '').toString() : '';

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
                  Text(
                    time,
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: cs.onSurface.withValues(alpha: 0.45)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
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
              Row(
                children: [
                  Icon(
                    Icons.person_outline,
                    size: 14,
                    color: cs.onSurface.withValues(alpha: 0.45),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      creatorName,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: cs.onSurface.withValues(alpha: 0.55),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(
                    Icons.chat_bubble_outline_rounded,
                    size: 14,
                    color: cs.onSurface.withValues(alpha: 0.45),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$postCount',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: cs.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    Icons.chevron_right,
                    size: 16,
                    color: cs.onSurface.withValues(alpha: 0.35),
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

class _CreateTopicSheet extends ConsumerStatefulWidget {
  final VoidCallback onCreated;
  const _CreateTopicSheet({required this.onCreated});

  @override
  ConsumerState<_CreateTopicSheet> createState() => _CreateTopicSheetState();
}

class _CreateTopicSheetState extends ConsumerState<_CreateTopicSheet> {
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _openingMessageCtrl = TextEditingController();
  bool _submitting = false;
  String? _selectedCategoryId;
  String _visibility = 'organization';
  String? _selectedTeamId;
  String? _selectedOrganizationId;
  bool _pinTopic = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    _openingMessageCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    final description = _descriptionCtrl.text.trim();
    final openingMessage = _openingMessageCtrl.text.trim();

    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title is required')),
      );
      return;
    }
    if (_selectedCategoryId == null || _selectedCategoryId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Category is required')),
      );
      return;
    }
    if (_visibility == 'team' &&
        (_selectedTeamId == null || _selectedTeamId!.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a team')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final me = ref.read(userProfileProvider).asData?.value;
      final created = await ref.read(apiClientProvider).createBoardTopic({
        'title': title,
        'categoryId': _selectedCategoryId,
        'visibility': _visibility,
        if (description.isNotEmpty) 'description': description,
        if (_visibility == 'team' && _selectedTeamId != null) 'teamId': _selectedTeamId,
        if (_visibility == 'organization' && _selectedOrganizationId != null)
          'organizationId': _selectedOrganizationId,
        if (me?.isAdmin == true && _pinTopic) 'isPinned': true,
      });

      if (openingMessage.isNotEmpty) {
        final topicId = created['id']?.toString();
        if (topicId != null && topicId.isNotEmpty) {
          await ref.read(apiClientProvider).createBoardPost(topicId, openingMessage);
        }
      }

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
    final me = ref.watch(userProfileProvider).asData?.value;
    final meta = ref.watch(_boardMetaProvider).asData?.value ?? const {};
    final visibilityOptions = _visibilityOptionsFromMeta(meta);
    final teams = (meta['teams'] as List<dynamic>?) ?? const [];
    final organizations = (meta['organizations'] as List<dynamic>?) ?? const [];

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
            TextField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                labelText: 'Title *',
                hintText: 'Enter topic title...',
              ),
              textCapitalization: TextCapitalization.sentences,
              maxLength: 200,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionCtrl,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                hintText: 'Add more details...',
                alignLabelWithHint: true,
              ),
              minLines: 3,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            categoriesAsync.when(
              data: (cats) {
                if (cats.isEmpty) {
                  return Text(
                    'No board categories found. Create category from web first.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.error,
                    ),
                  );
                }
                final validCategoryIds = cats
                    .map((item) => (item as Map<String, dynamic>)['id']?.toString() ?? '')
                    .where((id) => id.isNotEmpty)
                    .toSet();
                if ((_selectedCategoryId == null || _selectedCategoryId!.isEmpty) &&
                    validCategoryIds.isNotEmpty) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    if (_selectedCategoryId == null || _selectedCategoryId!.isEmpty) {
                      setState(() => _selectedCategoryId = validCategoryIds.first);
                    }
                  });
                }
                return DropdownButtonFormField<String>(
                  initialValue: validCategoryIds.contains(_selectedCategoryId)
                      ? _selectedCategoryId
                      : null,
                  decoration: const InputDecoration(labelText: 'Category'),
                  hint: const Text('Select category'),
                  items: cats.map((item) {
                    final cat = item as Map<String, dynamic>;
                    return DropdownMenuItem<String>(
                      value: cat['id']?.toString(),
                      child: Text(cat['name']?.toString() ?? ''),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => _selectedCategoryId = value),
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: visibilityOptions
                      .where((item) => item.value != 'all')
                      .any((item) => item.value == _visibility)
                  ? _visibility
                  : 'organization',
              decoration: const InputDecoration(labelText: 'Visibility'),
              items: visibilityOptions
                  .where((item) => item.value != 'all')
                  .map(
                    (item) => DropdownMenuItem<String>(
                      value: item.value,
                      child: Text(item.label),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                setState(() {
                  _visibility = value ?? 'organization';
                  if (_visibility != 'team') _selectedTeamId = null;
                });
              },
            ),
            if (_visibility == 'team') ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _selectedTeamId,
                decoration: const InputDecoration(labelText: 'Team'),
                hint: const Text('Select team'),
                items: teams.map((item) {
                  final team = item as Map<String, dynamic>;
                  return DropdownMenuItem<String>(
                    value: team['id']?.toString(),
                    child: Text(team['name']?.toString() ?? ''),
                  );
                }).toList(),
                onChanged: (value) => setState(() => _selectedTeamId = value),
              ),
              if (teams.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'No teams available for your account.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.error,
                    ),
                  ),
                ),
            ],
            if (_visibility == 'organization') ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _selectedOrganizationId,
                decoration: const InputDecoration(labelText: 'Organization'),
                hint: const Text('General'),
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('General'),
                  ),
                  ...organizations.map((item) {
                    final org = item as Map<String, dynamic>;
                    return DropdownMenuItem<String?>(
                      value: org['id']?.toString(),
                      child: Text(org['name']?.toString() ?? ''),
                    );
                  }),
                ],
                onChanged: (value) => setState(() => _selectedOrganizationId = value),
              ),
            ],
            if (me?.isAdmin == true) ...[
              const SizedBox(height: 12),
              CheckboxListTile(
                value: _pinTopic,
                contentPadding: EdgeInsets.zero,
                title: const Text('Pin topic'),
                onChanged: (value) => setState(() => _pinTopic = value == true),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _openingMessageCtrl,
              decoration: const InputDecoration(
                labelText: 'Opening message (optional)',
                hintText: 'Post the first message in this topic...',
                alignLabelWithHint: true,
              ),
              minLines: 4,
              maxLines: 8,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Create Topic',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
