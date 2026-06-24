export interface Env {
  MMD_CACHE: KVNamespace;
  // Add bindings here if needed, e.g. MYBROWSER for Cloudflare Browser Rendering
  MYBROWSER?: unknown;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObj = { [key: string]: JsonValue };

interface Author {
  name: string;
  screen_name?: string;
  avatar: string;
}

interface VideoFormat {
  url: string;
  width: number;
  height: number;
  quality: string;
  size?: number;
  bitrate?: number;
  fps?: number;
}

interface MediaResult {
  platform: 'xiaohongshu' | 'twitter';
  id: string;
  type: 'video' | 'images';
  title: string;
  desc: string;
  cover: string;
  author: Author;
  videos: VideoFormat[];
  images: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(obj: unknown, key: string): string {
  if (!isRecord(obj)) return '';
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

function getNumber(obj: unknown, key: string): number {
  if (!isRecord(obj)) return 0;
  const value = obj[key];
  return typeof value === 'number' ? value : 0;
}

function getArray(obj: unknown, key: string): unknown[] {
  if (!isRecord(obj)) return [];
  const value = obj[key];
  return Array.isArray(value) ? value : [];
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

// CORS Headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Response helper with CORS
function jsonResponse(data: JsonValue, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const urlObj = new URL(request.url);
    const path = urlObj.pathname;

    // Handle OPTIONS preflight request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    if (path === '/api/parse') {
      const targetUrl = urlObj.searchParams.get('url');
      if (!targetUrl) {
        return errorResponse('Missing "url" parameter');
      }

      try {
        const result = await parseWithCache(targetUrl, env, ctx);
        return jsonResponse(result as unknown as JsonValue);
      } catch (err) {
        return errorResponse(getErrorMessage(err), 500);
      }
    }

    if (path === '/api/image-proxy') {
      const imageUrl = urlObj.searchParams.get('url');
      if (!imageUrl) {
        return errorResponse('Missing "url" parameter');
      }
      try {
        return await handleImageProxy(imageUrl);
      } catch (err) {
        return errorResponse(getErrorMessage(err), 500);
      }
    }

    if (path === '/api/download') {
      const mediaUrl = urlObj.searchParams.get('url');
      const filename = urlObj.searchParams.get('name') || 'video.mp4';
      if (!mediaUrl) {
        return errorResponse('Missing "url" parameter for download');
      }

      try {
        return await handleProxyDownload(mediaUrl, filename);
      } catch (err) {
        return errorResponse(getErrorMessage(err), 500);
      }
    }

    // Default route
    return jsonResponse({ message: 'Social Media Video Downloader API' });
  },
};

// Resolve redirects (like xhslink.com -> xiaohongshu.com)
async function resolveUrl(url: string): Promise<string> {
  // Clean up URL
  let cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }

  // If it's a short link or redirect link, follow it
  if (cleanUrl.includes('xhslink.com') || cleanUrl.includes('doubleclick.net') || cleanUrl.includes('t.co')) {
    const res = await fetch(cleanUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const location = res.headers.get('location');
    if (location) {
      return resolveUrl(location);
    }
  }

  return cleanUrl;
}

// Main parser
async function parseMediaUrl(url: string, env: Env): Promise<MediaResult> {
  const resolvedUrl = await resolveUrl(url);
  const parsedUrl = new URL(resolvedUrl);
  const host = parsedUrl.hostname.toLowerCase();

  if (host.includes('xiaohongshu.com') || host.includes('rednote.com') || host.includes('xhslink.com')) {
    return await parseXiaohongshu(resolvedUrl, env);
  } else if (host.includes('twitter.com') || host.includes('x.com')) {
    return await parseTwitter(resolvedUrl);
  } else {
    throw new Error('Unsupported platform. Only Xiaohongshu (小红书) and X (Twitter) are supported.');
  }
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

interface CacheMeta {
  cachedAt: number;
}

interface CacheEntry {
  data: MediaResult;
  meta: CacheMeta;
}

function getCacheKey(resolvedUrl: string): string | null {
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

async function getCacheResult(kv: KVNamespace, key: string): Promise<CacheEntry | null> {
  try {
    const result = await kv.getWithMetadata<MediaResult, CacheMeta>(key, { type: 'json' });
    if (!result.value || !result.metadata) return null;
    return { data: result.value, meta: result.metadata };
  } catch (err) {
    console.error('KV get failed:', err);
    return null;
  }
}

async function setCacheResult(kv: KVNamespace, key: string, data: MediaResult): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(data), {
      metadata: { cachedAt: Date.now() },
    });
  } catch (err) {
    console.error('KV put failed:', err);
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

async function parseWithCache(url: string, env: Env, ctx: ExecutionContext): Promise<MediaResult> {
  const resolvedUrl = await resolveUrl(url);
  const cacheKey = getCacheKey(resolvedUrl);

  if (!cacheKey) {
    return parseMediaUrl(resolvedUrl, env);
  }

  const cached = await getCacheResult(env.MMD_CACHE, cacheKey);
  const now = Date.now();

  if (cached) {
    const age = now - cached.meta.cachedAt;

    // 绝对新鲜区间：0 ~ 12 小时，直接走缓存
    if (age < TWELVE_HOURS_MS) {
      return cached.data;
    }

    // 次鲜/尝试刷新区间：12 小时 ~ 3 天，先吐缓存，后台异步刷新
    if (age < THREE_DAYS_MS) {
      ctx.waitUntil(refreshCache(resolvedUrl, env, cacheKey));
      return cached.data;
    }
  }

  // 可能过期区间（3 天及以上）或无缓存：穿透缓存，优先请求源站
  try {
    const fresh = await parseMediaUrl(resolvedUrl, env);
    // 缓存写入是 best-effort：失败只打日志，不阻塞、不抛错给用户
    ctx.waitUntil(setCacheResult(env.MMD_CACHE, cacheKey, fresh));
    return fresh;
  } catch (err) {
    // 终极兜底：源站挂了/失败，无视时间直接返回缓存
    if (cached) {
      console.error('Fresh fetch failed, serving stale cache:', err);
      return cached.data;
    }
    throw err;
  }
}

// Parse Xiaohongshu URL
async function parseXiaohongshu(url: string, env: Env): Promise<MediaResult> {
  // Extract note ID from url
  // Path format is usually /explore/<noteId> or /discovery/item/<noteId>
  const matchId = url.match(/(?:explore|item)\/([a-zA-Z0-9]+)/);
  if (!matchId) {
    throw new Error('Invalid Xiaohongshu URL. Could not find note ID.');
  }
  const noteId = matchId[1];

  let html = '';
  let lastFetchStatus = 0;
  let lastFetchError: string | null = null;

  // Try fetching directly with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://www.xiaohongshu.com/',
        },
      });

      lastFetchStatus = res.status;
      if (res.ok) {
        html = await res.text();
        lastFetchError = null;
        break;
      }
      const body = await res.text().catch(() => '');
      lastFetchError = `HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)}`;
    } catch (err) {
      lastFetchError = getErrorMessage(err);
    }

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  if (!html) {
    throw new Error(`Failed to fetch Xiaohongshu page${lastFetchStatus ? ` (status ${lastFetchStatus})` : ''}${lastFetchError ? `: ${lastFetchError}` : ''}.`);
  }

  // Parse state
  let state = parseInitialState(html);

  // Fallback to Browser Rendering if available and direct parsing failed or note details empty
  const stateRecord = isRecord(state) ? state : null;
  const noteDetailMap = stateRecord ? getRecord(stateRecord, 'note') : null;
  const isStateEmpty = !noteDetailMap || !isRecord(noteDetailMap) || !isRecord((noteDetailMap as Record<string, unknown>).noteDetailMap) || !isRecord(((noteDetailMap as Record<string, unknown>).noteDetailMap as Record<string, unknown>)[noteId]);
  if (isStateEmpty && env.MYBROWSER) {
    try {
      // Dynamic import to avoid errors if the package is not bound
      // @ts-expect-error - @cloudflare/puppeteer is only available at runtime with Browser Rendering binding
      const puppeteer = await import('@cloudflare/puppeteer');
      const browser = await puppeteer.default.launch(env.MYBROWSER);
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      const renderedHtml = await page.content();
      await browser.close();

      const renderedState = parseInitialState(renderedHtml);
      const renderedRecord = isRecord(renderedState) ? renderedState : null;
      const renderedNote = renderedRecord ? getRecord(renderedRecord, 'note') : null;
      if (renderedNote && isRecord((renderedNote as Record<string, unknown>).noteDetailMap) && isRecord(((renderedNote as Record<string, unknown>).noteDetailMap as Record<string, unknown>)[noteId])) {
        state = renderedState;
      }
    } catch (browserErr) {
      console.error('Browser rendering failed:', browserErr);
    }
  }

  // Verify state contents
  const finalState = isRecord(state) ? state : null;
  const noteState = finalState ? getRecord(finalState, 'note') : null;
  const noteDetailMapState = noteState ? getRecord(noteState, 'noteDetailMap') : null;
  const detail = noteDetailMapState ? getRecord(noteDetailMapState, noteId) : null;
  if (!detail) {
    const statusHint = lastFetchStatus ? ` (last fetch status: ${lastFetchStatus})` : '';
    throw new Error(`Failed to parse Xiaohongshu note data.${statusHint} The page structure might have changed or requests are being blocked. Please try again.`);
  }

  const note = getRecord(detail, 'note');
  if (!note || Object.keys(note).length === 0) {
    throw new Error('Failed to load note content (empty note). It might be private or deleted.');
  }

  const title = getString(note, 'title');
  const desc = getString(note, 'desc');
  const type = getString(note, 'type') || 'normal'; // 'video' or 'normal' (images)
  const imageList = getArray(note, 'imageList');
  const video = getRecord(note, 'video');
  const firstImage = isRecord(imageList[0]) ? imageList[0] : null;
  const cover = getString(firstImage, 'urlDefault') || (video ? getString(getRecord(video, 'image'), 'url') : '');
  const user = getRecord(note, 'user');
  const author: Author = {
    name: user ? getString(user, 'nickname') : 'Xiaohongshu User',
    avatar: user ? getString(user, 'avatar') : '',
  };

  const result: MediaResult = {
    platform: 'xiaohongshu',
    id: noteId,
    type: type === 'video' ? 'video' : 'images',
    title,
    desc,
    cover,
    author,
    videos: [],
    images: [],
  };

  if (type === 'video' && video) {
    const media = getRecord(video, 'media');
    const stream = media ? getRecord(media, 'stream') : null;
    if (stream) {
      const h264 = getArray(stream, 'h264');
      const h265 = getArray(stream, 'h265');
      // Collect all video streams (h264, h265)
      const streams = [...h264, ...h265];
      const videoList = streams.map((streamItem) => {
        const s = isRecord(streamItem) ? streamItem : {};
        return {
          url: getString(s, 'masterUrl'),
          width: getNumber(s, 'width'),
          height: getNumber(s, 'height'),
          size: getNumber(s, 'size'),
          quality: getString(s, 'qualityType') || 'HD',
          fps: getNumber(s, 'fps'),
        };
      });

      // Sort by resolution/bitrate or size descending to display highest quality first
      videoList.sort((a, b) => (b.width * b.height) - (a.width * a.height));

      // Filter out duplicate masterUrls
      const seenUrls = new Set<string>();
      result.videos = videoList.filter((v) => {
        if (!v.url) return false;
        if (seenUrls.has(v.url)) return false;
        seenUrls.add(v.url);
        return true;
      });
    }
  }

  // Extract images
  if (imageList.length > 0) {
    result.images = imageList.map((img) => {
      const imgRecord = isRecord(img) ? img : {};
      return getString(imgRecord, 'urlDefault') || getString(imgRecord, 'url');
    });
  }

  // If it was detected as video but couldn't get streams, verify if we have image fallback
  if (result.type === 'video' && result.videos.length === 0 && result.images.length > 0) {
    result.type = 'images';
  }

  return result;
}

function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const target = value[key];
  return isRecord(target) ? target : null;
}

// Clean and parse initial state from HTML (Pure JSON.parse, no eval/new Function)
function parseInitialState(html: string): JsonValue {
  // Strategy 1: window.__INITIAL_STATE__ assignment
  const fromWindow = extractWindowInitialState(html);
  if (fromWindow !== null) return fromWindow;

  // Strategy 2: <script id="__INITIAL_STATE__" type="application/json">...</script>
  const scriptMatch = html.match(/<script[^>]+?id=["']__INITIAL_STATE__['"][^>]*?>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    const text = scriptMatch[1].trim().replace(/:\s*undefined\b/g, ':null');
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse script tag initial state:', getErrorMessage(e));
    }
  }

  return null;
}

function extractWindowInitialState(html: string): JsonValue | null {
  const marker = 'window.__INITIAL_STATE__';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  let pos = idx + marker.length;
  // Skip whitespace
  while (pos < html.length && /\s/.test(html[pos])) pos++;
  if (pos >= html.length || html[pos] !== '=') {
    // Try next occurrence if this one is malformed
    const next = html.indexOf(marker, pos);
    if (next !== -1) return extractWindowInitialState(html.slice(next));
    return null;
  }
  pos++; // skip '='

  // Bound the search by the containing </script> tag so trailing JS code
  // (e.g. `; window._SSR_HYDRATED = true;`) doesn't pollute the payload.
  const scriptEnd = html.indexOf('</script>', pos);
  const endBound = scriptEnd === -1 ? html.length : scriptEnd;
  let raw = html.slice(pos, endBound).trim();

  // Remove a single trailing semicolon
  if (raw.endsWith(';')) raw = raw.slice(0, -1);

  // Handle JSON.parse('...') wrappers
  if (raw.startsWith('JSON.parse(')) {
    const parsed = parseJsonParseWrapper(raw);
    if (parsed !== null) return parsed;
  }

  // Sanitize undefined -> null
  raw = raw.replace(/:\s*undefined\b/g, ':null');

  // Find the balanced end of the object/array literal, ignoring content
  // inside JSON strings. This avoids breaking on ';' characters inside
  // note descriptions or other string values.
  const jsonEnd = findJsonLiteralEnd(raw, 0);
  if (jsonEnd === -1) return null;

  try {
    return JSON.parse(raw.slice(0, jsonEnd));
  } catch (e) {
    console.error('Failed to parse window.__INITIAL_STATE__ literal:', getErrorMessage(e));
    return null;
  }
}

function parseJsonParseWrapper(raw: string): JsonValue | null {
  // raw starts with "JSON.parse("
  const prefix = 'JSON.parse(';
  const closeParen = findMatchingParen(raw, prefix.length);
  if (closeParen === -1) return null;

  const inner = raw.slice(prefix.length, closeParen).trim();
  if (inner.length < 2) return null;

  const quote = inner[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;

  // Find closing quote, respecting escapes
  let j = 1;
  let escaped = false;
  while (j < inner.length) {
    const c = inner[j];
    if (escaped) {
      escaped = false;
    } else if (c === '\\') {
      escaped = true;
    } else if (c === quote) {
      break;
    }
    j++;
  }
  if (j >= inner.length) return null;

  const payload = inner.slice(1, j);

  try {
    let decoded = '';
    if (quote === '"') {
      decoded = JSON.parse(`"${payload}"`);
    } else {
      const doubleQuoted = '"' + payload
        .replace(/\\"/g, '"')
        .replace(/"/g, '\\"')
        .replace(/\\'/g, "'")
        + '"';
      decoded = JSON.parse(doubleQuoted);
    }
    if (typeof decoded !== 'string') return null;
    decoded = decoded.replace(/:\s*undefined\b/g, ':null');
    return JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to parse JSON.parse wrapper:', getErrorMessage(e));
    return null;
  }
}

function findMatchingParen(s: string, start: number): number {
  let depth = 0;
  let inString: false | '"' | "'" | '`' = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === inString) {
        inString = false;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      continue;
    }
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function findJsonLiteralEnd(s: string, start: number): number {
  let i = start;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (i >= s.length) return -1;

  const c = s[i];
  if (c !== '{' && c !== '[') return -1;

  const close = c === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === c) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

// Parse Twitter/X URL using FixTweet API
async function parseTwitter(url: string): Promise<MediaResult> {
  // Extract status ID
  const matchId = url.match(/status\/(\d+)/);
  if (!matchId) {
    throw new Error('Invalid Twitter/X URL. Could not find Tweet status ID.');
  }
  const tweetId = matchId[1];

  // Call FixTweet API
  const apiRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!apiRes.ok) {
    const text = await apiRes.text();
    throw new Error(`Failed to retrieve tweet information from X. Status: ${apiRes.status}. Details: ${text}`);
  }

  const data = await apiRes.json() as JsonObj;
  const tweet = getRecord(data, 'tweet');
  if (!tweet || getString(tweet, 'type') === 'tombstone') {
    throw new Error(getString(data, 'message') || 'This Tweet is unavailable or deleted.');
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

  const result: MediaResult = {
    platform: 'twitter',
    id: tweetId,
    type: 'images',
    title,
    desc: title,
    cover,
    author,
    videos: [],
    images: [],
  };

  const videos: VideoFormat[] = [];
  const images: string[] = [];

  for (const media of allMedia) {
    const mediaRecord = isRecord(media) ? media : {};
    const mediaType = getString(mediaRecord, 'type');
    if (mediaType === 'video' || mediaType === 'gif') {
      result.type = 'video';

      // Try to read variants/formats
      const formats = getArray(mediaRecord, 'formats').length > 0 ? getArray(mediaRecord, 'formats') : getArray(mediaRecord, 'variants');
      const width = getNumber(mediaRecord, 'width');
      const height = getNumber(mediaRecord, 'height');
      const videoFormats = formats
        .filter((f) => {
          const formatRecord = isRecord(f) ? f : {};
          return getString(formatRecord, 'container') === 'mp4' || getString(formatRecord, 'content_type') === 'video/mp4';
        })
        .map((f) => {
          const formatRecord = isRecord(f) ? f : {};
          const formatUrl = getString(formatRecord, 'url');
          const urlDims = extractTwitterDimensions(formatUrl);
          return {
            url: formatUrl,
            width: urlDims?.width ?? width,
            height: urlDims?.height ?? height,
            quality: formatUrl.includes('/vid/') ? extractTwitterQuality(formatUrl) : 'HD',
            bitrate: getNumber(formatRecord, 'bitrate'),
          };
        });

      // If no mp4 formats were found but there is a main media url
      const mediaUrl = getString(mediaRecord, 'url');
      if (videoFormats.length === 0 && mediaUrl && mediaUrl.includes('.mp4')) {
        const urlDims = extractTwitterDimensions(mediaUrl);
        videoFormats.push({
          url: mediaUrl,
          width: urlDims?.width ?? width,
          height: urlDims?.height ?? height,
          quality: 'HD',
          bitrate: 0,
        });
      }

      videos.push(...videoFormats);
    } else if (mediaType === 'photo') {
      images.push(getString(mediaRecord, 'url'));
    }
  }

  result.videos = videos;
  result.images = images;

  // Filter duplicate videos
  const seenUrls = new Set<string>();
  result.videos = videos.filter((v) => {
    if (!v.url) return false;
    if (seenUrls.has(v.url)) return false;
    seenUrls.add(v.url);
    return true;
  });

  return result;
}

// Utility to extract width/height from Twitter video url (e.g. /720x1280/ or /1280x720/)
function extractTwitterDimensions(url: string): { width: number; height: number } | null {
  const match = url.match(/\/(\d+)x(\d+)\//);
  if (match) {
    return {
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10),
    };
  }
  return null;
}

// Utility to guess resolution from Twitter video url (e.g. /720x1280/ or /1280x720/)
function extractTwitterQuality(url: string): string {
  const dims = extractTwitterDimensions(url);
  if (dims) {
    const height = Math.min(dims.width, dims.height);
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return height + 'p';
  }
  return 'HD';
}

// Image Proxy Handler - bypasses hotlink protection
async function handleImageProxy(imageUrl: string): Promise<Response> {
  const res = await fetch(imageUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.xiaohongshu.com/',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch image. Status: ${res.status}`);
  }

  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  // Cache for 1 hour on CDN edge
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

// Streaming Proxy Handler for downloads
async function handleProxyDownload(url: string, filename: string): Promise<Response> {
  const mediaRes = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch media file from remote host. Status: ${mediaRes.status}`);
  }

  // Create responsive headers
  const headers = new Headers(mediaRes.headers);

  // Set CORS and Attachment header
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  // Ensure browser prompts download instead of playing
  headers.set('Content-Type', 'application/octet-stream');

  return new Response(mediaRes.body, {
    status: mediaRes.status,
    headers,
  });
}
