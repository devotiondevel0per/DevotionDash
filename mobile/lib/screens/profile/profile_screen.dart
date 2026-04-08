import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../widgets/user_avatar.dart';
import '../../widgets/shimmer_loading.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _profileProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.getProfile();
  // API may wrap in 'user', 'profile', or 'data'
  if (res.containsKey('user')) return res['user'] as Map<String, dynamic>;
  if (res.containsKey('profile')) return res['profile'] as Map<String, dynamic>;
  if (res.containsKey('data')) return res['data'] as Map<String, dynamic>;
  return res;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFAA8038);

String _fieldValue(Map<String, dynamic> profile, List<String> keys) {
  for (final k in keys) {
    final v = profile[k];
    if (v != null && v.toString().isNotEmpty) return v.toString();
  }
  return '';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _editMode = false;
  bool _saving = false;
  bool _loggingOut = false;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _positionCtrl = TextEditingController();

  // Tracks the profile data currently loaded so we can populate fields
  Map<String, dynamic>? _loadedProfile;

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _positionCtrl.dispose();
    super.dispose();
  }

  void _populateFields(Map<String, dynamic> profile) {
    if (_loadedProfile == profile) return;
    _loadedProfile = profile;
    _firstNameCtrl.text = _fieldValue(profile, ['name']);
    _lastNameCtrl.text = _fieldValue(profile, ['surname']);
    _positionCtrl.text = _fieldValue(profile, ['position', 'jobTitle', 'role']);
  }

  void _toggleEdit() {
    setState(() => _editMode = !_editMode);
  }

  Future<void> _save() async {
    final firstName = _firstNameCtrl.text.trim();
    final lastName = _lastNameCtrl.text.trim();
    final position = _positionCtrl.text.trim();
    if (firstName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('First name cannot be empty'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.updateProfile({
        'name': firstName,
        'surname': lastName,
        'position': position,
      });
      ref.invalidate(_profileProvider);
      if (mounted) {
        setState(() => _editMode = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile updated'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out'),
        content: const Text('Are you sure you want to log out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: _kPrimary),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _loggingOut = true);
    try {
      await ref.read(authStateProvider.notifier).logout();
      // Router redirect handles navigation automatically
    } catch (e) {
      if (mounted) {
        setState(() => _loggingOut = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Logout failed: $e'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_profileProvider);

    return Scaffold(
      appBar: AppBar(
        title:
            const Text('Profile', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (async.value != null)
            _editMode
                ? TextButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Save',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: _kPrimary)),
                  )
                : IconButton(
                    icon: const Icon(Icons.edit_outlined),
                    onPressed: _toggleEdit,
                    tooltip: 'Edit profile',
                  ),
        ],
      ),
      body: async.when(
        loading: () => const _ProfileShimmer(),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_profileProvider),
        ),
        data: (profile) {
          _populateFields(profile);
          return _ProfileBody(
            profile: profile,
            editMode: _editMode,
            firstNameCtrl: _firstNameCtrl,
            lastNameCtrl: _lastNameCtrl,
            positionCtrl: _positionCtrl,
            loggingOut: _loggingOut,
            onAvatarTap: _editMode ? () {} : null,
            onLogout: _logout,
            onCancelEdit: _toggleEdit,
          );
        },
      ),
    );
  }
}

// ─── Profile body ─────────────────────────────────────────────────────────────

class _ProfileBody extends StatelessWidget {
  final Map<String, dynamic> profile;
  final bool editMode;
  final TextEditingController firstNameCtrl;
  final TextEditingController lastNameCtrl;
  final TextEditingController positionCtrl;
  final bool loggingOut;
  final VoidCallback? onAvatarTap;
  final VoidCallback onLogout;
  final VoidCallback onCancelEdit;

  const _ProfileBody({
    required this.profile,
    required this.editMode,
    required this.firstNameCtrl,
    required this.lastNameCtrl,
    required this.positionCtrl,
    required this.loggingOut,
    required this.onAvatarTap,
    required this.onLogout,
    required this.onCancelEdit,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final name = _fieldValue(profile, ['fullname', 'name', 'displayName']);
    final email = _fieldValue(profile, ['email']);
    final role =
        _fieldValue(profile, ['role', 'position', 'jobTitle']);
    final department = _fieldValue(profile, ['department']);
    final photo =
        (profile['photoUrl'] ?? profile['avatar'] ?? profile['photo'])
            ?.toString();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // ── Avatar ──
          GestureDetector(
            onTap: onAvatarTap,
            child: Stack(
              alignment: Alignment.bottomRight,
              children: [
                UserAvatar(photoUrl: photo, name: name, radius: 60),
                if (editMode)
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: const BoxDecoration(
                      color: _kPrimary,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.camera_alt_rounded,
                        size: 16, color: Colors.white),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Name ──
          if (!editMode) ...[
            Text(
              name.isNotEmpty ? name : 'Unknown',
              style: theme.textTheme.headlineSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            if (email.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                email,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (role.isNotEmpty) ...[
              const SizedBox(height: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: _kPrimary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  role,
                  style: const TextStyle(
                    color: _kPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ],

          const SizedBox(height: 28),

          // ── Info / Edit card ──
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    editMode ? 'Edit Profile' : 'Profile Info',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 16),
                  if (editMode) ...[
                    // Editable name field
                    TextFormField(
                      controller: firstNameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'First Name',
                        prefixIcon: Icon(Icons.person_outline_rounded),
                      ),
                      textCapitalization: TextCapitalization.words,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: lastNameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Last Name',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                      textCapitalization: TextCapitalization.words,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: positionCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Position',
                        prefixIcon: Icon(Icons.work_outline_rounded),
                      ),
                      textCapitalization: TextCapitalization.words,
                    ),
                    const SizedBox(height: 8),
                    // Read-only email note
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 4, vertical: 4),
                      child: Text(
                        'Email cannot be changed here.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.45),
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: onCancelEdit,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(44),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ] else ...[
                    _ProfileRow(
                      icon: Icons.person_outline_rounded,
                      label: 'Name',
                      value: name.isNotEmpty ? name : '—',
                    ),
                    _ProfileRow(
                      icon: Icons.email_outlined,
                      label: 'Email',
                      value: email.isNotEmpty ? email : '—',
                    ),
                    _ProfileRow(
                      icon: Icons.business_outlined,
                      label: 'Department',
                      value: department.isNotEmpty ? department : '—',
                    ),
                    _ProfileRow(
                      icon: Icons.badge_outlined,
                      label: 'Role',
                      value: role.isNotEmpty ? role : '—',
                    ),
                    _ProfileRow(
                      icon: Icons.phone_outlined,
                      label: 'Phone',
                      value: _fieldValue(
                              profile, ['phoneMobile', 'phoneWork', 'phone'])
                          .let((v) => v.isNotEmpty ? v : '—'),
                    ),
                  ],
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // ── Logout button ──
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: loggingOut ? null : onLogout,
              icon: loggingOut
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: _kPrimary),
                    )
                  : const Icon(Icons.logout_rounded, color: _kPrimary),
              label: Text(
                loggingOut ? 'Logging out…' : 'Log Out',
                style: const TextStyle(
                    color: _kPrimary, fontWeight: FontWeight.w600),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: _kPrimary),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Profile row ──────────────────────────────────────────────────────────────

class _ProfileRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _ProfileRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.5);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: muted),
          const SizedBox(width: 12),
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: muted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500),
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Profile shimmer ──────────────────────────────────────────────────────────

class _ProfileShimmer extends StatelessWidget {
  const _ProfileShimmer();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      child: Column(
        children: const [
          ShimmerBox(width: 120, height: 120, borderRadius: 60),
          SizedBox(height: 16),
          ShimmerBox(width: 180, height: 22),
          SizedBox(height: 10),
          ShimmerBox(width: 140, height: 16),
          SizedBox(height: 28),
          ShimmerBox(width: double.infinity, height: 220),
          SizedBox(height: 24),
          ShimmerBox(width: double.infinity, height: 52),
        ],
      ),
    );
  }
}

// ─── Error view ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline_rounded,
                size: 56, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text('Could not load profile',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.5),
                  ),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
              style: FilledButton.styleFrom(backgroundColor: _kPrimary),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

extension _Let<T> on T {
  R let<R>(R Function(T) block) => block(this);
}

