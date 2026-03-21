import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Mixin for [ConsumerState] that adds periodic auto-refresh.
///
/// Usage:
/// ```dart
/// class _MyScreenState extends ConsumerState<MyScreen> with AutoRefreshMixin {
///   @override
///   void initState() {
///     super.initState();
///     startAutoRefresh(const Duration(seconds: 30), _refresh);
///   }
///   void _refresh() => ref.invalidate(myProvider);
/// }
/// ```
mixin AutoRefreshMixin<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  Timer? _autoRefreshTimer;

  void startAutoRefresh(Duration interval, VoidCallback onRefresh) {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(interval, (_) {
      if (mounted) onRefresh();
    });
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    super.dispose();
  }
}

/// Widget wrapper for [ConsumerWidget] screens that don't have a State.
/// Periodically calls [onRefresh] while the widget is mounted.
class AutoRefreshScope extends ConsumerStatefulWidget {
  final Widget child;
  final Duration interval;
  final void Function(WidgetRef ref) onRefresh;

  const AutoRefreshScope({
    super.key,
    required this.child,
    required this.interval,
    required this.onRefresh,
  });

  @override
  ConsumerState<AutoRefreshScope> createState() => _AutoRefreshScopeState();
}

class _AutoRefreshScopeState extends ConsumerState<AutoRefreshScope> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(widget.interval, (_) {
      if (mounted) widget.onRefresh(ref);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
