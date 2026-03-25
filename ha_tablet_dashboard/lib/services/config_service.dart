import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/dashboard_config.dart';

class ConfigService {
  static const _configKey = 'dashboard_config';

  Future<DashboardConfig> loadConfig() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString(_configKey);
    if (jsonString == null) return const DashboardConfig();
    return DashboardConfig.fromJson(
      json.decode(jsonString) as Map<String, dynamic>,
    );
  }

  Future<void> saveConfig(DashboardConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_configKey, json.encode(config.toJson()));
  }

  Future<void> clearConfig() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_configKey);
  }
}
