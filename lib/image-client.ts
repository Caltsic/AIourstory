/**
 * 图片生成客户端
 * 兼容 OpenAI images API 格式（Seedream、SiliconFlow、FLUX 等）
 */

import {
  getImageStorageConfig,
  saveImageStorageConfig,
  type ImageStorageConfig,
} from "./storage";
import { logError, logInfo, logWarn } from "./app-logger";

export type { ImageStorageConfig };

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function truncateForLog(text: string, maxChars = 800): string {
  const normalized = (text ?? "").toString();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...[truncated ${normalized.length - maxChars} chars]`;
}

function isDashScopeHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "dashscope.aliyuncs.com";
  } catch {
    return false;
  }
}

function buildDashScopeNativeUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}/api/v1/services/aigc/text2image/image-synthesis`;
  } catch {
    return "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBodyWithoutSizeFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...body };
  delete (next as Record<string, unknown>).size;
  delete (next as Record<string, unknown>).image_size;

  const parametersRaw = next.parameters;
  if (parametersRaw && typeof parametersRaw === "object") {
    const nextParameters = {
      ...(parametersRaw as Record<string, unknown>),
    };
    delete nextParameters.size;
    next.parameters = nextParameters;
  }

  return next;
}

async function pollDashScopeTask(
  baseUrl: string,
  apiKey: string,
  taskId: string,
): Promise<string> {
  const taskEndpoint = (() => {
    try {
      const parsed = new URL(baseUrl);
      return `${parsed.origin}/api/v1/tasks/${taskId}`;
    } catch {
      return `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
    }
  })();

  for (let i = 0; i < 20; i++) {
    const response = await fetch(taskEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWarn(
        "image",
        `task query failed status=${response.status} endpoint=${taskEndpoint} message=${errorText.slice(0, 300)}`,
      );
      throw new Error(`图片任务查询失败: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const output = (data.output ?? {}) as Record<string, any>;
    const status = String(output.task_status ?? "").toUpperCase();

    if (status === "SUCCEEDED") {
      const results = Array.isArray(output.results) ? output.results : [];
      const first = (results[0] ?? {}) as Record<string, any>;
      if (typeof first.url === "string" && first.url) {
        return first.url;
      }
      if (typeof first.b64_json === "string" && first.b64_json) {
        return `data:image/jpeg;base64,${first.b64_json}`;
      }
      throw new Error("图片任务成功，但返回结果为空");
    }

    if (status === "FAILED" || status === "CANCELED") {
      const message =
        (typeof output.message === "string" && output.message) ||
        (typeof data.message === "string" && data.message) ||
        "图片任务失败";
      logWarn("image", `task failed taskId=${taskId} message=${message}`);
      throw new Error(message);
    }

    await sleep(1500);
  }

  throw new Error("图片任务超时，请稍后重试");
}

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

  const baseUrl = normalizeUrl(config.imageApiUrl);

  const imageSize = config.imageSize.trim();
  const sizeMatch = imageSize.match(/^(\d+)x(\d+)$/i);
  const finalImageSize = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : "";
  const requestBody: Record<string, unknown> = {
    model: config.imageModel,
    prompt,
    n: 1,
  };

  if (finalImageSize) {
    requestBody.size = finalImageSize;
    requestBody.image_size = finalImageSize; // 兼容部分提供商的字段命名
  }

  const requestCandidates: Array<{
    kind: "openai" | "dashscope-native";
    url: string;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  }> = [
    {
      kind: "openai",
      // 使用用户填写的完整 endpoint，不做任何路径拼接
      url: baseUrl,
      body: requestBody,
    },
  ];

  if (isDashScopeHost(baseUrl)) {
    const nativeBody: Record<string, unknown> = {
      model: config.imageModel,
      input: {
        prompt,
      },
      parameters: {
        n: 1,
      },
    };
    if (finalImageSize) {
      (nativeBody.parameters as Record<string, unknown>).size =
        finalImageSize.replace("x", "*");
    }

    requestCandidates.push({
      kind: "dashscope-native",
      url: buildDashScopeNativeUrl(baseUrl),
      body: nativeBody,
      headers: {
        "X-DashScope-Async": "enable",
      },
    });
  }

  logInfo(
    "image",
    `request model=${config.imageModel} baseUrl=${baseUrl} size=${finalImageSize || "(none)"} promptChars=${prompt.length} prompt=${truncateForLog(prompt, 600)}`,
  );

  let lastError = "";

  for (const candidate of requestCandidates) {
    logInfo(
      "image",
      `request candidate=${candidate.kind} url=${candidate.url}`,
    );
    let response = await fetch(candidate.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.imageApiKey}`,
        ...(candidate.headers ?? {}),
      },
      body: JSON.stringify(candidate.body),
    });

    if (!response.ok) {
      let errorText = await response.text();
      logWarn(
        "image",
        `generation failed candidate=${candidate.kind} status=${response.status} url=${candidate.url} message=${errorText.slice(0, 300)}`,
      );

      if (
        response.status === 400 &&
        /argument\s+not\s+supported\s*:\s*size|unsupported.*size|不支持.*size/i.test(
          errorText,
        )
      ) {
        const bodyWithoutSize = buildBodyWithoutSizeFields(candidate.body);
        logWarn(
          "image",
          `generation retry without size candidate=${candidate.kind} url=${candidate.url}`,
        );
        response = await fetch(candidate.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.imageApiKey}`,
            ...(candidate.headers ?? {}),
          },
          body: JSON.stringify(bodyWithoutSize),
        });
        if (!response.ok) {
          errorText = await response.text();
          lastError = `图片生成失败: ${response.status} - ${errorText}`;
          continue;
        }
      }
      // Seedream 4.5 等服务要求更高像素时，自动按最小像素重试一次
      else if (
        response.status === 400 &&
        /size/i.test(errorText) &&
        candidate.kind === "openai"
      ) {
        const minPixelsMatch = errorText.match(/at least\s*(\d+)\s*pixels/i);
        if (minPixelsMatch) {
          const minPixels = Number(minPixelsMatch[1]);
          const side = Math.ceil(Math.sqrt(minPixels));
          const retrySize = `${side}x${side}`;
          response = await fetch(candidate.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.imageApiKey}`,
              ...(candidate.headers ?? {}),
            },
            body: JSON.stringify({
              ...(candidate.body || {}),
              size: retrySize,
              image_size: retrySize,
            }),
          });
          if (!response.ok) {
            errorText = await response.text();
            logWarn(
              "image",
              `generation retry failed candidate=${candidate.kind} status=${response.status} url=${candidate.url} message=${errorText.slice(0, 300)}`,
            );
            lastError = `图片生成失败: ${response.status} - ${errorText}`;
            continue;
          }
        } else {
          lastError = `图片生成失败: ${response.status} - ${errorText}`;
          continue;
        }
      } else {
        lastError = `图片生成失败: ${response.status} - ${errorText}`;
        continue;
      }
    }

    const data = (await response.json()) as Record<string, any>;

    if (candidate.kind === "dashscope-native") {
      const output = (data.output ?? {}) as Record<string, any>;
      const taskId =
        (typeof output.task_id === "string" && output.task_id) ||
        (typeof data.task_id === "string" && data.task_id) ||
        "";

      if (taskId) {
        logInfo(
          "image",
          `response candidate=${candidate.kind} status=200 asyncTaskId=${taskId}`,
        );
        return pollDashScopeTask(baseUrl, config.imageApiKey, taskId);
      }

      const results = Array.isArray(output.results) ? output.results : [];
      const first = (results[0] ?? {}) as Record<string, any>;
      if (typeof first.url === "string" && first.url) {
        logInfo(
          "image",
          `response candidate=${candidate.kind} status=200 url=${first.url}`,
        );
        return first.url;
      }
      if (typeof first.b64_json === "string" && first.b64_json) {
        logInfo(
          "image",
          `response candidate=${candidate.kind} status=200 b64_json_len=${first.b64_json.length}`,
        );
        return `data:image/jpeg;base64,${first.b64_json}`;
      }

      lastError = "图片生成 API 返回格式不支持";
      continue;
    }

    type ImageItem = { b64_json?: string; url?: string };
    const items: ImageItem[] =
      (data.data as ImageItem[]) ?? (data.images as ImageItem[]) ?? [];

    if (items.length > 0) {
      const item = items[0];
      if (item.b64_json) {
        logInfo(
          "image",
          `response candidate=${candidate.kind} status=200 b64_json_len=${item.b64_json.length}`,
        );
        return `data:image/jpeg;base64,${item.b64_json}`;
      }
      if (item.url) {
        logInfo(
          "image",
          `response candidate=${candidate.kind} status=200 url=${item.url}`,
        );
        return item.url;
      }
    }

    const taskId =
      (typeof data.task_id === "string" && data.task_id) ||
      (typeof data.id === "string" && data.id) ||
      "";
    if (taskId && isDashScopeHost(baseUrl)) {
      return pollDashScopeTask(baseUrl, config.imageApiKey, taskId);
    }

    lastError = "图片生成 API 返回格式不支持";
  }

  logError(
    "image",
    `generation exhausted model=${config.imageModel} baseUrl=${baseUrl} lastError=${lastError || "unknown"}`,
  );
  throw new Error(lastError || "图片生成失败");
}
