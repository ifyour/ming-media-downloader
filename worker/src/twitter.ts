import type { MediaResult, Author, VideoFormat } from './types';
import { isRecord, getString, getNumber, getArray, getRecord, extractTwitterDimensions, extractTwitterQuality, getErrorMessage } from './utils';
import { parseTwitterHtml } from './twitter-html';

class TweetError extends Error {
  constructor(message: string, public reason: string) {
    super(message);
    this.name = 'TweetError';
  }
}

function extractTweetId(url: string): string {
  const match = url.match(/status\/(\d+)/);
  if (!match) throw new Error('Invalid Twitter/X URL. Could not find Tweet status ID.');
  return match[1];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  timeoutMs = 10_000,
  retries = 2,
): Promise<Response | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response;
      return response;
    } catch {
      if (attempt < retries) {
        await sleep(500 * attempt);
      }
    }
  }
  return null;
}

function parseFxTwitterResponse(data: unknown, tweetId: string): MediaResult | null {
  const root = isRecord(data) ? data : null;
  if (!root) return null;

  const tweet = getRecord(root, 'tweet');
  if (!tweet) return null;

  if (getString(tweet, 'type') === 'tombstone') {
    const message = getString(root, 'message') || 'This Tweet is unavailable or deleted.';
    throw new TweetError(message, 'tombstone');
  }

  const title = getString(tweet, 'text');
  const mediaRecord = getRecord(tweet, 'media');
  const allMedia = mediaRecord ? getArray(mediaRecord, 'all') : [];
  const firstMedia = isRecord(allMedia[0]) ? allMedia[0] : null;
  const cover = getString(firstMedia, 'thumbnail_url') || getString(firstMedia, 'url');
  const authorRecord = getRecord(tweet, 'author');
  const author: Author = {
    name: authorRecord ? getString(authorRecord, 'name') : 'X User',
    screen_name: authorRecord ? getString(authorRecord, 'screen_name') : '',
    avatar: authorRecord ? getString(authorRecord, 'avatar_url') : '',
  };

  const videos: VideoFormat[] = [];
  const images: string[] = [];
  let type: 'video' | 'images' = 'images';

  for (const media of allMedia) {
    const mr = isRecord(media) ? media : {};
    const mediaType = getString(mr, 'type');

    if (mediaType === 'video' || mediaType === 'gif') {
      type = 'video';

      const formats = getArray(mr, 'formats').length > 0 ? getArray(mr, 'formats') : getArray(mr, 'variants');
      const w = getNumber(mr, 'width');
      const h = getNumber(mr, 'height');

      const vf = formats
        .filter((f) => {
          const fr = isRecord(f) ? f : {};
          return getString(fr, 'container') === 'mp4' || getString(fr, 'content_type') === 'video/mp4';
        })
        .map((f) => {
          const fr = isRecord(f) ? f : {};
          const fu = getString(fr, 'url');
          const dims = extractTwitterDimensions(fu);
          return {
            url: fu,
            width: dims?.width ?? w,
            height: dims?.height ?? h,
            quality: fu.includes('/vid/') ? extractTwitterQuality(fu) : 'HD',
            bitrate: getNumber(fr, 'bitrate'),
          };
        });

      const mu = getString(mr, 'url');
      if (vf.length === 0 && mu && mu.includes('.mp4')) {
        const dims = extractTwitterDimensions(mu);
        vf.push({
          url: mu,
          width: dims?.width ?? w,
          height: dims?.height ?? h,
          quality: 'HD',
          bitrate: 0,
        });
      }

      videos.push(...vf);
    } else if (mediaType === 'photo') {
      images.push(getString(mr, 'url'));
    }
  }

  const seenUrls = new Set<string>();
  const uniqueVideos = videos.filter(v => {
    if (!v.url) return false;
    if (seenUrls.has(v.url)) return false;
    seenUrls.add(v.url);
    return true;
  });

  return {
    platform: 'twitter',
    id: tweetId,
    type,
    title,
    desc: title,
    cover,
    author,
    videos: uniqueVideos,
    images,
  };
}

async function tryFxTwitterApi(
  baseUrl: string,
  tweetId: string,
  errors: string[],
): Promise<MediaResult | null> {
  const response = await fetchWithRetry(baseUrl);
  if (!response) {
    errors.push(`${baseUrl}: network error after retries`);
    return null;
  }
  if (!response.ok) {
    errors.push(`${baseUrl}: HTTP ${response.status}`);
    const text = await response.text().catch(() => '');
    if (text) errors[errors.length - 1] += ` (${text.slice(0, 200)})`;
    return null;
  }
  const data = await response.json().catch(() => {
    errors.push(`${baseUrl}: invalid JSON response`);
    return null;
  });
  if (!data) return null;
  return parseFxTwitterResponse(data, tweetId);
}

export async function parseTwitter(url: string): Promise<MediaResult> {
  const tweetId = extractTweetId(url);
  const errors: string[] = [];

  try {
    const r1 = await tryFxTwitterApi(`https://api.fxtwitter.com/status/${tweetId}`, tweetId, errors);
    if (r1) return r1;
  } catch (err) {
    if (err instanceof TweetError) throw err;
    errors.push(`fxtwitter: ${getErrorMessage(err)}`);
  }

  try {
    const r2 = await tryFxTwitterApi(`https://api.vxtwitter.com/status/${tweetId}`, tweetId, errors);
    if (r2) return r2;
  } catch (err) {
    if (err instanceof TweetError) throw err;
    errors.push(`vxtwitter: ${getErrorMessage(err)}`);
  }

  const r3 = await parseTwitterHtml(url, tweetId);
  if (r3) return r3;

  throw new Error(`Failed to parse tweet. Details: ${errors.join('; ')}`);
}
