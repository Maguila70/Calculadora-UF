import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class EnergyCard extends StatelessWidget {
  const EnergyCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final power = provider.currentPower;
    final maxPower = DashboardConfig.maxPower;
    final ratio = (power / maxPower).clamp(0.0, 1.0);

    Color barColor;
    if (power < 3500) {
      barColor = AppTheme.success;
    } else if (power < 5000) {
      barColor = AppTheme.warning;
    } else {
      barColor = AppTheme.error;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.flash_on, color: barColor, size: 22),
                const SizedBox(width: 8),
                const Text(
                  'Consumo Casa',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Text(
                  '${power.round()} W',
                  style: TextStyle(
                    color: barColor,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: ratio,
                minHeight: 14,
                backgroundColor: AppTheme.textMuted.withAlpha(50),
                valueColor: AlwaysStoppedAnimation(barColor),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('0 W', style: TextStyle(color: AppTheme.textMuted, fontSize: 10)),
                Text('${maxPower.round()} W',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 10)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
