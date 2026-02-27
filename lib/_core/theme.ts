import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";
export type ThemePresetId =
  | "paper-ink-narrative"
  | "default"
  | "mimic-sentient-trail";

export const ThemePresetIds = [
  "paper-ink-narrative",
  "default",
  "mimic-sentient-trail",
] as const;
export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "paper-ink-narrative";

export const ThemePresets = [
  {
    id: "paper-ink-narrative" as ThemePresetId,
    label: "\u7EB8\u58A8\u53D9\u5883",
    description: "\u5B98\u7F51\u540C\u6B3E\u6E29\u6DA6\u53D9\u4E8B\u98CE\u683C",
  },
  {
    id: "default" as ThemePresetId,
    label: "\u591C\u5E55\u7EEF\u7AE0",
    description: "\u7ECF\u5178\u6697\u8272\u5267\u573A\u98CE\u683C",
  },
  {
    id: "mimic-sentient-trail" as ThemePresetId,
    label: "\u6781\u5C3D\u6846\u67B6",
    description: "\u672A\u6765\u6781\u7B80\u84DD\u56FE\u98CE\u683C",
  },
] as const;

export const ThemeColors = themeConfig.themeColors;

type ThemeColorTokens = typeof ThemeColors;
type ThemeColorName = keyof ThemeColorTokens;
type ThemeTokenPalette = Record<ColorScheme, Record<ThemeColorName, string>>;
type ThemeTokenPaletteItem = ThemeTokenPalette[ColorScheme];

function buildSchemePalette(colors: ThemeColorTokens): ThemeTokenPalette {
  const palette: ThemeTokenPalette = {
    light: {} as ThemeTokenPalette["light"],
    dark: {} as ThemeTokenPalette["dark"],
  };

  (Object.keys(colors) as ThemeColorName[]).forEach((name) => {
    const swatch = colors[name];
    palette.light[name] = swatch.light;
    palette.dark[name] = swatch.dark;
  });

  return palette;
}

const MimicSentientTrailPalette: ThemeTokenPalette = {
  light: {
    primary: "#06BFF2",
    background: "#F8FBFF",
    surface: "#FFFFFF",
    foreground: "#0B1220",
    muted: "#5D6A80",
    border: "#BFD0E7",
    success: "#0EA5A8",
    warning: "#F59E0B",
    error: "#E11D48",
  },
  dark: {
    primary: "#06BFF2",
    background: "#F1F7FF",
    surface: "#FFFFFF",
    foreground: "#0B1220",
    muted: "#5D6A80",
    border: "#BFD0E7",
    success: "#0EA5A8",
    warning: "#F59E0B",
    error: "#E11D48",
  },
};

const PaperInkNarrativePalette: ThemeTokenPalette = {
  light: {
    primary: "#A86C3C",
    background: "#FBF8F1",
    surface: "#FFFDF9",
    foreground: "#241D16",
    muted: "#6E6459",
    border: "#E7DED0",
    success: "#3E9B73",
    warning: "#C78A2C",
    error: "#C2614F",
  },
  dark: {
    primary: "#BC8457",
    background: "#F3ECE0",
    surface: "#FAF4EA",
    foreground: "#31271E",
    muted: "#857666",
    border: "#D4C5B4",
    success: "#4D9C78",
    warning: "#C18A39",
    error: "#BD6557",
  },
};

export const ThemePresetPalettes: Record<ThemePresetId, ThemeTokenPalette> = {
  "paper-ink-narrative": PaperInkNarrativePalette,
  default: buildSchemePalette(ThemeColors),
  "mimic-sentient-trail": MimicSentientTrailPalette,
};

// Backward-compatible export (existing callsites read SchemeColors[scheme]).
export const SchemeColors = ThemePresetPalettes[DEFAULT_THEME_PRESET_ID];

type RuntimePalette = ThemeTokenPaletteItem & {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  border: string;
};

function buildRuntimePalette(base: ThemeTokenPaletteItem): RuntimePalette {
  return {
    ...base,
    text: base.foreground,
    background: base.background,
    tint: base.primary,
    icon: base.muted,
    tabIconDefault: base.muted,
    tabIconSelected: base.primary,
    border: base.border,
  };
}

export function isThemePresetId(value: string): value is ThemePresetId {
  return (ThemePresetIds as readonly string[]).includes(value);
}

export function getSchemeColors(
  preset: ThemePresetId,
  scheme: ColorScheme,
): ThemeTokenPaletteItem {
  return ThemePresetPalettes[preset][scheme];
}

export function getThemeColors(
  preset: ThemePresetId,
  scheme: ColorScheme,
): RuntimePalette {
  return buildRuntimePalette(getSchemeColors(preset, scheme));
}

export const Colors = {
  light: getThemeColors(DEFAULT_THEME_PRESET_ID, "light"),
  dark: getThemeColors(DEFAULT_THEME_PRESET_ID, "dark"),
} satisfies Record<ColorScheme, RuntimePalette>;

export type ThemeColorPalette = (typeof Colors)[ColorScheme];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
