/**
 * 兼容的存储层
 * Web 环境使用 AsyncStorage，原生环境使用 SecureStore
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_KEY_KEY = "user_api_key";
const API_URL_KEY = "user_api_url";
const MODEL_KEY = "user_model";
const TEMPERATURE_KEY = "user_temperature";
const EVAL_API_KEY_KEY = "user_eval_api_key";
const EVAL_API_URL_KEY = "user_eval_api_url";
const EVAL_MODEL_KEY = "user_eval_model";
const EVAL_TEMPERATURE_KEY = "user_eval_temperature";
const AUTO_BG_EVERY_CHOICES_KEY = "user_auto_bg_every_choices";

const IMAGE_API_KEY_KEY = "user_image_api_key";
const IMAGE_API_URL_KEY = "user_image_api_url";
const IMAGE_MODEL_KEY = "user_image_model";
const IMAGE_SIZE_KEY = "user_image_size";

export interface StorageConfig {
  apiKey: string | null;
  apiUrl: string;
  model: string;
  temperature: number;
  evalApiKey: string | null;
  evalApiUrl: string;
  evalModel: string;
  evalTemperature: number;
  autoBackgroundEveryChoices: number;
}

function normalizeTemperature(value: string | null | undefined): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0.7;
  return Math.max(0, Math.min(2, parsed));
}

function normalizePositiveInt(
  value: string | null | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export interface ImageStorageConfig {
  imageApiKey: string | null;
  imageApiUrl: string;
  imageModel: string;
  imageSize: string;
}

/**
 * 获取用户配置的 API 信息
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  if (Platform.OS === "web") {
    // Web 环境使用 AsyncStorage
    const apiKey = await AsyncStorage.getItem(API_KEY_KEY);
    const apiUrl = await AsyncStorage.getItem(API_URL_KEY);
    const model = await AsyncStorage.getItem(MODEL_KEY);
    const temperature = await AsyncStorage.getItem(TEMPERATURE_KEY);
    const evalApiKey = await AsyncStorage.getItem(EVAL_API_KEY_KEY);
    const evalApiUrl = await AsyncStorage.getItem(EVAL_API_URL_KEY);
    const evalModel = await AsyncStorage.getItem(EVAL_MODEL_KEY);
    const evalTemperature = await AsyncStorage.getItem(EVAL_TEMPERATURE_KEY);
    const autoBgEveryChoices = await AsyncStorage.getItem(
      AUTO_BG_EVERY_CHOICES_KEY,
    );

    return {
      apiKey: apiKey || null,
      apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
      model: model || "gpt-4o-mini",
      temperature: normalizeTemperature(temperature),
      evalApiKey: evalApiKey || null,
      evalApiUrl:
        evalApiUrl || apiUrl || "https://api.openai.com/v1/chat/completions",
      evalModel: evalModel || model || "gpt-4o-mini",
      evalTemperature: normalizeTemperature(evalTemperature || temperature),
      autoBackgroundEveryChoices: normalizePositiveInt(autoBgEveryChoices, 3),
    };
  } else {
    // 原生环境使用 SecureStore
    const apiKey = await SecureStore.getItemAsync(API_KEY_KEY);
    const apiUrl = await SecureStore.getItemAsync(API_URL_KEY);
    const model = await SecureStore.getItemAsync(MODEL_KEY);
    const temperature = await SecureStore.getItemAsync(TEMPERATURE_KEY);
    const evalApiKey = await SecureStore.getItemAsync(EVAL_API_KEY_KEY);
    const evalApiUrl = await SecureStore.getItemAsync(EVAL_API_URL_KEY);
    const evalModel = await SecureStore.getItemAsync(EVAL_MODEL_KEY);
    const evalTemperature =
      await SecureStore.getItemAsync(EVAL_TEMPERATURE_KEY);
    const autoBgEveryChoices = await SecureStore.getItemAsync(
      AUTO_BG_EVERY_CHOICES_KEY,
    );

    return {
      apiKey: apiKey || null,
      apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
      model: model || "gpt-4o-mini",
      temperature: normalizeTemperature(temperature),
      evalApiKey: evalApiKey || null,
      evalApiUrl:
        evalApiUrl || apiUrl || "https://api.openai.com/v1/chat/completions",
      evalModel: evalModel || model || "gpt-4o-mini",
      evalTemperature: normalizeTemperature(evalTemperature || temperature),
      autoBackgroundEveryChoices: normalizePositiveInt(autoBgEveryChoices, 3),
    };
  }
}

/**
 * 保存 API 配置
 */
export async function saveStorageConfig(config: {
  apiKey: string;
  apiUrl: string;
  model: string;
  temperature?: number;
  evalApiKey?: string;
  evalApiUrl?: string;
  evalModel?: string;
  evalTemperature?: number;
  autoBackgroundEveryChoices?: number;
}): Promise<void> {
  const finalTemperature = Math.max(0, Math.min(2, config.temperature ?? 0.7));
  const finalEvalTemperature = Math.max(
    0,
    Math.min(2, config.evalTemperature ?? config.temperature ?? 0.7),
  );
  const finalAutoBgEveryChoices = Math.max(
    1,
    Math.floor(config.autoBackgroundEveryChoices ?? 3),
  );
  if (Platform.OS === "web") {
    // Web 环境使用 AsyncStorage
    await AsyncStorage.setItem(API_KEY_KEY, config.apiKey);
    await AsyncStorage.setItem(API_URL_KEY, config.apiUrl);
    await AsyncStorage.setItem(MODEL_KEY, config.model);
    await AsyncStorage.setItem(TEMPERATURE_KEY, finalTemperature.toString());
    await AsyncStorage.setItem(EVAL_API_KEY_KEY, config.evalApiKey ?? "");
    await AsyncStorage.setItem(EVAL_API_URL_KEY, config.evalApiUrl ?? "");
    await AsyncStorage.setItem(EVAL_MODEL_KEY, config.evalModel ?? "");
    await AsyncStorage.setItem(
      EVAL_TEMPERATURE_KEY,
      finalEvalTemperature.toString(),
    );
    await AsyncStorage.setItem(
      AUTO_BG_EVERY_CHOICES_KEY,
      finalAutoBgEveryChoices.toString(),
    );
  } else {
    // 原生环境使用 SecureStore
    await SecureStore.setItemAsync(API_KEY_KEY, config.apiKey);
    await SecureStore.setItemAsync(API_URL_KEY, config.apiUrl);
    await SecureStore.setItemAsync(MODEL_KEY, config.model);
    await SecureStore.setItemAsync(
      TEMPERATURE_KEY,
      finalTemperature.toString(),
    );
    await SecureStore.setItemAsync(EVAL_API_KEY_KEY, config.evalApiKey ?? "");
    await SecureStore.setItemAsync(EVAL_API_URL_KEY, config.evalApiUrl ?? "");
    await SecureStore.setItemAsync(EVAL_MODEL_KEY, config.evalModel ?? "");
    await SecureStore.setItemAsync(
      EVAL_TEMPERATURE_KEY,
      finalEvalTemperature.toString(),
    );
    await SecureStore.setItemAsync(
      AUTO_BG_EVERY_CHOICES_KEY,
      finalAutoBgEveryChoices.toString(),
    );
  }
}

/**
 * 获取图片生成 API 配置
 */
export async function getImageStorageConfig(): Promise<ImageStorageConfig> {
  if (Platform.OS === "web") {
    const imageApiKey = await AsyncStorage.getItem(IMAGE_API_KEY_KEY);
    const imageApiUrl = await AsyncStorage.getItem(IMAGE_API_URL_KEY);
    const imageModel = await AsyncStorage.getItem(IMAGE_MODEL_KEY);
    const imageSize = await AsyncStorage.getItem(IMAGE_SIZE_KEY);
    return {
      imageApiKey: imageApiKey || null,
      imageApiUrl: imageApiUrl || "",
      imageModel: imageModel || "",
      imageSize: imageSize || "",
    };
  } else {
    const imageApiKey = await SecureStore.getItemAsync(IMAGE_API_KEY_KEY);
    const imageApiUrl = await SecureStore.getItemAsync(IMAGE_API_URL_KEY);
    const imageModel = await SecureStore.getItemAsync(IMAGE_MODEL_KEY);
    const imageSize = await SecureStore.getItemAsync(IMAGE_SIZE_KEY);
    return {
      imageApiKey: imageApiKey || null,
      imageApiUrl: imageApiUrl || "",
      imageModel: imageModel || "",
      imageSize: imageSize || "",
    };
  }
}

/**
 * 保存图片生成 API 配置
 */
export async function saveImageStorageConfig(config: {
  imageApiKey: string;
  imageApiUrl: string;
  imageModel: string;
  imageSize?: string;
}): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(IMAGE_API_KEY_KEY, config.imageApiKey);
    await AsyncStorage.setItem(IMAGE_API_URL_KEY, config.imageApiUrl);
    await AsyncStorage.setItem(IMAGE_MODEL_KEY, config.imageModel);
    await AsyncStorage.setItem(IMAGE_SIZE_KEY, config.imageSize || "");
  } else {
    await SecureStore.setItemAsync(IMAGE_API_KEY_KEY, config.imageApiKey);
    await SecureStore.setItemAsync(IMAGE_API_URL_KEY, config.imageApiUrl);
    await SecureStore.setItemAsync(IMAGE_MODEL_KEY, config.imageModel);
    await SecureStore.setItemAsync(IMAGE_SIZE_KEY, config.imageSize || "");
  }
}

/**
 * 清除 API 配置
 */
export async function clearStorageConfig(): Promise<void> {
  if (Platform.OS === "web") {
    // Web 环境使用 AsyncStorage
    await AsyncStorage.removeItem(API_KEY_KEY);
    await AsyncStorage.removeItem(API_URL_KEY);
    await AsyncStorage.removeItem(MODEL_KEY);
    await AsyncStorage.removeItem(TEMPERATURE_KEY);
    await AsyncStorage.removeItem(EVAL_API_KEY_KEY);
    await AsyncStorage.removeItem(EVAL_API_URL_KEY);
    await AsyncStorage.removeItem(EVAL_MODEL_KEY);
    await AsyncStorage.removeItem(EVAL_TEMPERATURE_KEY);
    await AsyncStorage.removeItem(AUTO_BG_EVERY_CHOICES_KEY);
  } else {
    // 原生环境使用 SecureStore
    await SecureStore.deleteItemAsync(API_KEY_KEY);
    await SecureStore.deleteItemAsync(API_URL_KEY);
    await SecureStore.deleteItemAsync(MODEL_KEY);
    await SecureStore.deleteItemAsync(TEMPERATURE_KEY);
    await SecureStore.deleteItemAsync(EVAL_API_KEY_KEY);
    await SecureStore.deleteItemAsync(EVAL_API_URL_KEY);
    await SecureStore.deleteItemAsync(EVAL_MODEL_KEY);
    await SecureStore.deleteItemAsync(EVAL_TEMPERATURE_KEY);
    await SecureStore.deleteItemAsync(AUTO_BG_EVERY_CHOICES_KEY);
  }
}
