import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'auth_service.dart';
import '../utils/navigation.dart';
import '../utils/platform_support.dart';
import 'runtime_config.dart';

// ─── Background FCM handler (must be top-level) ──────────────────────────────

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (!PlatformSupport.supportsFirebasePush) return;
  await Firebase.initializeApp();
  // Show local notification for background/killed-state FCM messages
  await NotificationService._showFromRemoteMessage(message);
}

// ─── Notification channels (Android) ────────────────────────────────────────

const _taskChannel = AndroidNotificationChannel(
  'devotiondash_tasks',
  'Tasks',
  description: 'Task assignments and updates',
  importance: Importance.high,
);

const _chatChannel = AndroidNotificationChannel(
  'devotiondash_chat',
  'Chat Messages',
  description: 'New chat messages',
  importance: Importance.max,
  playSound: true,
);

const _liveChatChannel = AndroidNotificationChannel(
  'devotiondash_livechat',
  'Live Chat',
  description: 'New live chat messages and assignments',
  importance: Importance.max,
  playSound: true,
);

const _generalChannel = AndroidNotificationChannel(
  'devotiondash_general',
  'General',
  description: 'General workspace notifications',
  importance: Importance.defaultImportance,
);

// ─── Notification types ──────────────────────────────────────────────────────

enum NotifType { chat, task, mention, serviceDesk, general }

// ─── Service ─────────────────────────────────────────────────────────────────

class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static int _idCounter = 0;

  static int _nextId() => ++_idCounter;

  static bool _fcmAvailable = false;

  /// Call once in main() before runApp.
  static Future<void> init() async {
    if (!PlatformSupport.supportsFirebasePush) {
      await _initLocalNotifications();
      debugPrint(
        '[FCM] Skipping Firebase push setup on ${PlatformSupport.notificationPlatformName}.',
      );
      return;
    }

    // Register FCM background handler BEFORE Firebase.initializeApp
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    try {
      await Firebase.initializeApp();
      _fcmAvailable = true;
    } catch (e) {
      debugPrint(
        '[FCM] Firebase not configured — push disabled. Add google-services.json to enable. ($e)',
      );
    }
    // Always init local notifications (needed with or without FCM)
    await _initLocalNotifications();

    if (!_fcmAvailable) return; // Socket.io notifications still work

    // FCM: request permission (iOS / Android 13+)
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // FCM foreground: show heads-up on Android
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );

    // FCM foreground message handler
    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    // FCM notification opened (app was in background)
    FirebaseMessaging.onMessageOpenedApp.listen(_onNotificationOpenedApp);

    // Handle notification that launched the app from terminated state
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _handleRemoteMessageTap(initial);
  }

  // ─── Local notifications setup ─────────────────────────────────────────────

  static Future<void> _initLocalNotifications() async {
    if (!PlatformSupport.supportsLocalNotifications) {
      debugPrint(
        '[Notifications] Local notifications unavailable on ${PlatformSupport.notificationPlatformName}.',
      );
      return;
    }

    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    const darwinSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: androidSettings,
        iOS: darwinSettings,
        macOS: darwinSettings,
      ),
      onDidReceiveNotificationResponse: _onTap,
    );
    final androidPlugin = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await androidPlugin?.createNotificationChannel(_taskChannel);
    await androidPlugin?.createNotificationChannel(_chatChannel);
    await androidPlugin?.createNotificationChannel(_liveChatChannel);
    await androidPlugin?.createNotificationChannel(_generalChannel);
    await androidPlugin?.requestNotificationsPermission();
  }

  // ─── FCM token ─────────────────────────────────────────────────────────────

  /// Get the current FCM token. Register it with the server after login.
  static Future<String?> getFcmToken() async {
    if (!_fcmAvailable || !PlatformSupport.supportsPushTokenRegistration) {
      return null;
    }
    return FirebaseMessaging.instance.getToken();
  }

  // ─── FCM handlers ──────────────────────────────────────────────────────────

  static Future<void> _onForegroundMessage(RemoteMessage message) async {
    await _showFromRemoteMessage(message);
  }

  static void _onNotificationOpenedApp(RemoteMessage message) {
    _handleRemoteMessageTap(message);
  }

  static void _handleRemoteMessageTap(RemoteMessage message) {
    final payload = message.data['payload'] as String?;
    if (payload != null) navigateFromNotification(payload);
  }

  /// Shows a local notification from a FCM RemoteMessage (used in both
  /// foreground and background/killed-state contexts).
  static Future<void> _showFromRemoteMessage(RemoteMessage message) async {
    if (!PlatformSupport.supportsLocalNotifications) return;
    final notification = message.notification;
    final title =
        notification?.title ??
        message.data['title'] ??
        RuntimeConfig.instance.fallbackAppName;
    final body = notification?.body ?? message.data['body'] ?? '';
    final type = message.data['type'] as String?;
    final payload = message.data['payload'] as String?;

    final channelId = _channelIdForType(type);
    final channelName = _channelNameForType(type);

    await _plugin.show(
      id: _nextId(),
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelName,
          importance: type == 'chat' ? Importance.max : Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: payload,
    );
  }

  static String _channelIdForType(String? type) {
    final normalized = (type ?? '').toLowerCase();
    if (normalized == 'chat') return _chatChannel.id;
    if (normalized == 'livechat') return _liveChatChannel.id;
    if (normalized.startsWith('task')) return _taskChannel.id;
    switch (normalized) {
      case 'tasks':
      case 'task_comment':
      case 'task_reply':
        return _taskChannel.id;
    }
    return _generalChannel.id;
  }

  static String _channelNameForType(String? type) {
    final normalized = (type ?? '').toLowerCase();
    if (normalized == 'chat') return _chatChannel.name;
    if (normalized == 'livechat') return _liveChatChannel.name;
    if (normalized.startsWith('task')) return _taskChannel.name;
    switch (normalized) {
      case 'tasks':
      case 'task_comment':
      case 'task_reply':
        return _taskChannel.name;
    }
    return _generalChannel.name;
  }

  static void _onTap(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null) return;
    navigateFromNotification(payload);
  }

  // ─── Show helpers (used by Socket.io live events) ──────────────────────────

  static Future<void> showChat({
    required String sender,
    required String message,
    required String dialogId,
  }) async {
    if (!PlatformSupport.supportsLocalNotifications) return;
    await _plugin.show(
      id: _nextId(),
      title: sender,
      body: message,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _chatChannel.id,
          _chatChannel.name,
          channelDescription: _chatChannel.description,
          importance: Importance.max,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          styleInformation: BigTextStyleInformation(message),
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: 'chat:$dialogId',
    );
  }

  static Future<void> showLiveChat({
    required String title,
    required String body,
    required String dialogId,
  }) async {
    if (!PlatformSupport.supportsLocalNotifications) return;
    await _plugin.show(
      id: _nextId(),
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _liveChatChannel.id,
          _liveChatChannel.name,
          channelDescription: _liveChatChannel.description,
          importance: Importance.max,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: '/livechat?dialog=$dialogId',
    );
  }

  static Future<void> showTask({
    required String title,
    required String body,
    required String taskId,
  }) async {
    if (!PlatformSupport.supportsLocalNotifications) return;
    await _plugin.show(
      id: _nextId(),
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _taskChannel.id,
          _taskChannel.name,
          channelDescription: _taskChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: 'task:$taskId',
    );
  }

  static Future<void> showGeneral({
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!PlatformSupport.supportsLocalNotifications) return;
    await _plugin.show(
      id: _nextId(),
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _generalChannel.id,
          _generalChannel.name,
          channelDescription: _generalChannel.description,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
        ),
      ),
      payload: payload,
    );
  }

  static Future<void> clearAll() async {
    if (!PlatformSupport.supportsLocalNotifications) return;
    await _plugin.cancelAll();
  }
}

// ─── Socket notification listener ────────────────────────────────────────────

class SocketNotificationListener {
  io.Socket? _socket;
  final ApiClient _api = ApiClient();
  final Set<String> _knownNotificationIds = <String>{};
  final Map<String, DateTime> _recentDispatches = <String, DateTime>{};
  Timer? _pollTimer;
  bool _notificationBaselineReady = false;
  bool _pollingNotifications = false;

  void connect(String token) {
    disconnect();
    _socket = io.io(
      RuntimeConfig.instance.serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) => debugPrint('[Socket] Connected'));
    _socket!.onDisconnect((_) => debugPrint('[Socket] Disconnected'));

    // Chat message
    _socket!.on('chat:message', (data) {
      if (data is! Map) return;
      final d = Map<String, dynamic>.from(data);
      NotificationService.showChat(
        sender: d['senderName'] ?? 'New message',
        message: d['text'] ?? '',
        dialogId: d['dialogId'] ?? '',
      );
    });

    _socket!.on('livechat:message', (data) {
      if (data is! Map) return;
      final d = Map<String, dynamic>.from(data);
      final dialogId = d['dialogId']?.toString() ?? '';
      if (dialogId.isEmpty) return;
      final sender =
          d['senderName']?.toString() ??
          d['sender']?.toString() ??
          d['title']?.toString() ??
          'Live chat';
      final message =
          d['text']?.toString() ??
          d['body']?.toString() ??
          'New live chat message';
      NotificationService.showLiveChat(
        title: sender,
        body: message,
        dialogId: dialogId,
      );
    });

    // Task lifecycle + conversation notifications
    final taskEvents = <String>[
      'task:assigned',
      'task:updated',
      'task:created',
      'task:new',
      'task:changed',
      'task:status',
      'task:statusChanged',
      'task:open',
      'task:opened',
      'task:reopen',
      'task:reopened',
      'task:close',
      'task:closed',
      'task:comment',
      'task:commented',
      'task:reply',
      'task:replied',
    ];
    for (final event in taskEvents) {
      _socket!.on(event, (data) {
        if (data is! Map) return;
        final d = Map<String, dynamic>.from(data);
        final taskId = _taskIdFromPayloadData(d);
        if (taskId == null || taskId.isEmpty) return;
        final lowerEvent = event.toLowerCase();
        final title = _taskNotificationTitle(lowerEvent, d);
        final body = d['body']?.toString().trim().isNotEmpty == true
            ? d['body'].toString()
            : (d['title']?.toString().trim().isNotEmpty == true
                ? d['title'].toString()
                : 'Task activity requires your attention');
        final dedupeKey = 'socket:$lowerEvent:$taskId:$title:$body';
        if (!_shouldDispatch(dedupeKey, const Duration(seconds: 3))) return;
        NotificationService.showTask(
          title: title,
          body: body,
          taskId: taskId,
        );
      });
    }

    // General notification from server
    _socket!.on('notification', (data) {
      if (data is! Map) return;
      final d = Map<String, dynamic>.from(data);
      final payload = d['payload']?.toString() ?? d['link']?.toString();
      final dialogId = _dialogIdFromLink(payload);
      final type = d['type']?.toString() ?? '';
      final taskId = _taskIdFromAny(type, payload, d);
      if ((type == 'livechat' || (payload?.startsWith('/livechat') ?? false)) &&
          dialogId != null &&
          dialogId.isNotEmpty) {
        final dedupeKey = 'socket:livechat:$dialogId:${d['title']}:${d['body']}';
        if (!_shouldDispatch(dedupeKey, const Duration(seconds: 3))) return;
        NotificationService.showLiveChat(
          title: d['title'] ?? 'Live chat',
          body: d['body'] ?? 'New live chat activity',
          dialogId: dialogId,
        );
        return;
      }
      if (taskId != null && taskId.isNotEmpty) {
        final dedupeKey = 'socket:task:$taskId:${d['title']}:${d['body']}';
        if (!_shouldDispatch(dedupeKey, const Duration(seconds: 3))) return;
        NotificationService.showTask(
          title: d['title'] ?? 'Task Update',
          body: d['body'] ?? 'Task activity requires your attention',
          taskId: taskId,
        );
        return;
      }
      NotificationService.showGeneral(
        title: d['title'] ?? RuntimeConfig.instance.fallbackAppName,
        body: d['body'] ?? '',
        payload: payload,
      );
    });

    // Mention in board/chat
    _socket!.on('mention', (data) {
      if (data is! Map) return;
      final d = Map<String, dynamic>.from(data);
      NotificationService.showGeneral(
        title: '${d['from'] ?? 'Someone'} mentioned you',
        body: d['text'] ?? '',
        payload: d['payload'],
      );
    });

    _pollNotifications(seedOnly: true);
    _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) {
      _pollNotifications();
    });
  }

  void disconnect() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _knownNotificationIds.clear();
    _recentDispatches.clear();
    _notificationBaselineReady = false;
    _pollingNotifications = false;
  }

  Future<void> _pollNotifications({bool seedOnly = false}) async {
    if (_pollingNotifications) return;
    _pollingNotifications = true;
    try {
      final response = await _api.getNotifications(limit: 40, unreadOnly: true);
      final items = (response['notifications'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

      if (!_notificationBaselineReady || seedOnly) {
        _knownNotificationIds
          ..clear()
          ..addAll(
            items
                .map((item) => item['id']?.toString())
                .whereType<String>()
                .where((id) => id.isNotEmpty),
          );
        _notificationBaselineReady = true;
        return;
      }

      final fresh = items
          .where((item) {
            final id = item['id']?.toString();
            return id != null &&
                id.isNotEmpty &&
                !_knownNotificationIds.contains(id);
          })
          .toList()
          .reversed;

      for (final item in fresh) {
        final id = item['id']?.toString();
        if (id != null && id.isNotEmpty) {
          _knownNotificationIds.add(id);
        }
        await _showNotificationItem(item);
      }
    } catch (error) {
      debugPrint('[Notifications] Poll failed: $error');
    } finally {
      _pollingNotifications = false;
    }
  }

  Future<void> _showNotificationItem(Map<String, dynamic> item) async {
    final type = item['type']?.toString() ?? '';
    final title =
        item['title']?.toString() ?? RuntimeConfig.instance.fallbackAppName;
    final body = item['body']?.toString() ?? '';
    final link = item['link']?.toString();

    if ((type == 'livechat' || (link?.startsWith('/livechat') ?? false)) &&
        link != null) {
      final dialogId = _dialogIdFromLink(link);
      if (dialogId != null && dialogId.isNotEmpty) {
        final dedupeKey = 'poll:livechat:$dialogId:$title:$body';
        if (!_shouldDispatch(dedupeKey, const Duration(seconds: 3))) return;
        await NotificationService.showLiveChat(
          title: title,
          body: body,
          dialogId: dialogId,
        );
        return;
      }
    }

    if ((type == 'chat' || (link?.startsWith('/chat') ?? false)) &&
        link != null) {
      final dialogId = _dialogIdFromLink(link);
      if (dialogId != null && dialogId.isNotEmpty) {
        final dedupeKey = 'poll:chat:$dialogId:$title:$body';
        if (!_shouldDispatch(dedupeKey, const Duration(seconds: 3))) return;
        await NotificationService.showChat(
          sender: title,
          message: body,
          dialogId: dialogId,
        );
        return;
      }
    }

    final taskId = _taskIdFromAny(type, link, item);
    if (taskId != null && taskId.isNotEmpty) {
      final dedupeKey = 'poll:task:$taskId:$title:$body';
      if (!_shouldDispatch(dedupeKey, const Duration(seconds: 3))) return;
      await NotificationService.showTask(
        title: title,
        body: body.isNotEmpty ? body : 'Task activity requires your attention',
        taskId: taskId,
      );
      return;
    }

    await NotificationService.showGeneral(
      title: title,
      body: body,
      payload: link,
    );
  }

  bool _shouldDispatch(String key, Duration window) {
    final now = DateTime.now();
    final prev = _recentDispatches[key];
    if (prev != null && now.difference(prev) <= window) {
      return false;
    }
    _recentDispatches[key] = now;
    final cutoff = now.subtract(const Duration(minutes: 2));
    _recentDispatches.removeWhere((_, timestamp) => timestamp.isBefore(cutoff));
    return true;
  }

  String? _dialogIdFromLink(String? link) {
    if (link == null || link.trim().isEmpty) return null;
    final uri = Uri.tryParse(link);
    if (uri == null) return null;
    final queryDialog = uri.queryParameters['dialog']?.trim();
    if (queryDialog != null && queryDialog.isNotEmpty) {
      return queryDialog;
    }
    if (uri.pathSegments.length >= 2 &&
        (uri.pathSegments.first == 'chat' ||
            uri.pathSegments.first == 'livechat')) {
      return uri.pathSegments[1].trim();
    }
    return null;
  }

  String? _taskIdFromAny(
    String? type,
    String? link,
    Map<String, dynamic> data,
  ) {
    final taskId = _taskIdFromPayloadData(data);
    if (taskId != null && taskId.isNotEmpty) return taskId;
    if (link == null || link.trim().isEmpty) {
      final normalized = (type ?? '').trim().toLowerCase();
      if (normalized.startsWith('task')) return null;
      return null;
    }
    final fromLink = _taskIdFromLink(link);
    if (fromLink != null && fromLink.isNotEmpty) return fromLink;
    final normalized = (type ?? '').trim().toLowerCase();
    if (normalized.startsWith('task')) return null;
    return null;
  }

  String? _taskIdFromPayloadData(Map<String, dynamic> data) {
    final candidates = <dynamic>[
      data['taskId'],
      data['task_id'],
      data['id'],
      data['entityId'],
      data['entity_id'],
    ];
    for (final raw in candidates) {
      final value = raw?.toString().trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }
    return null;
  }

  String? _taskIdFromLink(String? link) {
    if (link == null || link.trim().isEmpty) return null;
    final uri = Uri.tryParse(link);
    if (uri == null) return null;
    if (uri.path == '/tasks') {
      final fromQuery = uri.queryParameters['task']?.trim() ??
          uri.queryParameters['id']?.trim();
      if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;
    }
    if (uri.pathSegments.length >= 2 && uri.pathSegments.first == 'tasks') {
      final pathId = uri.pathSegments[1].trim();
      if (pathId.isNotEmpty) return pathId;
    }
    return null;
  }

  String _taskNotificationTitle(String eventName, Map<String, dynamic> data) {
    final provided = data['title']?.toString().trim();
    if (provided != null && provided.isNotEmpty) return provided;
    if (eventName.contains('assign')) return 'New Task Assigned';
    if (eventName.contains('comment') || eventName.contains('reply')) {
      return 'Task Conversation';
    }
    if (eventName.contains('reopen')) return 'Task Reopened';
    if (eventName.contains('close')) return 'Task Closed';
    if (eventName.contains('open')) return 'Task Opened';
    if (eventName.contains('status')) return 'Task Status Updated';
    return 'Task Updated';
  }
}

final socketListenerProvider = Provider<SocketNotificationListener>((ref) {
  final listener = SocketNotificationListener();

  ref.listen(authStateProvider, (_, next) {
    next.whenData((user) {
      if (user != null) {
        ref.read(authServiceProvider).getToken().then((token) {
          if (token != null) listener.connect(token);
        });
      } else {
        listener.disconnect();
      }
    });
  }, fireImmediately: true);

  ref.onDispose(listener.disconnect);
  return listener;
});
