import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/ha_entity.dart';

enum ConnectionState { disconnected, connecting, connected, authenticated, error }

class HaWebSocketService {
  WebSocketChannel? _channel;
  int _messageId = 0;
  ConnectionState _connectionState = ConnectionState.disconnected;
  String _errorMessage = '';

  final _stateController = StreamController<ConnectionState>.broadcast();
  final _entityController = StreamController<Map<String, HaEntity>>.broadcast();
  final _eventController = StreamController<Map<String, dynamic>>.broadcast();

  final Map<int, Completer<dynamic>> _pendingRequests = {};
  final Map<String, HaEntity> _entities = {};

  Stream<ConnectionState> get connectionStateStream => _stateController.stream;
  Stream<Map<String, HaEntity>> get entityStream => _entityController.stream;
  Stream<Map<String, dynamic>> get eventStream => _eventController.stream;
  ConnectionState get connectionState => _connectionState;
  String get errorMessage => _errorMessage;
  Map<String, HaEntity> get entities => Map.unmodifiable(_entities);

  int get _nextId => ++_messageId;

  Future<void> connect(String url, String accessToken) async {
    if (_connectionState == ConnectionState.connecting ||
        _connectionState == ConnectionState.authenticated) {
      return;
    }

    _setConnectionState(ConnectionState.connecting);

    try {
      final wsUrl = _buildWsUrl(url);
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

      _channel!.stream.listen(
        (data) => _handleMessage(json.decode(data as String), accessToken),
        onError: (error) {
          _errorMessage = error.toString();
          _setConnectionState(ConnectionState.error);
        },
        onDone: () {
          _setConnectionState(ConnectionState.disconnected);
        },
      );
    } catch (e) {
      _errorMessage = e.toString();
      _setConnectionState(ConnectionState.error);
    }
  }

  String _buildWsUrl(String url) {
    var wsUrl = url.trim();
    if (wsUrl.endsWith('/')) wsUrl = wsUrl.substring(0, wsUrl.length - 1);
    if (wsUrl.startsWith('http://')) {
      wsUrl = 'ws://${wsUrl.substring(7)}/api/websocket';
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = 'wss://${wsUrl.substring(8)}/api/websocket';
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = 'ws://$wsUrl/api/websocket';
    } else if (!wsUrl.endsWith('/api/websocket')) {
      wsUrl = '$wsUrl/api/websocket';
    }
    return wsUrl;
  }

  void _handleMessage(Map<String, dynamic> message, String accessToken) {
    final type = message['type'] as String?;

    switch (type) {
      case 'auth_required':
        _authenticate(accessToken);
        break;
      case 'auth_ok':
        _setConnectionState(ConnectionState.authenticated);
        _subscribeToStateChanges();
        _fetchStates();
        break;
      case 'auth_invalid':
        _errorMessage = message['message'] as String? ?? 'Autenticación inválida';
        _setConnectionState(ConnectionState.error);
        break;
      case 'result':
        _handleResult(message);
        break;
      case 'event':
        _handleEvent(message);
        break;
    }
  }

  void _authenticate(String token) {
    _send({'type': 'auth', 'access_token': token});
  }

  Future<dynamic> _sendCommand(Map<String, dynamic> command) {
    final id = _nextId;
    command['id'] = id;
    final completer = Completer<dynamic>();
    _pendingRequests[id] = completer;
    _send(command);
    return completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        _pendingRequests.remove(id);
        return null;
      },
    );
  }

  void _send(Map<String, dynamic> data) {
    _channel?.sink.add(json.encode(data));
  }

  void _handleResult(Map<String, dynamic> message) {
    final id = message['id'] as int?;
    if (id != null && _pendingRequests.containsKey(id)) {
      final completer = _pendingRequests.remove(id)!;
      if (message['success'] == true) {
        completer.complete(message['result']);
      } else {
        completer.completeError(
          message['error']?['message'] ?? 'Unknown error',
        );
      }
    }
  }

  void _handleEvent(Map<String, dynamic> message) {
    final eventData = message['event'] as Map<String, dynamic>?;
    if (eventData == null) return;

    final eventType = eventData['event_type'] as String?;
    if (eventType == 'state_changed') {
      final data = eventData['data'] as Map<String, dynamic>?;
      if (data != null && data['new_state'] != null) {
        final entity = HaEntity.fromJson(
          data['new_state'] as Map<String, dynamic>,
        );
        _entities[entity.entityId] = entity;
        _entityController.add(Map.unmodifiable(_entities));
      }
    }

    _eventController.add(eventData);
  }

  Future<void> _subscribeToStateChanges() async {
    await _sendCommand({
      'type': 'subscribe_events',
      'event_type': 'state_changed',
    });
  }

  Future<void> _fetchStates() async {
    final result = await _sendCommand({'type': 'get_states'});
    if (result is List) {
      _entities.clear();
      for (final stateData in result) {
        final entity =
            HaEntity.fromJson(stateData as Map<String, dynamic>);
        _entities[entity.entityId] = entity;
      }
      _entityController.add(Map.unmodifiable(_entities));
    }
  }

  // --- Service calls ---

  Future<void> callService(
    String domain,
    String service, {
    String? entityId,
    Map<String, dynamic>? data,
  }) async {
    final serviceData = <String, dynamic>{
      'type': 'call_service',
      'domain': domain,
      'service': service,
    };
    if (entityId != null) {
      serviceData['target'] = {'entity_id': entityId};
    }
    if (data != null) {
      serviceData['service_data'] = data;
    }
    await _sendCommand(serviceData);
  }

  Future<void> toggleEntity(String entityId) async {
    final domain = entityId.split('.').first;
    await callService(domain, 'toggle', entityId: entityId);
  }

  Future<void> turnOn(String entityId, {Map<String, dynamic>? data}) async {
    final domain = entityId.split('.').first;
    await callService(domain, 'turn_on', entityId: entityId, data: data);
  }

  Future<void> turnOff(String entityId) async {
    final domain = entityId.split('.').first;
    await callService(domain, 'turn_off', entityId: entityId);
  }

  Future<void> setClimateTemperature(
      String entityId, double temperature) async {
    await callService('climate', 'set_temperature',
        entityId: entityId, data: {'temperature': temperature});
  }

  Future<void> setClimateHvacMode(String entityId, String mode) async {
    await callService('climate', 'set_hvac_mode',
        entityId: entityId, data: {'hvac_mode': mode});
  }

  Future<void> mediaPlayPause(String entityId) async {
    await callService('media_player', 'media_play_pause',
        entityId: entityId);
  }

  Future<void> mediaNext(String entityId) async {
    await callService('media_player', 'media_next_track',
        entityId: entityId);
  }

  Future<void> mediaPrevious(String entityId) async {
    await callService('media_player', 'media_previous_track',
        entityId: entityId);
  }

  Future<void> setVolume(String entityId, double level) async {
    await callService('media_player', 'volume_set',
        entityId: entityId, data: {'volume_level': level});
  }

  Future<void> activateScene(String entityId) async {
    await callService('scene', 'turn_on', entityId: entityId);
  }

  Future<void> setLightBrightness(String entityId, int brightness) async {
    await callService('light', 'turn_on',
        entityId: entityId, data: {'brightness': brightness});
  }

  Future<void> setLightColor(String entityId, List<int> rgb) async {
    await callService('light', 'turn_on',
        entityId: entityId, data: {'rgb_color': rgb});
  }

  void _setConnectionState(ConnectionState state) {
    _connectionState = state;
    _stateController.add(state);
  }

  void disconnect() {
    _channel?.sink.close();
    _channel = null;
    _entities.clear();
    _pendingRequests.clear();
    _messageId = 0;
    _setConnectionState(ConnectionState.disconnected);
  }

  void dispose() {
    disconnect();
    _stateController.close();
    _entityController.close();
    _eventController.close();
  }
}
