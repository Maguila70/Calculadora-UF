import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/dashboard_provider.dart';

class PoolCard extends StatelessWidget {
  const PoolCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final isFilling = provider.isPoolFilling;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.pool,
                  color: isFilling ? AppTheme.poolActive : AppTheme.textSecondary,
                  size: 22,
                ),
                const SizedBox(width: 8),
                const Text(
                  'Piscina',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (isFilling) ...[
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.poolActive.withAlpha(30),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Llenando',
                      style: TextStyle(color: AppTheme.poolActive, fontSize: 11),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _PoolButton(
                    label: '30 min',
                    icon: Icons.timer,
                    onTap: () => provider.fillPool30(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _PoolButton(
                    label: '1 hora',
                    icon: Icons.timer,
                    onTap: () => provider.fillPool60(),
                  ),
                ),
                if (isFilling) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: _PoolButton(
                      label: 'Detener',
                      icon: Icons.stop,
                      isStop: true,
                      onTap: () => provider.stopPool(),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PoolButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool isStop;

  const _PoolButton({
    required this.label,
    required this.icon,
    required this.onTap,
    this.isStop = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = isStop ? AppTheme.error : AppTheme.poolActive;

    return Material(
      color: color.withAlpha(20),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
