import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_client.dart';

class UserAvatar extends StatelessWidget {
  final String? photoUrl;
  final String name;
  final double radius;
  final Color? backgroundColor;

  const UserAvatar({
    super.key,
    this.photoUrl,
    required this.name,
    this.radius = 20,
    this.backgroundColor,
  });

  String get _initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  String? _resolveUrl(String? url) {
    return resolveServerUrl(url);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final resolved = _resolveUrl(photoUrl);
    if (resolved != null) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: backgroundColor ?? cs.primaryContainer,
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: resolved,
            width: radius * 2,
            height: radius * 2,
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) => _initialsWidget(cs),
          ),
        ),
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor ?? cs.primaryContainer,
      child: _initialsWidget(cs),
    );
  }

  Widget _initialsWidget(ColorScheme cs) => Text(
        _initials,
        style: TextStyle(
          color: cs.onPrimaryContainer,
          fontSize: radius * 0.7,
          fontWeight: FontWeight.w600,
        ),
      );
}
