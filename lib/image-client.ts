/**
 * 图片生成客户端
 * 兼容 OpenAI images API 格式（Seedream、SiliconFlow、FLUX 等）
 */

import {
  getImageStorageConfig,
  saveImageStorageConfig,
  type ImageStorageConfig,
} from "./storage";

export type { ImageStorageConfig };

export async function getImageConfig(): Promise<ImageStorageConfig> {
  return getImageStorageConfig();
}

export async function saveImageConfig(config: {
  imageApiKey: string;
  imageApiUrl: string;
  imageModel: string;
  imageSize?: string;
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
    throw new Error("图片生成 API 未配置");
  }

  // 确保 URL 以 /images/generations 结尾
  const baseUrl = config.imageApiUrl.replace(/\/$/, "");
  const url = baseUrl.endsWith("/images/generations")
    ? baseUrl
    : `${baseUrl}/images/generations`;

  const imageSize = config.imageSize.trim();
  const is16By9 = /^\s*(\d+)x(\d+)\s*$/i.test(imageSize)
    ? (() => {
        const match = imageSize.match(/^(\d+)x(\d+)$/i);
        if (!match) return false;
        const w = Number(match[1]);
        const h = Number(match[2]);
        return w > 0 && h > 0 && Math.abs(w / h - 16 / 9) < 0.02;
      })()
    : false;
  const finalImageSize = is16By9 ? imageSize : "1280x720";
  const requestBody: Record<string, unknown> = {
    model: config.imageModel,
    prompt,
    n: 1,
  };

  requestBody.size = finalImageSize;
  requestBody.image_size = finalImageSize; // 兼容部分提供商的字段命名

  let response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.imageApiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorText = await response.text();

    // Seedream 4.5 等服务要求更高像素时，自动按最小像素重试一次
    if (response.status === 400 && /size/i.test(errorText)) {
      const minPixelsMatch = errorText.match(/at least\s*(\d+)\s*pixels/i);
      if (minPixelsMatch) {
        const minPixels = Number(minPixelsMatch[1]);
        const side = Math.ceil(Math.sqrt(minPixels));
        const retrySize = `${side}x${side}`;
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.imageApiKey}`,
          },
          body: JSON.stringify({
            ...requestBody,
            size: retrySize,
            image_size: retrySize,
          }),
        });

        if (!response.ok) {
          errorText = await response.text();
          throw new Error(`图片生成失败: ${response.status} - ${errorText}`);
        }
      } else {
        throw new Error(`图片生成失败: ${response.status} - ${errorText}`);
      }
    } else {
      throw new Error(`图片生成失败: ${response.status} - ${errorText}`);
    }
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (typeof data.task_id === "string" || typeof data.id === "string") {
    throw new Error(
      "图片任务已提交，当前服务返回异步任务，请稍后重试或检查服务是否支持同步返回图片",
    );
  }

  // 尝试提取图片结果（兼容 data[] 和 images[] 两种格式）
  type ImageItem = { b64_json?: string; url?: string };
  const items: ImageItem[] =
    (data.data as ImageItem[]) ?? (data.images as ImageItem[]) ?? [];

  if (items.length === 0) {
    throw new Error("图片生成 API 返回了空结果");
  }

  const item = items[0];

  if (item.b64_json) {
    return `data:image/jpeg;base64,${item.b64_json}`;
  }
  if (item.url) {
    return item.url;
  }

  throw new Error("图片生成 API 返回格式不支持");
}
