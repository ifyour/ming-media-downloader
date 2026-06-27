import type { Env, MediaResult } from './types';
import { resolveUrl } from './utils';
import { getCacheKey, getCacheResult, setCacheResult } from './cache';
import { parseRednote } from './rednote';
import { parseTwitter } from './twitter';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export async function parseMediaUrl(url: string, env: Env): Promise<MediaResult> {
  const resolvedUrl = await resolveUrl(url);
  const parsedUrl = new URL(resolvedUrl);
  const host = parsedUrl.hostname.toLowerCase();

  if (host.includes('xiaohongshu.com') || host.includes('rednote.com') || host.includes('xhslink.com')) {
    return await parseRednote(resolvedUrl, env);
  } else if (host.includes('twitter.com') || host.includes('x.com')) {
    return await parseTwitter(resolvedUrl);
  } else {
    throw new Error('Unsupported platform. Only RedNote (小红书) and X (Twitter) are supported.');
  }
}

async function refreshCache(resolvedUrl: string, env: Env, cacheKey: string): Promise<void> {
  try {
    const fresh = await parseMediaUrl(resolvedUrl, env);
    await setCacheResult(env.MMD_CACHE, cacheKey, fresh);
  } catch (err) {
    console.error('Background cache refresh failed:', err);
  }
}

export async function parseWithCache(url: string, env: Env, ctx: ExecutionContext): Promise<MediaResult> {
  const resolvedUrl = await resolveUrl(url);
  const cacheKey = getCacheKey(resolvedUrl);

  if (!cacheKey) {
    return parseMediaUrl(resolvedUrl, env);
  }

  const cached = await getCacheResult(env.MMD_CACHE, cacheKey);
  const now = Date.now();

  if (cached) {
    const age = now - cached.meta.cachedAt;

    if (age < TWELVE_HOURS_MS) {
      return cached.data;
    }

    if (age < THREE_DAYS_MS) {
      ctx.waitUntil(refreshCache(resolvedUrl, env, cacheKey));
      return cached.data;
    }
  }

  try {
    const fresh = await parseMediaUrl(resolvedUrl, env);
    ctx.waitUntil(setCacheResult(env.MMD_CACHE, cacheKey, fresh));
    return fresh;
  } catch (err) {
    if (cached) {
      console.error('Fresh fetch failed, serving stale cache:', err);
      return cached.data;
    }
    throw err;
  }
}
