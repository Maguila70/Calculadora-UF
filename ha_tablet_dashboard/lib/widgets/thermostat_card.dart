import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class ThermostatCard extends StatelessWidget {
  const ThermostatCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final thermostat = provider.thermostat;

    if (thermostat == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Center(
            child: Text('Calefacción no disponible',
                style: TextStyle(color: AppTheme.textMuted)),
          ),
        ),
      );
    }

    final currentTemp = thermostat.currentTemperature ?? 0;
    final targetTemp = thermostat.temperature ?? 20;
    final hvacAction = thermostat.hvacAction ?? 'idle';
    final isHeating = hvacAction == 'heating';
    final isOff = thermostat.state == 'off';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Icon(
                  Icons.thermostat,
                  color: isHeating
                      ? AppTheme.warning
                      : isOff
                          ? AppTheme.textMuted
                          : AppTheme.primary,
                  size: 22,
                ),
                const SizedBox(width: 8),
                const Text(
                  'Calefacción',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isHeating
                        ? AppTheme.warning.withAlpha(30)
                        : AppTheme.textMuted.withAlpha(30),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isHeating ? 'Calentando' : isOff ? 'Apagado' : 'Idle',
                    style: TextStyle(
                      color: isHeating ? AppTheme.warning : AppTheme.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Column(
                  children: [
                    Text(
                      '${currentTemp.toStringAsFixed(1)}°',
                      style: const TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w300,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const Text(
                      'Actual',
                      style:
                          TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
                const SizedBox(width: 32),
                Column(
                  children: [
                    Text(
                      '${targetTemp.toStringAsFixed(1)}°',
                      style: TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w300,
                        color: isHeating ? AppTheme.warning : AppTheme.primary,
                      ),
                    ),
                    const Text(
                      'Objetivo',
                      style:
                          TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: () => provider.setClimateTemperature(
                    DashboardConfig.thermostatEntity,
                    targetTemp - 0.5,
                  ),
                  icon: const Icon(Icons.remove_circle_outline),
                  color: AppTheme.primary,
                ),
                const SizedBox(width: 16),
                IconButton(
                  onPressed: () => provider.setClimateTemperature(
                    DashboardConfig.thermostatEntity,
                    targetTemp + 0.5,
                  ),
                  icon: const Icon(Icons.add_circle_outline),
                  color: AppTheme.primary,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
