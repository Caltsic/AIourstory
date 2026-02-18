/**
 * 兼容的存储层
 * Web 环境使用 AsyncStorage，原生环境使用 SecureStore
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_KEY = 'user_api_key';
const API_URL_KEY = 'user_api_url';
const MODEL_KEY = 'user_model';

export interface StorageConfig {
  apiKey: string | null;
  apiUrl: string;
  model: string;
}

/**
 * 获取用户配置的 API 信息
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  if (Platform.OS === 'web') {
    // Web 环境使用 AsyncStorage
    const apiKey = await AsyncStorage.getItem(API_KEY_KEY);
    const apiUrl = await AsyncStorage.getItem(API_URL_KEY);
    const model = await AsyncStorage.getItem(MODEL_KEY);

    return {
      apiKey: apiKey || null,
      apiUrl: apiUrl || 'https://api.openai.com/v1/chat/completions',
      model: model || 'gpt-4o-mini',
    };
  } else {
    // 原生环境使用 SecureStore
    const apiKey = await SecureStore.getItemAsync(API_KEY_KEY);
    const apiUrl = await SecureStore.getItemAsync(API_URL_KEY);
    const model = await SecureStore.getItemAsync(MODEL_KEY);

    return {
      apiKey: apiKey || null,
      apiUrl: apiUrl || 'https://api.openai.com/v1/chat/completions',
      model: model || 'gpt-4o-mini',
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
  if (Platform.OS === 'web') {
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
 * 清除 API 配置
 */
export async function clearStorageConfig(): Promise<void> {
  if (Platform.OS === 'web') {
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
