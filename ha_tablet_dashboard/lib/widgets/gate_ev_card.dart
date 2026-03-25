import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/dashboard_provider.dart';

class GateEvCard extends StatelessWidget {
  const GateEvCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            // Gate button
            Expanded(child: _GateButton(provider: provider)),
            const SizedBox(width: 8),
            // EV Charger
            Expanded(child: _EvChargerButton(provider: provider)),
          ],
        ),
      ),
    );
  }
}

class _GateButton extends StatelessWidget {
  final DashboardProvider provider;
  const _GateButton({required this.provider});

  @override
  Widget build(BuildContext context) {
    final isEnabled = provider.isGateEnabled;
    final isRunning = provider.isGateScriptRunning;

    return Material(
      color: isRunning
          ? AppTheme.gateActive.withAlpha(30)
          : AppTheme.textMuted.withAlpha(20),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: isEnabled ? () => provider.openGate() : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            children: [
              Icon(
                Icons.door_sliding,
                size: 32,
                color: isEnabled
                    ? (isRunning ? AppTheme.gateActive : AppTheme.primary)
                    : AppTheme.textMuted,
              ),
              const SizedBox(height: 6),
              Text(
                'Portón',
                style: TextStyle(
                  color: isEnabled ? AppTheme.textPrimary : AppTheme.textMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (isRunning)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text(
                    'Abriendo...',
                    style: TextStyle(color: AppTheme.gateActive, fontSize: 10),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EvChargerButton extends StatelessWidget {
  final DashboardProvider provider;
  const _EvChargerButton({required this.provider});

  @override
  Widget build(BuildContext context) {
    final isCharging = provider.isEvCharging;
    final power = provider.evPower;
    final energyDay = provider.evEnergyDay;

    return Material(
      color: isCharging
          ? AppTheme.evCharging.withAlpha(30)
          : AppTheme.textMuted.withAlpha(20),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => provider.toggleEvCharger(),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            children: [
              Icon(
                Icons.ev_station,
                size: 32,
                color: isCharging ? AppTheme.evCharging : AppTheme.textMuted,
              ),
              const SizedBox(height: 4),
              Text(
                'Cargador EV',
                style: TextStyle(
                  color: isCharging ? AppTheme.textPrimary : AppTheme.textMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                isCharging ? '$power W' : 'Desconectado',
                style: TextStyle(
                  color: isCharging ? AppTheme.evCharging : AppTheme.textMuted,
                  fontSize: 11,
                ),
              ),
              if (energyDay != 'unavailable')
                Text(
                  '24h: $energyDay kWh',
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 10),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
