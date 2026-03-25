import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/dashboard_provider.dart';

class ClockWeatherCard extends StatefulWidget {
  const ClockWeatherCard({super.key});

  @override
  State<ClockWeatherCard> createState() => _ClockWeatherCardState();
}

class _ClockWeatherCardState extends State<ClockWeatherCard> {
  late Timer _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  IconData _weatherIcon(String? state) {
    switch (state) {
      case 'sunny':
      case 'clear-night':
        return Icons.wb_sunny;
      case 'partlycloudy':
        return Icons.cloud_queue;
      case 'cloudy':
        return Icons.cloud;
      case 'rainy':
        return Icons.grain;
      case 'pouring':
        return Icons.water;
      case 'snowy':
        return Icons.ac_unit;
      case 'fog':
        return Icons.foggy;
      case 'lightning':
      case 'lightning-rainy':
        return Icons.flash_on;
      case 'windy':
        return Icons.air;
      default:
        return Icons.thermostat;
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final weather = provider.weatherEntity;
    final timeStr = DateFormat('HH:mm').format(_now);
    final dateStr = DateFormat('EEEE, dd MMMM', 'es').format(_now);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              timeStr,
              style: const TextStyle(
                fontSize: 64,
                fontWeight: FontWeight.w300,
                color: AppTheme.textPrimary,
                height: 1,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              dateStr,
              style: const TextStyle(
                fontSize: 18,
                color: AppTheme.textSecondary,
              ),
            ),
            if (weather != null) ...[
              const SizedBox(height: 16),
              const Divider(color: AppTheme.textMuted, height: 1),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _weatherIcon(weather.state),
                    size: 36,
                    color: AppTheme.amber,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${weather.temperature?.round() ?? '--'}°C',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _weatherDetail(Icons.water_drop, '${weather.humidity?.round() ?? '--'}%'),
                  const SizedBox(width: 20),
                  _weatherDetail(Icons.air, '${weather.windSpeed?.round() ?? '--'} km/h'),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _weatherDetail(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppTheme.textMuted),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14)),
      ],
    );
  }
}
