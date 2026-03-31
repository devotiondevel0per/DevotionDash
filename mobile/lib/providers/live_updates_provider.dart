import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _liveUpdatesEnabledKey = 'live_updates_enabled';

class LiveUpdatesController extends AsyncNotifier<bool> {
  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_liveUpdatesEnabledKey) ?? true;
  }

  Future<void> setEnabled(bool enabled) async {
    state = AsyncData(enabled);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_liveUpdatesEnabledKey, enabled);
  }
}

final liveUpdatesControllerProvider =
    AsyncNotifierProvider<LiveUpdatesController, bool>(
      LiveUpdatesController.new,
    );

