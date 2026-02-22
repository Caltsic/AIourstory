import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Appearance,
  View,
  useColorScheme as useSystemColorScheme,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import {
  DEFAULT_THEME_PRESET_ID,
  getSchemeColors,
  isThemePresetId,
  type ColorScheme,
  type ThemePresetId,
} from "@/constants/theme";

const THEME_PRESET_STORAGE_KEY = "app_theme_preset";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  themePreset: ThemePresetId;
  setThemePreset: (preset: ThemePresetId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [colorScheme, setColorSchemeState] =
    useState<ColorScheme>(systemScheme);
  const [themePreset, setThemePresetState] = useState<ThemePresetId>(
    DEFAULT_THEME_PRESET_ID,
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_PRESET_STORAGE_KEY);
        if (!active || !saved || !isThemePresetId(saved)) return;
        setThemePresetState(saved);
      } catch {
        // ignore storage failures
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const applyScheme = useCallback((scheme: ColorScheme, preset: ThemePresetId) => {
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = `${preset}-${scheme}`;
      root.classList.toggle("dark", scheme === "dark");
      const palette = getSchemeColors(preset, scheme);
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setColorScheme = useCallback(
    (scheme: ColorScheme) => {
      setColorSchemeState(scheme);
      applyScheme(scheme, themePreset);
    },
    [applyScheme, themePreset],
  );

  const setThemePreset = useCallback(
    (preset: ThemePresetId) => {
      setThemePresetState(preset);
      void AsyncStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
      applyScheme(colorScheme, preset);
    },
    [applyScheme, colorScheme],
  );

  useEffect(() => {
    applyScheme(colorScheme, themePreset);
  }, [applyScheme, colorScheme, themePreset]);

  const themeVariables = useMemo(
    () => {
      const palette = getSchemeColors(themePreset, colorScheme);
      return vars({
        "color-primary": palette.primary,
        "color-background": palette.background,
        "color-surface": palette.surface,
        "color-foreground": palette.foreground,
        "color-muted": palette.muted,
        "color-border": palette.border,
        "color-success": palette.success,
        "color-warning": palette.warning,
        "color-error": palette.error,
      });
    },
    [colorScheme, themePreset],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      themePreset,
      setThemePreset,
    }),
    [colorScheme, setColorScheme, setThemePreset, themePreset],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
