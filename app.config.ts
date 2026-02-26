import type { ExpoConfig } from "expo/config";

const env = {
  // App branding
  appName: "AIourStory",
  appSlug: "ai-story-game",
  scheme: "aistorygame",
  iosBundleId: "com.aistorygame.app",
  androidPackage: "com.aistorygame.app",
};

const allowInsecureHttp =
  process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === "1" ||
  process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === "true";

const defaultApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "http://127.0.0.1:3000/v1";

function shouldEnableCleartextTraffic(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const usesCleartextTraffic =
  allowInsecureHttp || shouldEnableCleartextTraffic(defaultApiBaseUrl);

function resolveAndroidVersionCode() {
  const explicitVersionCode = process.env.ANDROID_VERSION_CODE?.trim();
  if (explicitVersionCode) {
    const parsed = Number.parseInt(explicitVersionCode, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // Fallback to Unix timestamp so local release builds auto-increment.
  return Math.floor(Date.now() / 1000);
}

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.25",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    versionCode: resolveAndroidVersionCode(),
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-audio",
      {
        microphonePermission:
          "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          usesCleartextTraffic,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "1d3004ae-15bf-400d-abf0-2ccef1b01632",
    },
  },
};

export default config;
