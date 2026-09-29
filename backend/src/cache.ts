import type { MediaResult, CacheMeta, CacheEntry } from './types';

export function getCacheKey(resolvedUrl: string): string | null {
  try {
    const parsed = new URL(resolvedUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('xiaohongshu.com') || host.includes('rednote.com')) {
      const match = parsed.pathname.match(/(?:explore|item)\/([a-zA-Z0-9]+)/);
      if (match) return `xhs:${match[1]}`;
    }

    if (host.includes('twitter.com') || host.includes('x.com')) {
      const match = parsed.pathname.match(/status\/(\d+)/);
      if (match) return `tw:${match[1]}`;
    }
  } catch {
    // ignore invalid URLs
  }
  return null;
}

export async function getCacheResult(kv: KVNamespace, key: string): Promise<CacheEntry | null> {
  try {
    const result = await kv.getWithMetadata<MediaResult, CacheMeta>(key, { type: 'json' });
    if (!result.value || !result.metadata) return null;
    return { data: result.value, meta: result.metadata };
  } catch (err) {
    console.error('KV get failed:', err);
    return null;
  }
}

export async function setCacheResult(kv: KVNamespace, key: string, data: MediaResult): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(data), {
      metadata: { cachedAt: Date.now() },
    });
  } catch (err) {
    console.error('KV put failed:', err);
  }
}
