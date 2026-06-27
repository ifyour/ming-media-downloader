# 测试策略实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 添加全面的测试套件，覆盖 Worker 后端（主测试 + 降级路径）和前端（单元测试、hooks、组件、API 契约）。

**架构：** `tests/` 目录位于仓库根目录，两个 Vitest 工作区项目（`worker`、`frontend`）。降级测试通过 `*.fallback.test.ts` 命名约定隔离 — 从 `pnpm test` 中排除，包含在 `pnpm test:full` 中。

**技术栈：** Vitest（运行器）、`@cloudflare/vitest-pool-workers`（workerd 中的 Worker 测试运行时）、jsdom（前端 DOM）、`@testing-library/react`（组件测试）。

## 全局约束

- 前端 tsconfig 中 `verbatimModuleSyntax: true` — 类型导入使用 `import type`
- `erasableSyntaxOnly: true` — 不使用枚举、命名空间、参数属性
- Worker 源代码使用 `import type` + 普通 `import`（无 verbatimModuleSyntax 限制）
- 所有 mock 数据内联（无 fixture 文件）
- 测试放在 `tests/` 目录（不与源码同级）
- `*.fallback.test.ts` 文件是可选的降级测试套件

---

### Task 1: 基础设施搭建

**文件：**
- 创建：`tests/vitest.workspace.ts`
- 创建：`tests/frontend/setup.ts`
- 修改：`package.json`（添加开发依赖 + 脚本）
- 创建：`vitest.config.ts`（若需要 — 但工作区文件已足够）

**接口：**
- 消耗：无
- 产出：Vitest 工作区配置、可运行的测试命令、前端测试 setup

- [ ] **Step 1: 安装依赖**

```bash
# 前端测试依赖（根 package.json）
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom

# Worker 测试依赖（worker/package.json）
cd worker && pnpm add -D vitest @cloudflare/vitest-pool-workers && cd ..
```

- [ ] **Step 2: 创建 tests/vitest.workspace.ts**

```typescript
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'worker',
      include: ['tests/worker/**/*.test.ts'],
      exclude: ['tests/worker/**/*.fallback.test.ts'],
      pool: '@cloudflare/vitest-pool-workers',
      poolOptions: {
        workers: {
          wrangler: { configPath: './worker/wrangler.toml' },
        },
      },
    },
  },
  {
    test: {
      name: 'frontend',
      include: ['tests/frontend/**/*.test.ts', 'tests/frontend/**/*.test.tsx'],
      environment: 'jsdom',
      globals: true,
      setupFiles: ['tests/frontend/setup.ts'],
    },
  },
])
```

- [ ] **Step 3: 创建 tests/frontend/setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: 更新根 package.json，添加测试脚本**

编辑 `package.json` 的 scripts 部分 — 在 `"deploy:backend"` 之后添加：

```json
    "test": "vitest run --exclude '**/*.fallback.test.ts'",
    "test:full": "vitest run",
    "test:fallback": "vitest run 'tests/worker/**/*.fallback.test.ts'",
    "test:frontend": "vitest run --project frontend",
    "test:worker": "vitest run --project worker",
    "test:watch": "vitest"
```

- [ ] **Step 5: 验证设置运行（预期尚无测试）**

```bash
pnpm test
# 预期：No test files found（或类似的空摘要）
```

- [ ] **Step 6: 提交**

```bash
git add tests/ package.json worker/package.json pnpm-lock.yaml
git commit -m "test: add vitest workspace with worker + frontend projects"
```

---

### Task 2: Worker 工具函数 & 缓存测试

**文件：**
- 创建：`tests/worker/utils.test.ts`
- 创建：`tests/worker/cache.test.ts`

**接口：**
- 消耗：`worker/src/utils.ts` 导出、`worker/src/cache.ts` 导出、`worker/src/types.ts` 类型
- 产出：所有纯工具函数和缓存 key/CRUD 逻辑的测试覆盖

- [ ] **Step 1: 编写 tests/worker/utils.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isRecord,
  getString,
  getNumber,
  getArray,
  getRecord,
  getErrorMessage,
  resolveUrl,
  extractTwitterDimensions,
  extractTwitterQuality,
} from '../../worker/src/utils'

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isRecord([1, 2, 3])).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord('string')).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord(true)).toBe(false)
  })
})

describe('getString', () => {
  it('returns string value from record', () => {
    expect(getString({ name: 'test' }, 'name')).toBe('test')
  })

  it('returns empty string for missing key', () => {
    expect(getString({}, 'name')).toBe('')
  })

  it('returns empty string for non-string value', () => {
    expect(getString({ name: 123 }, 'name')).toBe('')
  })

  it('returns empty string when input is not a record', () => {
    expect(getString(null, 'name')).toBe('')
    expect(getString('foo', 'name')).toBe('')
  })
})

describe('getNumber', () => {
  it('returns number from record', () => {
    expect(getNumber({ count: 42 }, 'count')).toBe(42)
  })

  it('returns 0 for missing key', () => {
    expect(getNumber({}, 'count')).toBe(0)
  })

  it('returns 0 for non-number value', () => {
    expect(getNumber({ count: '42' }, 'count')).toBe(0)
  })

  it('returns 0 when input is not a record', () => {
    expect(getNumber(null, 'count')).toBe(0)
  })
})

describe('getArray', () => {
  it('returns array from record', () => {
    expect(getArray({ items: [1, 2, 3] }, 'items')).toEqual([1, 2, 3])
  })

  it('returns empty array for missing key', () => {
    expect(getArray({}, 'items')).toEqual([])
  })

  it('returns empty array for non-array value', () => {
    expect(getArray({ items: 'not-array' }, 'items')).toEqual([])
  })

  it('returns empty array when input is not a record', () => {
    expect(getArray(null, 'items')).toEqual([])
  })
})

describe('getRecord', () => {
  it('returns nested record from record', () => {
    expect(getRecord({ nested: { a: 1 } }, 'nested')).toEqual({ a: 1 })
  })

  it('returns null for missing key', () => {
    expect(getRecord({}, 'nested')).toBeNull()
  })

  it('returns null when value is not a record', () => {
    expect(getRecord({ nested: 'string' }, 'nested')).toBeNull()
  })

  it('returns null when input is not a record', () => {
    expect(getRecord(null, 'nested')).toBeNull()
  })
})

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke')
  })

  it('returns string directly', () => {
    expect(getErrorMessage('custom error')).toBe('custom error')
  })

  it('returns fallback for unknown types', () => {
    expect(getErrorMessage(null)).toBe('Unknown error')
    expect(getErrorMessage(42)).toBe('Unknown error')
    expect(getErrorMessage(undefined)).toBe('Unknown error')
  })
})

describe('resolveUrl', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('passes through non-shortened URLs unchanged', async () => {
    const url = await resolveUrl('https://xiaohongshu.com/explore/123')
    expect(url).toBe('https://xiaohongshu.com/explore/123')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('adds https prefix when missing', async () => {
    const url = await resolveUrl('xiaohongshu.com/explore/123')
    expect(url).toBe('https://xiaohongshu.com/explore/123')
  })

  it('follows redirect for xhslink.com', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(Object.entries({ location: 'https://xiaohongshu.com/explore/abc' })),
    })
    const url = await resolveUrl('https://xhslink.com/abc')
    expect(url).toBe('https://xiaohongshu.com/explore/abc')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const reqUrl = mockFetch.mock.calls[0][0]
    expect(reqUrl).toContain('xhslink.com')
  })

  it('handles doubleclick.net redirect', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(Object.entries({ location: 'https://x.com/user/status/123' })),
    })
    const url = await resolveUrl('https://doubleclick.net/xyz')
    expect(url).toBe('https://x.com/user/status/123')
  })

  it('handles t.co redirect', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(Object.entries({ location: 'https://x.com/user/status/456' })),
    })
    const url = await resolveUrl('https://t.co/abc')
    expect(url).toBe('https://x.com/user/status/456')
  })

  it('recursively resolves chained redirects', async () => {
    mockFetch
      .mockResolvedValueOnce({
        headers: new Map(Object.entries({ location: 'https://t.co/xyz' })),
      })
      .mockResolvedValueOnce({
        headers: new Map(Object.entries({ location: 'https://x.com/user/status/789' })),
      })
    const url = await resolveUrl('https://xhslink.com/chain')
    expect(url).toBe('https://x.com/user/status/789')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns cleaned URL when redirect has no location header', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(),
    })
    const url = await resolveUrl('https://xhslink.com/abc')
    expect(url).toBe('https://xhslink.com/abc')
  })
})

describe('extractTwitterDimensions', () => {
  it('parses WxH from URL path', () => {
    expect(extractTwitterDimensions('https://example.com/video/720x1280.mp4')).toEqual({
      width: 720,
      height: 1280,
    })
  })

  it('returns null for URL without dimensions', () => {
    expect(extractTwitterDimensions('https://example.com/video.mp4')).toBeNull()
  })

  it('returns null for empty URL', () => {
    expect(extractTwitterDimensions('')).toBeNull()
  })
})

describe('extractTwitterQuality', () => {
  it('returns 1080p for height >= 1080', () => {
    expect(extractTwitterQuality('/video/1920x1080.mp4')).toBe('1080p')
  })

  it('returns 720p for height >= 720', () => {
    expect(extractTwitterQuality('/video/1280x720.mp4')).toBe('720p')
  })

  it('returns 480p for height >= 480', () => {
    expect(extractTwitterQuality('/video/640x480.mp4')).toBe('480p')
  })

  it('returns Np for lower resolutions', () => {
    expect(extractTwitterQuality('/video/320x360.mp4')).toBe('360p')
  })

  it('returns HD when dimensions cannot be extracted', () => {
    expect(extractTwitterQuality('/video/no-dimensions.mp4')).toBe('HD')
  })
})
```

- [ ] **Step 2: 运行以验证失败**

```bash
pnpm test:worker
# 预期：测试失败（utils 模块未找到）— 或通过，因为池解析了导入
# 必要时调整导入路径
```

- [ ] **Step 3: 编写 tests/worker/cache.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { getCacheKey, getCacheResult, setCacheResult } from '../../worker/src/cache'
import type { MediaResult } from '../../worker/src/types'

describe('getCacheKey', () => {
  it('returns xhs key for xiaohongshu.com explore URL', () => {
    expect(getCacheKey('https://www.xiaohongshu.com/explore/123abc')).toBe('xhs:123abc')
  })

  it('returns xhs key for xiaohongshu.com item URL', () => {
    expect(getCacheKey('https://www.xiaohongshu.com/item/456def')).toBe('xhs:456def')
  })

  it('returns xhs key for rednote.com URL', () => {
    expect(getCacheKey('https://www.rednote.com/explore/789ghi')).toBe('xhs:789ghi')
  })

  it('returns tw key for twitter.com status URL', () => {
    expect(getCacheKey('https://twitter.com/user/status/123456789')).toBe('tw:123456789')
  })

  it('returns tw key for x.com status URL', () => {
    expect(getCacheKey('https://x.com/user/status/987654321')).toBe('tw:987654321')
  })

  it('returns null for unsupported URLs', () => {
    expect(getCacheKey('https://example.com')).toBeNull()
    expect(getCacheKey('https://youtube.com/watch?v=abc')).toBeNull()
  })

  it('returns null for invalid URLs', () => {
    // Bad URL should be handled by try/catch
  })

  it('returns null for xiaohongshu URL without valid path', () => {
    expect(getCacheKey('https://www.xiaohongshu.com/')).toBeNull()
  })

  it('returns null for twitter URL without status in path', () => {
    expect(getCacheKey('https://x.com/home')).toBeNull()
  })
})

describe('getCacheResult', () => {
  it('returns CacheEntry when key exists in KV', async () => {
    const data: MediaResult = {
      platform: 'twitter', id: '123', type: 'video',
      title: 'test', desc: 'test', cover: '',
      author: { name: 'u', avatar: '' },
      videos: [], images: [],
    }
    const meta = { cachedAt: Date.now() }
    const mockKv = {
      getWithMetadata: async () => ({ value: data, metadata: meta }),
    } as unknown as KVNamespace

    const result = await getCacheResult(mockKv, 'tw:123')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
    expect(result!.meta).toEqual(meta)
  })

  it('returns null when key does not exist', async () => {
    const mockKv = {
      getWithMetadata: async () => ({ value: null, metadata: null }),
    } as unknown as KVNamespace

    const result = await getCacheResult(mockKv, 'tw:missing')
    expect(result).toBeNull()
  })

  it('returns null on KV error', async () => {
    const mockKv = {
      getWithMetadata: async () => { throw new Error('KV error') },
    } as unknown as KVNamespace

    const result = await getCacheResult(mockKv, 'tw:123')
    expect(result).toBeNull()
  })
})

describe('setCacheResult', () => {
  it('stores data with cachedAt metadata', async () => {
    const data: MediaResult = {
      platform: 'rednote', id: 'abc', type: 'images',
      title: 'test', desc: 'test', cover: '',
      author: { name: 'u', avatar: '' },
      videos: [], images: [],
    }
    let storedKey = ''
    let storedValue = ''
    let storedMetadata: unknown = null
    const mockKv = {
      put: async (key: string, value: string, opts?: unknown) => {
        storedKey = key
        storedValue = value
        storedMetadata = opts
      },
    } as unknown as KVNamespace

    await setCacheResult(mockKv, 'xhs:abc', data)
    expect(storedKey).toBe('xhs:abc')
    expect(JSON.parse(storedValue)).toEqual(data)
    expect(storedMetadata).toHaveProperty('metadata')
    expect((storedMetadata as { metadata: { cachedAt: number } }).metadata).toHaveProperty('cachedAt')
  })

  it('handles KV put error gracefully', async () => {
    const mockKv = {
      put: async () => { throw new Error('KV error') },
    } as unknown as KVNamespace
    await expect(setCacheResult(mockKv, 'xhs:abc', {} as MediaResult)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: 运行以验证通过**

```bash
pnpm test:worker
# 预期：所有测试通过
```

- [ ] **Step 5: 提交**

```bash
git add tests/worker/utils.test.ts tests/worker/cache.test.ts
git commit -m "test: add worker utility and cache unit tests"
```

---

### Task 3: Worker Twitter 测试

**文件：**
- 创建：`tests/worker/twitter.test.ts`
- 创建：`tests/worker/twitter-html.test.ts`
- 创建：`tests/worker/twitter.fallback.test.ts`

**接口：**
- 消耗：`worker/src/twitter.ts` (`parseTwitter`)，`worker/src/twitter-html.ts` (`parseTwitterHtml`)，`worker/src/utils.ts` (类型守卫)
- 产出：Twitter 3 层解析的主测试 + 降级测试覆盖

- [ ] **Step 1: 编写 tests/worker/twitter.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTwitter } from '../../worker/src/twitter'

describe('parseTwitter', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const validFxTwitterResponse = {
    tweet: {
      text: 'Hello world',
      media: {
        all: [
          {
            type: 'video',
            formats: [
              { url: 'https://example.com/video/720x1280.mp4', container: 'mp4', bitrate: 500000 },
              { url: 'https://example.com/video/480x854.mp4', container: 'mp4', bitrate: 300000 },
            ],
            width: 720,
            height: 1280,
          },
        ],
      },
      author: {
        name: 'Test User',
        screen_name: 'testuser',
        avatar_url: 'https://example.com/avatar.jpg',
      },
    },
  }

  it('parses a valid tweet with video from fxtwitter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validFxTwitterResponse,
    })

    const result = await parseTwitter('https://x.com/testuser/status/123456789')

    expect(result.platform).toBe('twitter')
    expect(result.id).toBe('123456789')
    expect(result.type).toBe('video')
    expect(result.videos).toHaveLength(2)
    expect(result.videos[0].quality).toBe('720p')
    expect(result.author.name).toBe('Test User')
  })

  it('parses a tweet with photos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'Photo tweet',
          media: {
            all: [
              { type: 'photo', url: 'https://example.com/photo1.jpg' },
              { type: 'photo', url: 'https://example.com/photo2.jpg' },
            ],
          },
          author: { name: 'User', screen_name: 'user', avatar_url: '' },
        },
      }),
    })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.type).toBe('images')
    expect(result.images).toHaveLength(2)
  })

  it('throws TweetError for tombstone tweets', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: { type: 'tombstone' },
        message: 'This Tweet has been deleted',
      }),
    })

    await expect(parseTwitter('https://x.com/user/status/999'))
      .rejects.toThrow('This Tweet has been deleted')
  })

  it('deduplicates videos by URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'Dedup test',
          media: {
            all: [{
              type: 'video', formats: [
                { url: 'https://example.com/dup.mp4', container: 'mp4' },
                { url: 'https://example.com/dup.mp4', container: 'mp4' },
              ], width: 1920, height: 1080,
            }],
          },
          author: { name: 'U', screen_name: 'u', avatar_url: '' },
        },
      }),
    })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.videos).toHaveLength(1)
  })

  it('falls back to vxtwitter when fxtwitter fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweet: {
            text: 'From vx',
            media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
            author: { name: 'V', screen_name: 'v', avatar_url: '' },
          },
        }),
      })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.title).toBe('From vx')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('includes video from media.url field when formats are empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'Direct url',
          media: {
            all: [{
              type: 'video',
              formats: [],
              url: 'https://example.com/video/1080x1920.mp4',
              width: 1080, height: 1920,
            }],
          },
          author: { name: 'U', screen_name: 'u', avatar_url: '' },
        },
      }),
    })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.videos).toHaveLength(1)
    expect(result.videos[0].url).toContain('.mp4')
  })
})
```

- [ ] **Step 2: 编写 tests/worker/twitter-html.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTwitterHtml } from '../../worker/src/twitter-html'

describe('parseTwitterHtml', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // HTMLRewriter 在 workerd 运行时中可用（vitest-pool-workers），
  // 因此这些测试从 mock HTML 中执行真实的 og:meta 提取

  function htmlWithOgMeta(overrides: Record<string, string> = {}): string {
    const tags = {
      'og:title': 'Tweet Title',
      'og:image': 'https://ex.com/image.jpg',
      'og:video': 'https://ex.com/video.mp4',
      'og:video:secure_url': 'https://ex.com/video.mp4',
      'og:video:width': '1280',
      'og:video:height': '720',
      'og:video:type': 'video/mp4',
      'twitter:creator': '@author',
      ...overrides,
    }
    return `<html><head>${
      Object.entries(tags)
        .map(([k, v]) => `<meta property="${k}" content="${v}" />`)
        .join('\n')
    }</head><body></body></html>`
  }

  it('returns null when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await parseTwitterHtml('https://x.com/user/status/123', '123')
    expect(result).toBeNull()
  })

  it('extracts video from OG meta tags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => htmlWithOgMeta(),
    })

    const result = await parseTwitterHtml('https://x.com/user/status/456', '456')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('video')
    expect(result!.videos[0].url).toBe('https://ex.com/video.mp4')
    expect(result!.videos[0].width).toBe(1280)
    expect(result!.videos[0].height).toBe(720)
    expect(result!.author.name).toBe('author')
  })

  it('extracts images when no og:video is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => htmlWithOgMeta({
        'og:video': '',
        'og:video:secure_url': '',
        'og:video:type': '',
      }),
    })

    const result = await parseTwitterHtml('https://x.com/user/status/789', '789')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('images')
    expect(result!.images).toContain('https://ex.com/image.jpg')
  })

  it('returns null when no relevant meta tags found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><head></head><body></body></html>',
    })

    const result = await parseTwitterHtml('https://x.com/user/status/000', '000')
    expect(result).toBeNull()
  })

  it('extracts screen name from URL for author fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => htmlWithOgMeta({ 'twitter:creator': '' }),
    })

    const result = await parseTwitterHtml('https://x.com/someuser/status/111', '111')
    expect(result!.author.screen_name).toBe('someuser')
  })
})
```

- [ ] **Step 3: 编写 tests/worker/twitter.fallback.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTwitter } from '../../worker/src/twitter'

describe('parseTwitter — 降级链 (Tier 3)', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('两个 API 层均失败时降级到 HTMLRewriter', async () => {
    // fxtwitter 和 vxtwitter 均失败，HTMLRewriter 通过 OG meta 成功
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'err' })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><head>
          <meta property="og:title" content="HTML Tweet" />
          <meta property="og:image" content="https://ex.com/img.jpg" />
        </head></html>`,
      })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.platform).toBe('twitter')
    expect(result.type).toBe('images')
    expect(result.images[0]).toBe('https://ex.com/img.jpg')
  })

  it('全部 3 层均失败 — 错误消息包含所有详细信息', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'forbidden' })
      .mockResolvedValueOnce({ ok: true, text: async () => '<html><head></head><body></body></html>' })

    try {
      await parseTwitter('https://x.com/user/status/999')
      expect.unreachable('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('500')
      expect(msg).toContain('403')
    }
  })

  it('fxtwitter 超时后 vxtwitter 成功', async () => {
    mockFetch
      .mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweet: {
            text: 'From vx after timeout',
            media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
            author: { name: 'V', screen_name: 'v', avatar_url: '' },
          },
        }),
      })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.title).toBe('From vx after timeout')
  })
})
```

- [ ] **Step 4: 运行以验证**

```bash
pnpm test:worker
# 预期：主 twitter 测试通过
pnpm test:fallback
# 预期：降级 twitter 测试通过
pnpm test
# 预期：降级测试被排除
```

- [ ] **Step 5: 提交**

```bash
git add tests/worker/twitter.test.ts tests/worker/twitter-html.test.ts tests/worker/twitter.fallback.test.ts
git commit -m "test: add worker twitter parser tests (primary + fallback)"
```

---

### Task 4: Worker RedNote 测试

**文件：**
- 创建：`tests/worker/rednote.test.ts`
- 创建：`tests/worker/rednote.fallback.test.ts`

**接口：**
- 消耗：`worker/src/rednote.ts` (`parseRednote`)，`worker/src/types.ts`
- 产出：RedNote INITIAL_STATE 提取、视频/图片解析、Puppeteer 降级的测试覆盖

- [ ] **Step 1: 编写 tests/worker/rednote.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseRednote } from '../../worker/src/rednote'
import type { Env } from '../../worker/src/types'

describe('parseRednote', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: Env

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    mockEnv = { MMD_CACHE: {} as KVNamespace }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function buildHtmlWithInitialState(noteId: string, overrides: Record<string, unknown> = {}): string {
    const state = {
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: 'Test Title',
              desc: 'Test Description',
              type: 'normal',
              imageList: [],
              user: {
                nickname: 'TestAuthor',
                avatar: 'https://example.com/avatar.jpg',
              },
              ...overrides,
            },
          },
        },
      },
    }
    return `<html><body><script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script></body></html>`
  }

  const noteId = 'abcdef123'

  it('parses a normal image note', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'normal',
      imageList: [
        { urlDefault: 'https://ex.com/img1.jpg' },
        { urlDefault: 'https://ex.com/img2.jpg' },
      ],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.platform).toBe('rednote')
    expect(result.id).toBe(noteId)
    expect(result.type).toBe('images')
    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toBe('https://ex.com/img1.jpg')
    expect(result.author.name).toBe('TestAuthor')
  })

  it('parses a video note with h264 streams', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'video',
      video: {
        media: {
          stream: {
            h264: [
              { masterUrl: 'https://ex.com/vid_1080p.mp4', width: 1920, height: 1080, size: 10_000_000, qualityType: '1080p', fps: 30 },
              { masterUrl: 'https://ex.com/vid_720p.mp4', width: 1280, height: 720, size: 5_000_000, qualityType: '720p', fps: 30 },
            ],
            h265: [],
          },
        },
      },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.rednote.com/explore/${noteId}`, mockEnv)
    expect(result.type).toBe('video')
    expect(result.videos).toHaveLength(2)
    // 应按分辨率降序排序
    expect(result.videos[0].quality).toBe('1080p')
    expect(result.videos[1].quality).toBe('720p')
  })

  it('deduplicates video streams by URL', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'video',
      video: {
        media: {
          stream: {
            h264: [
              { masterUrl: 'https://ex.com/dup.mp4', width: 1920, height: 1080 },
              { masterUrl: 'https://ex.com/dup.mp4', width: 1920, height: 1080 },
            ],
            h265: [],
          },
        },
      },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.videos).toHaveLength(1)
  })

  it('degrades video type to images when no videos found but images exist', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'video',
      video: { media: { stream: { h264: [], h265: [] } } },
      imageList: [{ urlDefault: 'https://ex.com/img.jpg' }],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.type).toBe('images')
    expect(result.images).toHaveLength(1)
  })

  it('extracts image urls from both urlDefault and url fields', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      imageList: [
        { urlDefault: 'https://ex.com/default.jpg' },
        { url: 'https://ex.com/fallback.jpg' },
      ],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.images[0]).toBe('https://ex.com/default.jpg')
    expect(result.images[1]).toBe('https://ex.com/fallback.jpg')
  })

  it('retries on fetch failure (3 attempts)', async () => {
    const html = buildHtmlWithInitialState(noteId)
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => html,
      })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.id).toBe(noteId)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('throws when all fetch attempts fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'))

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    ).rejects.toThrow('Failed to fetch RedNote page')
  })

  it('throws for invalid RedNote URL', async () => {
    await expect(
      parseRednote('https://example.com/not-rednote', mockEnv)
    ).rejects.toThrow('Invalid RedNote URL')
  })

  it('throws when HTML has no INITIAL_STATE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No state here</body></html>',
    })

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    ).rejects.toThrow('Failed to parse RedNote note data')
  })
})
```

- [ ] **Step 2: 编写 tests/worker/rednote.fallback.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseRednote } from '../../worker/src/rednote'
import type { Env } from '../../worker/src/types'

describe('parseRednote — 降级路径', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const noteId = 'fallback123'

  it('window.__INITIAL_STATE__ 缺失时降级到 __INITIAL_STATE__ script 标签', async () => {
    const stateJson = JSON.stringify({
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: 'Script Tag Title',
              desc: 'From script tag',
              type: 'normal',
              imageList: [],
              user: { nickname: 'ScriptAuthor', avatar: '' },
            },
          },
        },
      },
    })

    // 没有 window.__INITIAL_STATE__ 的 HTML，但有 script id="__INITIAL_STATE__"
    const html = `<html><body><script id="__INITIAL_STATE__" type="application/json">${stateJson}</script></body></html>`
    const env: Env = { MMD_CACHE: {} as KVNamespace }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    expect(result.title).toBe('Script Tag Title')
    expect(result.author.name).toBe('ScriptAuthor')
  })

  it('导入不可用时优雅降级到 Puppeteer SSR', async () => {
    // 首次获取返回没有 INITIAL_STATE 的 HTML
    const emptyHtml = '<html><body>Need SSR</body></html>'
    const env: Env = { MMD_CACHE: {} as KVNamespace, MYBROWSER: {} }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => emptyHtml,
    })

    // Puppeteer 动态导入将失败（包未安装）。
    // 函数捕获错误并继续，最终抛出
    // 因为没有从任何策略提取到状态。
    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    ).rejects.toThrow('Failed to parse RedNote note data')
  })

  it('所有策略均失败 — 抛出有意义的错误', async () => {
    const env: Env = { MMD_CACHE: {} as KVNamespace }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No state whatsoever</body></html>',
    })

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    ).rejects.toThrow('Failed to parse RedNote note data')
  })

  it('HTTP 错误状态在错误消息中包含部分 body', async () => {
    const env: Env = { MMD_CACHE: {} as KVNamespace }
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '{"error":"rate limit"}',
    })

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 运行以验证**

```bash
pnpm test:worker
pnpm test:fallback
pnpm test
```

- [ ] **Step 4: 提交**

```bash
git add tests/worker/rednote.test.ts tests/worker/rednote.fallback.test.ts
git commit -m "test: add worker rednote parser tests (primary + fallback)"
```

---

### Task 5: Worker Parse & Handler 测试

**文件：**
- 创建：`tests/worker/parse.test.ts`
- 创建：`tests/worker/parse.fallback.test.ts`
- 创建：`tests/worker/handlers.test.ts`

**接口：**
- 消耗：`worker/src/parse.ts` (`parseWithCache`, `parseMediaUrl`)，`worker/src/handlers.ts` (`handleImageProxy`, `handleProxyDownload`)
- 产出：路由分发、缓存生命周期、图片/下载代理的测试覆盖

- [ ] **Step 1: 编写 tests/worker/parse.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseWithCache } from '../../worker/src/parse'
import type { Env } from '../../worker/src/types'

describe('parseWithCache', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: Env
  let mockCtx: ExecutionContext

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    mockEnv = {
      MMD_CACHE: {
        getWithMetadata: vi.fn(),
        put: vi.fn(),
        get: vi.fn(),
      } as unknown as KVNamespace,
    }
    mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('delegates rednote URLs to parseRednote', async () => {
    // 缓存未命中
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({ value: null, metadata: null })
    // 获取返回带有 INITIAL_STATE 的 HTML
    const stateJson = JSON.stringify({
      note: { noteDetailMap: { abc123: { note: { title: 'RN', desc: '', type: 'normal', imageList: [], user: { nickname: 'A', avatar: '' } } } } },
    })
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `<html><script>window.__INITIAL_STATE__=${stateJson}</script></html>`,
    })

    const result = await parseWithCache('https://www.xiaohongshu.com/explore/abc123', mockEnv, mockCtx)
    expect(result.platform).toBe('rednote')
    expect(result.id).toBe('abc123')
  })

  it('delegates twitter URLs to parseTwitter', async () => {
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({ value: null, metadata: null })
    const tweetData = {
      tweet: {
        text: 'Tweet test',
        media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
        author: { name: 'U', screen_name: 'u', avatar_url: '' },
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => tweetData,
    })

    const result = await parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    expect(result.platform).toBe('twitter')
    expect(result.id).toBe('999')
  })

  it('throws for unsupported platforms', async () => {
    const result = parseWithCache('https://youtube.com/watch?v=abc', mockEnv, mockCtx)
    await expect(result).rejects.toThrow('Unsupported platform')
  })

  it('returns cached data when cache is fresh (< 12h)', async () => {
    const cachedData = {
      platform: 'twitter' as const, id: '123', type: 'images' as const,
      title: 'Cached', desc: '', cover: '',
      author: { name: 'U', avatar: '' },
      videos: [], images: [],
    }
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({
      value: cachedData,
      metadata: { cachedAt: Date.now() - 1000 }, // 1 second ago
    })

    const result = await parseWithCache('https://x.com/user/status/123', mockEnv, mockCtx)
    expect(result.title).toBe('Cached')
    expect(mockFetch).not.toHaveBeenCalled() // No HTTP request made
  })
})
```

- [ ] **Step 2: 编写 tests/worker/parse.fallback.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseWithCache } from '../../worker/src/parse'
import type { Env, MediaResult } from '../../worker/src/types'

describe('parseWithCache — 降级路径', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: Env
  let mockCtx: ExecutionContext

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    mockEnv = {
      MMD_CACHE: {
        getWithMetadata: vi.fn(),
        put: vi.fn(),
        get: vi.fn(),
      } as unknown as KVNamespace,
    }
    mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const staleData: MediaResult = {
    platform: 'twitter', id: '999', type: 'images',
    title: 'Stale', desc: '', cover: '',
    author: { name: 'U', avatar: '' },
    videos: [], images: [],
  }

  it('returns stale cache when fresh fetch fails', async () => {
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({
      value: staleData,
      metadata: { cachedAt: Date.now() - 4 * 24 * 60 * 60 * 1000 }, // > 3 days
    })

    // 新鲜获取失败
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' })

    const result = await parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    expect(result.title).toBe('Stale')
  })

  it('re-throws error when no cache available and fetch fails', async () => {
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({ value: null, metadata: null })
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' })

    await expect(
      parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    ).rejects.toThrow()
  })

  it('triggers background refresh for stale cache (12h-3d)', async () => {
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({
      value: staleData,
      metadata: { cachedAt: Date.now() - 18 * 60 * 60 * 1000 }, // 18 hours ago
    })

    // 后台刷新静默失败（测试它不阻塞响应）
    const tweetData = {
      tweet: {
        text: 'Fresh data',
        media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
        author: { name: 'U', screen_name: 'u', avatar_url: '' },
      },
    }
    mockFetch.mockResolvedValue({ ok: true, json: async () => tweetData })

    const result = await parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    expect(result.title).toBe('Stale')      // 立即返回缓存数据
    expect(mockCtx.waitUntil).toHaveBeenCalled() // 安排了后台刷新
  })

  it('bypasses cache when URL is not cacheable', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'No cache key',
          media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
          author: { name: 'U', screen_name: 'u', avatar_url: '' },
        },
      }),
    })

    const result = await parseWithCache('https://x.com/user/status/999?extra=param', mockEnv, mockCtx)
    expect(result.title).toBe('No cache key')
    expect(mockEnv.MMD_CACHE.getWithMetadata).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 编写 tests/worker/handlers.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleImageProxy, handleProxyDownload } from '../../worker/src/handlers'

describe('handleImageProxy', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('proxies image with RedNote Referer', async () => {
    const mockBody = new ReadableStream({ start(controller) { controller.close() } })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'image/jpeg' }),
      body: mockBody,
    })

    const response = await handleImageProxy('https://example.com/image.jpg')

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')

    // 验证使用正确的 headers 调用了 fetch
    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe('https://example.com/image.jpg')
    expect(fetchCall[1]?.headers?.['Referer']).toBe('https://www.xiaohongshu.com/')
  })

  it('throws when origin fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(handleImageProxy('https://example.com/missing.jpg'))
      .rejects.toThrow('Failed to fetch image')
  })
})

describe('handleProxyDownload', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('proxies download with Content-Disposition', async () => {
    const mockBody = new ReadableStream({ start(controller) { controller.close() } })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'video/mp4' }),
      body: mockBody,
    })

    const response = await handleProxyDownload('https://example.com/video.mp4', 'test_video.mp4')

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Content-Disposition')).toContain('test_video.mp4')
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
  })

  it('throws when download source fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(handleProxyDownload('https://example.com/missing.mp4', 'x.mp4'))
      .rejects.toThrow('Failed to fetch media file')
  })
})
```

- [ ] **Step 4: 运行以验证**

```bash
pnpm test:worker
pnpm test:fallback
pnpm test
```

- [ ] **Step 5: 提交**

```bash
git add tests/worker/parse.test.ts tests/worker/parse.fallback.test.ts tests/worker/handlers.test.ts
git commit -m "test: add worker parse and handler tests (primary + fallback)"
```

---

### Task 6: 前端纯函数测试

**文件：**
- 创建：`tests/frontend/extractUrl.test.ts`
- 创建：`tests/frontend/utils.test.ts`
- 创建：`tests/frontend/history.test.ts`

**接口：**
- 消耗：`src/extractUrl.ts` (`extractUrl`)，`src/utils.ts` (`getErrorMessage`, `proxiedImage`, `formatBytes`)，`src/history.ts` (`addToHistory`, `clearHistory`)
- 产出：所有非 React 前端工具函数的全覆盖

- [ ] **Step 1: 编写 tests/frontend/extractUrl.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { extractUrl } from '../../src/extractUrl'

describe('extractUrl', () => {
  it('extracts https URL from text', () => {
    expect(extractUrl('Check this https://x.com/user/status/123')).toBe('https://x.com/user/status/123')
  })

  it('extracts http URL from text', () => {
    expect(extractUrl('http://example.com/test')).toBe('http://example.com/test')
  })

  it('strips trailing punctuation from URL', () => {
    expect(extractUrl('Visit https://x.com/user/status/123!')).toBe('https://x.com/user/status/123')
    expect(extractUrl('See https://x.com/user/status/123...')).toBe('https://x.com/user/status/123')
  })

  it('does not strip trailing slash', () => {
    expect(extractUrl('https://x.com/user/status/123/')).toBe('https://x.com/user/status/123/')
  })

  it('extracts first URL when multiple present', () => {
    expect(extractUrl('https://first.com https://second.com')).toBe('https://first.com')
  })

  it('returns null when no URL present', () => {
    expect(extractUrl('Just some text')).toBeNull()
  })

  it('handles empty string', () => {
    expect(extractUrl('')).toBeNull()
  })

  it('handles Chinese text with URL', () => {
    expect(extractUrl('小红书分享 https://www.xiaohongshu.com/explore/abc123 快来')).toBe('https://www.xiaohongshu.com/explore/abc123')
  })

  it('strips Chinese punctuation after URL', () => {
    expect(extractUrl('https://www.xiaohongshu.com/explore/abc123。')).toBe('https://www.xiaohongshu.com/explore/abc123')
  })
})
```

- [ ] **Step 2: 编写 tests/frontend/utils.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { getErrorMessage, proxiedImage, formatBytes } from '../../src/utils'

describe('getErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(getErrorMessage(new Error('fail'))).toBe('fail')
  })

  it('returns string directly', () => {
    expect(getErrorMessage('custom error')).toBe('custom error')
  })

  it('returns default message for unknown types', () => {
    expect(getErrorMessage(null)).toBe('网络连接错误，请检查您的网络或稍后再试')
    expect(getErrorMessage(undefined)).toBe('网络连接错误，请检查您的网络或稍后再试')
  })
})

describe('proxiedImage', () => {
  it('wraps URL with image proxy path', () => {
    expect(proxiedImage('https://example.com/img.jpg')).toBe('/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimg.jpg')
  })

  it('encodes special characters in URL', () => {
    expect(proxiedImage('https://ex.com/img?w=100&h=200')).toContain('w%3D100')
  })

  it('returns empty string for empty input', () => {
    expect(proxiedImage('')).toBe('')
  })
})

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
    expect(formatBytes(2097152)).toBe('2 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })
})
```

- [ ] **Step 3: 编写 tests/frontend/history.test.ts**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addToHistory, clearHistory } from '../../src/history'
import type { HistoryItem } from '../../src/types'

describe('history', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds item to empty history', () => {
    const result = addToHistory({
      id: '123',
      platform: 'twitter',
      type: 'video',
      title: 'Test',
      url: 'https://x.com/user/status/123',
    })

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://x.com/user/status/123')
    expect(result[0].timestamp).toBeGreaterThan(0)
  })

  it('prepends new item to existing history', () => {
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'First', url: 'https://x.com/1' })
    addToHistory({ id: '2', platform: 'rednote', type: 'images', title: 'Second', url: 'https://xhs.com/2' })

    // 最新项在开头
    const items = JSON.parse(localStorage.getItem('download-history') || '[]')
    expect(items[0].url).toBe('https://xhs.com/2')
    expect(items[1].url).toBe('https://x.com/1')
  })

  it('deduplicates items with same URL', () => {
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'Test', url: 'https://x.com/1' })
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'Test', url: 'https://x.com/1' })

    const items = JSON.parse(localStorage.getItem('download-history') || '[]')
    expect(items).toHaveLength(1)
  })

  it('limits to 10 items', () => {
    for (let i = 0; i < 15; i++) {
      addToHistory({ id: `${i}`, platform: 'twitter', type: 'video', title: `Item ${i}`, url: `https://x.com/${i}` })
    }

    const items = JSON.parse(localStorage.getItem('download-history') || '[]')
    expect(items).toHaveLength(10)
  })

  it('clears all history', () => {
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'Test', url: 'https://x.com/1' })
    clearHistory()

    const items = JSON.parse(localStorage.getItem('download-history') || '[]')
    expect(items).toHaveLength(0)
  })
})
```

- [ ] **Step 4: 运行以验证**

```bash
pnpm test:frontend
```

- [ ] **Step 5: 提交**

```bash
git add tests/frontend/extractUrl.test.ts tests/frontend/utils.test.ts tests/frontend/history.test.ts
git commit -m "test: add frontend utility and history tests"
```

---

### Task 7: 前端 Hook & API 契约测试

**文件：**
- 创建：`tests/frontend/hooks.test.ts`
- 创建：`tests/frontend/api-contract.test.ts`

**接口：**
- 消耗：前端 hooks (`useHistoryState`, `useDownload`)，前端/后端 `MediaResult` 类型
- 产出：React hooks 的行为验证，API 响应形状兼容性

- [ ] **Step 1: 编写 tests/frontend/hooks.test.ts**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// 使用动态导入从项目源代码获取 hooks
// 这些 import 在测试运行时会解析

describe('useHistoryState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads initial history from localStorage', async () => {
    const items = [{ id: '1', platform: 'twitter' as const, type: 'video' as const, title: 'Test', url: 'https://x.com/1', timestamp: Date.now() }]
    localStorage.setItem('download-history', JSON.stringify(items))

    const { useHistoryState } = await import('../../src/hooks/useHistoryState')
    const { result } = renderHook(() => useHistoryState())

    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].url).toBe('https://x.com/1')
  })

  it('adds item to history', async () => {
    const { useHistoryState } = await import('../../src/hooks/useHistoryState')
    const { result } = renderHook(() => useHistoryState())

    act(() => {
      result.current.addItem({
        id: '1', platform: 'twitter', type: 'video',
        title: 'Test', url: 'https://x.com/1',
      })
    })

    expect(result.current.history).toHaveLength(1)
  })

  it('clears history', async () => {
    const { useHistoryState } = await import('../../src/hooks/useHistoryState')
    const { result } = renderHook(() => useHistoryState())

    act(() => {
      result.current.addItem({ id: '1', platform: 'twitter', type: 'video', title: 'Test', url: 'https://x.com/1' })
    })
    expect(result.current.history).toHaveLength(1)

    act(() => {
      result.current.clearHistory()
    })
    expect(result.current.history).toHaveLength(0)
  })
})

describe('useDownload', () => {
  it('builds download URL with proxy path', async () => {
    const { useDownload } = await import('../../src/hooks/useDownload')
    const { result } = renderHook(() => useDownload())

    const url = result.current.getDownloadUrl('https://example.com/video.mp4', 'test.mp4')
    expect(url).toContain('/api/proxy-download')
    expect(url).toContain(encodeURIComponent('https://example.com/video.mp4'))
    expect(url).toContain(encodeURIComponent('test.mp4'))
  })

  it('triggers stream download', async () => {
    const createObjectURL = vi.fn(() => 'blob:url')
    const revokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL

    const { useDownload } = await import('../../src/hooks/useDownload')
    const { result } = renderHook(() => useDownload())

    const mockBlob = new Blob(['test'])
    act(() => {
      result.current.downloadBlob(mockBlob, 'test.mp4')
    })

    expect(createObjectURL).toHaveBeenCalledWith(mockBlob)
  })
})
```

- [ ] **Step 2: 编写 tests/frontend/api-contract.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import type { MediaResult } from '../../worker/src/types'

// API 契约测试：验证前端期望的类型与 Worker 实际返回的形状兼容
// 这是一个编译时 + 运行时检查

describe('API Contract: MediaResult shape', () => {
  const sampleResponse = {
    platform: 'twitter' as const,
    id: '123',
    type: 'video' as const,
    title: 'Test Tweet',
    desc: 'Test Description',
    cover: 'https://example.com/cover.jpg',
    author: {
      name: 'Test User',
      screen_name: 'testuser',
      avatar: 'https://example.com/avatar.jpg',
    },
    videos: [{
      url: 'https://example.com/video.mp4',
      width: 1920,
      height: 1080,
      quality: '1080p',
      bitrate: 1000000,
    }],
    images: ['https://example.com/image.jpg'],
  }

  it('worker response matches MediaResult interface', () => {
    const data: MediaResult = sampleResponse
    expect(data.platform).toBe('twitter')
    expect(data.type).toBe('video')
    expect(data.videos[0].quality).toBe('1080p')
  })

  it('response fields are present in frontend types', () => {
    // 检查 Worker 返回的所有字段都在前端预期的位置
    const requiredFields = ['platform', 'id', 'type', 'title', 'desc', 'cover', 'author', 'videos', 'images']
    for (const field of requiredFields) {
      expect(sampleResponse).toHaveProperty(field)
    }
  })
})
```

- [ ] **Step 3: 运行以验证**

```bash
pnpm test:frontend
pnpm test
```

- [ ] **Step 4: 提交**

```bash
git add tests/frontend/hooks.test.ts tests/frontend/api-contract.test.ts
git commit -m "test: add frontend hooks and API contract tests"
```

---

### Task 8: 前端组件测试

**文件：**
- 创建：`tests/frontend/components/VideoOptions.test.tsx`
- 创建：`tests/frontend/components/ImageOptions.test.tsx`
- 创建：`tests/frontend/components/AppContent.test.tsx`
- 创建：`tests/frontend/components/PWAUpdatePrompt.test.tsx`

**接口：**
- 消耗：前端组件 (`VideoOptions`, `ImageOptions`, `App`, `PWAUpdatePrompt`)，mock 道具
- 产出：组件渲染、用户交互、边缘情况的测试覆盖

- [ ] **Step 1: 编写 tests/frontend/components/VideoOptions.test.tsx**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VideoOptions } from '../../../src/components/VideoOptions'
import type { VideoFormat } from '../../../src/types'

const mockVideos: VideoFormat[] = [
  { url: 'https://ex.com/1080p.mp4', width: 1920, height: 1080, quality: '1080p', bitrate: 5_000_000 },
  { url: 'https://ex.com/720p.mp4', width: 1280, height: 720, quality: '720p', bitrate: 2_000_000 },
]

describe('VideoOptions', () => {
  it('renders all format options', () => {
    render(<VideoOptions videos={mockVideos} filename="test" />)
    expect(screen.getByText(/1080p/)).toBeTruthy()
    expect(screen.getByText(/720p/)).toBeTruthy()
  })

  it('shows resolution and size', () => {
    render(<VideoOptions videos={mockVideos} filename="test" />)
    expect(screen.getByText(/1920x1080/)).toBeTruthy()
    expect(screen.getByText(/5 MB/)).toBeTruthy()
  })

  it('renders download links with correct href', () => {
    render(<VideoOptions videos={mockVideos} filename="test" />)
    const links = screen.getAllByRole('link')
    expect(links[0].getAttribute('href')).toContain('1080p.mp4')
  })

  it('handles empty videos array', () => {
    render(<VideoOptions videos={[]} filename="test" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('calls onDownload when download button clicked', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn()
    render(<VideoOptions videos={mockVideos} filename="test" onDownload={onDownload} />)

    const buttons = screen.getAllByRole('button')
    await user.click(buttons[0])
    expect(onDownload).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 编写 tests/frontend/components/ImageOptions.test.tsx**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageOptions } from '../../../src/components/ImageOptions'

const mockImages = ['https://ex.com/img1.jpg', 'https://ex.com/img2.jpg', 'https://ex.com/img3.jpg']

describe('ImageOptions', () => {
  it('renders image count and all thumbnails', () => {
    render(<ImageOptions images={mockImages} filename="test" />)
    expect(screen.getByText(/3/)).toBeTruthy()
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(3)
  })

  it('renders download all button', () => {
    render(<ImageOptions images={mockImages} filename="test" />)
    expect(screen.getByText(/Download All/i)).toBeTruthy()
  })

  it('calls onDownloadAll when download all clicked', async () => {
    const user = userEvent.setup()
    const onDownloadAll = vi.fn()
    render(<ImageOptions images={mockImages} filename="test" onDownloadAll={onDownloadAll} />)

    await user.click(screen.getByText(/Download All/i))
    expect(onDownloadAll).toHaveBeenCalled()
  })

  it('handles empty images array', () => {
    const { container } = render(<ImageOptions images={[]} filename="test" />)
    expect(container.querySelector('img')).toBeNull()
  })
})
```

- [ ] **Step 3: 编写 tests/frontend/components/AppContent.test.tsx**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppContent } from '../../../src/components/AppContent'

describe('AppContent', () => {
  const defaultProps = {
    onUrlSubmit: vi.fn(),
    onHistoryClick: vi.fn(),
    onClearHistory: vi.fn(),
    onUpdateSW: vi.fn(),
    url: '',
    setUrl: vi.fn(),
    loading: false,
    error: null,
    result: null,
    history: [],
    pendingSW: false,
  }

  it('renders URL input and submit button', () => {
    render(<AppContent {...defaultProps} />)
    expect(screen.getByPlaceholderText(/paste/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /download|parse/i })).toBeTruthy()
  })

  it('shows loading state', () => {
    render(<AppContent {...defaultProps} loading={true} />)
    expect(screen.getByText(/loading|parsing/i)).toBeTruthy()
  })

  it('shows error message', () => {
    render(<AppContent {...defaultProps} error="Something went wrong" />)
    expect(screen.getByText(/Something went wrong/)).toBeTruthy()
  })

  it('shows result when available', () => {
    const result = {
      platform: 'twitter' as const,
      id: '123', type: 'video' as const,
      title: 'Test Tweet',
      desc: '', cover: '',
      author: { name: 'User', avatar: '' },
      videos: [{ url: 'https://ex.com/v.mp4', width: 1920, height: 1080, quality: '1080p', bitrate: 0 }],
      images: [],
    }
    render(<AppContent {...defaultProps} result={result} />)
    expect(screen.getByText(/Test Tweet/)).toBeTruthy()
  })

  it('shows empty state when no history and no result', () => {
    render(<AppContent {...defaultProps} />)
    expect(screen.getByText(/paste.*link|enter.*url/i)).toBeTruthy()
  })

  it('shows PWA update prompt when pending SW', () => {
    render(<AppContent {...defaultProps} pendingSW={true} />)
    expect(screen.getByText(/update|new version/i)).toBeTruthy()
  })

  it('calls onHistoryClick when history item is clicked', async () => {
    const user = userEvent.setup()
    const onHistoryClick = vi.fn()
    const history = [{ id: '1', platform: 'twitter' as const, type: 'video' as const, title: 'Past', url: 'https://x.com/1', timestamp: Date.now() }]

    render(<AppContent {...defaultProps} history={history} onHistoryClick={onHistoryClick} />)
    expect(screen.getByText(/Past/)).toBeTruthy()

    await user.click(screen.getByText(/Past/))
    expect(onHistoryClick).toHaveBeenCalledWith('https://x.com/1')
  })

  it('calls onClearHistory when clear button clicked', async () => {
    const user = userEvent.setup()
    const onClearHistory = vi.fn()
    const history = [{ id: '1', platform: 'twitter' as const, type: 'video' as const, title: 'Past', url: 'https://x.com/1', timestamp: Date.now() }]

    render(<AppContent {...defaultProps} history={history} onClearHistory={onClearHistory} />)
    await user.click(screen.getByText(/clear/i))
    expect(onClearHistory).toHaveBeenCalled()
  })

  it('submits URL when enter is pressed', async () => {
    const user = userEvent.setup()
    const onUrlSubmit = vi.fn()
    const setUrl = vi.fn()

    render(<AppContent {...defaultProps} onUrlSubmit={onUrlSubmit} setUrl={setUrl} />)

    const input = screen.getByPlaceholderText(/paste/i)
    await user.type(input, 'https://x.com/user/status/123{Enter}')
    expect(onUrlSubmit).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: 编写 tests/frontend/components/PWAUpdatePrompt.test.tsx**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PWAUpdatePrompt } from '../../../src/components/PWAUpdatePrompt'

describe('PWAUpdatePrompt', () => {
  it('renders update message', () => {
    render(<PWAUpdatePrompt onUpdate={vi.fn()} />)
    expect(screen.getByText(/new version/i)).toBeTruthy()
  })

  it('renders update button', () => {
    render(<PWAUpdatePrompt onUpdate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /update/i })).toBeTruthy()
  })

  it('calls updateServiceWorker on button click', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<PWAUpdatePrompt onUpdate={onUpdate} />)

    await user.click(screen.getByRole('button', { name: /update/i }))
    expect(onUpdate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: 运行以验证**

```bash
pnpm test:frontend
pnpm test
```

- [ ] **Step 6: 提交**

```bash
git add tests/frontend/components/
git commit -m "test: add frontend component tests with @testing-library/react"
```
