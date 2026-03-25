import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class LightsCard extends StatelessWidget {
  const LightsCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.lightbulb_outline, color: AppTheme.lightOn, size: 20),
                SizedBox(width: 8),
                Text(
                  'Luces',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: DashboardConfig.lights.entries.map((entry) {
                final info = entry.value;
                final entityId = info['entity']!;
                final name = info['name']!;
                final script = info['script'];
                final isOn = provider.isEntityOn(entityId);

                return _LightChip(
                  name: name,
                  isOn: isOn,
                  onTap: () {
                    if (script != null) {
                      provider.callScript(script);
                    } else {
                      provider.toggleEntity(entityId);
                    }
                  },
                  onLongPress: entityId.startsWith('light.')
                      ? () => _showBrightnessDialog(context, provider, entityId, name)
                      : null,
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  void _showBrightnessDialog(
    BuildContext context,
    DashboardProvider provider,
    String entityId,
    String name,
  ) {
    final entity = provider.entity(entityId);
    double brightness = (entity?.brightness ?? 128) / 255.0;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          backgroundColor: AppTheme.card,
          title: Text(name, style: const TextStyle(color: AppTheme.textPrimary)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Brillo', style: TextStyle(color: AppTheme.textSecondary)),
              Slider(
                value: brightness,
                onChanged: (v) => setState(() => brightness = v),
                onChangeEnd: (v) {
                  provider.setLightBrightness(entityId, (v * 255).round());
                },
              ),
              Text(
                '${(brightness * 100).round()}%',
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 18),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cerrar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _LightChip extends StatelessWidget {
  final String name;
  final bool isOn;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _LightChip({
    required this.name,
    required this.isOn,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isOn ? AppTheme.lightOn.withAlpha(30) : AppTheme.textMuted.withAlpha(20),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isOn ? AppTheme.lightOn.withAlpha(100) : Colors.transparent,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.lightbulb,
              size: 16,
              color: isOn ? AppTheme.lightOn : AppTheme.textMuted,
            ),
            const SizedBox(width: 6),
            Text(
              name,
              style: TextStyle(
                color: isOn ? AppTheme.lightOn : AppTheme.textSecondary,
                fontSize: 12,
                fontWeight: isOn ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
