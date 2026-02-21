import "@/global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/lib/auth-provider";
import { initAppLogger } from "@/lib/app-logger";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  useEffect(() => {
    initAppLogger();
  }, []);

  const content = (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="create-story"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="game"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen name="login" options={{ presentation: "modal" }} />
          <Stack.Screen name="profile" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="plaza/prompt-detail"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen
            name="plaza/story-detail"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen
            name="plaza/submit-prompt"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen
            name="plaza/submit-story"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen
            name="plaza/my-submissions"
            options={{ presentation: "modal" }}
          />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );

  return content;
}
