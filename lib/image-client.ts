/**
 * 图片生成客户端
 * 兼容 OpenAI images API 格式（Seedream、SiliconFlow、FLUX 等）
 */

import { getImageStorageConfig, saveImageStorageConfig, type ImageStorageConfig } from './storage';

export type { ImageStorageConfig };

export async function getImageConfig(): Promise<ImageStorageConfig> {
  return getImageStorageConfig();
}

export async function saveImageConfig(config: {
  imageApiKey: string;
  imageApiUrl: string;
  imageModel: string;
}): Promise<void> {
  return saveImageStorageConfig(config);
}

/**
 * 调用图片生成 API，返回 base64 data URI 或远程 URL。
 * 兼容两种响应格式：
 *   - { data: [{ b64_json, url }] }   (OpenAI 格式)
 *   - { images: [{ url, b64_json }] } (SiliconFlow / Kolors 格式)
 */
export async function generateImage(prompt: string): Promise<string> {
  const config = await getImageStorageConfig();

  if (!config.imageApiKey || !config.imageApiUrl || !config.imageModel) {
    throw new Error('图片生成 API 未配置');
  }

  // 确保 URL 以 /images/generations 结尾
  const baseUrl = config.imageApiUrl.replace(/\/$/, '');
  const url = baseUrl.endsWith('/images/generations')
    ? baseUrl
    : `${baseUrl}/images/generations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.imageApiKey}`,
    },
    body: JSON.stringify({
      model: config.imageModel,
      prompt,
      n: 1,
      image_size: '1024x576', // 横版比例，适合故事背景
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`图片生成失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as Record<string, unknown>;

  // 尝试提取图片结果（兼容 data[] 和 images[] 两种格式）
  type ImageItem = { b64_json?: string; url?: string };
  const items: ImageItem[] =
    (data.data as ImageItem[]) ??
    (data.images as ImageItem[]) ??
    [];

  if (items.length === 0) {
    throw new Error('图片生成 API 返回了空结果');
  }

  const item = items[0];

  if (item.b64_json) {
    return `data:image/jpeg;base64,${item.b64_json}`;
  }
  if (item.url) {
    return item.url;
  }

  throw new Error('图片生成 API 返回格式不支持');
}
