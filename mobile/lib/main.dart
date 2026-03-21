import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme.dart';
import 'services/branding_service.dart';
import 'services/notification_service.dart';
import 'services/runtime_config.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await RuntimeConfig.init();
  // NotificationService.init() calls Firebase.initializeApp() internally
  await NotificationService.init();
  runApp(const ProviderScope(child: TeamwoxApp()));
}

class TeamwoxApp extends ConsumerWidget {
  const TeamwoxApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final branding = ref.watch(appBrandingProvider).valueOrNull ??
        AppBranding.fallback();

    // Start socket listener once logged in
    ref.watch(socketListenerProvider);

    return MaterialApp.router(
      title: branding.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: router,
    );
  }
}
