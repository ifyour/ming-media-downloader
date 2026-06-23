export interface Env {
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
      ...corsHeaders,
    },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;
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
        const result = await parseMediaUrl(targetUrl, env);
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
  // Try fetching directly
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });

  if (res.ok) {
    html = await res.text();
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
    throw new Error('Failed to parse Xiaohongshu note data. The page structure might have changed or requests are being blocked. Please try again.');
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

// Clean and Parse initial state from HTML (Pure JSON.parse, no eval/new Function)
function parseInitialState(html: string): JsonValue {
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(.*?)(?:<\/script>|;)/);
  if (!match) return null;

  let stateStr = match[1].trim();

  // Replace undefined values with null to make it valid JSON syntax
  stateStr = stateStr.replace(/:\s*undefined\b/g, ':null');

  if (stateStr.startsWith('JSON.parse(')) {
    const firstParen = stateStr.indexOf('(');
    const lastParen = stateStr.lastIndexOf(')');
    if (firstParen !== -1 && lastParen !== -1) {
      let inner = stateStr.substring(firstParen + 1, lastParen).trim();

      const quoteChar = inner[0];
      if (quoteChar === '"' || quoteChar === "'" || quoteChar === '`') {
        inner = inner.substring(1, inner.length - 1);
      }

      try {
        let rawJson = '';
        if (quoteChar === '"') {
          rawJson = JSON.parse(`"${inner}"`);
        } else {
          // Fallback conversion for single quotes or template literals
          const doubleQuoted = '"' + inner
            .replace(/\\"/g, '"')
            .replace(/"/g, '\\"')
            .replace(/\\'/g, "'")
            + '"';
          rawJson = JSON.parse(doubleQuoted);
        }
        if (typeof rawJson !== 'string') return null;
        rawJson = rawJson.replace(/:\s*undefined\b/g, ':null');
        return JSON.parse(rawJson);
      } catch (e) {
        console.error('Failed to parse wrapped state string:', e);
      }
    }
  }

  try {
    return JSON.parse(stateStr);
  } catch (e) {
    console.error('JSON.parse direct state failed:', getErrorMessage(e));
    return null;
  }
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
          return {
            url: formatUrl,
            width,
            height,
            quality: formatUrl.includes('/vid/') ? extractTwitterQuality(formatUrl) : 'HD',
            bitrate: getNumber(formatRecord, 'bitrate'),
          };
        });

      // If no mp4 formats were found but there is a main media url
      const mediaUrl = getString(mediaRecord, 'url');
      if (videoFormats.length === 0 && mediaUrl && mediaUrl.includes('.mp4')) {
        videoFormats.push({
          url: mediaUrl,
          width,
          height,
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

// Utility to guess resolution from Twitter video url (e.g. /720x1280/ or /1280x720/)
function extractTwitterQuality(url: string): string {
  const match = url.match(/\/(\d+x\d+)\//);
  if (match) {
    const res = match[1].split('x');
    const height = Math.min(parseInt(res[0], 10), parseInt(res[1], 10));
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
