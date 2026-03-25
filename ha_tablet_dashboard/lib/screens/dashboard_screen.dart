import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/dashboard_provider.dart';
import '../services/ha_websocket_service.dart' as ws;
import '../widgets/alarm_card.dart';
import '../widgets/cameras_card.dart';
import '../widgets/clock_weather_card.dart';
import '../widgets/energy_card.dart';
import '../widgets/family_card.dart';
import '../widgets/gate_ev_card.dart';
import '../widgets/lights_card.dart';
import '../widgets/pool_card.dart';
import '../widgets/thermostat_card.dart';
import 'settings_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();

    if (provider.isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!provider.config.isConfigured) {
      return const SettingsScreen(isInitialSetup: true);
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Top bar with connection status
            _buildTopBar(context, provider),
            // Main dashboard content
            Expanded(
              child: _buildDashboard(context, provider),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context, DashboardProvider provider) {
    final isConnected = provider.isConnected;
    final error = provider.error;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppTheme.surface,
      child: Row(
        children: [
          Icon(
            isConnected ? Icons.cloud_done : Icons.cloud_off,
            color: isConnected ? AppTheme.success : AppTheme.error,
            size: 18,
          ),
          const SizedBox(width: 8),
          Text(
            isConnected
                ? 'Conectado'
                : error ?? 'Desconectado',
            style: TextStyle(
              color: isConnected ? AppTheme.success : AppTheme.error,
              fontSize: 12,
            ),
          ),
          const Spacer(),
          if (!isConnected)
            IconButton(
              onPressed: () => provider.connect(),
              icon: const Icon(Icons.refresh, size: 20),
              color: AppTheme.primary,
              tooltip: 'Reconectar',
            ),
          IconButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
            icon: const Icon(Icons.settings, size: 20),
            color: AppTheme.textSecondary,
          ),
        ],
      ),
    );
  }

  Widget _buildDashboard(BuildContext context, DashboardProvider provider) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Tablet landscape: 3 columns
        // Tablet portrait: 2 columns
        // Phone: 1 column
        final isLandscape = constraints.maxWidth > constraints.maxHeight;
        final isTablet = constraints.maxWidth > 600;

        if (isTablet && isLandscape) {
          return _buildTabletLandscape(provider);
        } else if (isTablet) {
          return _buildTabletPortrait(provider);
        }
        return _buildPhone(provider);
      },
    );
  }

  Widget _buildTabletLandscape(DashboardProvider provider) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Column 1: Clock/Weather + Family + Energy
          Expanded(
            flex: 3,
            child: ListView(
              padding: const EdgeInsets.all(4),
              children: const [
                ClockWeatherCard(),
                FamilyCard(),
                EnergyCard(),
              ],
            ),
          ),
          // Column 2: Alarm + Cameras + Thermostat
          Expanded(
            flex: 4,
            child: ListView(
              padding: const EdgeInsets.all(4),
              children: const [
                AlarmCard(),
                CamerasCard(),
                ThermostatCard(),
              ],
            ),
          ),
          // Column 3: Lights + Pool + Gate/EV
          Expanded(
            flex: 3,
            child: ListView(
              padding: const EdgeInsets.all(4),
              children: const [
                LightsCard(),
                PoolCard(),
                GateEvCard(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabletPortrait(DashboardProvider provider) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(4),
              children: const [
                ClockWeatherCard(),
                AlarmCard(),
                CamerasCard(),
                ThermostatCard(),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(4),
              children: const [
                FamilyCard(),
                EnergyCard(),
                LightsCard(),
                PoolCard(),
                GateEvCard(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhone(DashboardProvider provider) {
    return ListView(
      padding: const EdgeInsets.all(8),
      children: const [
        ClockWeatherCard(),
        AlarmCard(),
        CamerasCard(),
        FamilyCard(),
        EnergyCard(),
        ThermostatCard(),
        LightsCard(),
        PoolCard(),
        GateEvCard(),
      ],
    );
  }
}
