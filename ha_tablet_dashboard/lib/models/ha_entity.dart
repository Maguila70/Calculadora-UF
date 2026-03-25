/// Represents a Home Assistant entity with its state and attributes.
class HaEntity {
  final String entityId;
  final String state;
  final Map<String, dynamic> attributes;
  final DateTime lastChanged;
  final DateTime lastUpdated;

  HaEntity({
    required this.entityId,
    required this.state,
    this.attributes = const {},
    DateTime? lastChanged,
    DateTime? lastUpdated,
  })  : lastChanged = lastChanged ?? DateTime.now(),
        lastUpdated = lastUpdated ?? DateTime.now();

  String get domain => entityId.split('.').first;
  String get objectId => entityId.split('.').last;
  String get friendlyName =>
      attributes['friendly_name'] as String? ??
      objectId.replaceAll('_', ' ');
  String? get icon => attributes['icon'] as String?;
  String? get unitOfMeasurement =>
      attributes['unit_of_measurement'] as String?;

  bool get isOn => state == 'on' || state == 'home' || state == 'playing';
  bool get isOff => state == 'off' || state == 'not_home' || state == 'idle';
  bool get isUnavailable => state == 'unavailable' || state == 'unknown';

  // Light
  int? get brightness => attributes['brightness'] as int?;

  // Climate
  double? get temperature => (attributes['temperature'] as num?)?.toDouble();
  double? get currentTemperature =>
      (attributes['current_temperature'] as num?)?.toDouble();
  String? get hvacAction => attributes['hvac_action'] as String?;
  List<String>? get hvacModes =>
      (attributes['hvac_modes'] as List<dynamic>?)?.cast<String>();

  // Weather
  double? get humidity => (attributes['humidity'] as num?)?.toDouble();
  double? get pressure => (attributes['pressure'] as num?)?.toDouble();
  double? get windSpeed => (attributes['wind_speed'] as num?)?.toDouble();
  List<dynamic>? get forecast => attributes['forecast'] as List<dynamic>?;

  // Media player
  double? get volumeLevel =>
      (attributes['volume_level'] as num?)?.toDouble();

  // Camera
  String? get accessToken => attributes['access_token'] as String?;

  factory HaEntity.fromJson(Map<String, dynamic> json) {
    return HaEntity(
      entityId: json['entity_id'] as String,
      state: json['state'] as String? ?? 'unknown',
      attributes: (json['attributes'] as Map<String, dynamic>?) ?? {},
      lastChanged: json['last_changed'] != null
          ? DateTime.parse(json['last_changed'] as String)
          : null,
      lastUpdated: json['last_updated'] != null
          ? DateTime.parse(json['last_updated'] as String)
          : null,
    );
  }

  HaEntity copyWith({
    String? state,
    Map<String, dynamic>? attributes,
    DateTime? lastChanged,
    DateTime? lastUpdated,
  }) {
    return HaEntity(
      entityId: entityId,
      state: state ?? this.state,
      attributes: attributes ?? this.attributes,
      lastChanged: lastChanged ?? this.lastChanged,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}
