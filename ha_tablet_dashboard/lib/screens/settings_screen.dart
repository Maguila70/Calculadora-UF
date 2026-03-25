import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/dashboard_config.dart';
import '../providers/dashboard_provider.dart';

class SettingsScreen extends StatefulWidget {
  final bool isInitialSetup;

  const SettingsScreen({super.key, this.isInitialSetup = false});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _urlController;
  late TextEditingController _tokenController;
  bool _keepScreenOn = true;
  bool _obscureToken = true;

  @override
  void initState() {
    super.initState();
    final config = context.read<DashboardProvider>().config;
    _urlController = TextEditingController(text: config.haUrl);
    _tokenController = TextEditingController(text: config.accessToken);
    _keepScreenOn = config.keepScreenOn;
  }

  @override
  void dispose() {
    _urlController.dispose();
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final provider = context.read<DashboardProvider>();
    final newConfig = DashboardConfig(
      haUrl: _urlController.text.trim(),
      accessToken: _tokenController.text.trim(),
      keepScreenOn: _keepScreenOn,
    );
    await provider.updateConfig(newConfig);
    if (mounted && !widget.isInitialSetup) {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isInitialSetup
            ? 'Configuración Inicial'
            : 'Configuración'),
        automaticallyImplyLeading: !widget.isInitialSetup,
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 500),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              if (widget.isInitialSetup) ...[
                const Icon(Icons.home, size: 64, color: AppTheme.primary),
                const SizedBox(height: 16),
                const Text(
                  'Home Assistant\nTablet Dashboard',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Conecta tu instancia de Home Assistant',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 32),
              ],

              // URL field
              const Text('URL de Home Assistant',
                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
              const SizedBox(height: 8),
              TextField(
                controller: _urlController,
                decoration: const InputDecoration(
                  hintText: 'http://homeassistant.local:8123',
                  prefixIcon: Icon(Icons.link),
                ),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: 20),

              // Token field
              const Text('Token de Acceso (Long-Lived)',
                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
              const SizedBox(height: 8),
              TextField(
                controller: _tokenController,
                obscureText: _obscureToken,
                decoration: InputDecoration(
                  hintText: 'Token de acceso de larga duración',
                  prefixIcon: const Icon(Icons.key),
                  suffixIcon: IconButton(
                    onPressed: () =>
                        setState(() => _obscureToken = !_obscureToken),
                    icon: Icon(
                      _obscureToken ? Icons.visibility : Icons.visibility_off,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Genera un token en: Perfil → Tokens de acceso de larga duración',
                style: TextStyle(color: AppTheme.textMuted, fontSize: 11),
              ),
              const SizedBox(height: 20),

              // Keep screen on
              SwitchListTile(
                title: const Text('Mantener pantalla encendida',
                    style: TextStyle(color: AppTheme.textPrimary)),
                subtitle: const Text('Evita que la tablet entre en reposo',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                value: _keepScreenOn,
                onChanged: (v) => setState(() => _keepScreenOn = v),
              ),
              const SizedBox(height: 32),

              // Save button
              ElevatedButton.icon(
                onPressed: _save,
                icon: const Icon(Icons.save),
                label: Text(widget.isInitialSetup ? 'Conectar' : 'Guardar'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 50),
                ),
              ),

              // Connection status
              Consumer<DashboardProvider>(
                builder: (_, provider, __) {
                  if (provider.error != null) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.error.withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Error: ${provider.error}',
                          style: const TextStyle(
                              color: AppTheme.error, fontSize: 12),
                        ),
                      ),
                    );
                  }
                  if (provider.isConnected) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.success.withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.check_circle,
                                color: AppTheme.success, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'Conectado - ${provider.entities.length} entidades',
                              style: const TextStyle(
                                  color: AppTheme.success, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  return const SizedBox.shrink();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
