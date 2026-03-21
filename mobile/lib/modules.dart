import 'package:flutter/material.dart';

class AppModuleDefinition {
  const AppModuleDefinition({
    required this.id,
    required this.label,
    required this.route,
    required this.icon,
    required this.color,
    this.mobileEnabled = true,
    this.primaryCandidate = false,
  });

  final String id;
  final String label;
  final String route;
  final IconData icon;
  final Color color;
  final bool mobileEnabled;
  final bool primaryCandidate;
}

const appModules = <AppModuleDefinition>[
  AppModuleDefinition(
    id: 'home',
    label: 'Home',
    route: '/home',
    icon: Icons.home_rounded,
    color: Color(0xFFB02B2C),
    primaryCandidate: true,
  ),
  AppModuleDefinition(
    id: 'tasks',
    label: 'Tasks',
    route: '/tasks',
    icon: Icons.task_alt_rounded,
    color: Color(0xFFC79810),
    primaryCandidate: true,
  ),
  AppModuleDefinition(
    id: 'projects',
    label: 'Projects',
    route: '/projects',
    icon: Icons.folder_special_rounded,
    color: Color(0xFF437388),
  ),
  AppModuleDefinition(
    id: 'documents',
    label: 'Documents',
    route: '/documents',
    icon: Icons.folder_open_rounded,
    color: Color(0xFF437388),
  ),
  AppModuleDefinition(
    id: 'email',
    label: 'E-Mail',
    route: '/email',
    icon: Icons.mail_rounded,
    color: Color(0xFF5EAD63),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'board',
    label: 'Board',
    route: '/board',
    icon: Icons.dashboard_rounded,
    color: Color(0xFFC79810),
  ),
  AppModuleDefinition(
    id: 'leads',
    label: 'Leads',
    route: '/leads',
    icon: Icons.stacked_line_chart_rounded,
    color: Color(0xFF5EAD63),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'clients',
    label: 'Organizations',
    route: '/clients',
    icon: Icons.business_rounded,
    color: Color(0xFF3B4A61),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'contacts',
    label: 'Contacts',
    route: '/contacts',
    icon: Icons.contacts_rounded,
    color: Color(0xFF818B4B),
  ),
  AppModuleDefinition(
    id: 'team',
    label: 'Team',
    route: '/team',
    icon: Icons.groups_rounded,
    color: Color(0xFF525739),
  ),
  AppModuleDefinition(
    id: 'calendar',
    label: 'Calendar',
    route: '/calendar',
    icon: Icons.calendar_month_rounded,
    color: Color(0xFF437388),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'chat',
    label: 'Chat',
    route: '/chat',
    icon: Icons.chat_bubble_rounded,
    color: Color(0xFF5EAD63),
    primaryCandidate: true,
  ),
  AppModuleDefinition(
    id: 'livechat',
    label: 'Live Chat',
    route: '/livechat',
    icon: Icons.support_agent_rounded,
    color: Color(0xFF5EAD63),
    primaryCandidate: true,
  ),
  AppModuleDefinition(
    id: 'servicedesk',
    label: 'Ticket Desk',
    route: '/servicedesk',
    icon: Icons.confirmation_number_rounded,
    color: Color(0xFF5EAD63),
  ),
  AppModuleDefinition(
    id: 'products',
    label: 'Products',
    route: '/products',
    icon: Icons.inventory_2_rounded,
    color: Color(0xFF818B4B),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'accounting',
    label: 'Accounting',
    route: '/accounting',
    icon: Icons.menu_book_rounded,
    color: Color(0xFF818B4B),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'ebank',
    label: 'e-Bank',
    route: '/ebank',
    icon: Icons.credit_card_rounded,
    color: Color(0xFF818B4B),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'telephony',
    label: 'Telephony',
    route: '/telephony',
    icon: Icons.phone_rounded,
    color: Color(0xFF818B4B),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'search',
    label: 'Search',
    route: '/search',
    icon: Icons.search_rounded,
    color: Color(0xFF000000),
    mobileEnabled: false,
  ),
  AppModuleDefinition(
    id: 'administration',
    label: 'Administration',
    route: '/administration',
    icon: Icons.settings_rounded,
    color: Color(0xFFD15600),
    mobileEnabled: false,
  ),
];

AppModuleDefinition? findModuleByRoute(String route) {
  for (final module in appModules) {
    if (module.route == route) return module;
  }
  return null;
}

List<AppModuleDefinition> mobileModulesForAccess({
  required List<String> accessibleModules,
  required bool isAdmin,
}) {
  return appModules.where((module) {
    if (!module.mobileEnabled) return false;
    return isAdmin || accessibleModules.contains(module.id);
  }).toList();
}
