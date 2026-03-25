import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class FamilyCard extends StatelessWidget {
  const FamilyCard({super.key});

  Color _colorFromName(String name) {
    switch (name) {
      case 'blue':
        return Colors.blue;
      case 'pink':
        return Colors.pink;
      case 'purple':
        return Colors.purple;
      case 'green':
        return Colors.green;
      default:
        return AppTheme.primary;
    }
  }

  IconData _iconFromName(String name) {
    switch (name) {
      case 'face-man':
        return Icons.face;
      case 'face-woman':
        return Icons.face_4;
      default:
        return Icons.person;
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: DashboardConfig.familyMembers.entries.map((entry) {
            final info = entry.value;
            final entityId = info['entity']!;
            final name = info['name']!;
            final color = _colorFromName(info['color']!);
            final icon = _iconFromName(info['icon']!);
            final state = provider.entityState(entityId);
            final isHome = state == 'home';

            return Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color.withAlpha(isHome ? 50 : 20),
                      border: Border.all(
                        color: isHome ? color : AppTheme.textMuted,
                        width: 2,
                      ),
                    ),
                    child: Icon(icon, color: isHome ? color : AppTheme.textMuted, size: 28),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    name,
                    style: TextStyle(
                      color: isHome ? AppTheme.textPrimary : AppTheme.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    _translateState(state),
                    style: TextStyle(
                      color: isHome ? color : AppTheme.textMuted,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  String _translateState(String state) {
    switch (state) {
      case 'home':
        return 'En casa';
      case 'not_home':
        return 'Fuera';
      case 'unavailable':
        return 'No disponible';
      default:
        return state;
    }
  }
}
