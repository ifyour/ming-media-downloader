import type { Env, MediaResult, Author, JsonValue } from './types';
import { isRecord, getString, getNumber, getArray, getRecord, getErrorMessage } from './utils';

export async function parseRednote(url: string, env: Env): Promise<MediaResult> {
  const matchId = url.match(/(?:explore|item)\/([a-zA-Z0-9]+)/);
  if (!matchId) {
    throw new Error('Invalid RedNote URL. Could not find note ID.');
  }
  const noteId = matchId[1];

  let html = '';
  let lastFetchStatus = 0;
  let lastFetchError: string | null = null;

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
    throw new Error(`Failed to fetch RedNote page${lastFetchStatus ? ` (status ${lastFetchStatus})` : ''}${lastFetchError ? `: ${lastFetchError}` : ''}.`);
  }

  let state = parseInitialState(html);

  const stateRecord = isRecord(state) ? state : null;
  const noteDetailMap = stateRecord ? getRecord(stateRecord, 'note') : null;
  const isStateEmpty = !noteDetailMap || !isRecord(noteDetailMap) || !isRecord((noteDetailMap as Record<string, unknown>).noteDetailMap) || !isRecord(((noteDetailMap as Record<string, unknown>).noteDetailMap as Record<string, unknown>)[noteId]);

  if (isStateEmpty && env.MYBROWSER) {
    try {
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

  const finalState = isRecord(state) ? state : null;
  const noteState = finalState ? getRecord(finalState, 'note') : null;
  const noteDetailMapState = noteState ? getRecord(noteState, 'noteDetailMap') : null;
  const detail = noteDetailMapState ? getRecord(noteDetailMapState, noteId) : null;
  if (!detail) {
    const statusHint = lastFetchStatus ? ` (last fetch status: ${lastFetchStatus})` : '';
    throw new Error(`Failed to parse RedNote note data.${statusHint} The page structure might have changed or requests are being blocked. Please try again.`);
  }

  const note = getRecord(detail, 'note');
  if (!note || Object.keys(note).length === 0) {
    throw new Error('Failed to load note content (empty note). It might be private or deleted.');
  }

  const title = getString(note, 'title');
  const desc = getString(note, 'desc');
  const type = getString(note, 'type') || 'normal';
  const imageList = getArray(note, 'imageList');
  const video = getRecord(note, 'video');
  const firstImage = isRecord(imageList[0]) ? imageList[0] : null;
  const cover = getString(firstImage, 'urlDefault') || (video ? getString(getRecord(video, 'image'), 'url') : '');
  const user = getRecord(note, 'user');
  const author: Author = {
    name: user ? getString(user, 'nickname') : 'RedNote User',
    avatar: user ? getString(user, 'avatar') : '',
  };

  const result: MediaResult = {
    platform: 'rednote',
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

      videoList.sort((a, b) => (b.width * b.height) - (a.width * a.height));

      const seenUrls = new Set<string>();
      result.videos = videoList.filter((v) => {
        if (!v.url) return false;
        if (seenUrls.has(v.url)) return false;
        seenUrls.add(v.url);
        return true;
      });
    }
  }

  if (imageList.length > 0) {
    result.images = imageList.map((img) => {
      const imgRecord = isRecord(img) ? img : {};
      return getString(imgRecord, 'urlDefault') || getString(imgRecord, 'url');
    });
  }

  if (result.type === 'video' && result.videos.length === 0 && result.images.length > 0) {
    result.type = 'images';
  }

  return result;
}

function parseInitialState(html: string): JsonValue {
  const fromWindow = extractWindowInitialState(html);
  if (fromWindow !== null) return fromWindow;

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
  while (pos < html.length && /\s/.test(html[pos])) pos++;
  if (pos >= html.length || html[pos] !== '=') {
    const next = html.indexOf(marker, pos);
    if (next !== -1) return extractWindowInitialState(html.slice(next));
    return null;
  }
  pos++;

  const scriptEnd = html.indexOf('</script>', pos);
  const endBound = scriptEnd === -1 ? html.length : scriptEnd;
  let raw = html.slice(pos, endBound).trim();

  if (raw.endsWith(';')) raw = raw.slice(0, -1);

  if (raw.startsWith('JSON.parse(')) {
    const parsed = parseJsonParseWrapper(raw);
    if (parsed !== null) return parsed;
  }

  raw = raw.replace(/:\s*undefined\b/g, ':null');

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
  const prefix = 'JSON.parse(';
  const closeParen = findMatchingParen(raw, prefix.length);
  if (closeParen === -1) return null;

  const inner = raw.slice(prefix.length, closeParen).trim();
  if (inner.length < 2) return null;

  const quote = inner[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;

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
