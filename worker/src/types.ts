export interface Env {
  MMD_CACHE: KVNamespace;
  MYBROWSER?: unknown;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObj = { [key: string]: JsonValue };

export interface Author {
  name: string;
  screen_name?: string;
  avatar: string;
}

export interface VideoFormat {
  url: string;
  width: number;
  height: number;
  quality: string;
  size?: number;
  bitrate?: number;
  fps?: number;
}

export interface MediaResult {
  platform: 'rednote' | 'twitter';
  id: string;
  type: 'video' | 'images';
  title: string;
  desc: string;
  cover: string;
  author: Author;
  videos: VideoFormat[];
  images: string[];
}

export interface CacheMeta {
  cachedAt: number;
}

export interface CacheEntry {
  data: MediaResult;
  meta: CacheMeta;
}
