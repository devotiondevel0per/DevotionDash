import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/live_updates_provider.dart';

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
  ProviderSubscription<AsyncValue<bool>>? _liveUpdatesSub;
  Duration? _refreshInterval;
  VoidCallback? _refreshCallback;

  void _applyAutoRefreshEnabled(bool enabled) {
    _autoRefreshTimer?.cancel();
    final interval = _refreshInterval;
    final callback = _refreshCallback;
    if (!enabled || interval == null || callback == null) return;
    _autoRefreshTimer = Timer.periodic(interval, (_) {
      if (mounted) callback();
    });
  }

  void startAutoRefresh(Duration interval, VoidCallback onRefresh) {
    _refreshInterval = interval;
    _refreshCallback = onRefresh;
    _liveUpdatesSub?.close();

    final enabled = ref.read(liveUpdatesControllerProvider).value ?? true;
    _applyAutoRefreshEnabled(enabled);

    _liveUpdatesSub = ref.listenManual<AsyncValue<bool>>(
      liveUpdatesControllerProvider,
      (_, next) {
        _applyAutoRefreshEnabled(next.value ?? true);
      },
    );
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _liveUpdatesSub?.close();
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
  ProviderSubscription<AsyncValue<bool>>? _liveUpdatesSub;

  void _applyAutoRefreshEnabled(bool enabled) {
    _timer?.cancel();
    if (!enabled) return;
    _timer = Timer.periodic(widget.interval, (_) {
      if (mounted) widget.onRefresh(ref);
    });
  }

  @override
  void initState() {
    super.initState();
    final enabled = ref.read(liveUpdatesControllerProvider).value ?? true;
    _applyAutoRefreshEnabled(enabled);

    _liveUpdatesSub = ref.listenManual<AsyncValue<bool>>(
      liveUpdatesControllerProvider,
      (_, next) {
        _applyAutoRefreshEnabled(next.value ?? true);
      },
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _liveUpdatesSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
