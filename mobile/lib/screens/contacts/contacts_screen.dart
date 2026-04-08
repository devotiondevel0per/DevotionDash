import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../utils/auto_refresh.dart';
import '../../widgets/shimmer_loading.dart';
import '../../widgets/empty_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

@immutable
class _ContactsQuery {
  final String search;
  final String organizationId;
  final String sort;
  final bool mineOnly;
  final bool? hasEmail;
  final bool? hasPhone;

  const _ContactsQuery({
    this.search = '',
    this.organizationId = 'all',
    this.sort = 'updated',
    this.mineOnly = false,
    this.hasEmail,
    this.hasPhone,
  });

  @override
  bool operator ==(Object other) =>
      other is _ContactsQuery &&
      other.search == search &&
      other.organizationId == organizationId &&
      other.sort == sort &&
      other.mineOnly == mineOnly &&
      other.hasEmail == hasEmail &&
      other.hasPhone == hasPhone;

  @override
  int get hashCode =>
      Object.hash(search, organizationId, sort, mineOnly, hasEmail, hasPhone);
}

final contactsProvider =
    FutureProvider.family<List<dynamic>, _ContactsQuery>((ref, query) async {
  final res = await ref.watch(apiClientProvider).getContacts(
        search: query.search,
        organizationId: query.organizationId,
        sort: query.sort,
        mineOnly: query.mineOnly,
        hasEmail: query.hasEmail,
        hasPhone: query.hasPhone,
        limit: 500,
      );
  if (res is List) return res;
  if (res is Map) {
    final raw = res['items'] ?? res['data'] ?? res['contacts'] ?? [];
    return raw as List<dynamic>;
  }
  return [];
});

final _organizationsProvider = FutureProvider<List<Map<String, String>>>((ref) async {
  try {
    final data = await ref.watch(apiClientProvider).getClients(page: 1);
    final raw =
        (data['items'] ?? data['data'] ?? data['organizations'] ?? []) as List<dynamic>;
    return raw
        .map((item) => item as Map<String, dynamic>)
        .map(
          (org) => {
            'id': (org['id'] ?? '').toString(),
            'name': (org['name'] ?? '').toString(),
          },
        )
        .where((org) => org['id']!.isNotEmpty && org['name']!.isNotEmpty)
        .toList();
  } catch (_) {
    return const [];
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _kPrimary = Color(0xFFF59E0B);

String _contactName(Map<String, dynamic> c) {
  final first = (c['firstName'] ?? c['first_name'] ?? '').toString().trim();
  final last = (c['lastName'] ?? c['last_name'] ?? '').toString().trim();
  final full = '$first $last'.trim();
  return full.isNotEmpty ? full : (c['name'] ?? c['fullname'] ?? 'Unknown').toString();
}

String _contactEmail(Map<String, dynamic> c) =>
    (c['email'] ?? '').toString();

String _contactPhone(Map<String, dynamic> c) =>
    (c['phone'] ?? c['phoneWork'] ?? c['phoneMobile'] ?? '').toString();

String _contactOrg(Map<String, dynamic> c) {
  final org = c['organization'] ?? c['company'] ?? c['client'];
  if (org is Map) return (org['name'] ?? '').toString();
  return (org ?? c['organizationName'] ?? c['companyName'] ?? '').toString();
}

String _contactPosition(Map<String, dynamic> c) =>
    (c['position'] ?? c['jobTitle'] ?? c['title'] ?? '').toString();

String? _contactPhoto(Map<String, dynamic> c) =>
    (c['photoUrl'] ?? c['avatar'] ?? c['photo'])?.toString();

// ─── Screen ───────────────────────────────────────────────────────────────────

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen>
    with AutoRefreshMixin {
  static const _bucketOptions = <Map<String, String>>[
    {'id': 'all', 'label': 'All'},
    {'id': 'assigned', 'label': 'Assigned'},
    {'id': 'unassigned', 'label': 'Unassigned'},
    {'id': 'missing-email', 'label': 'No Email'},
    {'id': 'missing-phone', 'label': 'No Phone'},
  ];

  final _searchController = TextEditingController();
  bool _showSearch = false;
  String _searchQuery = '';
  String _organizationId = 'all';
  String _sort = 'updated';
  bool _mineOnly = false;
  String _bucket = 'all';

  _ContactsQuery _query() {
    final hasEmail = _bucket == 'missing-email' ? false : null;
    final hasPhone = _bucket == 'missing-phone' ? false : null;
    final organizationId = _bucket == 'unassigned' ? 'none' : _organizationId;
    return _ContactsQuery(
      search: _searchQuery.trim(),
      organizationId: organizationId,
      sort: _sort,
      mineOnly: _mineOnly,
      hasEmail: hasEmail,
      hasPhone: hasPhone,
    );
  }

  @override
  void initState() {
    super.initState();
    startAutoRefresh(
      const Duration(seconds: 120),
      () => ref.invalidate(contactsProvider(_query())),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchQuery = '';
        _searchController.clear();
      }
    });
  }

  void _showContactSheet(BuildContext context, Map<String, dynamic> contact) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ContactSheet(contact: contact),
    );
  }

  Widget _filtersBar(List<Map<String, String>> organizations) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color:
                Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.45),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: _bucketOptions
                  .map(
                    (item) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        selected: _bucket == item['id'],
                        label: Text(item['label']!),
                        onSelected: (_) {
                          setState(() {
                            _bucket = item['id']!;
                            if (_bucket == 'unassigned') {
                              _organizationId = 'none';
                            } else if (_organizationId == 'none') {
                              _organizationId = 'all';
                            }
                          });
                        },
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                SizedBox(
                  width: 180,
                  child: DropdownButtonFormField<String>(
                    initialValue: _sort,
                    decoration: const InputDecoration(
                      labelText: 'Sort',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'updated', child: Text('Latest update')),
                      DropdownMenuItem(value: 'name', child: Text('Name A-Z')),
                      DropdownMenuItem(value: 'created', child: Text('Recently created')),
                    ],
                    onChanged: (value) => setState(() => _sort = value ?? 'updated'),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 210,
                  child: DropdownButtonFormField<String>(
                    initialValue: _organizationId,
                    decoration: const InputDecoration(
                      labelText: 'Organization',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      const DropdownMenuItem(value: 'all', child: Text('All organizations')),
                      const DropdownMenuItem(value: 'none', child: Text('Unassigned only')),
                      ...organizations.map(
                        (org) => DropdownMenuItem<String>(
                          value: org['id'],
                          child: Text(org['name'] ?? ''),
                        ),
                      ),
                    ],
                    onChanged: (value) {
                      setState(() {
                        _organizationId = value ?? 'all';
                        if (_organizationId == 'none') {
                          _bucket = 'unassigned';
                        } else if (_bucket == 'unassigned') {
                          _bucket = 'all';
                        }
                      });
                    },
                  ),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  selected: _mineOnly,
                  label: const Text('My Contacts'),
                  onSelected: (value) => setState(() => _mineOnly = value),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _query();
    final contacts = ref.watch(contactsProvider(query));
    final organizations = ref.watch(_organizationsProvider).asData?.value ?? const [];

    return Scaffold(
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search contacts…',
                  border: InputBorder.none,
                  hintStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  filled: false,
                ),
                style: theme.textTheme.bodyLarge,
                onChanged: (v) => setState(() => _searchQuery = v),
              )
            : const Text('Contacts',
                style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search_rounded),
            onPressed: _toggleSearch,
            tooltip: _showSearch ? 'Close' : 'Search',
          ),
        ],
      ),
      body: contacts.when(
        loading: () => const ShimmerList(count: 10),
        error: (e, _) => ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(contactsProvider(query)),
        ),
        data: (list) {
          final visible = _bucket == 'assigned'
              ? list.where((item) => _contactOrg(item as Map<String, dynamic>).isNotEmpty).toList()
              : list;
          final hasFilter = _searchQuery.trim().isNotEmpty ||
              _bucket != 'all' ||
              _organizationId != 'all' ||
              _sort != 'updated' ||
              _mineOnly;

          return Column(
            children: [
              _filtersBar(organizations),
              Expanded(
                child: visible.isEmpty
                    ? EmptyState(
                        icon: Icons.contacts_outlined,
                        title: hasFilter ? 'No results' : 'No contacts',
                        subtitle: hasFilter
                            ? 'Try a different filter or search term'
                            : 'No contacts found',
                      )
                    : RefreshIndicator(
                        color: _kPrimary,
                        onRefresh: () async => ref.invalidate(contactsProvider(query)),
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: visible.length,
                          separatorBuilder: (_, __) => Divider(
                            height: 1,
                            indent: 72,
                            endIndent: 16,
                            color: theme.colorScheme.outline.withValues(alpha: 0.2),
                          ),
                          itemBuilder: (ctx, i) {
                            final c = visible[i] as Map<String, dynamic>;
                            final name = _contactName(c);
                            final email = _contactEmail(c);
                            final org = _contactOrg(c);
                            final photo = _contactPhoto(c);

                            return ListTile(
                              contentPadding:
                                  const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              leading: _ContactAvatar(photo: photo, name: name),
                              title: Text(
                                name,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (org.isNotEmpty)
                                    Text(
                                      org,
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        color: _kPrimary,
                                        fontWeight: FontWeight.w500,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  if (email.isNotEmpty)
                                    Text(
                                      email,
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        color: theme.colorScheme.onSurface
                                            .withValues(alpha: 0.5),
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                ],
                              ),
                              trailing: const Icon(Icons.chevron_right, size: 20),
                              onTap: () => _showContactSheet(ctx, c),
                            );
                          },
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── Contact avatar ───────────────────────────────────────────────────────────

class _ContactAvatar extends StatelessWidget {
  final String? photo;
  final String name;
  const _ContactAvatar({this.photo, required this.name});

  @override
  Widget build(BuildContext context) {
    final initials = name.isNotEmpty
        ? (name.split(' ').length >= 2
            ? '${name.split(' ')[0][0]}${name.split(' ')[1][0]}'.toUpperCase()
            : name[0].toUpperCase())
        : '?';

    if (photo != null && photo!.isNotEmpty) {
      return CircleAvatar(
        radius: 22,
        backgroundImage: NetworkImage(resolveServerUrl(photo!)!),
        backgroundColor: _kPrimary.withValues(alpha: 0.15),
        onBackgroundImageError: (_, __) {},
        child: null,
      );
    }
    return CircleAvatar(
      radius: 22,
      backgroundColor: _kPrimary.withValues(alpha: 0.15),
      child: Text(
        initials,
        style: const TextStyle(
            color: _kPrimary, fontWeight: FontWeight.bold, fontSize: 14),
      ),
    );
  }
}

// ─── Contact detail sheet ────────────────────────────────────────────────────

class _ContactSheet extends StatelessWidget {
  final Map<String, dynamic> contact;
  const _ContactSheet({required this.contact});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = _contactName(contact);
    final email = _contactEmail(contact);
    final phone = _contactPhone(contact);
    final org = _contactOrg(contact);
    final position = _contactPosition(contact);
    final photo = _contactPhoto(contact);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 4),

            // Avatar
            _ContactAvatar(photo: photo, name: name),
            const SizedBox(height: 12),

            // Name
            Text(name,
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center),

            // Position
            if (position.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(position,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: _kPrimary, fontWeight: FontWeight.w500),
                  textAlign: TextAlign.center),
            ],

            // Organization
            if (org.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(org,
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.55)),
                  textAlign: TextAlign.center),
            ],

            const SizedBox(height: 20),
            const Divider(height: 1),
            const SizedBox(height: 12),

            // Info rows
            if (email.isNotEmpty)
              _InfoRow(icon: Icons.email_outlined, label: 'Email', value: email),
            if (phone.isNotEmpty)
              _InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: phone),
            if (org.isNotEmpty)
              _InfoRow(
                  icon: Icons.business_outlined, label: 'Company', value: org),

            const SizedBox(height: 20),

            // Actions
            Row(
              children: [
                if (email.isNotEmpty)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final uri = Uri(scheme: 'mailto', path: email);
                        if (await canLaunchUrl(uri)) await launchUrl(uri);
                      },
                      icon: const Icon(Icons.email_outlined, size: 18),
                      label: const Text('Email'),
                    ),
                  ),
                if (email.isNotEmpty && phone.isNotEmpty)
                  const SizedBox(width: 12),
                if (phone.isNotEmpty)
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () async {
                        final uri = Uri(scheme: 'tel', path: phone);
                        if (await canLaunchUrl(uri)) await launchUrl(uri);
                      },
                      style: FilledButton.styleFrom(
                          backgroundColor: _kPrimary),
                      icon: const Icon(Icons.phone_outlined, size: 18),
                      label: const Text('Call'),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon,
              size: 18,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          const SizedBox(width: 12),
          Text(label,
              style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                  fontWeight: FontWeight.w500)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(value,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w500),
                textAlign: TextAlign.end,
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}
