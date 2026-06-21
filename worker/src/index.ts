export interface Env {
  // Add bindings here if needed, e.g. MYBROWSER for Cloudflare Browser Rendering
  MYBROWSER?: any;
}

// CORS Headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Response helper with CORS
function jsonResponse(data: any, status = 200) {
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
        return jsonResponse(result);
      } catch (err: any) {
        return errorResponse(err.message || 'Failed to parse URL', 500);
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
      } catch (err: any) {
        return errorResponse(err.message || 'Download proxy failed', 500);
      }
    }

    // Default route
    return jsonResponse({ message: 'Social Media Video Downloader API' });
  },
};

// Resolve redirects (like xhslink.com -> xiaohongshu.com)
async function resolveUrl(url: string): Promise<string> {
  // Clean up URL
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // If it's a short link or redirect link, follow it
  if (url.includes('xhslink.com') || url.includes('doubleclick.net') || url.includes('t.co')) {
    const res = await fetch(url, {
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

  return url;
}

// Main parser
async function parseMediaUrl(url: string, env: Env): Promise<any> {
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
async function parseXiaohongshu(url: string, env: Env): Promise<any> {
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
  const isStateEmpty = !state || !state.note || !state.note.noteDetailMap || !state.note.noteDetailMap[noteId] || !state.note.noteDetailMap[noteId].note;
  if (isStateEmpty && env.MYBROWSER) {
    try {
      // Dynamic import to avoid errors if the package is not bound
      const puppeteer = await import('@cloudflare/puppeteer');
      const browser = await puppeteer.default.launch(env.MYBROWSER);
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      const renderedHtml = await page.content();
      await browser.close();

      const renderedState = parseInitialState(renderedHtml);
      if (renderedState && renderedState.note && renderedState.note.noteDetailMap && renderedState.note.noteDetailMap[noteId]) {
        state = renderedState;
      }
    } catch (browserErr) {
      console.error('Browser rendering failed:', browserErr);
    }
  }

  // Verify state contents
  if (!state || !state.note || !state.note.noteDetailMap || !state.note.noteDetailMap[noteId]) {
    throw new Error('Failed to parse Xiaohongshu note data. The page structure might have changed or requests are being blocked. Please try again.');
  }

  const detail = state.note.noteDetailMap[noteId];
  const note = detail.note;
  if (!note || Object.keys(note).length === 0) {
    throw new Error('Failed to load note content (empty note). It might be private or deleted.');
  }

  const title = note.title || '';
  const desc = note.desc || '';
  const type = note.type || 'normal'; // 'video' or 'normal' (images)
  const cover = note.imageList?.[0]?.urlDefault || note.video?.image?.url || '';
  const author = {
    name: note.user?.nickname || 'Xiaohongshu User',
    avatar: note.user?.avatar || '',
  };

  const result: any = {
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

  if (type === 'video' && note.video) {
    const videoStream = note.video.media?.stream;
    if (videoStream) {
      // Collect all video streams (h264, h265)
      const streams = [...(videoStream.h264 || []), ...(videoStream.h265 || [])];
      const videoList = streams.map((stream: any) => ({
        url: stream.masterUrl,
        width: stream.width,
        height: stream.height,
        size: stream.size,
        quality: stream.qualityType || 'HD',
        fps: stream.fps,
      }));

      // Sort by resolution/bitrate or size descending to display highest quality first
      videoList.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      
      // Filter out duplicate masterUrls
      const seenUrls = new Set<string>();
      result.videos = videoList.filter((v: any) => {
        if (!v.url) return false;
        if (seenUrls.has(v.url)) return false;
        seenUrls.add(v.url);
        return true;
      });
    }
  }

  // Extract images
  if (note.imageList && note.imageList.length > 0) {
    result.images = note.imageList.map((img: any) => img.urlDefault || img.url || '');
  }

  // If it was detected as video but couldn't get streams, verify if we have image fallback
  if (result.type === 'video' && result.videos.length === 0 && result.images.length > 0) {
    result.type = 'images';
  }

  return result;
}

// Clean and Parse initial state from HTML (Pure JSON.parse, no eval/new Function)
function parseInitialState(html: string): any {
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
        rawJson = rawJson.replace(/:\s*undefined\b/g, ':null');
        return JSON.parse(rawJson);
      } catch (e) {
        console.error('Failed to parse wrapped state string:', e);
      }
    }
  }

  try {
    return JSON.parse(stateStr);
  } catch (e: any) {
    console.error('JSON.parse direct state failed:', e.message);
    return null;
  }
}

// Parse Twitter/X URL using FixTweet API
async function parseTwitter(url: string): Promise<any> {
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

  const data = await apiRes.json() as any;
  if (!data.tweet || data.tweet.type === 'tombstone') {
    throw new Error(data.message || 'This Tweet is unavailable or deleted.');
  }

  const tweet = data.tweet;
  const title = tweet.text || '';
  const cover = tweet.media?.all?.[0]?.thumbnail_url || tweet.media?.all?.[0]?.url || '';
  const author = {
    name: tweet.author?.name || 'X User',
    screen_name: tweet.author?.screen_name || '',
    avatar: tweet.author?.avatar_url || '',
  };

  const result: any = {
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

  const mediaList = tweet.media?.all || [];
  const videos: any[] = [];
  const images: string[] = [];

  for (const media of mediaList) {
    if (media.type === 'video' || media.type === 'gif') {
      result.type = 'video';
      
      // Try to read variants/formats
      const formats = media.formats || media.variants || [];
      const videoFormats = formats
        .filter((f: any) => f.container === 'mp4' || f.content_type === 'video/mp4')
        .map((f: any) => ({
          url: f.url,
          width: media.width,
          height: media.height,
          quality: f.url.includes('/vid/') ? extractTwitterQuality(f.url) : 'HD',
          bitrate: f.bitrate || 0,
        }));

      // Sort by quality/bitrate descending
      videoFormats.sort((a: any, b: any) => b.bitrate - a.bitrate);
      
      // If no mp4 formats were found but there is a main media url
      if (videoFormats.length === 0 && media.url && media.url.includes('.mp4')) {
        videoFormats.push({
          url: media.url,
          width: media.width,
          height: media.height,
          quality: 'HD',
          bitrate: 0,
        });
      }

      videos.push(...videoFormats);
    } else if (media.type === 'photo') {
      images.push(media.url);
    }
  }

  result.videos = videos;
  result.images = images;

  // Filter duplicate videos
  const seenUrls = new Set<string>();
  result.videos = videos.filter((v: any) => {
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
    const height = Math.min(parseInt(res[0]), parseInt(res[1]));
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return height + 'p';
  }
  return 'HD';
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
