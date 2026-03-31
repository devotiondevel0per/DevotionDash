import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../modules.dart';
import '../providers/user_provider.dart';
import '../services/branding_service.dart';
import '../utils/breakpoints.dart';

final _unreadChatProvider = FutureProvider<int>((ref) async => 0);

class _NavItem {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.route,
  });

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final String route;
}

const _moreRoute = '/more';
const _logoAsset = 'assets/images/logo.png';

class AdaptiveShell extends ConsumerWidget {
  const AdaptiveShell({super.key, required this.child});

  final Widget child;

  List<_NavItem> _navItems(WidgetRef ref) {
    final permissions = ref.watch(permissionsProvider).asData?.value;
    final accessible = permissions == null
        ? mobileModulesForAccess(
            accessibleModules: const ['home', 'tasks', 'chat', 'livechat'],
            isAdmin: false,
          )
        : mobileModulesForAccess(
            accessibleModules: permissions.accessibleModules,
            isAdmin: permissions.isAdmin,
          );

    final home = accessible.firstWhere(
      (module) => module.id == 'home',
      orElse: () => appModules.firstWhere((module) => module.id == 'home'),
    );

    final primary = accessible
        .where((module) => module.primaryCandidate && module.id != 'home')
        .take(3)
        .map(
          (module) => _NavItem(
            label: module.label,
            icon: _outlinedIconForRoute(module.route),
            activeIcon: module.icon,
            route: module.route,
          ),
        )
        .toList();

    return [
      _NavItem(
        label: home.label,
        icon: Icons.home_outlined,
        activeIcon: home.icon,
        route: home.route,
      ),
      ...primary,
      const _NavItem(
        label: 'More',
        icon: Icons.grid_view_outlined,
        activeIcon: Icons.grid_view_rounded,
        route: _moreRoute,
      ),
    ];
  }

  int _selectedIndex(BuildContext context, List<_NavItem> navItems) {
    final location = GoRouterState.of(context).matchedLocation;
    final directIndex = navItems.indexWhere((item) => location.startsWith(item.route));
    if (directIndex >= 0) return directIndex;
    return navItems.length - 1;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final navItems = _navItems(ref);
    final selectedIndex = _selectedIndex(context, navItems);
    final unreadChat = ref.watch(_unreadChatProvider).value ?? 0;
    final branding = ref.watch(appBrandingProvider).asData?.value ??
        AppBranding.fallback();

    return Breakpoints.isPhone(context)
        ? _PhoneShell(
            child: child,
            navItems: navItems,
            selectedIndex: selectedIndex,
            unreadChat: unreadChat,
          )
        : _WideShell(
            child: child,
            navItems: navItems,
            selectedIndex: selectedIndex,
            unreadChat: unreadChat,
            appName: branding.appName,
          );
  }
}

IconData _outlinedIconForRoute(String route) {
  switch (route) {
    case '/tasks':
      return Icons.task_alt_outlined;
    case '/chat':
      return Icons.chat_bubble_outline_rounded;
    case '/livechat':
      return Icons.support_agent_outlined;
    default:
      return findModuleByRoute(route)?.icon ?? Icons.circle_outlined;
  }
}

Widget _badgeIcon(IconData icon, int count) {
  if (count <= 0) return Icon(icon);
  return Badge(
    label: Text(count > 99 ? '99+' : '$count'),
    child: Icon(icon),
  );
}

class _PhoneShell extends StatelessWidget {
  const _PhoneShell({
    required this.child,
    required this.navItems,
    required this.selectedIndex,
    required this.unreadChat,
  });

  final Widget child;
  final List<_NavItem> navItems;
  final int selectedIndex;
  final int unreadChat;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) => context.go(navItems[index].route),
        destinations: navItems.map((item) {
          final isChatItem = item.route == '/chat';
          return NavigationDestination(
            icon: isChatItem ? _badgeIcon(item.icon, unreadChat) : Icon(item.icon),
            selectedIcon:
                isChatItem ? _badgeIcon(item.activeIcon, unreadChat) : Icon(item.activeIcon),
            label: item.label,
          );
        }).toList(),
      ),
    );
  }
}

class _WideShell extends StatelessWidget {
  const _WideShell({
    required this.child,
    required this.navItems,
    required this.selectedIndex,
    required this.unreadChat,
    required this.appName,
  });

  final Widget child;
  final List<_NavItem> navItems;
  final int selectedIndex;
  final int unreadChat;
  final String appName;

  @override
  Widget build(BuildContext context) {
    final isDesktop = Breakpoints.isDesktop(context);

    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            extended: isDesktop,
            selectedIndex: selectedIndex,
            onDestinationSelected: (index) => context.go(navItems[index].route),
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: isDesktop
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Image.asset(
                          _logoAsset,
                          width: 28,
                          height: 28,
                          fit: BoxFit.contain,
                        ),
                        const SizedBox(width: 12),
                        Flexible(
                          child: Text(
                            appName,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                        ),
                      ],
                    )
                  : Image.asset(
                      _logoAsset,
                      width: 28,
                      height: 28,
                      fit: BoxFit.contain,
                    ),
            ),
            destinations: navItems.map((item) {
              final isChatItem = item.route == '/chat';
              return NavigationRailDestination(
                icon: isChatItem ? _badgeIcon(item.icon, unreadChat) : Icon(item.icon),
                selectedIcon:
                    isChatItem ? _badgeIcon(item.activeIcon, unreadChat) : Icon(item.activeIcon),
                label: Text(item.label),
              );
            }).toList(),
          ),
          const VerticalDivider(thickness: 1, width: 1),
          Expanded(child: child),
        ],
      ),
    );
  }
}
