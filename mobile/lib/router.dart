import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/tasks/tasks_screen.dart';
import 'screens/tasks/task_detail_screen.dart';
import 'screens/chat/chat_screen.dart';
import 'screens/chat/chat_detail_screen.dart';
import 'screens/board/board_screen.dart';
import 'screens/board/board_detail_screen.dart';
import 'screens/livechat/livechat_screen.dart';
import 'screens/contacts/contacts_screen.dart';
import 'screens/projects/projects_screen.dart';
import 'screens/projects/project_detail_screen.dart';
import 'screens/documents/documents_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/team/team_screen.dart';
import 'screens/servicedesk/servicedesk_screen.dart';
import 'screens/servicedesk/servicedesk_detail_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/more_screen.dart';
import 'services/auth_service.dart';
import 'utils/navigation.dart';
import 'widgets/adaptive_shell.dart';
import 'widgets/module_guard.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: navigatorKey,
    initialLocation: '/splash',
    redirect: (context, state) {
      final isLoggedIn = authState.value != null;
      final loc = state.matchedLocation;
      final isAuth = loc == '/login' || loc == '/splash';

      if (!isLoggedIn && !isAuth) return '/login';
      if (isLoggedIn && loc == '/login') return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),

      // ── Shell with adaptive nav ────────────────────────────────────────────
      ShellRoute(
        builder: (context, state, child) => AdaptiveShell(child: child),
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'home',
              child: HomeScreen(),
            ),
          ),
          GoRoute(
            path: '/tasks',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'tasks',
              child: TasksScreen(),
            ),
          ),
          GoRoute(
            path: '/chat',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'chat',
              child: ChatScreen(),
            ),
          ),
          GoRoute(
            path: '/board',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'board',
              child: BoardScreen(),
            ),
          ),
          GoRoute(
            path: '/livechat',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'livechat',
              child: LiveChatScreen(),
            ),
          ),
          GoRoute(path: '/more', builder: (_, __) => const MoreScreen()),

          // Sub-routes reachable from shell (back button shows nav bar)
          GoRoute(
            path: '/contacts',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'contacts',
              child: ContactsScreen(),
            ),
          ),
          GoRoute(
            path: '/projects',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'projects',
              child: ProjectsScreen(),
            ),
          ),
          GoRoute(
            path: '/documents',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'documents',
              child: DocumentsScreen(),
            ),
          ),
          GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
          GoRoute(
            path: '/team',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'team',
              child: TeamScreen(),
            ),
          ),
          GoRoute(
            path: '/servicedesk',
            builder: (_, __) => const ModuleGuard(
              moduleId: 'servicedesk',
              child: ServiceDeskScreen(),
            ),
          ),
          GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),

          // Detail routes
          GoRoute(
            path: '/projects/:id',
            builder: (_, state) => ModuleGuard(
              moduleId: 'projects',
              child: ProjectDetailScreen(projectId: state.pathParameters['id']!),
            ),
          ),
          GoRoute(
            path: '/tasks/:id',
            builder: (_, state) => ModuleGuard(
              moduleId: 'tasks',
              child: TaskDetailScreen(taskId: state.pathParameters['id']!),
            ),
          ),
          GoRoute(
            path: '/chat/:id',
            builder: (_, state) {
              final extra = state.extra as Map<String, dynamic>?;
              final dialog = extra?['dialog'] as Map<String, dynamic>?;
              final isLiveChat = extra?['isLiveChat'] == true;
              return ModuleGuard(
                moduleId: isLiveChat ? 'livechat' : 'chat',
                child: ChatDetailScreen(
                  dialogId: state.pathParameters['id']!,
                  dialog: dialog,
                  isLiveChat: isLiveChat,
                ),
              );
            },
          ),
          GoRoute(
            path: '/board/:id',
            builder: (_, state) => ModuleGuard(
              moduleId: 'board',
              child: BoardDetailScreen(topicId: state.pathParameters['id']!),
            ),
          ),
          GoRoute(
            path: '/servicedesk/:id',
            builder: (_, state) => ModuleGuard(
              moduleId: 'servicedesk',
              child: ServiceDeskDetailScreen(id: state.pathParameters['id']!),
            ),
          ),
        ],
      ),
    ],
  );
});
