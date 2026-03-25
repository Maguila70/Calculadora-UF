import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class CamerasCard extends StatelessWidget {
  const CamerasCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final hasDetection = provider.hasActiveDetection;

    if (!hasDetection) return const SizedBox.shrink();

    final detections = provider.activeDetections;
    final camerasToShow = <MapEntry<String, String>>[];

    if (detections.containsKey('porton')) {
      camerasToShow.add(const MapEntry('Portón', DashboardConfig.cameraPorton));
    }
    if (detections.containsKey('piscina')) {
      camerasToShow.add(const MapEntry('Piscina', DashboardConfig.cameraPiscina));
    }
    if (detections.containsKey('jardin_norte')) {
      camerasToShow.add(const MapEntry('Jardín Norte', DashboardConfig.cameraJardinNorte));
    }

    if (camerasToShow.isEmpty) return const SizedBox.shrink();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.videocam, color: AppTheme.error, size: 20),
                SizedBox(width: 8),
                Text(
                  'Cámaras - Detección Activa',
                  style: TextStyle(
                    color: AppTheme.error,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...camerasToShow.map((cam) => _CameraPlaceholder(
                  name: cam.key,
                  entityId: cam.value,
                  haUrl: provider.config.haUrl,
                  accessToken: provider.entity(cam.value)?.accessToken,
                )),
          ],
        ),
      ),
    );
  }
}

class _CameraPlaceholder extends StatelessWidget {
  final String name;
  final String entityId;
  final String haUrl;
  final String? accessToken;

  const _CameraPlaceholder({
    required this.name,
    required this.entityId,
    required this.haUrl,
    this.accessToken,
  });

  @override
  Widget build(BuildContext context) {
    // In production, use the HA camera proxy URL:
    // $haUrl/api/camera_proxy/$entityId?token=$accessToken
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      height: 120,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.textMuted.withAlpha(50)),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.videocam, color: AppTheme.textMuted, size: 32),
            const SizedBox(height: 4),
            Text(
              name,
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
            ),
            Text(
              entityId,
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}
