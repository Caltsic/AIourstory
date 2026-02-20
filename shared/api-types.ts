export type PlazaSort = "newest" | "popular" | "downloads";

export interface ApiUser {
  uuid: string;
  username: string | null;
  nickname: string;
  avatarSeed: string;
  role: "user" | "admin";
  isBound: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: ApiUser;
}

export interface PromptPlazaItem {
  uuid: string;
  name: string;
  description: string;
  tags: string[];
  downloadCount: number;
  likeCount: number;
  isLiked: boolean;
  createdAt: string;
  author: {
    uuid: string;
    nickname: string;
    avatarSeed: string;
  };
}

export interface PromptPlazaDetail extends PromptPlazaItem {
  promptsJson: string;
  status: "pending" | "approved" | "rejected";
}

export interface StoryPlazaItem {
  uuid: string;
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  difficulty: string;
  tags: string[];
  downloadCount: number;
  likeCount: number;
  isLiked: boolean;
  createdAt: string;
  author: {
    uuid: string;
    nickname: string;
    avatarSeed: string;
  };
}

export interface StoryPlazaDetail extends StoryPlazaItem {
  premise: string;
  protagonistDescription: string;
  protagonistAppearance: string;
  initialPacing: string;
  extraDescription: string;
  status: "pending" | "approved" | "rejected";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SubmissionItem {
  uuid: string;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  downloadCount: number;
  likeCount: number;
  createdAt: string;
}
