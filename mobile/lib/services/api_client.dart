import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'runtime_config.dart';

// ─── Server URL — change only this line to point to your server ──────────────
String get kBaseUrl => RuntimeConfig.instance.apiBaseUrl;

String? resolveServerUrl(String? value) {
  if (value == null || value.trim().isEmpty) return null;
  return RuntimeConfig.instance.resolveUrl(value);
}

List<String> _chatMemberIds(Map<String, dynamic> dialog) {
  final members = dialog['members'] as List<dynamic>? ?? const [];
  final ids = <String>{};
  for (final member in members) {
    if (member is! Map<String, dynamic>) continue;
    final userId =
        member['userId']?.toString() ??
        (member['user'] as Map<String, dynamic>?)?['id']?.toString() ??
        '';
    if (userId.isNotEmpty) {
      ids.add(userId);
    }
  }
  return ids.toList()..sort();
}

String? _canonicalChatSubject(Map<String, dynamic> dialog) {
  final raw = dialog['subject']?.toString().trim();
  if (raw == null || raw.isEmpty) return null;
  final lower = raw.toLowerCase();
  if (lower == 'direct' || lower == 'direct chat' || lower.startsWith('direct:')) {
    return null;
  }
  return raw;
}

Map<String, dynamic> _withCanonicalChatSubject(Map<String, dynamic> dialog) {
  final canonical = _canonicalChatSubject(dialog);
  if (canonical == dialog['subject']) return dialog;
  return {
    ...dialog,
    'subject': canonical,
  };
}

String? _directChatKey(Map<String, dynamic> dialog) {
  if (dialog['isExternal'] == true) return null;
  if (dialog['groupId'] != null || dialog['organizationId'] != null) return null;
  if (_canonicalChatSubject(dialog) != null) return null;

  final ids = _chatMemberIds(dialog);
  if (ids.length != 2) return null;
  return ids.join(':');
}

bool _isMalformedDirectChatDialog(Map<String, dynamic> dialog) {
  if (dialog['isExternal'] == true) return false;
  if (dialog['groupId'] != null || dialog['organizationId'] != null) return false;
  if (_canonicalChatSubject(dialog) != null) return false;
  return _chatMemberIds(dialog).length <= 1;
}

int _chatDialogRank(Map<String, dynamic> dialog) {
  final messages = dialog['messages'] as List<dynamic>? ?? const [];
  var score = messages.isNotEmpty ? 4 : 0;
  if (_canonicalChatSubject(dialog) == null) score += 2;
  return score;
}

List<dynamic> _dedupeChatDialogs(List<dynamic> dialogs) {
  final result = <dynamic>[];
  final directDialogs = <String, Map<String, dynamic>>{};

  for (final row in dialogs) {
    if (row is! Map<String, dynamic>) {
      result.add(row);
      continue;
    }

    final normalized = _withCanonicalChatSubject(row);
    if (_isMalformedDirectChatDialog(normalized)) {
      continue;
    }
    final key = _directChatKey(normalized);
    if (key == null) {
      result.add(normalized);
      continue;
    }

    final existing = directDialogs[key];
    if (existing == null || _chatDialogRank(normalized) > _chatDialogRank(existing)) {
      directDialogs[key] = normalized;
    }
  }

  result.addAll(directDialogs.values);
  result.sort((a, b) {
    if (a is! Map<String, dynamic> || b is! Map<String, dynamic>) return 0;
    final aTime = DateTime.tryParse(a['updatedAt']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);
    final bTime = DateTime.tryParse(b['updatedAt']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);
    return bTime.compareTo(aTime);
  });
  return result;
}

class ApiClient {
  late final Dio _dio;

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: kBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      responseType: ResponseType.json,
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        const storage = FlutterSecureStorage();
        final token = await storage.read(key: 'auth_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        // Only set Content-Type for requests with a body (POST, PUT, PATCH).
        // GET/DELETE/HEAD must NOT have Content-Type — Windows http.sys rejects them.
        // Skip for FormData — Dio sets the multipart boundary automatically.
        final method = options.method.toUpperCase();
        if (method == 'POST' || method == 'PUT' || method == 'PATCH') {
          if (options.data is! FormData) {
            options.contentType = 'application/json';
          }
        }
        handler.next(options);
      },
      onError: (error, handler) {
        // Do NOT wipe storage here — wiping on 401 removes the token so every
        // subsequent request also has no Authorization header, creating a loop.
        // The authStateProvider handles sign-out when the user explicitly logs out.
        handler.next(error);
      },
    ));

    // ── Debug logger ────────────────────────────────────────────────────────
    _dio.interceptors.add(LogInterceptor(
      requestHeader: true,
      requestBody: true,
      responseHeader: true,
      responseBody: true,
      error: true,
      logPrint: (o) => debugPrint('[DIO] $o'),
    ));
  }

  // ─── Auth ───────────────────────────────────────────────
  Future<Map<String, dynamic>> mobileLogin(Map<String, dynamic> body) async {
    final res = await _dio.post('/auth/mobile', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getPublicBranding() async {
    final res = await _dio.get('/public/branding');
    return res.data as Map<String, dynamic>;
  }

  // ─── Tasks ──────────────────────────────────────────────
  Future<dynamic> getTasks({
    String? status,
    String? view,   // 'overview' | 'personal' | 'assigned' | 'groups'
    int page = 1,
    int limit = 20,
  }) async {
    final res = await _dio.get('/tasks', queryParameters: {
      if (status != null) 'status': status,
      if (view != null) 'view': view,
      'page': page,
      'limit': limit,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> getTask(String id) async {
    final res = await _dio.get('/tasks/$id');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createTask(Map<String, dynamic> body) async {
    final res = await _dio.post('/tasks', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateTask(String id, Map<String, dynamic> body) async {
    final res = await _dio.patch('/tasks/$id', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteTask(String id) async {
    final res = await _dio.delete('/tasks/$id');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getTaskComments(String id) async {
    final res = await _dio.get('/tasks/$id/comments');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> addTaskComment(String id, String text) async {
    final res = await _dio.post('/tasks/$id/comments', data: {'content': text});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getTasksMeta() async {
    final res = await _dio.get('/tasks/meta');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getTaskInsights() async {
    final res = await _dio.get('/tasks/insights');
    return res.data as Map<String, dynamic>;
  }

  // ─── Chat ───────────────────────────────────────────────
  Future<List<dynamic>> getChatDialogs({
    String? groupId,
    String? status,
    String? search,
  }) async {
    final res = await _dio.get('/chat/dialogs', queryParameters: {
      if (groupId != null && groupId.isNotEmpty && groupId != 'all')
        'groupId': groupId,
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    final rows = (res.data as List<dynamic>)
        .map((item) => item is Map ? Map<String, dynamic>.from(item) : item)
        .toList();
    return _dedupeChatDialogs(rows);
  }

  Future<Map<String, dynamic>> createChatDialog({
    List<String> memberIds = const [],
    String? subject,
    String? groupId,
    String? organizationId,
  }) async {
    final res = await _dio.post('/chat/dialogs', data: {
      'memberIds': memberIds,
      if (subject != null) 'subject': subject,
      if (groupId != null) 'groupId': groupId,
      if (organizationId != null) 'organizationId': organizationId,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getChatDialog(String dialogId) async {
    final res = await _dio.get('/chat/dialogs/$dialogId');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getChatMessages(String dialogId, {String? before}) async {
    final res = await _dio.get('/chat/dialogs/$dialogId/messages',
        queryParameters: {
          if (before != null) 'before': before,
        });
    final data = res.data;
    if (data is Map) return (data['items'] ?? []) as List<dynamic>;
    return data as List<dynamic>;
  }

  Future<Map<String, dynamic>> sendMessage(
    String dialogId,
    String text, {
    List<Map<String, dynamic>> attachments = const [],
    Map<String, dynamic>? replyTo,
    Map<String, dynamic>? forwardedFrom,
  }) async {
    final res = await _dio.post('/chat/dialogs/$dialogId/messages', data: {
      'content': text,
      if (attachments.isNotEmpty) 'attachments': attachments,
      if (replyTo != null) 'replyTo': replyTo,
      if (forwardedFrom != null) 'forwardedFrom': forwardedFrom,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getChatUsers() async {
    final res = await _dio.get('/chat/users');
    return res.data as List<dynamic>;
  }

  Future<List<dynamic>> getChatGroups() async {
    final res = await _dio.get('/chat/groups');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> createChatGroup({
    required String name,
    String? description,
    bool isPublic = false,
  }) async {
    final res = await _dio.post('/chat/groups', data: {
      'name': name,
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      'isPublic': isPublic,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateChatDialog(
    String dialogId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.put('/chat/dialogs/$dialogId', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteChatMessage(String messageId) async {
    final res = await _dio.delete('/chat/messages/$messageId');
    return res.data as Map<String, dynamic>;
  }

  // ─── LiveChat ────────────────────────────────────────────
  Future<List<dynamic>> getLiveChatDialogs({
    String? status,
    String? queue,
    String? groupId,
    String? search,
    int limit = 150,
  }) async {
    final res = await _dio.get('/livechat/dialogs', queryParameters: {
      // Always send status; 'all' returns every dialog regardless of state
      'status': status ?? 'open',
      if (queue != null && queue.isNotEmpty) 'queue': queue,
      if (groupId != null && groupId.isNotEmpty) 'groupId': groupId,
      if (search != null && search.isNotEmpty) 'search': search,
      'limit': limit,
    });
    final data = res.data;
    if (data is Map) return (data['items'] ?? []) as List<dynamic>;
    return data as List<dynamic>;
  }

  Future<Map<String, dynamic>> getLiveChatDialog(String dialogId) async {
    final res = await _dio.get('/livechat/dialogs/$dialogId');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getLiveChatMessages(String dialogId, {String? before}) async {
    final res = await _dio.get('/livechat/dialogs/$dialogId/messages',
        queryParameters: {
          if (before != null) 'before': before,
        });
    final data = res.data;
    if (data is Map) return (data['items'] ?? []) as List<dynamic>;
    return data as List<dynamic>;
  }

  Future<Map<String, dynamic>> sendLiveChatMessage(
    String dialogId,
    String text, {
    List<Map<String, dynamic>> attachments = const [],
    Map<String, dynamic>? replyTo,
  }) async {
    final res = await _dio.post('/livechat/dialogs/$dialogId/messages',
        data: {
          'content': text,
          if (attachments.isNotEmpty) 'attachments': attachments,
          if (replyTo != null) 'replyTo': replyTo,
        });
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getLiveChatAgents() async {
    final res = await _dio.get('/livechat/agents');
    final data = res.data;
    if (data is Map) return (data['items'] ?? []) as List<dynamic>;
    return data as List<dynamic>;
  }

  Future<List<dynamic>> getLiveChatAgentStatuses() async {
    final res = await _dio.get('/livechat/agent-status');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> updateLiveChatAgentStatus(String status) async {
    final res = await _dio.put('/livechat/agent-status', data: {'status': status});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> assignLiveChatDialog(
    String dialogId, {
    required String agentId,
  }) async {
    final res = await _dio.post('/livechat/dialogs/$dialogId/assign',
        data: {'agentId': agentId});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> transferLiveChatDialog(
    String dialogId, {
    required String agentId,
  }) async {
    final res = await _dio.post('/livechat/dialogs/$dialogId/transfer',
        data: {'agentId': agentId});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateLiveChatDialog(
    String dialogId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.put('/livechat/dialogs/$dialogId', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getLiveChatInsights(String dialogId) async {
    final res = await _dio.get('/livechat/dialogs/$dialogId/insights');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createLiveChatDialog(Map<String, dynamic> body) async {
    final res = await _dio.post('/livechat/dialogs', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getLiveChatOverview() async {
    final res = await _dio.get('/livechat/overview');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getLiveChatGroups() async {
    final res = await _dio.get('/livechat/groups');
    final data = res.data;
    if (data is Map) return (data['items'] ?? []) as List<dynamic>;
    return data as List<dynamic>;
  }

  // ─── Board ──────────────────────────────────────────────
  Future<List<dynamic>> getBoardTopics() async {
    final res = await _dio.get('/board');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> getBoardTopic(String id) async {
    final res = await _dio.get('/board/$id');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getBoardCategories() async {
    final res = await _dio.get('/board/categories');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> createBoardTopic(Map<String, dynamic> body) async {
    final res = await _dio.post('/board', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createBoardPost(String topicId, String content) async {
    final res = await _dio.post('/board/$topicId/posts', data: {'content': content});
    return res.data as Map<String, dynamic>;
  }

  // ─── Contacts ───────────────────────────────────────────
  Future<dynamic> getContacts({String? search, int page = 1}) async {
    final res = await _dio.get('/contacts', queryParameters: {
      if (search != null && search.isNotEmpty) 'search': search,
      'page': page,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> getContact(String id) async {
    final res = await _dio.get('/contacts/$id');
    return res.data as Map<String, dynamic>;
  }

  // ─── Organizations (Clients) ─────────────────────────────
  Future<Map<String, dynamic>> getClients({String? search, int page = 1}) async {
    final res = await _dio.get('/clients', queryParameters: {
      if (search != null && search.isNotEmpty) 'search': search,
      'page': page,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getClient(String id) async {
    final res = await _dio.get('/clients/$id');
    return res.data as Map<String, dynamic>;
  }

  // ─── Projects ───────────────────────────────────────────
  Future<List<dynamic>> getProjects({
    String? search,
    String? status,
    String? categoryId,
    int limit = 200,
  }) async {
    final res = await _dio.get('/projects', queryParameters: {
      if (search != null && search.isNotEmpty) 'search': search,
      if (status != null && status.isNotEmpty && status != 'all') 'status': status,
      if (categoryId != null && categoryId.isNotEmpty && categoryId != 'all')
        'categoryId': categoryId,
      'limit': limit,
    });
    final data = res.data;
    if (data is List<dynamic>) return data;
    if (data is Map && data['items'] is List) {
      return List<dynamic>.from(data['items'] as List);
    }
    return const [];
  }

  Future<Map<String, dynamic>> getProject(String id) async {
    final res = await _dio.get('/projects/$id');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createProject(Map<String, dynamic> body) async {
    final res = await _dio.post('/projects', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProject(
    String projectId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.put('/projects/$projectId', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteProject(String projectId) async {
    final res = await _dio.delete('/projects/$projectId');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getProjectPhases(String id) async {
    final res = await _dio.get('/projects/$id/phases');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> getProjectTasks(
    String id, {
    String? phaseId,
    String? status,
    String? assigneeId,
  }) async {
    final res = await _dio.get('/projects/$id/tasks', queryParameters: {
      if (phaseId != null && phaseId.isNotEmpty) 'phaseId': phaseId,
      if (status != null && status.isNotEmpty) 'status': status,
      if (assigneeId != null && assigneeId.isNotEmpty) 'assigneeId': assigneeId,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createProjectTask(
    String projectId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.post('/projects/$projectId/tasks', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProjectTask(
    String projectId,
    String taskId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.put('/projects/$projectId/tasks/$taskId', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteProjectTask(
    String projectId,
    String taskId,
  ) async {
    final res = await _dio.delete('/projects/$projectId/tasks/$taskId');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> addProjectMember(
    String projectId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.post('/projects/$projectId/members', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteProjectMember(
    String projectId,
    String memberId,
  ) async {
    final res = await _dio.delete('/projects/$projectId/members/$memberId');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createProjectPhase(
    String projectId,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.post('/projects/$projectId/phases', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteProjectPhase(
    String projectId,
    String phaseId,
  ) async {
    final res = await _dio.delete('/projects/$projectId/phases/$phaseId');
    return res.data as Map<String, dynamic>;
  }

  // ─── Documents ──────────────────────────────────────────
  Future<Map<String, dynamic>> getDocuments({
    String? folderId,
    String? search,
    String category = 'all',
  }) async {
    final res = await _dio.get('/documents', queryParameters: {
      if (folderId != null) 'folderId': folderId,
      if (search != null && search.isNotEmpty) 'search': search,
      'category': category,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getDocument(String id) async {
    final res = await _dio.get('/documents/$id');
    return res.data as Map<String, dynamic>;
  }

  Future<void> downloadToFile({
    required String url,
    required String savePath,
    void Function(int received, int total)? onReceiveProgress,
  }) async {
    final resolvedUrl = resolveServerUrl(url) ?? url;
    final uri = Uri.tryParse(resolvedUrl);
    if (uri == null) {
      throw Exception('Invalid download URL');
    }

    await _dio.downloadUri(
      uri,
      savePath,
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(minutes: 2),
      ),
      onReceiveProgress: onReceiveProgress,
    );
  }

  Future<void> downloadDocumentToFile({
    required String documentId,
    required String savePath,
    void Function(int received, int total)? onReceiveProgress,
  }) async {
    await _dio.download(
      '/documents/$documentId/download',
      savePath,
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(minutes: 2),
      ),
      onReceiveProgress: onReceiveProgress,
    );
  }

  Future<Map<String, dynamic>> createDocumentFolder({
    required String name,
    String? parentId,
    String accessLevel = 'private',
  }) async {
    final res = await _dio.post('/documents', data: {
      'type': 'folder',
      'name': name,
      if (parentId != null) 'parentId': parentId,
      'accessLevel': accessLevel,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getDocumentFolders() async {
    final res = await _dio.get('/documents/folders');
    return res.data as List<dynamic>;
  }

  /// Upload a file and create a Document record.
  /// [filePath] — absolute path on device.
  /// [fileName] — original file name (with extension).
  /// [mimeType] — MIME type string.
  /// [fileSize] — file size in bytes.
  Future<Map<String, dynamic>> uploadDocument({
    required String filePath,
    required String fileName,
    required String mimeType,
    required int fileSize,
    String? folderId,
    String accessLevel = 'private',
    void Function(int sent, int total)? onProgress,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        filePath,
        filename: fileName,
        contentType: DioMediaType.parse(mimeType),
      ),
      if (folderId != null) 'folderId': folderId,
      'accessLevel': accessLevel,
    });

    final res = await _dio.post(
      '/documents/upload',
      data: formData,
      options: Options(
        headers: {'Content-Type': 'multipart/form-data'},
      ),
      onSendProgress: onProgress,
    );
    return res.data as Map<String, dynamic>;
  }

  Future<void> deleteDocument(String id) async {
    await _dio.delete('/documents/$id');
  }

  Future<void> deleteDocumentFolder(String id) async {
    await _dio.delete('/documents/folders/$id');
  }

  Future<List<dynamic>> getDocumentShareUsers({
    String? search,
    int limit = 200,
  }) async {
    final res = await _dio.get('/documents/share-users', queryParameters: {
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      'limit': limit,
    });
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> getDocumentShareSettings(
    String documentId,
  ) async {
    final res = await _dio.get('/documents/$documentId/share');
    return res.data as Map<String, dynamic>;
  }

  Future<void> updateDocumentShareSettings({
    required String documentId,
    required String accessLevel,
    required List<Map<String, dynamic>> shares,
  }) async {
    await _dio.put('/documents/$documentId/share', data: {
      'accessLevel': accessLevel,
      'shares': shares,
    });
  }

  Future<Map<String, dynamic>> getFolderShareSettings(String folderId) async {
    final res = await _dio.get('/documents/folders/$folderId/share');
    return res.data as Map<String, dynamic>;
  }

  Future<void> updateFolderShareSettings({
    required String folderId,
    required String accessLevel,
    required List<Map<String, dynamic>> shares,
  }) async {
    await _dio.put('/documents/folders/$folderId/share', data: {
      'accessLevel': accessLevel,
      'shares': shares,
    });
  }

  // ─── Notifications ──────────────────────────────────────
  Future<Map<String, dynamic>> getNotifications({
    int page = 1,
    int? limit,
    bool unreadOnly = false,
  }) async {
    final res = await _dio.get('/notifications', queryParameters: {
      'page': page,
      if (limit != null) 'limit': limit,
      if (unreadOnly) 'unreadOnly': true,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> markNotificationRead(String id) async {
    final res = await _dio.put('/notifications', data: {'id': id});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> markAllNotificationsRead() async {
    final res = await _dio.put('/notifications', data: {'all': true});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> markNotificationsReadLink(String link) async {
    final res = await _dio.put('/notifications', data: {'link': link});
    return res.data as Map<String, dynamic>;
  }

  // ─── Team ───────────────────────────────────────────────
  Future<List<dynamic>> getTeamUsers({String? search}) async {
    final res = await _dio.get('/team', queryParameters: {
      if (search != null && search.isNotEmpty) 'search': search,
    });
    return res.data as List<dynamic>;
  }

  // ─── Service Desk ────────────────────────────────────────
  Future<dynamic> getServiceDeskRequests({String? status}) async {
    final res = await _dio.get('/servicedesk', queryParameters: {
      if (status != null) 'status': status,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> getServiceDeskRequest(String id) async {
    final res = await _dio.get('/servicedesk/$id');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createServiceDeskRequest(Map<String, dynamic> body) async {
    final res = await _dio.post('/servicedesk', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getServiceDeskGroups() async {
    final res = await _dio.get('/servicedesk/groups');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> addServiceDeskComment(
      String id, String comment) async {
    final res = await _dio.post('/servicedesk/$id/comments',
        data: {'content': comment});
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateServiceDeskRequest(
      String id, Map<String, dynamic> body) async {
    final res = await _dio.put('/servicedesk/$id', data: body);
    return res.data as Map<String, dynamic>;
  }

  // ─── Calendar ────────────────────────────────────────────
  Future<List<dynamic>> getCalendarEvents({String? start, String? end}) async {
    final res = await _dio.get('/calendar/events', queryParameters: {
      if (start != null) 'start': start,
      if (end != null) 'end': end,
    });
    return res.data as List<dynamic>;
  }

  // ─── Search ──────────────────────────────────────────────
  Future<Map<String, dynamic>> search(String query) async {
    final res = await _dio.get('/search', queryParameters: {'q': query});
    return res.data as Map<String, dynamic>;
  }

  // ─── Account / Profile ───────────────────────────────────
  Future<Map<String, dynamic>> getProfile() async {
    final res = await _dio.get('/account/profile');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> body) async {
    final res = await _dio.put('/account/profile', data: body);
    return res.data as Map<String, dynamic>;
  }

  // ─── Permissions ─────────────────────────────────────────
  Future<Map<String, dynamic>> getPermissions() async {
    final res = await _dio.get('/permissions');
    return res.data as Map<String, dynamic>;
  }

  // ─── Home ────────────────────────────────────────────────
  Future<Map<String, dynamic>> getHomeStats() async {
    final res = await _dio.get('/home/stats');
    return res.data as Map<String, dynamic>;
  }

  // ─── Device token (FCM push) ─────────────────────────────
  Future<void> registerFcmToken(String token, {String platform = 'android'}) async {
    await _dio.post('/notifications/device-token',
        data: {'token': token, 'platform': platform});
  }

  Future<void> unregisterFcmToken(String token) async {
    await _dio.delete('/notifications/device-token', data: {'token': token});
  }

  Future<List<dynamic>> uploadTaskFiles(
    String taskId, {
    required List<String> filePaths,
    void Function(int sent, int total)? onProgress,
  }) async {
    final files = await Future.wait(
      filePaths.map((path) => MultipartFile.fromFile(path)),
    );
    final res = await _dio.post(
      '/tasks/$taskId/uploads',
      data: FormData.fromMap({'files': files}),
      onSendProgress: onProgress,
    );
    final data = res.data as Map<String, dynamic>;
    return (data['files'] as List<dynamic>? ?? const []);
  }

  Future<List<dynamic>> uploadServiceDeskFiles(
    String requestId, {
    required List<String> filePaths,
    void Function(int sent, int total)? onProgress,
  }) async {
    final files = await Future.wait(
      filePaths.map((path) => MultipartFile.fromFile(path)),
    );
    final res = await _dio.post(
      '/servicedesk/$requestId/uploads',
      data: FormData.fromMap({'files': files}),
      onSendProgress: onProgress,
    );
    final data = res.data as Map<String, dynamic>;
    return (data['files'] as List<dynamic>? ?? const []);
  }
}

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
