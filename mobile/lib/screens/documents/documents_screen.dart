import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:file_picker/file_picker.dart';

import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

@immutable
class _DocsParams {
  final String? folderId;
  final String search;
  final String category;
  const _DocsParams({this.folderId, this.search = '', this.category = 'all'});

  @override
  bool operator ==(Object other) =>
      other is _DocsParams &&
      other.folderId == folderId &&
      other.search == search &&
      other.category == category;

  @override
  int get hashCode => Object.hash(folderId, search, category);
}

final documentsProvider =
    FutureProvider.family<Map<String, dynamic>, _DocsParams>((ref, p) async {
  return ref.watch(apiClientProvider).getDocuments(
        folderId: p.folderId,
        search: p.search.isEmpty ? null : p.search,
        category: p.category,
      );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFF06B6D4);

IconData _iconFor(String? ext) {
  switch ((ext ?? '').toLowerCase()) {
    case 'pdf':
      return Icons.picture_as_pdf_outlined;
    case 'doc':
    case 'docx':
      return Icons.description_outlined;
    case 'xls':
    case 'xlsx':
      return Icons.table_chart_outlined;
    case 'ppt':
    case 'pptx':
      return Icons.slideshow_outlined;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return Icons.image_outlined;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return Icons.folder_zip_outlined;
    case 'txt':
    case 'md':
      return Icons.text_snippet_outlined;
    case 'mp4':
    case 'mov':
    case 'avi':
      return Icons.videocam_outlined;
    case 'mp3':
    case 'wav':
      return Icons.audiotrack_outlined;
    case 'folder':
      return Icons.folder_rounded;
    default:
      return Icons.insert_drive_file_outlined;
  }
}

Color _iconColor(String? ext) {
  switch ((ext ?? '').toLowerCase()) {
    case 'pdf':
      return const Color(0xFFEF4444);
    case 'doc':
    case 'docx':
      return const Color(0xFF3B82F6);
    case 'xls':
    case 'xlsx':
      return const Color(0xFF22C55E);
    case 'ppt':
    case 'pptx':
      return const Color(0xFFF97316);
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return const Color(0xFF8B5CF6);
    case 'zip':
    case 'rar':
    case '7z':
      return const Color(0xFF78716C);
    case 'txt':
    case 'md':
      return const Color(0xFF6B7280);
    case 'mp4':
    case 'mov':
      return const Color(0xFFEC4899);
    case 'mp3':
    case 'wav':
      return const Color(0xFF14B8A6);
    case 'folder':
      return const Color(0xFFF59E0B);
    default:
      return _kPrimary;
  }
}

String _formatSize(dynamic bytes) {
  if (bytes == null) return '';
  final b = bytes is int ? bytes : int.tryParse(bytes.toString()) ?? 0;
  if (b == 0) return '';
  if (b < 1024) return '${b} B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
  if (b < 1024 * 1024 * 1024)
    return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(b / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
}

String _formatDate(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    return DateFormat('MMM d, y').format(DateTime.parse(raw).toLocal());
  } catch (_) {
    return raw;
  }
}

String _docName(Map<String, dynamic> doc) =>
    (doc['name'] ?? doc['filename'] ?? doc['title'] ?? 'Untitled').toString();

String _fileExt(Map<String, dynamic> doc) {
  final mime = doc['mimeType']?.toString() ?? '';
  if (mime.isNotEmpty) {
    // pdf → pdf, image/png → png, application/vnd.ms-excel → xls
    if (mime.contains('pdf')) return 'pdf';
    if (mime.contains('word') || mime.contains('msword')) return 'docx';
    if (mime.contains('excel') || mime.contains('spreadsheet')) return 'xlsx';
    if (mime.contains('powerpoint') || mime.contains('presentation'))
      return 'pptx';
    if (mime.contains('png')) return 'png';
    if (mime.contains('jpeg') || mime.contains('jpg')) return 'jpg';
    if (mime.contains('gif')) return 'gif';
    if (mime.contains('webp')) return 'webp';
    if (mime.contains('zip')) return 'zip';
    if (mime.contains('text/plain')) return 'txt';
  }
  // Fall back to extension from name
  final name = _docName(doc);
  final idx = name.lastIndexOf('.');
  if (idx >= 0) return name.substring(idx + 1).toLowerCase();
  return '';
}

String _ownerName(Map<String, dynamic> item) {
  final owner = item['owner'];
  if (owner is Map) {
    return (owner['fullname'] ?? owner['name'] ?? '').toString();
  }
  return '';
}

String _safeFileName(String value) {
  final sanitized = value
      .trim()
      .replaceAll(RegExp(r'[<>:"/\\|?*]+'), '_')
      .replaceAll(RegExp(r'\s+'), ' ');
  if (sanitized.isEmpty) return 'document';
  return sanitized;
}

String _contentPreviewTitle(Map<String, dynamic> doc) {
  final mime = (doc['mimeType'] ?? '').toString().toLowerCase();
  if (mime.contains('html')) return 'HTML Document';
  if (mime.contains('markdown')) return 'Markdown Document';
  if (mime.contains('json')) return 'JSON Document';
  if (mime.contains('xml')) return 'XML Document';
  return 'Document Content';
}

bool _isImageDocument(Map<String, dynamic> doc) {
  final mime = (doc['mimeType'] ?? '').toString().toLowerCase();
  if (mime.startsWith('image/')) return true;
  switch (_fileExt(doc)) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return true;
    default:
      return false;
  }
}

// ─── Breadcrumb model ─────────────────────────────────────────────────────────

@immutable
class _OpenProgressState {
  final String message;
  final double? progress;

  const _OpenProgressState({
    required this.message,
    required this.progress,
  });
}

typedef _OpenProgressUpdate = void Function({
  String? message,
  double? progress,
});

Future<T> _runWithOpenProgressDialog<T>(
  BuildContext context, {
  required String title,
  required String initialMessage,
  required Future<T> Function(_OpenProgressUpdate update) task,
}) async {
  final notifier = ValueNotifier<_OpenProgressState>(
    _OpenProgressState(message: initialMessage, progress: null),
  );
  final navigator = Navigator.of(context, rootNavigator: true);
  var dialogVisible = true;

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    useRootNavigator: true,
    builder: (dialogContext) => PopScope(
      canPop: false,
      child: AlertDialog(
        title: Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        content: ValueListenableBuilder<_OpenProgressState>(
          valueListenable: notifier,
          builder: (_, state, __) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(state.message),
              const SizedBox(height: 16),
              LinearProgressIndicator(value: state.progress),
              const SizedBox(height: 10),
              Text(
                state.progress == null
                    ? 'Please wait...'
                    : '${(state.progress! * 100).clamp(0, 100).toStringAsFixed(0)}%',
                style: Theme.of(dialogContext).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    ),
  ).then((_) {
    dialogVisible = false;
  });

  await Future<void>.delayed(const Duration(milliseconds: 60));

  try {
    return await task(({
      String? message,
      double? progress,
    }) {
      notifier.value = _OpenProgressState(
        message: message ?? notifier.value.message,
        progress: progress,
      );
    });
  } finally {
    if (dialogVisible && navigator.canPop()) {
      navigator.pop();
    }
    notifier.dispose();
  }
}

class _Breadcrumb {
  final String? folderId;
  final String name;
  const _Breadcrumb({this.folderId, required this.name});
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen>
    with AutoRefreshMixin, SingleTickerProviderStateMixin {
  final List<_Breadcrumb> _breadcrumbs = [
    const _Breadcrumb(folderId: null, name: 'Documents'),
  ];

  bool _showSearch = false;
  final _searchCtrl = TextEditingController();
  String _searchQuery = '';
  bool _fabExpanded = false;

  // Upload state
  bool _uploading = false;
  double _uploadProgress = 0;
  String _uploadingName = '';

  late final TabController _tabCtrl;
  static const _tabs = [
    (key: 'all', label: 'All'),
    (key: 'shared', label: 'Shared'),
    (key: 'sharedWithMe', label: 'Shared with me'),
  ];

  String? get _currentFolderIdNullable => _breadcrumbs.last.folderId;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: _tabs.length, vsync: this);
    _tabCtrl.addListener(() => setState(() {}));
    startAutoRefresh(const Duration(seconds: 120), () {
      _invalidate();
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _tabCtrl.dispose();
    super.dispose();
  }

  void _invalidate() {
    ref.invalidate(documentsProvider(_params()));
  }

  _DocsParams _params() => _DocsParams(
        folderId: _currentFolderIdNullable,
        search: _searchQuery,
        category: _tabs[_tabCtrl.index].key,
      );

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchQuery = '';
        _searchCtrl.clear();
      }
    });
  }

  void _openFolder(String folderId, String name) {
    setState(() {
      _breadcrumbs.add(_Breadcrumb(folderId: folderId, name: name));
      _searchQuery = '';
      _searchCtrl.clear();
      _showSearch = false;
    });
  }

  void _navToBreadcrumb(int index) {
    if (index == _breadcrumbs.length - 1) return;
    setState(() => _breadcrumbs.removeRange(index + 1, _breadcrumbs.length));
  }

  bool get _canGoBack => _breadcrumbs.length > 1;

  void _showCreateFolderSheet() {
    setState(() => _fabExpanded = false);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _CreateFolderSheet(
        parentId: _currentFolderIdNullable,
        onCreated: _invalidate,
      ),
    );
  }

  Future<void> _pickAndUpload() async {
    setState(() => _fabExpanded = false);

    FilePickerResult? result;
    try {
      result = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: false,
        withReadStream: false,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open file picker: $e')),
        );
      }
      return;
    }

    if (result == null || result.files.isEmpty) return;
    final picked = result.files.first;
    final filePath = picked.path;
    if (filePath == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not read file path')),
        );
      }
      return;
    }

    final fileName = picked.name;
    final fileSize = picked.size;
    final mimeType = picked.extension != null
        ? _mimeFromExt(picked.extension!)
        : 'application/octet-stream';

    setState(() {
      _uploading = true;
      _uploadProgress = 0;
      _uploadingName = fileName;
    });

    try {
      await ref.read(apiClientProvider).uploadDocument(
        filePath: filePath,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: fileSize,
        folderId: _currentFolderIdNullable,
        onProgress: (sent, total) {
          if (total > 0 && mounted) {
            setState(() => _uploadProgress = sent / total);
          }
        },
      );
      if (mounted) {
        _invalidate();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('"$fileName" uploaded successfully'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Colors.green.shade700,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  static String _mimeFromExt(String ext) {
    switch (ext.toLowerCase()) {
      case 'pdf': return 'application/pdf';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls': return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt': return 'application/vnd.ms-powerpoint';
      case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'svg': return 'image/svg+xml';
      case 'mp4': return 'video/mp4';
      case 'mov': return 'video/quicktime';
      case 'mp3': return 'audio/mpeg';
      case 'wav': return 'audio/wav';
      case 'zip': return 'application/zip';
      case 'rar': return 'application/x-rar-compressed';
      case '7z': return 'application/x-7z-compressed';
      case 'txt': return 'text/plain';
      case 'md': return 'text/markdown';
      case 'json': return 'application/json';
      case 'xml': return 'application/xml';
      case 'csv': return 'text/csv';
      default: return 'application/octet-stream';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final params = _params();
    final async = ref.watch(documentsProvider(params));

    return PopScope(
      canPop: !_canGoBack,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _canGoBack) {
          setState(() => _breadcrumbs.removeLast());
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: _canGoBack
              ? IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () =>
                      setState(() => _breadcrumbs.removeLast()),
                )
              : null,
          title: _showSearch
              ? TextField(
                  controller: _searchCtrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: 'Search documents…',
                    border: InputBorder.none,
                    hintStyle: TextStyle(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    filled: false,
                  ),
                  style: theme.textTheme.bodyLarge,
                  onChanged: (v) => setState(() => _searchQuery = v),
                )
              : Text(
                  _breadcrumbs.last.name,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
          actions: [
            IconButton(
              icon: Icon(_showSearch ? Icons.close : Icons.search_rounded),
              onPressed: _toggleSearch,
              tooltip: _showSearch ? 'Close' : 'Search',
            ),
          ],
          bottom: PreferredSize(
            preferredSize: Size.fromHeight(
              (_breadcrumbs.length > 1 ? 36.0 : 0.0) + 48.0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_breadcrumbs.length > 1)
                  _BreadcrumbBar(
                    breadcrumbs: _breadcrumbs,
                    onTap: _navToBreadcrumb,
                  ),
                TabBar(
                  controller: _tabCtrl,
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  indicatorColor: _kPrimary,
                  labelColor: _kPrimary,
                  tabs: _tabs
                      .map((t) => Tab(text: t.label, height: 44))
                      .toList(),
                ),
              ],
            ),
          ),
        ),
        body: async.when(
          loading: () => const ShimmerList(count: 10),
          error: (e, _) => ErrorState(
            message: e.toString(),
            onRetry: _invalidate,
          ),
          data: (data) {
            final folders = (data['folders'] as List<dynamic>?) ?? [];
            final documents = (data['documents'] as List<dynamic>?) ?? [];

            if (folders.isEmpty && documents.isEmpty) {
              return EmptyState(
                icon: Icons.folder_open_outlined,
                title: _searchQuery.isNotEmpty
                    ? 'No results'
                    : _canGoBack
                        ? 'Empty folder'
                        : 'No documents',
                subtitle: _searchQuery.isNotEmpty
                    ? 'Try a different search term'
                    : 'Tap + to create a folder',
              );
            }

            return RefreshIndicator(
              color: _kPrimary,
              onRefresh: () async => _invalidate(),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: folders.length + documents.length,
                separatorBuilder: (_, __) => Divider(
                  height: 1,
                  indent: 64,
                  endIndent: 16,
                  color:
                      theme.colorScheme.outline.withValues(alpha: 0.15),
                ),
                itemBuilder: (ctx, i) {
                  if (i < folders.length) {
                    final folder = folders[i] as Map<String, dynamic>;
                    return _FolderTile(
                      folder: folder,
                      onTap: () {
                        final id = folder['id']?.toString() ?? '';
                        if (id.isNotEmpty) {
                          _openFolder(id, _docName(folder));
                        }
                      },
                    );
                  }
                  final doc = documents[i - folders.length]
                      as Map<String, dynamic>;
                  return _FileTile(doc: doc, onDeleted: _invalidate);
                },
              ),
            );
          },
        ),
        floatingActionButton: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // Upload progress banner
            if (_uploading)
              Card(
                margin: const EdgeInsets.only(bottom: 12, right: 4),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: _kPrimary),
                          ),
                          const SizedBox(width: 10),
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 180),
                            child: Text(
                              'Uploading "$_uploadingName"',
                              style: const TextStyle(fontSize: 12),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      LinearProgressIndicator(
                        value: _uploadProgress > 0 ? _uploadProgress : null,
                        color: _kPrimary,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${(_uploadProgress * 100).toStringAsFixed(0)}%',
                        style: const TextStyle(fontSize: 11, color: _kPrimary),
                      ),
                    ],
                  ),
                ),
              ),

            // Speed-dial mini buttons (visible when expanded)
            if (_fabExpanded) ...[
              _SpeedDialItem(
                icon: Icons.create_new_folder_outlined,
                label: 'New Folder',
                color: const Color(0xFFF59E0B),
                onTap: _showCreateFolderSheet,
              ),
              const SizedBox(height: 10),
              _SpeedDialItem(
                icon: Icons.upload_file_outlined,
                label: 'Upload File',
                color: _kPrimary,
                onTap: _uploading ? null : _pickAndUpload,
              ),
              const SizedBox(height: 16),
            ],

            // Main FAB
            FloatingActionButton(
              onPressed: () => setState(() => _fabExpanded = !_fabExpanded),
              backgroundColor: _kPrimary,
              foregroundColor: Colors.white,
              tooltip: _fabExpanded ? 'Close' : 'Add',
              child: AnimatedRotation(
                turns: _fabExpanded ? 0.125 : 0,
                duration: const Duration(milliseconds: 200),
                child: const Icon(Icons.add),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Speed dial item ──────────────────────────────────────────────────────────

class _SpeedDialItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  const _SpeedDialItem({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          elevation: 2,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        FloatingActionButton.small(
          heroTag: label,
          onPressed: onTap,
          backgroundColor: color,
          foregroundColor: Colors.white,
          child: Icon(icon, size: 20),
        ),
      ],
    );
  }
}

// ─── Breadcrumb bar ───────────────────────────────────────────────────────────

class _BreadcrumbBar extends StatelessWidget {
  final List<_Breadcrumb> breadcrumbs;
  final void Function(int) onTap;
  const _BreadcrumbBar({required this.breadcrumbs, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: breadcrumbs.length,
        separatorBuilder: (_, __) => Icon(
          Icons.chevron_right,
          size: 16,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
        ),
        itemBuilder: (_, i) {
          final crumb = breadcrumbs[i];
          final isLast = i == breadcrumbs.length - 1;
          return GestureDetector(
            onTap: () => onTap(i),
            child: Center(
              child: Text(
                crumb.name,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight:
                      isLast ? FontWeight.w700 : FontWeight.normal,
                  color: isLast ? theme.colorScheme.onSurface : _kPrimary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Folder tile ──────────────────────────────────────────────────────────────

class _FolderTile extends StatelessWidget {
  final Map<String, dynamic> folder;
  final VoidCallback onTap;
  const _FolderTile({required this.folder, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = _docName(folder);
    const color = Color(0xFFF59E0B);
    final count = folder['_count'] as Map<String, dynamic>?;
    final subfolders = (count?['children'] ?? 0) as int;
    final files = (count?['documents'] ?? 0) as int;
    final total = subfolders + files;
    final owner = _ownerName(folder);
    final isShared = (folder['shareCount'] as int? ?? 0) > 0;
    final accessLevel = (folder['accessLevel'] ?? 'private').toString();

    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(Icons.folder_rounded, color: color, size: 24),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              name,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (isShared) ...[
            const SizedBox(width: 6),
            Icon(Icons.people_outline,
                size: 14,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
          ],
          if (accessLevel == 'module') ...[
            const SizedBox(width: 4),
            Icon(Icons.business_outlined,
                size: 14, color: _kPrimary.withValues(alpha: 0.7)),
          ],
        ],
      ),
      subtitle: Text(
        [
          if (total > 0) '$total item${total != 1 ? 's' : ''}',
          if (owner.isNotEmpty) 'by $owner',
        ].join(' · '),
        style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
      ),
      trailing: const Icon(Icons.chevron_right, size: 20),
      onTap: onTap,
    );
  }
}

// ─── File tile ────────────────────────────────────────────────────────────────

class _FileTile extends ConsumerWidget {
  final Map<String, dynamic> doc;
  final VoidCallback? onDeleted;
  const _FileTile({required this.doc, this.onDeleted});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final name = _docName(doc);
    final ext = _fileExt(doc);
    final color = _iconColor(ext);
    final icon = _iconFor(ext);
    final size = _formatSize(doc['fileSize'] ?? doc['size']);
    final date = _formatDate(
        doc['updatedAt']?.toString() ?? doc['createdAt']?.toString());
    final owner = _ownerName(doc);
    final isShared = (doc['shareCount'] as int? ?? 0) > 0;
    final isSigned = doc['isSigned'] == true;
    final accessLevel = (doc['accessLevel'] ?? 'private').toString();
    final hasContent = (doc['content']?.toString() ?? '').isNotEmpty;
    final hasFile = (doc['fileUrl']?.toString() ?? '').isNotEmpty;

    final meta = [
      if (ext.isNotEmpty) ext.toUpperCase(),
      if (size.isNotEmpty) size,
      if (date.isNotEmpty) date,
    ].join(' · ');

    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 22),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              name,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (isSigned) ...[
            const SizedBox(width: 6),
            Tooltip(
              message: 'Signed',
              child: Icon(Icons.verified_outlined,
                  size: 14, color: Colors.green.shade600),
            ),
          ],
          if (isShared) ...[
            const SizedBox(width: 4),
            Icon(Icons.people_outline,
                size: 14,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
          ],
          if (accessLevel == 'module') ...[
            const SizedBox(width: 4),
            Icon(Icons.business_outlined,
                size: 14, color: _kPrimary.withValues(alpha: 0.7)),
          ],
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (meta.isNotEmpty)
            Text(
              meta,
              style: theme.textTheme.bodySmall?.copyWith(
                  color:
                      theme.colorScheme.onSurface.withValues(alpha: 0.5)),
            ),
          if (owner.isNotEmpty)
            Text(
              owner,
              style: theme.textTheme.bodySmall?.copyWith(
                  color: _kPrimary.withValues(alpha: 0.8),
                  fontWeight: FontWeight.w500),
            ),
        ],
      ),
      trailing: IconButton(
        icon: const Icon(Icons.more_vert, size: 20),
        onPressed: () => _showFileOptions(context, ref),
      ),
      onTap: (hasFile || hasContent)
          ? () => _openFile(context, ref)
          : null,
    );
  }

  Future<String?> _downloadDocumentFile({
    required WidgetRef ref,
    required String url,
    required String fileName,
    bool persistent = false,
    void Function(int received, int total)? onProgress,
  }) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return null;

    final baseDir = persistent
        ? await getApplicationDocumentsDirectory()
        : await getTemporaryDirectory();
    final documentsDir =
        Directory('${baseDir.path}${Platform.pathSeparator}documents');
    if (!await documentsDir.exists()) {
      await documentsDir.create(recursive: true);
    }

    final stampedName =
        '${DateTime.now().millisecondsSinceEpoch}_${_safeFileName(fileName)}';
    final outputPath =
        '${documentsDir.path}${Platform.pathSeparator}$stampedName';

    final documentId = doc['id']?.toString() ?? '';
    if (documentId.isNotEmpty) {
      await ref.read(apiClientProvider).downloadDocumentToFile(
            documentId: documentId,
            savePath: outputPath,
            onReceiveProgress: onProgress,
          );
    } else {
      await ref.read(apiClientProvider).downloadToFile(
            url: uri.toString(),
            savePath: outputPath,
            onReceiveProgress: onProgress,
          );
    }
    return outputPath;
  }

  Future<void> _openDocumentContent(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final id = doc['id']?.toString() ?? '';
    final content = await _runWithOpenProgressDialog<String>(
      context,
      title: _docName(doc),
      initialMessage: 'Opening document content...',
      task: (update) async {
        update(message: 'Loading document content...', progress: null);
        var value = (doc['content'] ?? '').toString();
        if (value.isEmpty && id.isNotEmpty) {
          try {
            final detail = await ref.read(apiClientProvider).getDocument(id);
            value = (detail['content'] ?? '').toString();
          } catch (_) {
            // Fall back to the message below.
          }
        }
        update(message: 'Preparing preview...', progress: 1);
        return value;
      },
    );

    if (!context.mounted) return;
    if (content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This document has no previewable content'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _DocumentContentScreen(
          title: _docName(doc),
          subtitle: _contentPreviewTitle(doc),
          content: content,
        ),
      ),
    );
  }

  Future<void> _openFile(BuildContext context, WidgetRef ref) async {
    final fileUrl = resolveServerUrl(doc['fileUrl']?.toString()) ?? '';
    if (fileUrl.isNotEmpty) {
      try {
        final localPath = await _runWithOpenProgressDialog<String?>(
          context,
          title: _docName(doc),
          initialMessage: 'Opening file...',
          task: (update) async {
            update(message: 'Downloading file...', progress: 0);
            final localPath = await _downloadDocumentFile(
              ref: ref,
              url: fileUrl,
              fileName: _docName(doc),
              onProgress: (received, total) {
                final progress = total > 0 ? received / total : null;
                update(
                  message: total > 0
                      ? 'Downloading file...'
                      : 'Preparing file...',
                  progress: progress,
                );
              },
            );
            update(message: 'Preparing file...', progress: 1);
            return localPath;
          },
        );
        if (localPath != null) {
          if (_isImageDocument(doc) && context.mounted) {
            await Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => _ImageDocumentScreen(
                  title: _docName(doc),
                  imagePath: localPath,
                ),
              ),
            );
            return;
          }
          final result = await OpenFilex.open(localPath);
          if (result.type == ResultType.done) {
            return;
          }
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Could not open file directly: $e'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }

      final uri = Uri.tryParse(fileUrl);
      if (uri != null && await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return;
      }
    }

    final hasContent = (doc['content']?.toString() ?? '').isNotEmpty;
    if (hasContent || (doc['id']?.toString() ?? '').isNotEmpty) {
      await _openDocumentContent(context, ref);
      return;
    }

    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('This document could not be opened'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _downloadFile(BuildContext context, WidgetRef ref) async {
    final fileUrl = resolveServerUrl(doc['fileUrl']?.toString()) ?? '';
    if (fileUrl.isEmpty) return;

    try {
      final localPath = await _downloadDocumentFile(
        ref: ref,
        url: fileUrl,
        fileName: _docName(doc),
        persistent: true,
      );
      if (!context.mounted || localPath == null) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Downloaded to $localPath'),
          behavior: SnackBarBehavior.floating,
          action: SnackBarAction(
            label: 'Open',
            onPressed: () {
              OpenFilex.open(localPath);
            },
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Download failed: $e'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
  }

  void _showFileOptions(BuildContext context, WidgetRef ref) {
    final fileUrl = resolveServerUrl(doc['fileUrl']?.toString()) ?? '';
    final name = _docName(doc);
    final ext = _fileExt(doc);
    final size = _formatSize(doc['fileSize'] ?? doc['size']);
    final date = _formatDate(doc['updatedAt']?.toString());
    final owner = _ownerName(doc);
    final isSigned = doc['isSigned'] == true;
    final accessLevel = (doc['accessLevel'] ?? 'private').toString();
    final signedAt = _formatDate(doc['signedAt']?.toString());
    final hasContent = (doc['content']?.toString() ?? '').isNotEmpty;

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      isScrollControlled: true,
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                      color:
                          Colors.grey.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(2)),
                ),
              ),

              // File header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: _iconColor(ext).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(_iconFor(ext),
                          color: _iconColor(ext), size: 26),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.w700),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            children: [
                              if (ext.isNotEmpty)
                                _MetaBadge(
                                    label: ext.toUpperCase(),
                                    color: _iconColor(ext)),
                              if (accessLevel == 'module')
                                _MetaBadge(
                                    label: 'Company',
                                    color: _kPrimary),
                              if (isSigned)
                                _MetaBadge(
                                    label: 'Signed',
                                    color: Colors.green.shade600),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),

              // Metadata rows
              Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 20, vertical: 12),
                child: Column(
                  children: [
                    if (size.isNotEmpty)
                      _DetailRow(
                          icon: Icons.data_usage_outlined,
                          label: 'Size',
                          value: size),
                    if (owner.isNotEmpty)
                      _DetailRow(
                          icon: Icons.person_outline,
                          label: 'Owner',
                          value: owner),
                    if (date.isNotEmpty)
                      _DetailRow(
                          icon: Icons.update_rounded,
                          label: 'Modified',
                          value: date),
                    if (isSigned && signedAt.isNotEmpty)
                      _DetailRow(
                          icon: Icons.verified_outlined,
                          label: 'Signed',
                          value: signedAt),
                  ],
                ),
              ),
              const Divider(height: 1),

              // Actions
              if (fileUrl.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.open_in_new_rounded),
                  title: const Text('Open file'),
                  onTap: () async {
                    Navigator.pop(sheetCtx);
                    await _openFile(context, ref);
                  },
                ),
              if (fileUrl.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.download_rounded),
                  title: const Text('Download'),
                  onTap: () async {
                    Navigator.pop(sheetCtx);
                    await _downloadFile(context, ref);
                  },
                ),
              if (hasContent)
                ListTile(
                  leading: const Icon(Icons.article_outlined),
                  title: const Text('Open content'),
                  onTap: () async {
                    Navigator.pop(sheetCtx);
                    await _openDocumentContent(context, ref);
                  },
                ),
              ListTile(
                leading: const Icon(Icons.info_outline_rounded),
                title: const Text('Details'),
                onTap: () => Navigator.pop(sheetCtx),
              ),
              // Delete (only shown if user has permission)
              if (doc['myAccess']?['canDelete'] == true ||
                  doc['permission']?['canDelete'] == true)
                ListTile(
                  leading: Icon(Icons.delete_outline_rounded,
                      color: Theme.of(context).colorScheme.error),
                  title: Text(
                    'Delete',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.error),
                  ),
                  onTap: () async {
                    Navigator.pop(sheetCtx);
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Delete file?'),
                        content: Text(
                            '"$name" will be permanently deleted.'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: const Text('Cancel'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            style: FilledButton.styleFrom(
                                backgroundColor: Theme.of(context)
                                    .colorScheme
                                    .error),
                            child: const Text('Delete'),
                          ),
                        ],
                      ),
                    );
                    if (confirmed != true) return;
                    try {
                      // ignore: use_build_context_synchronously
                      await ref.read(apiClientProvider).deleteDocument(
                          doc['id']?.toString() ?? '');
                      onDeleted?.call();
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Delete failed: $e'),
                            backgroundColor:
                                Theme.of(context).colorScheme.error,
                          ),
                        );
                      }
                    }
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Create folder sheet ──────────────────────────────────────────────────────

class _CreateFolderSheet extends ConsumerStatefulWidget {
  final String? parentId;
  final VoidCallback onCreated;
  const _CreateFolderSheet({required this.parentId, required this.onCreated});

  @override
  ConsumerState<_CreateFolderSheet> createState() =>
      _CreateFolderSheetState();
}

class _CreateFolderSheetState extends ConsumerState<_CreateFolderSheet> {
  final _nameCtrl = TextEditingController();
  bool _submitting = false;
  String _accessLevel = 'private';

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Folder name is required')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).createDocumentFolder(
            name: name,
            parentId: widget.parentId,
            accessLevel: _accessLevel,
          );
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create folder: $e'),
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
              'New Folder',
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _nameCtrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Folder name *',
                hintText: 'Enter folder name…',
                prefixIcon: Icon(Icons.folder_outlined),
              ),
              textCapitalization: TextCapitalization.words,
              maxLength: 100,
            ),
            const SizedBox(height: 8),
            // Access level
            Row(
              children: [
                const Icon(Icons.lock_outline, size: 18),
                const SizedBox(width: 10),
                const Text('Visibility:'),
                const SizedBox(width: 12),
                ChoiceChip(
                  label: const Text('Company'),
                  selected: _accessLevel == 'module',
                  onSelected: (_) =>
                      setState(() => _accessLevel = 'module'),
                  selectedColor: _kPrimary.withValues(alpha: 0.15),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Private'),
                  selected: _accessLevel == 'private',
                  onSelected: (_) =>
                      setState(() => _accessLevel = 'private'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: _kPrimary,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Create Folder',
                      style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

class _DocumentContentScreen extends StatelessWidget {
  const _DocumentContentScreen({
    required this.title,
    required this.subtitle,
    required this.content,
  });

  final String title;
  final String subtitle;
  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text(
              subtitle,
              style: theme.textTheme.labelLarge?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: SelectableText(
                content,
                style: theme.textTheme.bodyMedium?.copyWith(height: 1.55),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageDocumentScreen extends StatelessWidget {
  const _ImageDocumentScreen({
    required this.title,
    required this.imagePath,
  });

  final String title;
  final String imagePath;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 0.8,
          maxScale: 5,
          child: Image.file(
            File(imagePath),
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Could not render this image',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MetaBadge extends StatelessWidget {
  final String label;
  final Color color;
  const _MetaBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _DetailRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.5);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 16, color: muted),
          const SizedBox(width: 8),
          Text(label,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: muted, fontWeight: FontWeight.w500)),
          const Spacer(),
          Text(value,
              style: theme.textTheme.bodySmall
                  ?.copyWith(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
