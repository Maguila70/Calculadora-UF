/// Configuration for the HA tablet dashboard.
/// Entity IDs match the user's specific Home Assistant setup.
class DashboardConfig {
  final String haUrl;
  final String accessToken;
  final bool keepScreenOn;

  // Alarm
  static const String alarmEntity =
      'alarm_control_panel.risco_gonzalo_astica_partition_0';
  static const String alarmStateEntity = 'input_select.estado_alarma_mejorado';
  static const String sirenEntity = 'siren.outdoor_siren';
  static const String sirenEnabledEntity = 'input_boolean.sirena_habilitada';
  static const String poolBypassEntity = 'switch.piscina_canal_omitido';

  // Alarm scripts
  static const String armDayScript = 'script.armado_dia';
  static const String armNightScript = 'script.armado_noche';
  static const String disarmScript = 'script.desarmar_alarma';
  static const String sirenToggleScript = 'script.activa_desactiva_sirena';

  // Detection zones
  static const List<String> detectionZones = [
    'jardin_norte',
    'jardin_sur',
    'jardin_este',
    'porton',
    'estacionamiento',
    'piscina',
  ];

  static const Map<String, String> zoneNames = {
    'jardin_norte': 'Jardín Norte',
    'jardin_sur': 'Jardín Sur',
    'jardin_este': 'Jardín Este',
    'porton': 'Portón',
    'estacionamiento': 'Estacionamiento',
    'piscina': 'Piscina',
  };

  // Person detection entities (binary_sensor.<zone>_persona)
  // Recent detection entities (binary_sensor.deteccion_reciente_<zone>)

  // Family tracking
  static const Map<String, Map<String, String>> familyMembers = {
    'gonzalo': {
      'entity': 'device_tracker.sm_s911b',
      'name': 'Gonzalo',
      'icon': 'face-man',
      'color': 'blue',
    },
    'fabiola': {
      'entity': 'device_tracker.sm_s906e',
      'name': 'Fabiola',
      'icon': 'face-woman',
      'color': 'pink',
    },
    'valentina': {
      'entity': 'device_tracker.sm_f731b',
      'name': 'Valentina',
      'icon': 'face-woman',
      'color': 'purple',
    },
    'jose': {
      'entity': 'device_tracker.iphone',
      'name': 'José',
      'icon': 'face-man',
      'color': 'green',
    },
  };

  // Lights
  static const Map<String, Map<String, String>> lights = {
    'comedor': {
      'entity': 'switch.luces_comedor',
      'name': 'Comedor',
      'icon': 'ceiling-light',
    },
    'living': {
      'entity': 'light.lampara_living',
      'name': 'Living',
      'icon': 'floor-lamp',
    },
    'dormitorio': {
      'entity': 'light.lampara_habitacion_principal',
      'name': 'Dormitorio',
      'icon': 'bed-double',
    },
    'estacionamiento': {
      'entity': 'switch.luces_estacionamiento',
      'name': 'Estacionamiento',
      'icon': 'lightbulb-group',
    },
    'jardin': {
      'entity': 'input_boolean.luces_jardin',
      'name': 'Jardín',
      'icon': 'outdoor-lamp',
      'script': 'script.alternar_luces_jardin_2',
    },
    'rampa': {
      'entity': 'switch.luces_rampa',
      'name': 'Rampa',
      'icon': 'lightbulb',
    },
    'terraza': {
      'entity': 'switch.luces_terraza',
      'name': 'Terraza',
      'icon': 'lightbulb',
    },
    'terraza_2do': {
      'entity': 'switch.luces_terraza_2do_piso',
      'name': 'Terraza 2do',
      'icon': 'lightbulb',
    },
    'puerta_entrada': {
      'entity': 'switch.luces_puerta_de_entrada',
      'name': 'Puerta Entrada',
      'icon': 'lightbulb',
    },
  };

  // Energy
  static const String powerEntity = 'sensor.sonoff_1002334154_power';
  static const double maxPower = 5800;

  // Climate
  static const String thermostatEntity = 'climate.termostato_caldera';

  // Weather
  static const String weatherEntity = 'weather.forecast_casa';

  // Pool
  static const String poolFill30Script = 'script.llenado_piscina_30_minutos';
  static const String poolFill60Script = 'script.llenado_piscina_1_hora';
  static const String poolValveEntity = 'switch.llave_piscina_interruptor_1';

  // Gate
  static const String gateEnabledEntity = 'input_boolean.porton_enabled';
  static const String gateScript = 'script.boton_porton';
  static const String gateCameraEntity = 'camera.porton_fluent';

  // EV Charger
  static const String evChargerEntity = 'switch.sonoff_10022c80a0';
  static const String evPowerEntity = 'sensor.sonoff_10022c80a0_power';
  static const String evEnergyDayEntity = 'sensor.sonoff_10022c80a0_energy_day';
  static const String evEnergyMonthEntity =
      'sensor.sonoff_10022c80a0_energy_month';

  // Cameras
  static const String cameraPorton = 'camera.porton_fluent';
  static const String cameraPiscina = 'camera.piscina_fluent';
  static const String cameraJardinNorte =
      'camera.jardin_norte_seguimiento_automatico_fluent';

  const DashboardConfig({
    this.haUrl = '',
    this.accessToken = '',
    this.keepScreenOn = true,
  });

  bool get isConfigured => haUrl.isNotEmpty && accessToken.isNotEmpty;

  DashboardConfig copyWith({
    String? haUrl,
    String? accessToken,
    bool? keepScreenOn,
  }) {
    return DashboardConfig(
      haUrl: haUrl ?? this.haUrl,
      accessToken: accessToken ?? this.accessToken,
      keepScreenOn: keepScreenOn ?? this.keepScreenOn,
    );
  }

  Map<String, dynamic> toJson() => {
        'ha_url': haUrl,
        'access_token': accessToken,
        'keep_screen_on': keepScreenOn,
      };

  factory DashboardConfig.fromJson(Map<String, dynamic> json) {
    return DashboardConfig(
      haUrl: json['ha_url'] as String? ?? '',
      accessToken: json['access_token'] as String? ?? '',
      keepScreenOn: json['keep_screen_on'] as bool? ?? true,
    );
  }
}
