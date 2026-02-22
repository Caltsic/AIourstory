import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";
export type ThemePresetId = "default" | "mimic-sentient-trail";

export const ThemePresetIds = ["default", "mimic-sentient-trail"] as const;
export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "default";

export const ThemePresets = [
  {
    id: "default" as ThemePresetId,
    label: "\u7ECF\u5178\u9ED8\u8BA4",
    description: "\u539F\u59CB\u6697\u8272\u53D9\u4E8B\u98CE\u683C",
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

export const ThemePresetPalettes: Record<ThemePresetId, ThemeTokenPalette> = {
  default: buildSchemePalette(ThemeColors),
  "mimic-sentient-trail": MimicSentientTrailPalette,
};

// Backward-compatible export (existing callsites read SchemeColors[scheme]).
export const SchemeColors = ThemePresetPalettes.default;

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
  light: getThemeColors("default", "light"),
  dark: getThemeColors("default", "dark"),
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
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

