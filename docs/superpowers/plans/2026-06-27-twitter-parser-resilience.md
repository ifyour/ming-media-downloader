# Twitter 解析器多源容灾 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** 消除 Twitter 解析对 `api.fxtwitter.com` 的单点依赖，实现多源链式降级

**Architecture:** 3 层链式降级 — fxtwitter（加超时重试）→ vxtwitter（同格式后备）→ HTMLRewriter 抓取 x.com（零成本后备）

**Tech Stack:** Cloudflare Worker + TypeScript + HTMLRewriter（原生 API，零依赖）

## 全局约束

- 不引入新 npm 依赖
- 不改 `parse.ts`、`cache.ts`、前端、`wrangler.toml`、路由、部署流程
- Worker 的 tsconfig 无 `verbatimModuleSyntax`，普通 `import` 即可

---

### Task 1: 重构 twitter.ts —— 超时/重试/failover 链

**Files:**
- Modify: `worker/src/twitter.ts`

**Interfaces:**
- Produces: `fetchWithRetry(url, timeoutMs?, retries?)` — 带超时和指数退避的 fetch
- Produces: `parseFxTwitterResponse(data, tweetId)` — 共享响应解析函数
- Produces: `tryFxTwitterApi(url, tweetId)` — 单源尝试（fetch + 解析 + 校验）
- Consumes: `parseTwitterHtml(url)` from `twitter-html.ts` (Tier 3)

- [ ] **Step 1: 重构 twitter.ts**

```typescript
import type { MediaResult, Author, VideoFormat } from './types';
import { isRecord, getString, getNumber, getArray, getRecord, extractTwitterDimensions, extractTwitterQuality } from './utils';
import { parseTwitterHtml } from './twitter-html';

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
  if (!tweet || getString(tweet, 'type') === 'tombstone') return null;

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

  if (type === 'video' && uniqueVideos.length === 0 && images.length === 0) return null;
  if (type === 'images' && images.length === 0) return null;

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

async function tryFxTwitterApi(baseUrl: string, tweetId: string): Promise<MediaResult | null> {
  const response = await fetchWithRetry(baseUrl);
  if (!response || !response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data) return null;
  return parseFxTwitterResponse(data, tweetId);
}

export async function parseTwitter(url: string): Promise<MediaResult> {
  const tweetId = extractTweetId(url);

  const r1 = await tryFxTwitterApi(`https://api.fxtwitter.com/status/${tweetId}`, tweetId);
  if (r1) return r1;

  const r2 = await tryFxTwitterApi(`https://api.vxtwitter.com/status/${tweetId}`, tweetId);
  if (r2) return r2;

  const r3 = await parseTwitterHtml(url, tweetId);
  if (r3) return r3;

  throw new Error('Failed to parse tweet from all available sources.');
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `pnpm build` 或 `npx tsc --noEmit -p worker/tsconfig.json`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add worker/src/twitter.ts
git commit -m "refactor(twitter): extract fetchWithRetry, parseFxTwitterResponse, add failover chain"
```

---

### Task 2: 新增 twitter-html.ts —— HTMLRewriter 后备解析

**Files:**
- Create: `worker/src/twitter-html.ts`

**Interfaces:**
- Consumes: `types.ts` 的 `MediaResult`、`Author`
- Produces: `parseTwitterHtml(url, tweetId)` — 使用 HTMLRewriter 从 x.com 页面提取媒体信息

- [ ] **Step 1: 实现 HTMLRewriter 抓取 + 解析**

```typescript
import type { MediaResult, Author } from './types';

interface CollectedMeta {
  title: string;
  images: string[];
  videoUrl: string;
  videoSecureUrl: string;
  videoWidth: number;
  videoHeight: number;
  videoType: string;
  creator: string;
}

class MetaCollector {
  meta: CollectedMeta = {
    title: '',
    images: [],
    videoUrl: '',
    videoSecureUrl: '',
    videoWidth: 0,
    videoHeight: 0,
    videoType: '',
    creator: '',
  };

  handler = {
    element(element: Element): void {
      const property = element.getAttribute('property') || '';
      const name = element.getAttribute('name') || '';
      const content = element.getAttribute('content');
      if (!content) return;

      switch (property) {
        case 'og:title':
          this.meta.title = content;
          break;
        case 'og:image':
          this.meta.images.push(content);
          break;
        case 'og:video':
          this.meta.videoUrl = content;
          break;
        case 'og:video:secure_url':
          this.meta.videoSecureUrl = content;
          break;
        case 'og:video:width':
          this.meta.videoWidth = parseInt(content, 10) || 0;
          break;
        case 'og:video:height':
          this.meta.videoHeight = parseInt(content, 10) || 0;
          break;
        case 'og:video:type':
          this.meta.videoType = content;
          break;
        default:
          if (name === 'twitter:creator') {
            this.meta.creator = content;
          }
          break;
      }
    },
  };
}

function extractScreenName(url: string): string {
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
  return match ? match[1] : '';
}

export async function parseTwitterHtml(url: string, tweetId: string): Promise<MediaResult | null> {
  const collector = new MetaCollector();

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;

  try {
    await new HTMLRewriter()
      .on('meta[property^="og:"], meta[name^="twitter:"]', collector.handler)
      .transform(response)
      .text();
  } catch {
    return null;
  }

  const { meta } = collector;
  const screenName = extractScreenName(url);

  const author: Author = {
    name: meta.creator.replace('@', '') || screenName || 'X User',
    screen_name: screenName,
    avatar: '',
  };

  if (meta.videoUrl && meta.videoType === 'video/mp4') {
    return {
      platform: 'twitter',
      id: tweetId,
      type: 'video',
      title: meta.title,
      desc: meta.title,
      cover: meta.images[0] || '',
      author,
      videos: [{
        url: meta.videoSecureUrl || meta.videoUrl,
        width: meta.videoWidth || 0,
        height: meta.videoHeight || 0,
        quality: meta.videoHeight >= 720 ? 'HD' : 'SD',
        bitrate: 0,
      }],
      images: [],
    };
  }

  if (meta.images.length > 0) {
    return {
      platform: 'twitter',
      id: tweetId,
      type: 'images',
      title: meta.title,
      desc: meta.title,
      cover: meta.images[0],
      author,
      videos: [],
      images: meta.images,
    };
  }

  return null;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `pnpm build` 或 `npx tsc --noEmit -p worker/tsconfig.json`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add worker/src/twitter-html.ts
git commit -m "feat(twitter): add HTMLRewriter fallback parser for x.com pages"
```

---

### Task 3: 验证整体构建

- [ ] **Step 1: 运行类型检查**

```bash
pnpm build
```

Expected: `tsc -b` 通过，`vite build` 通过

- [ ] **Step 2: 运行 lint**

```bash
pnpm lint
```

Expected: 零错误

- [ ] **Step 3: 综合提交**

```bash
git add -A
git commit -m "feat: add multi-source failover chain for Twitter parser"
```
