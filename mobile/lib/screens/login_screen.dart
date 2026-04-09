import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/user_provider.dart';
import '../services/auth_service.dart';
import '../services/branding_service.dart';
import '../utils/breakpoints.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  static const _logoAsset = 'assets/images/devotion_group_d_small.png';
  final _formKey = GlobalKey<FormState>();
  final _loginCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  bool _requires2FA = false;
  String? _error;

  @override
  void dispose() {
    _loginCtrl.dispose();
    _passwordCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    try {
      await ref.read(authStateProvider.notifier).login(
            _loginCtrl.text.trim(),
            _passwordCtrl.text,
            otp: _requires2FA ? _otpCtrl.text.trim() : null,
          );
      ref.invalidate(userProfileProvider);
      ref.invalidate(permissionsProvider);
      // State is now updated — router redirect handles navigation automatically
    } catch (e) {
      final msg = e.toString();
      if (msg.contains('requires2FA') || msg.contains('2FA')) {
        setState(() { _requires2FA = true; _error = 'Enter your 2-step verification code.'; });
      } else if (msg.contains('401') || msg.contains('Invalid credentials') || msg.contains('credentials')) {
        setState(() => _error = 'Invalid login or password');
      } else {
        // Show real error (network, timeout, etc.)
        setState(() => _error = 'Error: $msg');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isWide = Breakpoints.isWide(context);
    final branding = ref.watch(appBrandingProvider).asData?.value ??
        AppBranding.fallback();

    return Scaffold(
      body: SafeArea(
        child: isWide
            ? _wideLayout(context, branding)
            : _phoneLayout(context, branding),
      ),
    );
  }

  // ─── Phone: full-screen form ────────────────────────────────────────────────
  Widget _phoneLayout(BuildContext context, AppBranding branding) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: _formCard(context, constrained: false, branding: branding),
      ),
    );
  }

  // ─── Tablet/Desktop: centered card ─────────────────────────────────────────
  Widget _wideLayout(BuildContext context, AppBranding branding) {
    return Row(
      children: [
        // Left branding panel
        Expanded(
          child: Container(
            color: Theme.of(context).colorScheme.primary,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(_logoAsset, width: 92, height: 92, fit: BoxFit.contain),
                const SizedBox(height: 24),
                Text(
                  branding.appName,
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  branding.appTagline,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(color: Colors.white70),
                ),
              ],
            ),
          ),
        ),
        // Right form panel
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(48),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 400),
                  child: _formCard(context, constrained: true, branding: branding),
                ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _formCard(
    BuildContext context, {
    required bool constrained,
    required AppBranding branding,
  }) {
    final cs = Theme.of(context).colorScheme;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!constrained) ...[
          Image.asset(_logoAsset, width: 84, height: 84, fit: BoxFit.contain),
          const SizedBox(height: 16),
          Text(
            branding.appName,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold, color: cs.primary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
        ],
        Text(
          'Sign in to your workspace',
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: cs.onSurfaceVariant),
          textAlign: constrained ? TextAlign.left : TextAlign.center,
        ),
        const SizedBox(height: 32),

        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: cs.errorContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(_error!, style: TextStyle(color: cs.onErrorContainer)),
          ),
          const SizedBox(height: 16),
        ],

        Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _loginCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Login or Email',
                  prefixIcon: Icon(Icons.person_outline),
                ),
                validator: (v) =>
                    v == null || v.isEmpty ? 'Enter your login' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) =>
                    v == null || v.isEmpty ? 'Enter your password' : null,
              ),
              if (_requires2FA) ...[
                const SizedBox(height: 16),
                TextFormField(
                  controller: _otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(
                    labelText: '2-Step Code',
                    prefixIcon: Icon(Icons.shield_outlined),
                    counterText: '',
                  ),
                  validator: (v) => _requires2FA && (v == null || v.length < 6)
                      ? 'Enter 6-digit code'
                      : null,
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 24),
        FilledButton(
          onPressed: _loading ? null : _login,
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: _loading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Text('Sign In', style: TextStyle(fontSize: 16)),
        ),
      ],
    );
  }
}
