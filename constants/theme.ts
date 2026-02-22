/**
 * Thin re-exports so consumers don't need to know about internal theme plumbing.
 * Full implementation lives in lib/_core/theme.ts.
 */
export {
  Colors,
  DEFAULT_THEME_PRESET_ID,
  Fonts,
  ThemePresets,
  ThemePresetPalettes,
  ThemePresetIds,
  SchemeColors,
  ThemeColors,
  type ColorScheme,
  type ThemePresetId,
  type ThemeColorPalette,
  getSchemeColors,
  getThemeColors,
  isThemePresetId,
} from "@/lib/_core/theme";
