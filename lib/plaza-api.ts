import { apiClient, parseApiError } from "@/lib/api-client";
import type {
  PaginatedResult,
  PromptPlazaDetail,
  PromptPlazaItem,
  StoryPlazaDetail,
  StoryPlazaItem,
} from "@shared/api-types";

export async function listPromptPlaza(params: {
  page?: number;
  limit?: number;
  sort?: "newest" | "popular" | "downloads";
  search?: string;
  tags?: string[];
  cursor?: string;
}) {
  const response = await apiClient.get<PaginatedResult<PromptPlazaItem>>(
    "/prompts",
    {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        cursor: params.cursor || undefined,
        sort: params.sort ?? "newest",
        search: params.search || undefined,
        tags: params.tags?.join(",") || undefined,
      },
    },
  );
  return response.data;
}

export async function getPromptPlazaDetail(uuid: string) {
  const response = await apiClient.get<PromptPlazaDetail>(`/prompts/${uuid}`);
  return response.data;
}

export async function submitPromptPlaza(payload: {
  name: string;
  description: string;
  promptsJson: string;
  tags: string[];
}) {
  try {
    const response = await apiClient.post<{ uuid: string; status: string }>(
      "/prompts",
      payload,
    );
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error, "Submit prompt failed"));
  }
}

export async function listMyPromptSubmissions() {
  const response =
    await apiClient.get<
      Array<PromptPlazaItem & { status: string; rejectReason: string | null }>
    >("/prompts/mine");
  return response.data;
}

export async function togglePromptLike(uuid: string) {
  const response = await apiClient.post<{ liked: boolean }>(
    `/prompts/${uuid}/like`,
  );
  return response.data;
}

export async function downloadPrompt(uuid: string) {
  const response = await apiClient.post<PromptPlazaDetail>(
    `/prompts/${uuid}/download`,
  );
  return response.data;
}

export async function listStoryPlaza(params: {
  page?: number;
  limit?: number;
  sort?: "newest" | "popular" | "downloads";
  search?: string;
  genre?: string;
  tags?: string[];
  cursor?: string;
}) {
  const response = await apiClient.get<PaginatedResult<StoryPlazaItem>>(
    "/stories",
    {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        cursor: params.cursor || undefined,
        sort: params.sort ?? "newest",
        search: params.search || undefined,
        genre: params.genre || undefined,
        tags: params.tags?.join(",") || undefined,
      },
    },
  );
  return response.data;
}

export async function getStoryPlazaDetail(uuid: string) {
  const response = await apiClient.get<StoryPlazaDetail>(`/stories/${uuid}`);
  return response.data;
}

export async function submitStoryPlaza(payload: {
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  protagonistDescription?: string;
  protagonistAppearance?: string;
  difficulty?: string;
  initialPacing?: string;
  extraDescription?: string;
  tags?: string[];
}) {
  try {
    const response = await apiClient.post<{ uuid: string; status: string }>(
      "/stories",
      payload,
    );
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error, "Submit story failed"));
  }
}

export async function listMyStorySubmissions() {
  const response =
    await apiClient.get<
      Array<StoryPlazaItem & { status: string; rejectReason: string | null }>
    >("/stories/mine");
  return response.data;
}

export async function toggleStoryLike(uuid: string) {
  const response = await apiClient.post<{ liked: boolean }>(
    `/stories/${uuid}/like`,
  );
  return response.data;
}

export async function downloadStory(uuid: string) {
  const response = await apiClient.post<StoryPlazaDetail>(
    `/stories/${uuid}/download`,
  );
  return response.data;
}
