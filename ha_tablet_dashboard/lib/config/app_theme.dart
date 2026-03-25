import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Dark theme inspired by Graphite Nightshade HA theme.
class AppTheme {
  static const Color background = Color(0xFF1A1A2E);
  static const Color surface = Color(0xFF16213E);
  static const Color card = Color(0xFF1E2A47);
  static const Color cardHover = Color(0xFF263356);
  static const Color primary = Color(0xFF03A9F4);
  static const Color accent = Color(0xFF00BCD4);
  static const Color textPrimary = Color(0xFFE8E8E8);
  static const Color textSecondary = Color(0xFF9E9E9E);
  static const Color textMuted = Color(0xFF616161);

  // Status colors
  static const Color success = Color(0xFF4CAF50);
  static const Color warning = Color(0xFFFF9800);
  static const Color error = Color(0xFFF44336);
  static const Color amber = Color(0xFFFFCA28);

  // Feature colors
  static const Color alarmArmedDay = Color(0xFFFF9800);
  static const Color alarmArmedNight = Color(0xFF2196F3);
  static const Color alarmDisarmed = Color(0xFF4CAF50);
  static const Color alarmTriggered = Color(0xFFF44336);
  static const Color detectionAlert = Color(0xFFF44336);
  static const Color lightOn = Color(0xFFFFCA28);
  static const Color lightOff = Color(0xFF616161);
  static const Color evCharging = Color(0xFF2196F3);
  static const Color poolActive = Color(0xFF00BCD4);
  static const Color gateActive = Color(0xFF03A9F4);

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: const ColorScheme.dark(
        primary: primary,
        secondary: accent,
        surface: surface,
        error: error,
      ),
      scaffoldBackgroundColor: background,
      cardColor: card,
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme).apply(
        bodyColor: textPrimary,
        displayColor: textPrimary,
      ),
      iconTheme: const IconThemeData(color: textSecondary, size: 28),
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        elevation: 0,
        titleTextStyle: GoogleFonts.inter(
          color: textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardTheme(
        color: card,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        margin: const EdgeInsets.all(4),
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: primary,
        inactiveTrackColor: textMuted,
        thumbColor: primary,
        trackHeight: 6,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
      ),
    );
  }
}
