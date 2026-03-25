import 'package:flutter/material.dart';
import '../models/dashboard_config.dart';
import '../models/ha_entity.dart';
import '../services/config_service.dart';
import '../services/ha_websocket_service.dart' as ws;

class DashboardProvider extends ChangeNotifier {
  final ws.HaWebSocketService _wsService = ws.HaWebSocketService();
  final ConfigService _configService = ConfigService();

  DashboardConfig _config = const DashboardConfig();
  Map<String, HaEntity> _entities = {};
  ws.ConnectionState _connectionState = ws.ConnectionState.disconnected;
  bool _isLoading = true;
  String? _error;

  DashboardConfig get config => _config;
  Map<String, HaEntity> get entities => _entities;
  ws.ConnectionState get connectionState => _connectionState;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isConnected => _connectionState == ws.ConnectionState.authenticated;

  // Entity helpers
  HaEntity? entity(String id) => _entities[id];
  String entityState(String id) => _entities[id]?.state ?? 'unavailable';
  bool isEntityOn(String id) => _entities[id]?.isOn ?? false;

  // Alarm
  HaEntity? get alarmEntity => entity(DashboardConfig.alarmEntity);
  String get alarmState => entityState(DashboardConfig.alarmStateEntity);
  bool get isSirenOn => isEntityOn(DashboardConfig.sirenEntity);
  bool get isSirenEnabled => isEntityOn(DashboardConfig.sirenEnabledEntity);

  // Detection
  bool get hasActiveDetection {
    for (final zone in DashboardConfig.detectionZones) {
      if (isEntityOn('binary_sensor.${zone}_persona') ||
          isEntityOn('binary_sensor.deteccion_reciente_$zone')) {
        return true;
      }
    }
    return false;
  }

  Map<String, bool> get activeDetections {
    final result = <String, bool>{};
    for (final zone in DashboardConfig.detectionZones) {
      final personActive = isEntityOn('binary_sensor.${zone}_persona');
      final recentActive = isEntityOn('binary_sensor.deteccion_reciente_$zone');
      if (personActive || recentActive) {
        result[zone] = personActive; // true = live, false = recent
      }
    }
    return result;
  }

  // Weather
  HaEntity? get weatherEntity => entity(DashboardConfig.weatherEntity);

  // Energy
  double get currentPower {
    final val = entityState(DashboardConfig.powerEntity);
    return double.tryParse(val) ?? 0;
  }

  // Thermostat
  HaEntity? get thermostat => entity(DashboardConfig.thermostatEntity);

  // EV Charger
  bool get isEvCharging => isEntityOn(DashboardConfig.evChargerEntity);
  String get evPower => entityState(DashboardConfig.evPowerEntity);
  String get evEnergyDay => entityState(DashboardConfig.evEnergyDayEntity);
  String get evEnergyMonth => entityState(DashboardConfig.evEnergyMonthEntity);

  // Pool
  bool get isPoolFilling => isEntityOn(DashboardConfig.poolValveEntity);

  // Gate
  bool get isGateEnabled => isEntityOn(DashboardConfig.gateEnabledEntity);
  bool get isGateScriptRunning => isEntityOn(DashboardConfig.gateScript);

  // Initialization
  Future<void> initialize() async {
    _isLoading = true;
    notifyListeners();

    _config = await _configService.loadConfig();

    _wsService.connectionStateStream.listen((state) {
      _connectionState = state;
      _error = state == ws.ConnectionState.error
          ? _wsService.errorMessage
          : null;
      notifyListeners();
    });

    _wsService.entityStream.listen((entities) {
      _entities = entities;
      notifyListeners();
    });

    if (_config.isConfigured) {
      await connect();
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> connect() async {
    await _wsService.connect(_config.haUrl, _config.accessToken);
  }

  void disconnect() => _wsService.disconnect();

  Future<void> updateConfig(DashboardConfig newConfig) async {
    final needsReconnect = newConfig.haUrl != _config.haUrl ||
        newConfig.accessToken != _config.accessToken;
    _config = newConfig;
    await _configService.saveConfig(newConfig);
    if (needsReconnect && newConfig.isConfigured) {
      disconnect();
      await connect();
    }
    notifyListeners();
  }

  // Service calls
  Future<void> toggleEntity(String entityId) async =>
      _wsService.toggleEntity(entityId);

  Future<void> turnOn(String entityId, {Map<String, dynamic>? data}) async =>
      _wsService.turnOn(entityId, data: data);

  Future<void> turnOff(String entityId) async =>
      _wsService.turnOff(entityId);

  Future<void> callScript(String scriptEntityId) async =>
      _wsService.callService('script', 'turn_on', entityId: scriptEntityId);

  Future<void> setLightBrightness(String entityId, int brightness) async =>
      _wsService.setLightBrightness(entityId, brightness);

  Future<void> setClimateTemperature(String entityId, double temp) async =>
      _wsService.setClimateTemperature(entityId, temp);

  Future<void> setClimateHvacMode(String entityId, String mode) async =>
      _wsService.setClimateHvacMode(entityId, mode);

  // Specific actions
  Future<void> armDay() async => callScript(DashboardConfig.armDayScript);
  Future<void> armNight() async => callScript(DashboardConfig.armNightScript);
  Future<void> disarm() async => callScript(DashboardConfig.disarmScript);
  Future<void> toggleSiren() async =>
      callScript(DashboardConfig.sirenToggleScript);

  Future<void> fillPool30() async =>
      toggleEntity(DashboardConfig.poolFill30Script);
  Future<void> fillPool60() async =>
      toggleEntity(DashboardConfig.poolFill60Script);
  Future<void> stopPool() async =>
      turnOff(DashboardConfig.poolValveEntity);

  Future<void> openGate() async => callScript(DashboardConfig.gateScript);
  Future<void> toggleEvCharger() async =>
      toggleEntity(DashboardConfig.evChargerEntity);

  @override
  void dispose() {
    _wsService.dispose();
    super.dispose();
  }
}
