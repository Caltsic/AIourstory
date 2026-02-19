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

const IMAGE_API_KEY_KEY = "user_image_api_key";
const IMAGE_API_URL_KEY = "user_image_api_url";
const IMAGE_MODEL_KEY = "user_image_model";
const IMAGE_SIZE_KEY = "user_image_size";

export interface StorageConfig {
  apiKey: string | null;
  apiUrl: string;
  model: string;
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

    return {
      apiKey: apiKey || null,
      apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
      model: model || "gpt-4o-mini",
    };
  } else {
    // 原生环境使用 SecureStore
    const apiKey = await SecureStore.getItemAsync(API_KEY_KEY);
    const apiUrl = await SecureStore.getItemAsync(API_URL_KEY);
    const model = await SecureStore.getItemAsync(MODEL_KEY);

    return {
      apiKey: apiKey || null,
      apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
      model: model || "gpt-4o-mini",
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
}): Promise<void> {
  if (Platform.OS === "web") {
    // Web 环境使用 AsyncStorage
    await AsyncStorage.setItem(API_KEY_KEY, config.apiKey);
    await AsyncStorage.setItem(API_URL_KEY, config.apiUrl);
    await AsyncStorage.setItem(MODEL_KEY, config.model);
  } else {
    // 原生环境使用 SecureStore
    await SecureStore.setItemAsync(API_KEY_KEY, config.apiKey);
    await SecureStore.setItemAsync(API_URL_KEY, config.apiUrl);
    await SecureStore.setItemAsync(MODEL_KEY, config.model);
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
  } else {
    // 原生环境使用 SecureStore
    await SecureStore.deleteItemAsync(API_KEY_KEY);
    await SecureStore.deleteItemAsync(API_URL_KEY);
    await SecureStore.deleteItemAsync(MODEL_KEY);
  }
}
