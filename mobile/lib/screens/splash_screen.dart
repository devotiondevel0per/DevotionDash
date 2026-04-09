import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../services/auth_service.dart';
import '../services/branding_service.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  static const _logoAsset = 'assets/images/devotion_group_d_small.png';
  static const _brandColor = Color(0xFFAA8038);

  late final AnimationController _controller;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoFloat;
  late final Animation<double> _logoGlow;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
    _logoScale = Tween<double>(begin: 0.95, end: 1.05).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutCubic),
    );
    _logoFloat = Tween<double>(begin: 6, end: -6).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );
    _logoGlow = Tween<double>(begin: 0.12, end: 0.28).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    _navigate();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _navigate() async {
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    final token = await ref.read(authServiceProvider).getToken();
    if (mounted) {
      context.go(token != null ? '/home' : '/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final branding = ref.watch(appBrandingProvider).asData?.value ??
        AppBranding.fallback();
    final logoUrl = branding.logoUrl?.trim();
    final hasNetworkLogo = logoUrl != null && logoUrl.isNotEmpty;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF8C672B),
              Color(0xFFAA8038),
              Color(0xFF6B4F22),
            ],
            stops: [0.0, 0.5, 1.0],
          ),
        ),
        child: Center(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Transform.translate(
                    offset: Offset(0, _logoFloat.value),
                    child: Transform.scale(
                      scale: _logoScale.value,
                      child: Container(
                        width: 108,
                        height: 108,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: _brandColor.withValues(alpha: _logoGlow.value),
                              blurRadius: 28,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: hasNetworkLogo
                            ? Image.network(
                                logoUrl!,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => Image.asset(
                                  _logoAsset,
                                  fit: BoxFit.contain,
                                ),
                              )
                            : Image.asset(_logoAsset, fit: BoxFit.contain),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    branding.appName,
                    style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    branding.appTagline,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: Colors.white70),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 42),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(3, (index) {
                      final phase = (_controller.value + index * 0.22) % 1.0;
                      final pulse =
                          1 - (2 * (phase - 0.5).abs()).clamp(0.0, 1.0);
                      final scale = 0.7 + pulse * 0.55;
                      final opacity = 0.35 + pulse * 0.65;
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        child: Transform.scale(
                          scale: scale,
                          child: Opacity(
                            opacity: opacity,
                            child: Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: 140,
                    child: LinearProgressIndicator(
                      minHeight: 3,
                      backgroundColor: Colors.white24,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        Colors.white.withValues(alpha: 0.95),
                      ),
                      value:
                          0.2 + 0.8 * (0.5 + 0.5 * math.sin(_controller.value * math.pi * 2)),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
