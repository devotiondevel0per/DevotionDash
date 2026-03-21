import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'runtime_config.dart';

class AppBranding {
  const AppBranding({
    required this.appName,
    required this.appTagline,
    this.logoUrl,
  });

  final String appName;
  final String appTagline;
  final String? logoUrl;

  factory AppBranding.fromSettings(Map<String, dynamic> json) {
    final runtime = RuntimeConfig.instance;
    final resolvedName = (json['app.name'] ?? json['app_name'] ?? '')
        .toString()
        .trim();
    final resolvedTagline = (json['app.tagline'] ?? '').toString().trim();
    final logo = (json['app.logo'] ?? '').toString().trim();

    return AppBranding(
      appName: resolvedName.isNotEmpty ? resolvedName : runtime.fallbackAppName,
      appTagline:
          resolvedTagline.isNotEmpty ? resolvedTagline : runtime.fallbackTagline,
      logoUrl: logo.isNotEmpty ? runtime.resolveUrl(logo) : null,
    );
  }

  factory AppBranding.fallback() {
    final runtime = RuntimeConfig.instance;
    return AppBranding(
      appName: runtime.fallbackAppName,
      appTagline: runtime.fallbackTagline,
    );
  }
}

final appBrandingProvider = FutureProvider<AppBranding>((ref) async {
  try {
    final settings = await ref.watch(apiClientProvider).getPublicBranding();
    return AppBranding.fromSettings(settings);
  } catch (_) {
    return AppBranding.fallback();
  }
});
