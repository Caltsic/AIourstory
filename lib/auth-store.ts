import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiUser, AuthResult } from "@shared/api-types";
import {
  apiClient,
  initializeApiClient,
  rawApiClient,
  parseApiError,
  setAuthHooks,
} from "@/lib/api-client";

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const AUTH_USER_KEY = "auth_user";
const DEVICE_ID_KEY = "auth_device_id";

type AuthState = {
  initialized: boolean;
  loading: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: ApiUser | null;
};

type AuthListener = (state: AuthState) => void;

let state: AuthState = {
  initialized: false,
  loading: false,
  accessToken: null,
  refreshToken: null,
  user: null,
};

const listeners = new Set<AuthListener>();

function emit() {
  for (const listener of listeners) {
    listener({ ...state });
  }
}

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  emit();
}

function generateDeviceId() {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getKV(key: string) {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setKV(key: string, value: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function delKV(key: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function persistAuth(auth: { accessToken: string; refreshToken: string; user: ApiUser }) {
  await Promise.all([
    setKV(ACCESS_TOKEN_KEY, auth.accessToken),
    setKV(REFRESH_TOKEN_KEY, auth.refreshToken),
    setKV(AUTH_USER_KEY, JSON.stringify(auth.user)),
  ]);
}

async function clearAuthStorage() {
  await Promise.all([delKV(ACCESS_TOKEN_KEY), delKV(REFRESH_TOKEN_KEY), delKV(AUTH_USER_KEY)]);
}

async function loadPersistedAuth() {
  const [accessToken, refreshToken, userRaw] = await Promise.all([
    getKV(ACCESS_TOKEN_KEY),
    getKV(REFRESH_TOKEN_KEY),
    getKV(AUTH_USER_KEY),
  ]);

  let user: ApiUser | null = null;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw) as ApiUser;
    } catch {
      user = null;
    }
  }

  return { accessToken, refreshToken, user };
}

async function getOrCreateDeviceId() {
  const saved = await getKV(DEVICE_ID_KEY);
  if (saved) return saved;

  const id = generateDeviceId();
  await setKV(DEVICE_ID_KEY, id);
  return id;
}

async function applyAuthResult(result: AuthResult) {
  await persistAuth(result);
  setState({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  });
}

export async function refreshAuthTokens() {
  if (!state.refreshToken) return false;

  try {
    const response = await rawApiClient.post<AuthResult>("/auth/refresh", {
      refreshToken: state.refreshToken,
    });
    await applyAuthResult(response.data);
    return true;
  } catch {
    await clearAuthStorage();
    setState({ accessToken: null, refreshToken: null, user: null });
    return false;
  }
}

export async function ensureDeviceSession() {
  const deviceId = await getOrCreateDeviceId();
  const response = await rawApiClient.post<AuthResult>("/auth/device-login", { deviceId });
  await applyAuthResult(response.data);
}

export async function initAuth() {
  if (state.loading) return;
  setState({ loading: true });

  try {
    await initializeApiClient();

    const persisted = await loadPersistedAuth();
    if (persisted.accessToken && persisted.refreshToken && persisted.user) {
      setState({
        accessToken: persisted.accessToken,
        refreshToken: persisted.refreshToken,
        user: persisted.user,
      });

      try {
        const me = await apiClient.get<ApiUser>("/auth/me");
        setState({ user: me.data });
        await setKV(AUTH_USER_KEY, JSON.stringify(me.data));
      } catch {
        const refreshed = await refreshAuthTokens();
        if (!refreshed) {
          await ensureDeviceSession();
        }
      }
    } else {
      await ensureDeviceSession();
    }
  } catch (error) {
    console.warn("initAuth failed:", error);
  } finally {
    setState({ initialized: true, loading: false });
  }
}

export async function registerBoundAccount(username: string, password: string, nickname?: string) {
  if (!state.accessToken) {
    throw new Error("Not authenticated");
  }

  try {
    const response = await rawApiClient.post<AuthResult>(
      "/auth/register",
      { username, password, nickname },
      { headers: { Authorization: `Bearer ${state.accessToken}` } }
    );
    await applyAuthResult(response.data);
    return response.data.user;
  } catch (error) {
    throw new Error(parseApiError(error, "Register failed"));
  }
}

export async function loginAccount(username: string, password: string) {
  try {
    const response = await rawApiClient.post<AuthResult>("/auth/login", {
      username,
      password,
    });
    await applyAuthResult(response.data);
    return response.data.user;
  } catch (error) {
    throw new Error(parseApiError(error, "Login failed"));
  }
}

export async function logoutAccount() {
  try {
    if (state.accessToken && state.refreshToken) {
      await rawApiClient.post(
        "/auth/logout",
        { refreshToken: state.refreshToken },
        { headers: { Authorization: `Bearer ${state.accessToken}` } }
      );
    }
  } catch {
    // best effort
  }

  await clearAuthStorage();
  setState({ accessToken: null, refreshToken: null, user: null });
  await ensureDeviceSession();
}

export async function updateProfile(data: { nickname?: string; avatarSeed?: string }) {
  const response = await apiClient.put<ApiUser>("/users/me", data);
  setState({ user: response.data });
  await setKV(AUTH_USER_KEY, JSON.stringify(response.data));
  return response.data;
}

export function getAuthState() {
  return { ...state };
}

export function getCurrentUser() {
  return state.user;
}

export function isBoundUser() {
  return Boolean(state.user?.isBound);
}

export function subscribeAuth(listener: AuthListener) {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

setAuthHooks({
  getAccessToken: async () => state.accessToken,
  refreshAuth: refreshAuthTokens,
});
