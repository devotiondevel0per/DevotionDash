import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

final navigatorKey = GlobalKey<NavigatorState>();

void navigateFromNotification(String payload) {
  final context = navigatorKey.currentContext;
  if (context == null) return;

  final trimmed = payload.trim();
  if (trimmed.isEmpty) return;

  if (trimmed.startsWith('/')) {
    final uri = Uri.tryParse(trimmed);
    if (uri != null) {
      final dialogId = uri.queryParameters['dialog']?.trim();
      final segments = uri.pathSegments;
      switch (uri.path) {
        case '/chat':
          if (dialogId != null && dialogId.isNotEmpty) {
            context.push('/chat/$dialogId');
            return;
          }
          break;
        case '/livechat':
          if (dialogId != null && dialogId.isNotEmpty) {
            context.push(
              '/chat/$dialogId',
              extra: {'isLiveChat': true},
            );
            return;
          }
          break;
        case '/tasks':
          final taskId = uri.queryParameters['id']?.trim();
          if (taskId != null && taskId.isNotEmpty) {
            context.push('/tasks/$taskId');
            return;
          }
          break;
        case '/servicedesk':
          final requestId = uri.queryParameters['id']?.trim();
          if (requestId != null && requestId.isNotEmpty) {
            context.push('/servicedesk/$requestId');
            return;
          }
          break;
      }

      if (segments.length >= 2) {
        switch (segments.first) {
          case 'chat':
            context.push('/chat/${segments[1]}');
            return;
          case 'livechat':
            context.push('/chat/${segments[1]}', extra: {'isLiveChat': true});
            return;
          case 'tasks':
            context.push('/tasks/${segments[1]}');
            return;
          case 'servicedesk':
            context.push('/servicedesk/${segments[1]}');
            return;
        }
      }
    }
  }

  final parts = payload.split(':');
  if (parts.length < 2) return;

  final type = parts[0];
  final id = parts[1];

  switch (type) {
    case 'chat':
      context.push('/chat/$id');
      return;
    case 'livechat':
      context.push('/chat/$id', extra: {'isLiveChat': true});
      return;
    case 'task':
      context.push('/tasks/$id');
      return;
    case 'servicedesk':
      context.push('/servicedesk/$id');
      return;
    default:
      context.push('/home');
      return;
  }
}
