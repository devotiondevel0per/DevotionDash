import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../services/runtime_config.dart';
import '../../providers/user_provider.dart';
import 'chat_screen.dart' show chatDialogsProvider, chatGroupsProvider;
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/user_avatar.dart';

// ─── Constants ────────────────────────────────────────────────────────────────

const Color _kPrimary = Color(0xFFE81313);
final RegExp _urlRegex = RegExp(
  r'((?:https?:\/\/|www\.)[^\s<]+)',
  caseSensitive: false,
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

String _parseContent(dynamic raw) {
  if (raw == null) return '';
  final s = raw.toString();
  try {
    final decoded = jsonDecode(s);
    if (decoded is Map) {
      return (decoded['text'] ?? decoded['content'] ?? s).toString();
    }
    return s;
  } catch (_) {
    return s;
  }
}

String _formatMsgTime(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    return DateFormat('HH:mm').format(DateTime.parse(raw).toLocal());
  } catch (_) {
    return '';
  }
}

String _formatDayLabel(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw).toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final msgDay = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(msgDay).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    return DateFormat('MMMM d, y').format(dt);
  } catch (_) {
    return '';
  }
}

String _formatPresenceLabel(String? raw) {
  if (raw == null || raw.isEmpty) return 'Last seen unavailable';
  final dt = DateTime.tryParse(raw)?.toLocal();
  if (dt == null) return 'Last seen unavailable';
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 2) return 'Online';
  if (diff.inMinutes < 60) return 'Last seen ${diff.inMinutes}m ago';
  if (diff.inHours < 24) return 'Last seen ${diff.inHours}h ago';
  return 'Last seen ${diff.inDays}d ago';
}

bool _isRecentlyOnline(String? raw) {
  final dt = DateTime.tryParse(raw ?? '')?.toLocal();
  if (dt == null) return false;
  return DateTime.now().difference(dt).inMinutes < 2;
}

String _chatUserName(Map<String, dynamic>? user) {
  if (user == null) return 'Chat';
  final fullname = user['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final name = user['name']?.toString().trim() ?? '';
  return name.isNotEmpty ? name : 'Chat';
}

Map<String, dynamic>? _findPeerUserFromDialog(
  Map<String, dynamic>? dialog,
  String? currentUserId,
) {
  if (dialog == null) return null;
  final members = dialog['members'] as List<dynamic>? ?? const [];
  Map<String, dynamic>? fallback;

  for (final rawMember in members) {
    if (rawMember is! Map<String, dynamic>) continue;
    final user = rawMember['user'] as Map<String, dynamic>?;
    if (user == null) continue;
    fallback ??= user;
    final userId =
        rawMember['userId']?.toString() ?? user['id']?.toString() ?? '';
    if (currentUserId == null || currentUserId.isEmpty || userId != currentUserId) {
      return user;
    }
  }

  return fallback;
}

bool _isGroupConversationDialog(Map<String, dynamic>? dialog) {
  if (dialog == null) return false;
  if (dialog['groupId'] != null || dialog['organizationId'] != null) return true;
  final subject = dialog['subject']?.toString().trim() ?? '';
  if (subject.isNotEmpty) return true;
  final members = dialog['members'] as List<dynamic>? ?? const [];
  return members.length > 2;
}

String _conversationTitleFromDialog(
  Map<String, dynamic> dialog,
  String? currentUserId,
) {
  final subject = dialog['subject']?.toString().trim() ?? '';
  if (subject.isNotEmpty) return subject;
  return _chatUserName(_findPeerUserFromDialog(dialog, currentUserId));
}

bool _shouldHideForwardDialog(
  Map<String, dynamic> dialog,
  String? currentUserId,
) {
  if (dialog['groupId'] != null || dialog['organizationId'] != null) return false;
  final subject = dialog['subject']?.toString().trim() ?? '';
  if (subject.isNotEmpty) return false;
  return _findPeerUserFromDialog(dialog, currentUserId) == null;
}

String _messagePreviewForForward(Map<String, dynamic> message) {
  final payload = message['payload'];
  if (payload is Map<String, dynamic>) {
    final type = payload['type']?.toString().toLowerCase() ?? '';
    if (type == 'deleted') return 'Deleted message';
    final text = payload['text']?.toString().trim() ?? '';
    if (text.isNotEmpty) return text;
    final attachments = payload['attachments'] as List<dynamic>? ?? const [];
    if (attachments.isNotEmpty) {
      if (attachments.length == 1 && attachments.first is Map<String, dynamic>) {
        return (attachments.first as Map<String, dynamic>)['fileName']
                ?.toString() ??
            'Attachment';
      }
      return '${attachments.length} attachments';
    }
  }
  return _parseContent(message['content'] ?? message['text']);
}

DateTime _messageDate(Map<String, dynamic> message) {
  final raw = message['createdAt']?.toString() ?? '';
  return DateTime.tryParse(raw)?.toLocal() ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

List<Map<String, dynamic>> _sortMessagesAscending(
  Iterable<Map<String, dynamic>> messages,
) {
  final rows = messages
      .map((message) => Map<String, dynamic>.from(message))
      .toList();
  rows.sort((a, b) => _messageDate(a).compareTo(_messageDate(b)));
  return rows;
}

List<Map<String, dynamic>> _mergeMessagesAscending(
  Iterable<Map<String, dynamic>> current,
  Iterable<Map<String, dynamic>> incoming,
) {
  final merged = <String, Map<String, dynamic>>{};
  for (final message in [...current, ...incoming]) {
    final id = message['id']?.toString();
    if (id == null || id.isEmpty) continue;
    merged[id] = Map<String, dynamic>.from(message);
  }
  return _sortMessagesAscending(merged.values);
}

bool _sameMessageCollection(
  List<Map<String, dynamic>> current,
  List<Map<String, dynamic>> next,
) {
  if (identical(current, next)) return true;
  if (current.length != next.length) return false;
  for (var i = 0; i < current.length; i++) {
    final a = current[i];
    final b = next[i];
    if ((a['id']?.toString() ?? '') != (b['id']?.toString() ?? '')) {
      return false;
    }
    if ((a['updatedAt']?.toString() ?? '') != (b['updatedAt']?.toString() ?? '')) {
      return false;
    }
    if ((a['content']?.toString() ?? '') != (b['content']?.toString() ?? '')) {
      return false;
    }
    if ((a['text']?.toString() ?? '') != (b['text']?.toString() ?? '')) {
      return false;
    }
  }
  return true;
}

String _inferMimeFromName(String fileName) {
  final lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

String _inferAttachmentKind(String mimeType) {
  final lower = mimeType.toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('audio/')) return 'audio';
  return 'file';
}

String _safeFileName(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'attachment';
  return trimmed.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
}

String? _normalizeUrlCandidate(String raw) {
  final cleaned = raw.trim().replaceFirst(RegExp(r'[),.;!?]+$'), '');
  if (cleaned.isEmpty) return null;
  final withScheme = cleaned.startsWith('www.') ? 'https://$cleaned' : cleaned;
  final uri = Uri.tryParse(withScheme);
  if (uri == null) return null;
  final scheme = uri.scheme.toLowerCase();
  if (scheme != 'http' && scheme != 'https') return null;
  return uri.toString();
}

List<String> _extractUniqueUrls(String text, {int max = 2}) {
  final urls = <String>{};
  for (final match in _urlRegex.allMatches(text)) {
    final raw = match.group(0) ?? '';
    final normalized = _normalizeUrlCandidate(raw);
    if (normalized == null) continue;
    urls.add(normalized);
    if (urls.length >= max) break;
  }
  return urls.toList();
}

bool _isImageUrl(String url) {
  final lower = url.toLowerCase();
  return lower.contains('.png') ||
      lower.contains('.jpg') ||
      lower.contains('.jpeg') ||
      lower.contains('.gif') ||
      lower.contains('.webp') ||
      lower.contains('.bmp') ||
      lower.contains('.svg');
}

Future<void> _openExternalUrl(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Invalid link')),
    );
    return;
  }
  final opened = await launchUrl(
    uri,
    mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication,
  );
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open link')),
    );
  }
}

Uint8List? _decodeDataUrlBytes(String dataUrl) {
  try {
    final commaIndex = dataUrl.indexOf(',');
    final rawBase64 =
        commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
    return base64Decode(rawBase64);
  } catch (_) {
    return null;
  }
}

Future<void> _openAttachment(
  BuildContext context,
  Map<String, dynamic> attachment,
) async {
  final dataUrl = attachment['dataUrl']?.toString() ?? '';
  final fileName = _safeFileName(
    attachment['fileName']?.toString() ?? 'attachment',
  );
  if (dataUrl.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Attachment data is unavailable.')),
    );
    return;
  }

  try {
    final bytes = _decodeDataUrlBytes(dataUrl);
    if (bytes == null) {
      throw Exception('Attachment could not be decoded.');
    }
    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}${Platform.pathSeparator}$fileName');
    await file.writeAsBytes(bytes, flush: true);
    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.message)),
      );
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to open attachment: $error')),
      );
    }
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

enum _LiveChatMenuAction {
  assignToMe,
  assign,
  transfer,
  changeQueue,
  toggleStatus,
  insights,
}

enum _ChatMenuAction {
  rename,
  toggleStatus,
}

class ChatDetailScreen extends ConsumerStatefulWidget {
  final String dialogId;
  final String? dialogName;
  final Map<String, dynamic>? dialog;
  final bool isLiveChat;

  const ChatDetailScreen({
    super.key,
    required this.dialogId,
    this.dialogName,
    this.dialog,
    this.isLiveChat = false,
  });

  @override
  ConsumerState<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends ConsumerState<ChatDetailScreen>
    with AutoRefreshMixin {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _storage = const FlutterSecureStorage();

  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  bool _sending = false;
  bool _showEmoji = false;
  String? _oldestMessageTime;
  AudioRecorder? _voiceRecorder;
  Timer? _voiceTicker;
  bool _isRecordingVoice = false;
  int _voiceRecordingSeconds = 0;
  Timer? _liveChatTypingPollTimer;
  Timer? _liveChatTypingDebounce;
  List<String> _liveChatTypingUsers = const [];

  // Reply state
  Map<String, dynamic>? _replyingTo;

  // Attachments (images picked but not yet sent)
  final List<_Attachment> _pendingAttachments = [];

  // Resolved dialog ID (may differ from widget.dialogId when opening from user)
  String _resolvedDialogId = '';
  Map<String, dynamic>? _dialogMeta;
  List<Map<String, dynamic>> _liveChatAgents = [];
  List<Map<String, dynamic>> _liveChatGroups = [];
  bool _loadingChatMeta = false;
  bool _updatingChat = false;
  bool _loadingLiveChatMeta = false;
  bool _updatingLiveChat = false;
  bool _didRefreshUnreadCounters = false;
  int _silentMetaPollCounter = 0;

  io.Socket? _socket;

  String get _dialogTitle {
    if (widget.dialogName != null && widget.dialogName!.isNotEmpty) {
      return widget.dialogName!;
    }
    final d = _dialogMeta ?? widget.dialog;
    if (d == null) return widget.isLiveChat ? 'Live Chat' : 'Chat';
    final subject = d['subject']?.toString().trim() ?? '';
    if (subject.isNotEmpty) return subject;
    if (widget.isLiveChat) return (d['visitorName'] ?? 'Visitor').toString();
    return _conversationTitleFromDialog(
      Map<String, dynamic>.from(d),
      ref.read(userProfileProvider).value?.id,
    );
  }

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _voiceRecorder = AudioRecorder();
    }
    _resolvedDialogId = widget.dialogId;
    _dialogMeta = widget.dialog != null
        ? Map<String, dynamic>.from(widget.dialog!)
        : null;
    _loadMessages(refresh: true);
    if (widget.isLiveChat) {
      _loadLiveChatMeta();
    } else {
      _loadChatMeta(silent: widget.dialog != null);
    }
    startAutoRefresh(const Duration(seconds: 6), () {
      _refreshConversationSilently();
    });
    _scrollCtrl.addListener(_onScroll);
    _connectSocket();
    _startLiveChatTypingLoop();
  }

  @override
  void dispose() {
    _liveChatTypingPollTimer?.cancel();
    _liveChatTypingDebounce?.cancel();
    _voiceTicker?.cancel();
    if (_isRecordingVoice) {
      _voiceRecorder?.stop();
    }
    _voiceRecorder?.dispose();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    _socket?.disconnect();
    _socket?.dispose();
    super.dispose();
  }

  // ─── Socket.io ────────────────────────────────────────────────────────────

  Future<void> _connectSocket() async {
    final token = await _storage.read(key: 'auth_token');
    if (token == null) return;
    final serverUrl = RuntimeConfig.instance.serverUrl;
    _socket = io.io(
      serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );
    final eventName = widget.isLiveChat ? 'livechat:message' : 'chat:message';
    _socket!.on(eventName, (data) {
      if (!mounted) return;
      try {
        final msg = data is Map
            ? Map<String, dynamic>.from(data)
            : jsonDecode(data.toString()) as Map<String, dynamic>;
        final msgDialogId = (msg['dialogId'] ?? msg['dialog_id'] ?? '').toString();
        if (msgDialogId.isNotEmpty && msgDialogId != _resolvedDialogId) return;
        final msgId = msg['id']?.toString() ?? '';
        if (msgId.isNotEmpty &&
            _messages.any((m) => m['id']?.toString() == msgId)) {
          return;
        }
        final shouldStick = _isNearBottom();
        setState(() => _messages = _mergeMessagesAscending(_messages, [msg]));
        if (shouldStick) {
          _scrollToBottom(animated: true);
        }
      } catch (_) {}
    });
    _socket!.on('connect_error', (_) {});
  }

  void _onScroll() {
    if (!_scrollCtrl.hasClients) return;
    if (_scrollCtrl.position.pixels <= 120 &&
        !_loadingMore &&
        _hasMore) {
      _loadMore();
    }
  }

  bool _isNearBottom() {
    if (!_scrollCtrl.hasClients) return true;
    return (_scrollCtrl.position.maxScrollExtent - _scrollCtrl.position.pixels) <= 120;
  }

  void _scrollToBottom({bool animated = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      final target = _scrollCtrl.position.maxScrollExtent;
      if (animated) {
        _scrollCtrl.animateTo(
          target,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      } else {
        _scrollCtrl.jumpTo(target);
      }
    });
  }

  Future<void> _refreshConversationSilently() async {
    if (_sending || _loadingMore) return;
    await _loadMessages(silent: true);
    _silentMetaPollCounter++;
    if (_silentMetaPollCounter % 4 == 0) {
      if (widget.isLiveChat) {
        await _loadLiveChatMeta(silent: true);
      } else {
        await _loadChatMeta(silent: true);
      }
    }
  }

  Future<void> _refreshConversation() async {
    await _loadMessages(refresh: true);
    if (widget.isLiveChat) {
      await _loadLiveChatMeta();
    } else {
      await _loadChatMeta();
    }
  }

  Future<void> _markConversationNotificationsRead() async {
    try {
      final link = widget.isLiveChat
          ? '/livechat?dialog=$_resolvedDialogId'
          : '/chat?dialog=$_resolvedDialogId';
      await ref
          .read(apiClientProvider)
          .markNotificationsReadLink(link);
      if (!_didRefreshUnreadCounters && !widget.isLiveChat) {
        _didRefreshUnreadCounters = true;
        ref.invalidate(chatDialogsProvider);
        ref.invalidate(chatGroupsProvider);
      }
    } catch (_) {
      // Best effort.
    }
  }

  Future<void> _loadChatMeta({bool silent = false}) async {
    if (widget.isLiveChat) return;
    if (!silent && mounted) {
      setState(() => _loadingChatMeta = true);
    }
    try {
      final dialog =
          await ref.read(apiClientProvider).getChatDialog(_resolvedDialogId);
      final nextMeta = Map<String, dynamic>.from(dialog);
      final currentMeta = _dialogMeta;
      final hasMeaningfulChange =
          currentMeta == null ||
          (currentMeta['updatedAt']?.toString() ?? '') !=
              (nextMeta['updatedAt']?.toString() ?? '') ||
          (currentMeta['status']?.toString() ?? '') !=
              (nextMeta['status']?.toString() ?? '') ||
          (currentMeta['subject']?.toString() ?? '') !=
              (nextMeta['subject']?.toString() ?? '');
      if (!mounted) return;
      if (silent && !hasMeaningfulChange) return;
      setState(() {
        _dialogMeta = nextMeta;
        _loadingChatMeta = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loadingChatMeta = false);
      if (!silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load conversation details: $error')),
        );
      }
    }
  }

  Future<void> _loadLiveChatMeta({bool silent = false}) async {
    if (!widget.isLiveChat) return;
    if (!silent && mounted) {
      setState(() => _loadingLiveChatMeta = true);
    }
    try {
      final api = ref.read(apiClientProvider);
      final results = await Future.wait([
        api.getLiveChatDialog(_resolvedDialogId),
        api.getLiveChatAgents(),
        api.getLiveChatGroups(),
      ]);
      final dialog = Map<String, dynamic>.from(results[0] as Map<String, dynamic>);
      final agents = (results[1] as List<dynamic>)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      final groups = (results[2] as List<dynamic>)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      final currentMeta = _dialogMeta;
      final currentAssignedCount =
          (currentMeta?['assignedTo'] as List<dynamic>?)?.length ?? 0;
      final nextAssignedCount =
          (dialog['assignedTo'] as List<dynamic>?)?.length ?? 0;
      final hasMeaningfulChange =
          currentMeta == null ||
          (currentMeta['updatedAt']?.toString() ?? '') !=
              (dialog['updatedAt']?.toString() ?? '') ||
          (currentMeta['status']?.toString() ?? '') !=
              (dialog['status']?.toString() ?? '') ||
          (currentMeta['groupId']?.toString() ?? '') !=
              (dialog['groupId']?.toString() ?? '') ||
          currentAssignedCount != nextAssignedCount ||
          _liveChatAgents.length != agents.length ||
          _liveChatGroups.length != groups.length;
      if (!mounted) return;
      if (silent && !hasMeaningfulChange) return;
      setState(() {
        _dialogMeta = dialog;
        _liveChatAgents = agents;
        _liveChatGroups = groups;
        _loadingLiveChatMeta = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loadingLiveChatMeta = false);
      if (!silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load live chat details: $error')),
        );
      }
    }
  }

  Future<void> _runChatMutation(
    Future<Map<String, dynamic>> Function(ApiClient api) mutate, {
    String? successMessage,
  }) async {
    if (_updatingChat) return;
    setState(() => _updatingChat = true);
    try {
      final updated = await mutate(ref.read(apiClientProvider));
      if (!mounted) return;
      setState(() {
        _dialogMeta = Map<String, dynamic>.from(updated);
      });
      await _loadMessages(refresh: true, silent: true);
      await _loadChatMeta(silent: true);
      if (mounted && successMessage != null && successMessage.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(successMessage)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Chat update failed: $error')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _updatingChat = false);
      }
    }
  }

  Future<void> _runLiveChatMutation(
    Future<void> Function(ApiClient api) mutate, {
    String? successMessage,
  }) async {
    if (_updatingLiveChat) return;
    setState(() => _updatingLiveChat = true);
    try {
      final api = ref.read(apiClientProvider);
      await mutate(api);
      await _loadMessages(refresh: true, silent: true);
      await _loadLiveChatMeta(silent: true);
      if (mounted && successMessage != null && successMessage.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(successMessage)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Live chat update failed: $error')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _updatingLiveChat = false);
      }
    }
  }

  Future<void> _assignLiveChatToMe() async {
    final currentUser = await ref.read(userProfileProvider.future);
    if (currentUser == null) return;
    await _runLiveChatMutation(
      (api) => api.assignLiveChatDialog(
        _resolvedDialogId,
        agentId: currentUser.id,
      ),
      successMessage: 'Conversation assigned to you.',
    );
  }

  Future<void> _pickGenericFile() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
      type: FileType.any,
    );
    if (result == null || result.files.isEmpty) return;

    final pickedAttachments = <_Attachment>[];
    for (final file in result.files) {
      final bytes = file.bytes ??
          (file.path != null ? await File(file.path!).readAsBytes() : null);
      if (bytes == null) continue;
      final mime = _inferMimeFromName(file.name);
      pickedAttachments.add(
        _Attachment(
          fileName: file.name,
          mimeType: mime,
          dataUrl: 'data:$mime;base64,${base64Encode(bytes)}',
          kind: _inferAttachmentKind(mime),
          sizeBytes: bytes.length,
          localPath: file.path,
          previewBytes: bytes,
        ),
      );
    }

    if (pickedAttachments.isEmpty || !mounted) return;
    setState(() {
      _pendingAttachments.addAll(pickedAttachments);
    });
  }

  Future<void> _showLiveChatAgentPicker({required bool transfer}) async {
    if (_liveChatAgents.isEmpty) {
      await _loadLiveChatMeta();
    }
    if (!mounted) return;
    final writeAgents = _liveChatAgents
        .where(
          (agent) =>
              agent['hasWrite'] == true || agent['hasManage'] == true,
        )
        .toList();
    if (writeAgents.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No eligible live chat agents found.')),
      );
      return;
    }

    final selectedAgentId = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              title: Text(transfer ? 'Transfer Conversation' : 'Assign Conversation'),
              subtitle: Text(
                transfer
                    ? 'Choose the agent who should receive this chat.'
                    : 'Choose the agent who should own this chat.',
              ),
            ),
            for (final agent in writeAgents)
              ListTile(
                leading: CircleAvatar(
                  child: Text(
                    (agent['name']?.toString().trim().isNotEmpty ?? false)
                        ? agent['name'].toString().trim()[0].toUpperCase()
                        : '?',
                  ),
                ),
                title: Text(agent['name']?.toString() ?? 'Agent'),
                subtitle: Text(
                  'Open chats: ${agent['openLoad'] ?? 0}'
                  '${agent['hasManage'] == true ? ' | Manager' : ''}',
                ),
                onTap: () => Navigator.of(sheetContext).pop(
                  agent['id']?.toString(),
                ),
              ),
          ],
        ),
      ),
    );

    if (selectedAgentId == null || selectedAgentId.isEmpty) return;
    await _runLiveChatMutation(
      (api) => transfer
          ? api.transferLiveChatDialog(
              _resolvedDialogId,
              agentId: selectedAgentId,
            )
          : api.assignLiveChatDialog(
              _resolvedDialogId,
              agentId: selectedAgentId,
            ),
      successMessage: transfer
          ? 'Conversation transferred.'
          : 'Conversation assigned.',
    );
  }

  Future<void> _showQueuePicker() async {
    if (_liveChatGroups.isEmpty) {
      await _loadLiveChatMeta();
    }
    if (!mounted) return;

    final selectedGroupId = await showModalBottomSheet<String?>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(
              title: Text('Change Queue'),
              subtitle: Text('Choose which live chat queue this conversation belongs to.'),
            ),
            ListTile(
              leading: const Icon(Icons.clear_all_rounded),
              title: const Text('No queue'),
              onTap: () => Navigator.of(sheetContext).pop(''),
            ),
            for (final group in _liveChatGroups)
              ListTile(
                leading: const Icon(Icons.hub_outlined),
                title: Text(group['name']?.toString() ?? 'Queue'),
                subtitle: Text(
                  'Open chats: ${group['openCount'] ?? 0}',
                ),
                onTap: () => Navigator.of(sheetContext).pop(
                  group['id']?.toString(),
                ),
              ),
          ],
        ),
      ),
    );

    if (!mounted || selectedGroupId == null) return;
    await _runLiveChatMutation(
      (api) => api.updateLiveChatDialog(
        _resolvedDialogId,
        {
          'groupId': selectedGroupId.isEmpty ? null : selectedGroupId,
        },
      ),
      successMessage: 'Queue updated.',
    );
  }

  Future<void> _toggleLiveChatStatus() async {
    final status = (_dialogMeta?['status'] ?? 'open').toString().toLowerCase();
    final nextStatus = status == 'closed' ? 'open' : 'closed';
    await _runLiveChatMutation(
      (api) => api.updateLiveChatDialog(
        _resolvedDialogId,
        {'status': nextStatus},
      ),
      successMessage: nextStatus == 'closed'
          ? 'Conversation closed.'
          : 'Conversation reopened.',
    );
  }

  Future<void> _showLiveChatInsights() async {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => FutureBuilder<Map<String, dynamic>>(
        future: ref.read(apiClientProvider).getLiveChatInsights(_resolvedDialogId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Failed to load AI insights: ${snapshot.error}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            );
          }
          final data = snapshot.data ?? const <String, dynamic>{};
          final highlights =
              (data['highlights'] as List<dynamic>? ?? const []).cast<dynamic>();
          final recommendations =
              (data['recommendations'] as List<dynamic>? ?? const []).cast<dynamic>();
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'AI Insights',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    data['summary']?.toString().trim().isNotEmpty == true
                        ? data['summary'].toString()
                        : 'No summary available.',
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _InsightChip(
                        label:
                            'Sentiment: ${data['sentiment']?.toString() ?? 'unknown'}',
                      ),
                      _InsightChip(
                        label: 'Intent: ${data['intent']?.toString() ?? 'unknown'}',
                      ),
                      _InsightChip(
                        label:
                            'Urgency: ${(data['urgencyScore'] ?? 0).toString()}',
                      ),
                    ],
                  ),
                  if (highlights.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text(
                      'Highlights',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    for (final item in highlights)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text('- ${item.toString()}'),
                      ),
                  ],
                  if (recommendations.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text(
                      'Recommendations',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    for (final item in recommendations)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text('- ${item.toString()}'),
                      ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ─── Load messages ────────────────────────────────────────────────────────

  Future<void> _renameConversation() async {
    final controller = TextEditingController(
      text: (_dialogMeta?['subject'] ?? '').toString(),
    );

    try {
      final nextTitle = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Rename Conversation'),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Title',
              hintText: 'Conversation title',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text.trim()),
              child: const Text('Save'),
            ),
          ],
        ),
      );

      if (!mounted || nextTitle == null) return;
      await _runChatMutation(
        (api) => api.updateChatDialog(
          _resolvedDialogId,
          {
            'subject': nextTitle.isEmpty ? null : nextTitle,
          },
        ),
        successMessage: 'Conversation updated.',
      );
    } finally {
      controller.dispose();
    }
  }

  Future<void> _toggleChatStatus() async {
    final status = (_dialogMeta?['status'] ?? 'open').toString().toLowerCase();
    final nextStatus = status == 'closed' ? 'open' : 'closed';
    await _runChatMutation(
      (api) => api.updateChatDialog(
        _resolvedDialogId,
        {'status': nextStatus},
      ),
      successMessage:
          nextStatus == 'closed' ? 'Conversation closed.' : 'Conversation reopened.',
    );
  }

  Future<void> _deleteMessageAsAdmin(Map<String, dynamic> message) async {
    if (widget.isLiveChat) return;
    final messageId = message['id']?.toString() ?? '';
    if (messageId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove Message'),
        content: const Text(
          'This will replace the message with an administrator removal notice.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      final updated =
          await ref.read(apiClientProvider).deleteChatMessage(messageId);
      if (!mounted) return;
      setState(() {
        _messages = _mergeMessagesAscending(_messages, [updated]);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message removed.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to remove message: $error')),
      );
    }
  }

  Future<void> _forwardMessage(Map<String, dynamic> message) async {
    if (widget.isLiveChat) return;

    final payload = message['payload'];
    if (payload is Map<String, dynamic>) {
      final type = payload['type']?.toString().toLowerCase() ?? '';
      if (type == 'deleted') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Deleted messages cannot be forwarded.')),
        );
        return;
      }
    }

    final currentUserId = ref.read(userProfileProvider).value?.id;
    try {
      final dialogs = await ref.read(apiClientProvider).getChatDialogs();
      if (!mounted) return;

      final availableDialogs = dialogs
          .whereType<Map<String, dynamic>>()
          .where((dialog) => !_shouldHideForwardDialog(dialog, currentUserId))
          .toList();

      if (availableDialogs.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No conversations available to forward to.')),
        );
        return;
      }

      final selectedDialogId = await showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(
                title: const Text('Forward Message'),
                subtitle: Text(_messagePreviewForForward(message)),
              ),
              for (final dialog in availableDialogs)
                ListTile(
                  leading: UserAvatar(
                    name: _conversationTitleFromDialog(dialog, currentUserId),
                    photoUrl:
                        _findPeerUserFromDialog(dialog, currentUserId)?['photoUrl']
                            ?.toString(),
                    radius: 18,
                  ),
                  title: Text(
                    _conversationTitleFromDialog(dialog, currentUserId),
                  ),
                  subtitle: Text(
                    (dialog['group'] is Map<String, dynamic>)
                        ? (dialog['group']['name']?.toString() ?? '')
                        : '',
                  ),
                  onTap: () => Navigator.of(sheetContext).pop(
                    dialog['id']?.toString(),
                  ),
                ),
            ],
          ),
        ),
      );

      if (!mounted || selectedDialogId == null || selectedDialogId.isEmpty) {
        return;
      }

      final attachments = payload is Map<String, dynamic>
          ? (payload['attachments'] as List<dynamic>? ?? const [])
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : const <Map<String, dynamic>>[];
      final text = payload is Map<String, dynamic>
          ? payload['text']?.toString() ?? ''
          : _parseContent(message['content'] ?? message['text']);

      final forwarded = await ref.read(apiClientProvider).sendMessage(
            selectedDialogId,
            text,
            attachments: attachments,
            forwardedFrom: {
              'id': message['id']?.toString() ?? '',
              'senderName': _senderName(message),
            },
          );

      if (!mounted) return;
      if (selectedDialogId == _resolvedDialogId) {
        setState(() {
          _messages = _mergeMessagesAscending(_messages, [forwarded]);
        });
        _scrollToBottom(animated: true);
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message forwarded.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to forward message: $error')),
      );
    }
  }

  Future<void> _showMessageActions(
    Map<String, dynamic> message, {
    required bool isMe,
  }) async {
    final currentUser = ref.read(userProfileProvider).value;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(
                _messagePreviewForForward(message),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(isMe ? 'Your message' : _senderName(message)),
            ),
            ListTile(
              leading: const Icon(Icons.reply_rounded),
              title: const Text('Reply'),
              onTap: () => Navigator.of(sheetContext).pop('reply'),
            ),
            if (!widget.isLiveChat)
              ListTile(
                leading: const Icon(Icons.forward_rounded),
                title: const Text('Forward'),
                onTap: () => Navigator.of(sheetContext).pop('forward'),
              ),
            if (!widget.isLiveChat && currentUser?.isAdmin == true)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded),
                title: const Text('Remove as admin'),
                onTap: () => Navigator.of(sheetContext).pop('delete'),
              ),
          ],
        ),
      ),
    );

    if (!mounted || action == null) return;

    switch (action) {
      case 'reply':
        setState(() => _replyingTo = message);
        break;
      case 'forward':
        await _forwardMessage(message);
        break;
      case 'delete':
        await _deleteMessageAsAdmin(message);
        break;
    }
  }

  Future<void> _loadMessages({bool refresh = false, bool silent = false}) async {
    if (refresh && !silent) {
      setState(() {
        _loading = true;
        _oldestMessageTime = null;
        _hasMore = true;
      });
    }
    try {
      final api = ref.read(apiClientProvider);
      final dialogId = _resolvedDialogId;
      final page = widget.isLiveChat
          ? await api.getLiveChatMessagesPage(dialogId)
          : await api.getChatMessagesPage(dialogId);
      final rawItems = page['items'] as List<dynamic>? ?? const <dynamic>[];
      final hasMore = page['hasMore'] == true;
      final msgs = _sortMessagesAscending(
        rawItems.whereType<Map<String, dynamic>>(),
      );
      final nextMessages = refresh
          ? (silent ? _mergeMessagesAscending(_messages, msgs) : msgs)
          : _mergeMessagesAscending(_messages, msgs);
      final messagesChanged = !_sameMessageCollection(_messages, nextMessages);
      final computedOldest = nextMessages.isNotEmpty
          ? nextMessages.first['createdAt']?.toString()
          : null;
      final nextOldest = silent ? _oldestMessageTime : computedOldest;
      final oldestChanged = _oldestMessageTime != nextOldest;
      final nextHasMore = silent ? _hasMore : hasMore;
      final shouldStick = refresh &&
          (_messages.isEmpty || _isNearBottom()) &&
          messagesChanged;
      if (mounted) {
        final requiresStateUpdate =
            !silent || messagesChanged || (_hasMore != nextHasMore) || oldestChanged || _loading;
        if (requiresStateUpdate) {
          setState(() {
            _messages = nextMessages;
            _hasMore = nextHasMore;
            _oldestMessageTime = nextOldest;
            _loading = false;
          });
        }
        if (shouldStick) {
          _scrollToBottom(animated: false);
        }
        if (!silent || messagesChanged) {
          await _markConversationNotificationsRead();
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        if (!silent) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to load messages: $e')),
          );
        }
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final previousScrollOffset =
          _scrollCtrl.hasClients ? _scrollCtrl.position.pixels : 0.0;
      final previousScrollExtent =
          _scrollCtrl.hasClients ? _scrollCtrl.position.maxScrollExtent : 0.0;
      final api = ref.read(apiClientProvider);
      final page = widget.isLiveChat
          ? await api.getLiveChatMessagesPage(
              _resolvedDialogId,
              before: _oldestMessageTime,
            )
          : await api.getChatMessagesPage(
              _resolvedDialogId,
              before: _oldestMessageTime,
            );
      final rawItems = page['items'] as List<dynamic>? ?? const <dynamic>[];
      final hasMore = page['hasMore'] == true;
      final msgs = _sortMessagesAscending(
        rawItems.whereType<Map<String, dynamic>>(),
      );
      if (mounted) {
        setState(() {
          _messages = _mergeMessagesAscending(_messages, msgs);
          _hasMore = hasMore;
          if (_messages.isNotEmpty) {
            _oldestMessageTime = _messages.first['createdAt']?.toString();
          }
          _loadingMore = false;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!_scrollCtrl.hasClients) return;
          final nextExtent = _scrollCtrl.position.maxScrollExtent;
          final delta = nextExtent - previousScrollExtent;
          _scrollCtrl.jumpTo(previousScrollOffset + delta);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  // ─── Send ─────────────────────────────────────────────────────────────────

  String _voiceTimerLabel() {
    final mins = (_voiceRecordingSeconds ~/ 60).toString().padLeft(2, '0');
    final secs = (_voiceRecordingSeconds % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  Future<void> _toggleVoiceRecording() async {
    if (_isRecordingVoice) {
      await _stopVoiceRecording(attach: true);
      return;
    }
    await _startVoiceRecording();
  }

  Future<void> _startVoiceRecording() async {
    if (_sending || _isRecordingVoice) return;
    if (kIsWeb) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Voice recording is not supported on web.')),
        );
      }
      return;
    }

    final recorder = _voiceRecorder ?? AudioRecorder();
    _voiceRecorder = recorder;

    try {
      var hasPermission = await recorder.hasPermission();
      if (!hasPermission) {
        final micPermission = await Permission.microphone.request();
        hasPermission = micPermission.isGranted || micPermission.isLimited;
      }
      if (!hasPermission) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Microphone permission is required.')),
          );
        }
        return;
      }

      final tempDir = await getTemporaryDirectory();
      final path =
          '${tempDir.path}${Platform.pathSeparator}voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      await recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: path,
      );

      _voiceTicker?.cancel();
      _voiceTicker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted || !_isRecordingVoice) return;
        setState(() => _voiceRecordingSeconds += 1);
      });

      if (mounted) {
        setState(() {
          _isRecordingVoice = true;
          _voiceRecordingSeconds = 0;
        });
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not start recording: $error')),
        );
      }
    }
  }

  Future<void> _stopVoiceRecording({required bool attach}) async {
    final recorder = _voiceRecorder;
    if (recorder == null) return;

    _voiceTicker?.cancel();
    final durationSec = _voiceRecordingSeconds;

    String? path;
    try {
      path = await recorder.stop();
    } catch (_) {
      path = null;
    }

    if (mounted) {
      setState(() {
        _isRecordingVoice = false;
        _voiceRecordingSeconds = 0;
      });
    } else {
      _isRecordingVoice = false;
      _voiceRecordingSeconds = 0;
    }

    if (!attach || path == null || path.isEmpty) return;

    try {
      final file = File(path);
      if (!await file.exists()) return;
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) return;
      const mime = 'audio/mp4';
      final fileName =
          'voice-${DateTime.now().millisecondsSinceEpoch}.m4a';
      if (!mounted) return;
      setState(() {
        _pendingAttachments.add(
          _Attachment(
            fileName: fileName,
            mimeType: mime,
            dataUrl: 'data:$mime;base64,${base64Encode(bytes)}',
            kind: 'audio',
            sizeBytes: bytes.length,
            localPath: path,
            durationSec: durationSec > 0 ? durationSec.toDouble() : null,
          ),
        );
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save voice note: $error')),
        );
      }
    }
  }

  void _startLiveChatTypingLoop() {
    if (!widget.isLiveChat) return;
    _liveChatTypingPollTimer?.cancel();
    _liveChatTypingPollTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) {
      _pollLiveChatTyping();
    });
    _pollLiveChatTyping();
  }

  Future<void> _pollLiveChatTyping() async {
    if (!widget.isLiveChat || _resolvedDialogId.isEmpty) return;
    try {
      final typers =
          await ref.read(apiClientProvider).getLiveChatTyping(_resolvedDialogId);
      if (!mounted) return;
      setState(() {
        _liveChatTypingUsers = typers;
      });
    } catch (_) {
      // Best-effort typing indicator.
    }
  }

  Future<void> _sendLiveChatTypingHeartbeat() async {
    if (!widget.isLiveChat || _resolvedDialogId.isEmpty) return;
    try {
      final me = ref.read(userProfileProvider).value;
      final fullName = me?.fullname ?? '';
      final name = fullName.trim().isNotEmpty ? fullName : me?.name;
      await ref.read(apiClientProvider).sendLiveChatTyping(
            _resolvedDialogId,
            name: name,
          );
    } catch (_) {
      // Best-effort typing indicator.
    }
  }

  void _handleComposerChanged(String value) {
    if (!widget.isLiveChat) return;
    if (value.trim().isEmpty) return;
    _liveChatTypingDebounce?.cancel();
    _liveChatTypingDebounce =
        Timer(const Duration(milliseconds: 300), _sendLiveChatTypingHeartbeat);
  }

  bool _isLiveChatAssignmentError(Object error) {
    if (error is DioException) {
      final status = error.response?.statusCode;
      final data = error.response?.data;
      final apiError = data is Map ? (data['error']?.toString() ?? '') : '';
      if (status == 403 &&
          apiError.toLowerCase().contains('assigned agent')) {
        return true;
      }
    }
    final text = error.toString().toLowerCase();
    return text.contains('only assigned agent') ||
        text.contains('assigned agent can send');
  }

  Future<Map<String, dynamic>?> _assignToMeAndRetryLiveChatSend({
    required String text,
    required List<Map<String, dynamic>> attachments,
    Map<String, dynamic>? replyTo,
  }) async {
    if (!widget.isLiveChat) return null;
    final me = await ref.read(userProfileProvider.future);
    if (me == null) return null;

    final api = ref.read(apiClientProvider);
    await api.assignLiveChatDialog(_resolvedDialogId, agentId: me.id);
    final retried = await api.sendLiveChatMessage(
      _resolvedDialogId,
      text,
      attachments: attachments,
      replyTo: replyTo,
    );
    return retried;
  }

  Future<void> _sendMessage() async {
    if (_isRecordingVoice) {
      await _stopVoiceRecording(attach: true);
    }

    final text = _inputCtrl.text.trim();
    if ((text.isEmpty && _pendingAttachments.isEmpty) || _sending) return;

    final pendingSnapshot = List<_Attachment>.from(_pendingAttachments);
    final attachments = pendingSnapshot.map((a) => a.toJson()).toList();
    final replyTo = _replyingTo != null
        ? {
            'id': (_replyingTo!['id'] ?? '').toString(),
            'text': _extractText(_replyingTo!),
            'senderName': _senderName(_replyingTo!),
          }
        : null;

    _inputCtrl.clear();
    setState(() {
      _sending = true;
      _replyingTo = null;
      _pendingAttachments.clear();
      _showEmoji = false;
    });

    try {
      final api = ref.read(apiClientProvider);
      Map<String, dynamic> result = widget.isLiveChat
          ? await api.sendLiveChatMessage(
              _resolvedDialogId,
              text,
              attachments: attachments,
              replyTo: replyTo,
            )
          : await api.sendMessage(_resolvedDialogId, text,
              attachments: attachments, replyTo: replyTo);

      if (widget.isLiveChat) {
        await _sendLiveChatTypingHeartbeat();
      }
      if (mounted) {
        setState(() => _messages = _mergeMessagesAscending(_messages, [result]));
        _scrollToBottom(animated: true);
        if (widget.isLiveChat) {
          await _loadLiveChatMeta(silent: true);
        } else {
          await _loadChatMeta(silent: true);
        }
      }
    } catch (e) {
      var recovered = false;
      if (widget.isLiveChat && _isLiveChatAssignmentError(e)) {
        try {
          final retried = await _assignToMeAndRetryLiveChatSend(
            text: text,
            attachments: attachments,
            replyTo: replyTo,
          );
          if (retried != null && mounted) {
            setState(() => _messages = _mergeMessagesAscending(_messages, [retried]));
            _scrollToBottom(animated: true);
            await _loadLiveChatMeta(silent: true);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Auto-assigned to you. Message sent successfully.'),
              ),
            );
            recovered = true;
          }
        } catch (_) {
          recovered = false;
        }
      }

      if (mounted) {
        if (!recovered) {
          _inputCtrl.text = text;
          setState(() {
            _pendingAttachments
              ..clear()
              ..addAll(pendingSnapshot);
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to send: $e')),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  // ─── Emoji ────────────────────────────────────────────────────────────────

  void _toggleEmoji() {
    setState(() => _showEmoji = !_showEmoji);
    if (_showEmoji) FocusScope.of(context).unfocus();
  }

  void _onEmojiSelected(Category? category, Emoji emoji) {
    final text = _inputCtrl.text;
    final sel = _inputCtrl.selection;
    final base = sel.baseOffset < 0 ? text.length : sel.baseOffset;
    final newText = text.substring(0, base) + emoji.emoji + text.substring(base);
    _inputCtrl.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: base + emoji.emoji.length),
    );
    _handleComposerChanged(newText);
  }

  // ─── Image attachment ─────────────────────────────────────────────────────

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: source, imageQuality: 80);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final b64 = base64Encode(bytes);
    final mime = file.mimeType ?? 'image/jpeg';
    setState(() {
      _pendingAttachments.add(_Attachment(
        fileName: file.name,
        mimeType: mime,
        dataUrl: 'data:$mime;base64,$b64',
        kind: 'image',
        sizeBytes: bytes.length,
        localPath: file.path,
        previewBytes: bytes,
      ));
    });
  }

  void _showAttachMenu() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_rounded, color: _kPrimary),
              title: const Text('Photo Library'),
              onTap: () { Navigator.pop(context); _pickImage(ImageSource.gallery); },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_rounded, color: _kPrimary),
              title: const Text('Camera'),
              onTap: () { Navigator.pop(context); _pickImage(ImageSource.camera); },
            ),
            ListTile(
              leading: Icon(
                _isRecordingVoice ? Icons.stop_circle_rounded : Icons.mic_rounded,
                color: _isRecordingVoice ? Colors.red : _kPrimary,
              ),
              title: Text(_isRecordingVoice ? 'Stop Voice Note' : 'Voice Note'),
              subtitle: _isRecordingVoice
                  ? Text('Recording ${_voiceTimerLabel()}')
                  : null,
              onTap: () {
                Navigator.pop(context);
                _toggleVoiceRecording();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_rounded, color: _kPrimary),
              title: const Text('Files'),
              onTap: () { Navigator.pop(context); _pickGenericFile(); },
            ),
          ],
        ),
      ),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  String _extractText(Map<String, dynamic> msg) {
    final payload = msg['payload'];
    if (payload is Map) return (payload['text'] ?? '').toString();
    return _parseContent(msg['content'] ?? msg['text']);
  }

  String _senderName(Map<String, dynamic> msg) {
    final user = msg['user'];
    if (user is Map) return (user['fullname'] ?? user['name'] ?? '').toString();
    return '';
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(userProfileProvider).value;
    final activeDialog = _dialogMeta ?? widget.dialog;
    final chatStatus =
        (_dialogMeta?['status'] ?? 'open').toString().toLowerCase();
    final liveChatStatus = chatStatus;
    final isLiveChatClosed = widget.isLiveChat && liveChatStatus == 'closed';
    final primaryPeer = widget.isLiveChat
        ? null
        : _findPeerUserFromDialog(activeDialog, currentUser?.id);
    final isGroupConversation = widget.isLiveChat
        ? false
        : _isGroupConversationDialog(activeDialog);
    final groupMap = activeDialog?['group'] is Map
        ? Map<String, dynamic>.from(activeDialog?['group'] as Map)
        : null;
    final groupName = groupMap?['name']?.toString();
    final memberCount =
        (activeDialog?['members'] as List<dynamic>? ?? const []).length;
    final headerSubtitle = widget.isLiveChat
        ? [
            if (liveChatStatus.isNotEmpty)
              liveChatStatus[0].toUpperCase() + liveChatStatus.substring(1),
            if (groupName != null && groupName.isNotEmpty) 'Queue: $groupName',
          ].join(' | ')
        : isGroupConversation
            ? [
                if (memberCount > 0)
                  '$memberCount participant${memberCount == 1 ? '' : 's'}',
                if (groupName != null && groupName.isNotEmpty)
                  'Channel: $groupName',
                if (chatStatus.isNotEmpty)
                  'Status: ${chatStatus[0].toUpperCase()}${chatStatus.substring(1)}',
              ].join(' | ')
            : _formatPresenceLabel(primaryPeer?['lastActivity']?.toString());
    final statusColor = widget.isLiveChat
        ? (isLiveChatClosed ? Colors.grey.shade500 : Colors.green.shade400)
        : (primaryPeer != null
            ? (_isRecentlyOnline(primaryPeer['lastActivity']?.toString())
                ? Colors.green.shade400
                : Colors.grey.shade400)
            : (chatStatus == 'closed'
                ? Colors.grey.shade400
                : Colors.green.shade400));
    final assignedTo =
        (_dialogMeta?['assignedTo'] as List<dynamic>? ?? const <dynamic>[]);
    final assignedNames = assignedTo
        .whereType<Map>()
        .map((item) => item['name']?.toString() ?? '')
        .where((name) => name.isNotEmpty)
        .join(', ');
    final queueName = (_dialogMeta?['group'] is Map)
        ? (Map<String, dynamic>.from(_dialogMeta?['group'] as Map))['name']
            ?.toString()
        : null;
    final visitorEmail = _dialogMeta?['visitorEmail']?.toString();
    Map<String, dynamic>? currentAgent;
    if (currentUser != null) {
      for (final agent in _liveChatAgents) {
        if (agent['id']?.toString() == currentUser.id) {
          currentAgent = agent;
          break;
        }
      }
    }
    final canManageLiveChat =
        currentUser?.isAdmin == true || currentAgent?['hasManage'] == true;
    final canWriteLiveChat =
        canManageLiveChat || currentAgent?['hasWrite'] == true;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: statusColor,
                shape: BoxShape.circle,
                border: Border.all(
                  color: Theme.of(context).colorScheme.surface,
                  width: 1.5,
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _dialogTitle,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (headerSubtitle.isNotEmpty)
                    Text(
                      widget.isLiveChat && assignedNames.isNotEmpty
                          ? [
                              headerSubtitle,
                              'Assigned: $assignedNames',
                            ].where((item) => item.isNotEmpty).join(' | ')
                          : headerSubtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.white70,
                          ),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _refreshConversation,
            icon: const Icon(Icons.refresh_rounded),
          ),
          if (widget.isLiveChat)
            _loadingLiveChatMeta || _updatingLiveChat
                ? const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Center(
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  )
                : PopupMenuButton<_LiveChatMenuAction>(
                    onSelected: (action) {
                      switch (action) {
                        case _LiveChatMenuAction.assignToMe:
                          _assignLiveChatToMe();
                          break;
                        case _LiveChatMenuAction.assign:
                          _showLiveChatAgentPicker(transfer: false);
                          break;
                        case _LiveChatMenuAction.transfer:
                          _showLiveChatAgentPicker(transfer: true);
                          break;
                        case _LiveChatMenuAction.changeQueue:
                          _showQueuePicker();
                          break;
                        case _LiveChatMenuAction.toggleStatus:
                          _toggleLiveChatStatus();
                          break;
                        case _LiveChatMenuAction.insights:
                          _showLiveChatInsights();
                          break;
                      }
                    },
                    itemBuilder: (_) => [
                      if (canWriteLiveChat)
                        const PopupMenuItem(
                          value: _LiveChatMenuAction.assignToMe,
                          child: Text('Assign to me'),
                        ),
                      if (canManageLiveChat)
                        const PopupMenuItem(
                          value: _LiveChatMenuAction.assign,
                          child: Text('Assign to agent'),
                        ),
                      if (canWriteLiveChat)
                        const PopupMenuItem(
                          value: _LiveChatMenuAction.transfer,
                          child: Text('Transfer'),
                        ),
                      if (canManageLiveChat)
                        const PopupMenuItem(
                          value: _LiveChatMenuAction.changeQueue,
                          child: Text('Change queue'),
                        ),
                      const PopupMenuItem(
                        value: _LiveChatMenuAction.toggleStatus,
                        child: Text('Open / Close'),
                      ),
                      const PopupMenuItem(
                        value: _LiveChatMenuAction.insights,
                        child: Text('AI insights'),
                      ),
                    ],
                  )
          else if (_loadingChatMeta || _updatingChat)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            )
          else
            PopupMenuButton<_ChatMenuAction>(
              onSelected: (action) {
                switch (action) {
                  case _ChatMenuAction.rename:
                    _renameConversation();
                    break;
                  case _ChatMenuAction.toggleStatus:
                    _toggleChatStatus();
                    break;
                }
              },
              itemBuilder: (_) => [
                if (isGroupConversation)
                  const PopupMenuItem(
                    value: _ChatMenuAction.rename,
                    child: Text('Rename conversation'),
                  ),
                PopupMenuItem(
                  value: _ChatMenuAction.toggleStatus,
                  child: Text(
                    chatStatus == 'closed'
                        ? 'Reopen conversation'
                        : 'Close conversation',
                  ),
                ),
              ],
            ),
        ],
      ),
      body: Column(
        children: [
          if (widget.isLiveChat)
            _LiveChatHeader(
              status: liveChatStatus,
              queueName: queueName,
              assignedNames: assignedNames,
              visitorEmail: visitorEmail,
            ),

          Expanded(
            child: _loading
                ? const ShimmerList(count: 6)
                : RefreshIndicator(
                    onRefresh: _refreshConversation,
                    child: _messages.isEmpty
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              SizedBox(
                                height: MediaQuery.of(context).size.height * 0.45,
                              ),
                              _EmptyMessages(dialogTitle: _dialogTitle),
                            ],
                          )
                        : ListView.builder(
                            controller: _scrollCtrl,
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            itemCount: _messages.length + (_loadingMore ? 1 : 0),
                            itemBuilder: (ctx, i) {
                              if (_loadingMore && i == 0) {
                                return const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(
                                    child: SizedBox(
                                      width: 24,
                                      height: 24,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    ),
                                  ),
                                );
                              }
                              final messageIndex = _loadingMore ? i - 1 : i;
                              final msg = _messages[messageIndex];
                              final isMe = currentUser != null &&
                                  msg['userId']?.toString() == currentUser.id;
                              final showDay = messageIndex == 0 ||
                                  _formatDayLabel(msg['createdAt']?.toString()) !=
                                      _formatDayLabel(
                                        _messages[messageIndex - 1]['createdAt']
                                            ?.toString(),
                                      );

                              return Column(
                                children: [
                                  if (showDay)
                                    _DaySeparator(
                                      label: _formatDayLabel(
                                        msg['createdAt']?.toString(),
                                      ),
                                    ),
                                  GestureDetector(
                                    onLongPress: () =>
                                        _showMessageActions(msg, isMe: isMe),
                                    onHorizontalDragEnd: (details) {
                                      if (details.primaryVelocity != null &&
                                          details.primaryVelocity! < -100) {
                                        setState(() => _replyingTo = msg);
                                      }
                                    },
                                    child: _MessageBubble(
                                      message: msg,
                                      isMe: isMe,
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                  ),
          ),

          if (widget.isLiveChat && _liveChatTypingUsers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 2, 14, 6),
              child: Row(
                children: [
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${_liveChatTypingUsers.join(", ")} ${_liveChatTypingUsers.length == 1 ? "is" : "are"} typing…',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ],
              ),
            ),

          if (_replyingTo != null)
            _ReplyBar(
              senderName: _senderName(_replyingTo!),
              text: _extractText(_replyingTo!),
              onCancel: () => setState(() => _replyingTo = null),
            ),

          if (_pendingAttachments.isNotEmpty)
            _AttachmentPreview(
              attachments: _pendingAttachments,
              onRemove: (i) => setState(() => _pendingAttachments.removeAt(i)),
            ),

          _InputBar(
            controller: _inputCtrl,
            sending: _sending,
            showEmoji: _showEmoji,
            onSend: _sendMessage,
            onToggleEmoji: _toggleEmoji,
            onAttach: _showAttachMenu,
            onToggleVoiceRecording: _toggleVoiceRecording,
            recordingVoice: _isRecordingVoice,
            recordingSeconds: _voiceRecordingSeconds,
            onChanged: _handleComposerChanged,
          ),

          if (_showEmoji)
            SizedBox(
              height: 280,
              child: EmojiPicker(
                onEmojiSelected: _onEmojiSelected,
                config: Config(
                  emojiViewConfig: EmojiViewConfig(
                    backgroundColor: Theme.of(context).colorScheme.surface,
                    emojiSizeMax:
                        28 * (kIsWeb ? 1.0 : (Platform.isIOS ? 1.20 : 1.0)),
                  ),
                  categoryViewConfig: const CategoryViewConfig(
                    indicatorColor: _kPrimary,
                    iconColorSelected: _kPrimary,
                  ),
                  searchViewConfig: const SearchViewConfig(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Attachment model ─────────────────────────────────────────────────────────

class _Attachment {
  final String fileName;
  final String mimeType;
  final String dataUrl;
  final String kind;
  final int sizeBytes;
  final double? durationSec;
  final String? localPath;
  final Uint8List? previewBytes;

  _Attachment({
    required this.fileName,
    required this.mimeType,
    required this.dataUrl,
    required this.kind,
    required this.sizeBytes,
    this.durationSec,
    this.localPath,
    this.previewBytes,
  });

  Map<String, dynamic> toJson() => {
    'fileName': fileName,
    'mimeType': mimeType,
    'dataUrl': dataUrl,
    'kind': kind,
    'sizeBytes': sizeBytes,
    if (durationSec != null) 'durationSec': durationSec,
  };
}

// ─── Day separator ────────────────────────────────────────────────────────────

class _DaySeparator extends StatelessWidget {
  final String label;
  const _DaySeparator({required this.label});

  @override
  Widget build(BuildContext context) {
    if (label.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
        ),
        const Expanded(child: Divider()),
      ]),
    );
  }
}

// ─── Reply bar ────────────────────────────────────────────────────────────────

class _ReplyBar extends StatelessWidget {
  final String senderName;
  final String text;
  final VoidCallback onCancel;

  const _ReplyBar({required this.senderName, required this.text, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh,
        border: Border(top: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.4))),
      ),
      child: Row(children: [
        Container(width: 3, height: 36, decoration: BoxDecoration(color: _kPrimary, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(senderName.isNotEmpty ? senderName : 'Message',
                style: const TextStyle(color: _kPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
            Text(text, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurface.withValues(alpha: 0.7))),
          ]),
        ),
        IconButton(icon: const Icon(Icons.close, size: 18), onPressed: onCancel, padding: EdgeInsets.zero),
      ]),
    );
  }
}

// ─── Attachment preview strip ─────────────────────────────────────────────────

class _AttachmentPreview extends StatelessWidget {
  final List<_Attachment> attachments;
  final void Function(int) onRemove;

  const _AttachmentPreview({required this.attachments, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 90,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      color: Theme.of(context).colorScheme.surfaceContainerHigh,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: attachments.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final a = attachments[i];
          return Stack(children: [
            Container(
              width: 88,
              height: 78,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(10),
              ),
              child: a.kind == 'image'
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: a.localPath != null
                          ? Image.file(
                              File(a.localPath!),
                              width: 88,
                              height: 78,
                              fit: BoxFit.cover,
                            )
                          : (a.previewBytes != null
                              ? Image.memory(
                                  a.previewBytes!,
                                  width: 88,
                                  height: 78,
                                  fit: BoxFit.cover,
                                )
                              : const SizedBox.shrink()),
                    )
                  : Padding(
                      padding: const EdgeInsets.all(8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.insert_drive_file_outlined),
                          const SizedBox(height: 8),
                          Text(
                            a.fileName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                        ],
                      ),
                    ),
            ),
            Positioned(
              top: 2, right: 2,
              child: GestureDetector(
                onTap: () => onRemove(i),
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                  child: const Icon(Icons.close, size: 14, color: Colors.white),
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

// ─── Empty messages ───────────────────────────────────────────────────────────

class _LiveChatHeader extends StatelessWidget {
  final String status;
  final String? queueName;
  final String assignedNames;
  final String? visitorEmail;

  const _LiveChatHeader({
    required this.status,
    required this.queueName,
    required this.assignedNames,
    required this.visitorEmail,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final chips = <Widget>[
      _InsightChip(
        label: status.isEmpty
            ? 'Status: unknown'
            : 'Status: ${status[0].toUpperCase()}${status.substring(1)}',
      ),
      if (queueName != null && queueName!.isNotEmpty)
        _InsightChip(label: 'Queue: $queueName'),
      if (assignedNames.isNotEmpty)
        _InsightChip(label: 'Assigned: $assignedNames'),
      if (visitorEmail != null && visitorEmail!.isNotEmpty)
        _InsightChip(label: visitorEmail!),
    ];

    if (chips.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      color: cs.surface,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: chips,
      ),
    );
  }
}

class _InsightChip extends StatelessWidget {
  final String label;

  const _InsightChip({required this.label});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium,
      ),
    );
  }
}

class _EmptyMessages extends StatelessWidget {
  final String dialogTitle;
  const _EmptyMessages({required this.dialogTitle});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: cs.surfaceContainerHighest,
            child: Icon(Icons.chat_bubble_outline_rounded, size: 36, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Text(dialogTitle,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('No messages yet. Say hello!',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
              textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}

// ─── Message bubble ───────────────────────────────────────────────────────────

class _MessageBubble extends StatelessWidget {
  final Map<String, dynamic> message;
  final bool isMe;

  const _MessageBubble({required this.message, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    final payload = message['payload'];
    final text = payload is Map
        ? (payload['text'] ?? '').toString()
        : _parseContent(message['content'] ?? message['text']);
    final timeStr = _formatMsgTime(message['createdAt']?.toString());

    final user = message['user'];
    final senderName = user is Map ? (user['fullname'] ?? user['name'] ?? '').toString() : '';
    final senderPhoto = user is Map ? user['photoUrl'] as String? : null;

    // Reply-to
    final replyTo = payload is Map ? payload['replyTo'] as Map? : null;
    final forwardedFrom =
        payload is Map ? payload['forwardedFrom'] as Map? : null;
    final seenByUserIds =
        payload is Map ? (payload['seenByUserIds'] as List<dynamic>? ?? []) : <dynamic>[];
    final isDeleted =
        payload is Map && (payload['type']?.toString().toLowerCase() == 'deleted');

    // Attachments
    final attachments = payload is Map ? (payload['attachments'] as List<dynamic>? ?? []) : <dynamic>[];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMe) ...[
            UserAvatar(name: senderName.isNotEmpty ? senderName : '?', photoUrl: senderPhoto, radius: 16),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
              child: _BubbleContent(
                isMe: isMe,
                text: text,
                time: timeStr,
                senderName: senderName,
                replyTo: replyTo,
                forwardedFrom: forwardedFrom,
                attachments: attachments,
                isDeleted: isDeleted,
                seenByCount: seenByUserIds.length,
                cs: cs,
              ),
            ),
          ),
          if (!isMe) const SizedBox(width: 40),
          if (isMe) const SizedBox(width: 6),
        ],
      ),
    );
  }
}

class _LinkifiedMessageText extends StatefulWidget {
  final String text;
  final TextStyle style;
  final Color linkColor;

  const _LinkifiedMessageText({
    required this.text,
    required this.style,
    required this.linkColor,
  });

  @override
  State<_LinkifiedMessageText> createState() => _LinkifiedMessageTextState();
}

class _LinkifiedMessageTextState extends State<_LinkifiedMessageText> {
  final List<TapGestureRecognizer> _recognizers = [];

  void _disposeRecognizers() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _disposeRecognizers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _disposeRecognizers();
    final spans = <InlineSpan>[];
    var cursor = 0;

    for (final match in _urlRegex.allMatches(widget.text)) {
      final raw = match.group(0) ?? '';
      final start = match.start;
      final end = match.end;
      if (start > cursor) {
        spans.add(
          TextSpan(
            text: widget.text.substring(cursor, start),
            style: widget.style,
          ),
        );
      }

      final cleaned = raw.replaceFirst(RegExp(r'[),.;!?]+$'), '');
      final trailing = raw.substring(cleaned.length);
      final normalized = _normalizeUrlCandidate(cleaned);

      if (normalized == null) {
        spans.add(TextSpan(text: raw, style: widget.style));
      } else {
        final recognizer = TapGestureRecognizer()
          ..onTap = () => _openExternalUrl(context, normalized);
        _recognizers.add(recognizer);
        spans.add(
          TextSpan(
            text: cleaned,
            style: widget.style.copyWith(
              color: widget.linkColor,
              decoration: TextDecoration.underline,
            ),
            recognizer: recognizer,
          ),
        );
        if (trailing.isNotEmpty) {
          spans.add(TextSpan(text: trailing, style: widget.style));
        }
      }

      cursor = end;
    }

    if (cursor < widget.text.length) {
      spans.add(TextSpan(text: widget.text.substring(cursor), style: widget.style));
    }

    return RichText(
      text: TextSpan(style: widget.style, children: spans),
      softWrap: true,
    );
  }
}

class _UrlPreviewCard extends StatelessWidget {
  final String url;
  final bool isMe;
  final ColorScheme cs;
  final Color fg;

  const _UrlPreviewCard({
    required this.url,
    required this.isMe,
    required this.cs,
    required this.fg,
  });

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(url);
    final host = uri?.host.isNotEmpty == true ? uri!.host : url;
    final path = uri == null
        ? ''
        : '${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}';
    final isImage = _isImageUrl(url);

    return InkWell(
      onTap: () => _openExternalUrl(context, url),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: isMe ? Colors.white24 : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isImage)
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  url,
                  height: 120,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            Text(
              host,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: fg,
              ),
            ),
            if (path.isNotEmpty)
              Text(
                path,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  color: isMe ? Colors.white70 : cs.onSurface.withValues(alpha: 0.6),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BubbleContent extends StatelessWidget {
  final bool isMe;
  final String text;
  final String time;
  final String senderName;
  final Map? replyTo;
  final Map? forwardedFrom;
  final List<dynamic> attachments;
  final bool isDeleted;
  final int seenByCount;
  final ColorScheme cs;

  const _BubbleContent({
    required this.isMe,
    required this.text,
    required this.time,
    required this.senderName,
    required this.replyTo,
    required this.forwardedFrom,
    required this.attachments,
    required this.isDeleted,
    required this.seenByCount,
    required this.cs,
  });

  @override
  Widget build(BuildContext context) {
    final bg = isMe ? _kPrimary : cs.surfaceContainerHigh;
    final fg = isMe ? Colors.white : cs.onSurface;
    final fgMuted = isMe ? Colors.white70 : cs.onSurface.withValues(alpha: 0.5);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(18),
          topRight: const Radius.circular(18),
          bottomLeft: Radius.circular(isMe ? 18 : 4),
          bottomRight: Radius.circular(isMe ? 4 : 18),
        ),
      ),
      child: Column(
        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // Sender name (others only)
          if (!isMe && senderName.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(senderName,
                  style: const TextStyle(color: _kPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
            ),

          if (forwardedFrom != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                'Forwarded',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isMe ? Colors.white70 : cs.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),

          // Reply preview
          if (replyTo != null)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: isMe ? Colors.white24 : cs.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
                border: Border(left: BorderSide(color: isMe ? Colors.white54 : _kPrimary, width: 3)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  (replyTo!['senderName'] ?? 'Message').toString(),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                      color: isMe ? Colors.white70 : _kPrimary),
                ),
                Text(
                  (replyTo!['text'] ?? '').toString(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: fgMuted),
                ),
              ]),
            ),

          if (!isDeleted)
            for (final rawAttachment in attachments)
              if (rawAttachment is Map)
              Builder(
                builder: (context) {
                  final attachment = Map<String, dynamic>.from(rawAttachment);
                  final kind = attachment['kind']?.toString() ??
                      _inferAttachmentKind(
                        attachment['mimeType']?.toString() ?? '',
                      );
                  final fileName =
                      attachment['fileName']?.toString() ?? 'Attachment';
                  final dataUrl = attachment['dataUrl']?.toString() ?? '';
                  final imageBytes = dataUrl.startsWith('data:')
                      ? _decodeDataUrlBytes(dataUrl)
                      : null;

                  if (kind == 'image' && dataUrl.isNotEmpty) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: GestureDetector(
                        onTap: () => _openAttachment(context, attachment),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: imageBytes != null
                              ? Image.memory(
                                  imageBytes,
                                  width: 200,
                                  fit: BoxFit.cover,
                                )
                              : Image.network(
                                  dataUrl,
                                  width: 200,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 200,
                                    padding: const EdgeInsets.all(12),
                                    color: isMe
                                        ? Colors.white24
                                        : cs.surfaceContainerHighest,
                                    child: Text(
                                      fileName,
                                      style: TextStyle(color: fg),
                                    ),
                                  ),
                                ),
                        ),
                      ),
                    );
                  }

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: dataUrl.isEmpty
                          ? null
                          : () => _openAttachment(context, attachment),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: isMe
                              ? Colors.white24
                              : cs.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.attach_file_rounded,
                              size: 18,
                              color: fg,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                fileName,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: fg),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),

          // Text
          if (isDeleted)
            Text(
              'This message was removed by administrator.',
              style: TextStyle(
                color: fgMuted,
                fontSize: 14,
                fontStyle: FontStyle.italic,
              ),
            )
          else if (text.isNotEmpty)
            Column(
              crossAxisAlignment:
                  isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                _LinkifiedMessageText(
                  text: text,
                  style: TextStyle(color: fg, fontSize: 14.5, height: 1.35),
                  linkColor: isMe ? Colors.white : Colors.blue.shade700,
                ),
                for (final previewUrl in _extractUniqueUrls(text, max: 2))
                  _UrlPreviewCard(
                    url: previewUrl,
                    isMe: isMe,
                    cs: cs,
                    fg: fg,
                  ),
              ],
            ),

          // Time
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(time, style: TextStyle(color: fgMuted, fontSize: 11)),
              if (isMe) ...[
                const SizedBox(width: 4),
                Icon(
                  Icons.done_all_rounded,
                  size: 14,
                  color: seenByCount > 1 ? Colors.lightBlue.shade200 : fgMuted,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Input bar ────────────────────────────────────────────────────────────────

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final bool showEmoji;
  final bool recordingVoice;
  final int recordingSeconds;
  final VoidCallback onSend;
  final VoidCallback onToggleEmoji;
  final VoidCallback onAttach;
  final VoidCallback onToggleVoiceRecording;
  final ValueChanged<String>? onChanged;

  const _InputBar({
    required this.controller,
    required this.sending,
    required this.showEmoji,
    required this.recordingVoice,
    required this.recordingSeconds,
    required this.onSend,
    required this.onToggleEmoji,
    required this.onAttach,
    required this.onToggleVoiceRecording,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final mins = (recordingSeconds ~/ 60).toString().padLeft(2, '0');
    final secs = (recordingSeconds % 60).toString().padLeft(2, '0');
    final recordingLabel = '$mins:$secs';

    return SafeArea(
      child: Container(
        decoration: BoxDecoration(
          color: cs.surface,
          border: Border(top: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5))),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: recordingVoice
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        const Icon(Icons.mic_rounded, size: 14, color: Colors.red),
                        const SizedBox(width: 6),
                        Text(
                          'Recording $recordingLabel',
                          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: Colors.red.shade700,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          'Tap mic to stop',
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: cs.onSurface.withValues(alpha: 0.65),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  
                  // Emoji toggle
                  IconButton(
                    icon: Icon(showEmoji ? Icons.keyboard_rounded : Icons.emoji_emotions_outlined,
                        color: _kPrimary),
                    onPressed: onToggleEmoji,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                  ),
                  // Attachment
                  IconButton(
                    icon: const Icon(Icons.attach_file_rounded, color: _kPrimary),
                    onPressed: onAttach,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                  ),
                  IconButton(
                    icon: Icon(
                      recordingVoice ? Icons.stop_circle_rounded : Icons.mic_none_rounded,
                      color: recordingVoice ? Colors.red : _kPrimary,
                    ),
                    onPressed: onToggleVoiceRecording,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 4),
                  // Text field
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: cs.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: TextField(
                        controller: controller,
                        onChanged: onChanged,
                        minLines: 1,
                        maxLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: 'Type a message...',
                          hintStyle: TextStyle(color: cs.onSurface.withValues(alpha: 0.45)),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          isDense: true,
                        ),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Send
                  sending
                      ? const SizedBox(
                          width: 44, height: 44,
                          child: Padding(
                            padding: EdgeInsets.all(10),
                            child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimary),
                          ))
                      : Material(
                          color: _kPrimary,
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: onSend,
                            child: const SizedBox(
                              width: 44, height: 44,
                              child: Icon(Icons.send_rounded, color: Colors.white, size: 20),
                            ),
                          ),
                        ),
                ]),
                ],
              )
            : Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          // Emoji toggle
          IconButton(
            icon: Icon(showEmoji ? Icons.keyboard_rounded : Icons.emoji_emotions_outlined,
                color: _kPrimary),
            onPressed: onToggleEmoji,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(),
          ),
          // Attachment
          IconButton(
            icon: const Icon(Icons.attach_file_rounded, color: _kPrimary),
            onPressed: onAttach,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(),
          ),
          IconButton(
            icon: Icon(
              recordingVoice ? Icons.stop_circle_rounded : Icons.mic_none_rounded,
              color: recordingVoice ? Colors.red : _kPrimary,
            ),
            onPressed: onToggleVoiceRecording,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(),
          ),
          const SizedBox(width: 4),
          // Text field
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: cs.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: controller,
                onChanged: onChanged,
                minLines: 1,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: 'Type a message...',
                  hintStyle: TextStyle(color: cs.onSurface.withValues(alpha: 0.45)),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  isDense: true,
                ),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Send
          sending
              ? const SizedBox(
                  width: 44, height: 44,
                  child: Padding(
                    padding: EdgeInsets.all(10),
                    child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimary),
                  ))
              : Material(
                  color: _kPrimary,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onSend,
                    child: const SizedBox(
                      width: 44, height: 44,
                      child: Icon(Icons.send_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ),
        ]),
      ),
    );
  }
}
