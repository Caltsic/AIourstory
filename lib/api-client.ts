import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { getServerApiBaseUrl } from "@/lib/storage";

interface AuthHooks {
  getAccessToken: () => Promise<string | null>;
  refreshAuth: () => Promise<boolean>;
}

let authHooks: AuthHooks = {
  getAccessToken: async () => null,
  refreshAuth: async () => false,
};

let baseUrl = "http://127.0.0.1:3000/v1";

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const apiClient: AxiosInstance = axios.create({
  baseURL: baseUrl,
  timeout: 12000,
});

export const rawApiClient: AxiosInstance = axios.create({
  baseURL: baseUrl,
  timeout: 12000,
});

export async function initializeApiClient() {
  const url = await getServerApiBaseUrl();
  setApiBaseUrl(url);
}

export function setApiBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, "");
  apiClient.defaults.baseURL = baseUrl;
  rawApiClient.defaults.baseURL = baseUrl;
}

export function getApiBaseUrl() {
  return baseUrl;
}

export function setAuthHooks(hooks: AuthHooks) {
  authHooks = hooks;
}

apiClient.interceptors.request.use(async (config) => {
  const token = await authHooks.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryConfig | undefined;

    if (!original || status !== 401 || original._retry) {
      throw error;
    }

    if (original.url?.includes("/auth/refresh") || original.url?.includes("/auth/device-login")) {
      throw error;
    }

    original._retry = true;
    const refreshed = await authHooks.refreshAuth();
    if (!refreshed) {
      throw error;
    }

    const token = await authHooks.getAccessToken();
    if (token) {
      original.headers.Authorization = `Bearer ${token}`;
    }

    return apiClient(original);
  }
);

export function parseApiError(err: unknown, fallback = "Request failed") {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data as { error?: string; message?: string } | undefined;
    return payload?.error || payload?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
