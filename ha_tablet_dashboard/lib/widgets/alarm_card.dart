import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class AlarmCard extends StatelessWidget {
  const AlarmCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final alarmState = provider.alarmState;
    final hasDetection = provider.hasActiveDetection;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Detection alert
            if (hasDetection) _buildDetectionAlert(context, provider),

            // Alarm status badge
            _buildAlarmStatus(alarmState),
            const SizedBox(height: 12),

            // Status chips row
            _buildStatusChips(provider),
            const SizedBox(height: 12),

            // Alarm control buttons
            _buildAlarmControls(context, provider),
          ],
        ),
      ),
    );
  }

  Widget _buildDetectionAlert(BuildContext context, DashboardProvider provider) {
    final detections = provider.activeDetections;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.detectionAlert.withAlpha(50),
        borderRadius: BorderRadius.circular(12),
        border: const Border(
          left: BorderSide(color: AppTheme.detectionAlert, width: 4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.warning_amber, color: AppTheme.detectionAlert, size: 20),
              SizedBox(width: 8),
              Text(
                '🚨 Persona Detectada',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppTheme.detectionAlert,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...detections.entries.map((entry) {
            final zoneName =
                DashboardConfig.zoneNames[entry.key] ?? entry.key;
            final isLive = entry.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(
                '$zoneName: ${isLive ? '🔴 Detección en curso' : '⚠️ Detección reciente'}',
                style: TextStyle(
                  color: isLive ? AppTheme.detectionAlert : AppTheme.warning,
                  fontSize: 12,
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildAlarmStatus(String state) {
    Color color;
    IconData icon;

    switch (state) {
      case 'Armado Día':
        color = AppTheme.alarmArmedDay;
        icon = Icons.shield;
        break;
      case 'Armado Noche':
        color = AppTheme.alarmArmedNight;
        icon = Icons.shield_moon;
        break;
      case 'Armado Fuera':
        color = AppTheme.alarmArmedNight;
        icon = Icons.lock;
        break;
      case 'Disparada':
        color = AppTheme.alarmTriggered;
        icon = Icons.notification_important;
        break;
      case 'Armando':
      case 'Desarmando':
      case 'Pendiente':
        color = AppTheme.primary;
        icon = Icons.sync;
        break;
      default:
        color = AppTheme.alarmDisarmed;
        icon = Icons.shield_outlined;
    }

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(100)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 8),
          Text(
            'Alarma: $state',
            style: TextStyle(
              color: color,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusChips(DashboardProvider provider) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Siren chip
        _StatusChip(
          icon: provider.isSirenOn
              ? Icons.notifications_active
              : provider.isSirenEnabled
                  ? Icons.notifications
                  : Icons.notifications_off,
          color: provider.isSirenOn
              ? AppTheme.error
              : provider.isSirenEnabled
                  ? AppTheme.amber
                  : AppTheme.textMuted,
          label: provider.isSirenOn ? 'Sonando' : 'Sirena',
          onTap: () => provider.toggleSiren(),
        ),
        const SizedBox(width: 8),
        // Pool sensor bypass chip
        _StatusChip(
          icon: provider.isEntityOn(DashboardConfig.poolBypassEntity)
              ? Icons.sensors_off
              : Icons.sensors,
          color: provider.isEntityOn(DashboardConfig.poolBypassEntity)
              ? AppTheme.error
              : AppTheme.success,
          label: 'Rayo Piscina',
          onTap: null,
        ),
      ],
    );
  }

  Widget _buildAlarmControls(
      BuildContext context, DashboardProvider provider) {
    final isDisarmed =
        provider.entityState(DashboardConfig.alarmEntity) == 'disarmed';

    if (isDisarmed) {
      return Row(
        children: [
          Expanded(
            child: _AlarmButton(
              label: 'Armado Día',
              icon: Icons.wb_sunny,
              color: AppTheme.alarmArmedDay,
              onTap: () => provider.armDay(),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _AlarmButton(
              label: 'Armado Noche',
              icon: Icons.nightlight,
              color: AppTheme.alarmArmedNight,
              onTap: () => provider.armNight(),
            ),
          ),
        ],
      );
    } else {
      return _AlarmButton(
        label: 'Desarmar',
        icon: Icons.lock_open,
        color: AppTheme.alarmDisarmed,
        onTap: () => provider.disarm(),
      );
    }
  }
}

class _StatusChip extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback? onTap;

  const _StatusChip({
    required this.icon,
    required this.color,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withAlpha(25),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: color, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

class _AlarmButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _AlarmButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withAlpha(25),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
