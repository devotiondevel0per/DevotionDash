import 'package:flutter/material.dart';

enum ScreenSize { phone, tablet, desktop }

class Breakpoints {
  static const double tablet = 600;
  static const double desktop = 1200;

  static ScreenSize of(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width >= desktop) return ScreenSize.desktop;
    if (width >= tablet) return ScreenSize.tablet;
    return ScreenSize.phone;
  }

  static bool isPhone(BuildContext context) => of(context) == ScreenSize.phone;
  static bool isTablet(BuildContext context) => of(context) == ScreenSize.tablet;
  static bool isDesktop(BuildContext context) => of(context) == ScreenSize.desktop;
  static bool isWide(BuildContext context) => of(context) != ScreenSize.phone;

  /// Grid column count: 2 → phone, 3 → tablet, 4 → desktop
  static int gridColumns(BuildContext context) {
    switch (of(context)) {
      case ScreenSize.desktop: return 4;
      case ScreenSize.tablet: return 3;
      case ScreenSize.phone: return 2;
    }
  }

  /// Responsive horizontal padding
  static double pagePadding(BuildContext context) {
    switch (of(context)) {
      case ScreenSize.desktop: return 48;
      case ScreenSize.tablet: return 32;
      case ScreenSize.phone: return 16;
    }
  }

  /// Max content width for wide screens
  static double maxContentWidth(BuildContext context) {
    switch (of(context)) {
      case ScreenSize.desktop: return 1100;
      case ScreenSize.tablet: return 800;
      case ScreenSize.phone: return double.infinity;
    }
  }
}

/// Wraps child in a centered, max-width constrained box on wide screens
class ResponsiveContainer extends StatelessWidget {
  final Widget child;
  const ResponsiveContainer({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final max = Breakpoints.maxContentWidth(context);
    final padding = Breakpoints.pagePadding(context);
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: max),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: padding),
          child: child,
        ),
      ),
    );
  }
}
