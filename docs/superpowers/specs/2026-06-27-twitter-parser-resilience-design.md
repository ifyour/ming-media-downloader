# Twitter 解析器多源容灾设计

## 概述

当前 Twitter/X 解析 100% 依赖第三方 API `api.fxtwitter.com`，形成单点故障（SPOF）。本文档设计多源链式降级方案，在保持"短平快"原则下大幅提升稳定性。

## 设计方案

### 多源链式降级 (Failover Chain)

```
请求 /api/parse?url=https://x.com/user/status/12345
  │
  ├─ Tier 1: api.fxtwitter.com/status/{id}     (当前源, 加超时+重试)
  │    ├─ 成功 → 返回结果
  │    └─ 失败 → ↓
  │
  ├─ Tier 2: api.vxtwitter.com/status/{id}     (同格式后备)
  │    ├─ 成功 → 返回结果
  │    └─ 失败 → ↓
  │
  └─ Tier 3: HTMLRewriter 抓取 x.com 页面      (零成本后备)
       ├─ 成功 → 返回结果
       └─ 失败 → throw Error("所有源均不可用")
```

**不纳入 Browser Rendering (Puppeteer)** 作为 Twitter 后备——杀鸡用牛刀，延迟高（10-20s）。如果用户之后开通 Browser Rendering，建议留给 RedNote（其内容 JS 动态渲染，HTMLRewriter 解不了）。

### 每层内部行为

```
trySource(url, sourceName):
  1. 第1次请求 (AbortSignal.timeout(10_000))
     ├─ 成功 + 响应校验通过 → return result
     └─ 失败 → 等待 500ms
  2. 第2次重试 (AbortSignal.timeout(10_000))
     ├─ 成功 + 响应校验通过 → return result
     └─ 失败 → throw (触发降级到下一层)
```

### 响应校验规则

解析结果后检查以下字段，任一缺失则视为"数据残缺"、触发降级：
- `type` (非空)
- `id` (非空)
- 视频推文：至少 1 个 `videos[]` 项
- 图片推文：至少 1 个 `images[]` 项

## 各 Tier 实现细节

### Tier 1: fxtwitter（现有源，加固）

- 不变 URL，增加 `AbortSignal.timeout(10_000)`
- 增加 2 次重试（500ms → 1000ms）
- 增加响应校验

### Tier 2: vxtwitter（新增，零适配成本）

- URL: `https://api.vxtwitter.com/status/{id}`
- 响应格式与 fxtwitter **完全一致**，复用 `parseFxTwitterResponse()` 函数
- 相同超时 + 重试逻辑

### Tier 3: HTMLRewriter（新增，零额外依赖）

- URL: `https://x.com/{user}/status/{id}`
- 使用 Cloudflare Worker 内置的 `HTMLRewriter` 解析页面流式 HTML
- 提取内容：
  - `<meta property="og:title" content="...">` → title/desc
  - `<meta property="og:image" content="...">` → images
  - `<meta property="og:video" content="...">` → videos（MP4 直链）
  - `<meta property="og:video:type" content="video/mp4">` → 视频类型确认
  - `<meta property="og:video:width" content="...">`、`og:video:height` → 分辨率
- 作者信息从页面 `<meta name="twitter:creator" content="...">` 或 URL 路径提取
- 这种方案**不需要任何 npm 依赖、不需要 Browser Rendering**，Worker 原生支持，毫秒级完成

## 文件变更

| 文件 | 变更 |
|------|------|
| `worker/src/twitter.ts` | 重构：提取 `trySource()` 工具函数、增加超时/重试/校验、增加 vxtwitter 后备 |
| `worker/src/twitter.ts` | 增加 `parseFxTwitterResponse()` 共享响应解析函数 |
| `worker/src/twitter-html.ts` | **新增**：HTMLRewriter 抓取 + `og:meta` 解析 |
| `worker/src/types.ts` | 无需变更 |
| `worker/src/parse.ts` | 无需变更（分发逻辑不变，由 twitter.ts 内部完成 failover） |
| 其他文件 | 不变 |

## 不变的范围（保持短平快）

- 不引入新 npm 依赖
- 不改 `parse.ts` 分发逻辑
- 不改 `cache.ts` 缓存策略
- 不改前端代码
- 不改 Worker 路由
- 不改 `wrangler.toml`
- 不改部署流程

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| vxtwitter 返回格式与 fxtwitter 偶尔不同 | 响应校验层会捕获，降级到 Tier 3 |
| Twitter HTML 结构变动导致 HTMLRewriter 失效 | 仅影响 Tier 3，前两 Tier 仍正常工作；可单独修复 |
| 多源重试增加请求耗时 | 每层 20s 超时兜底（2×10s），最多 3 层，最坏 ~60s，Worker 有 30s CPU 限制——但实际场景中第一层成功率 >99%，很少走到第二层 |
| fxtwitter 本身响应慢 | 10s 超时兜底，快速降级 |

## 测试策略

1. **单元测试**：mock 各 Tier 的响应，验证 failover 逻辑能正确降级
2. **集成测试**：用真实推文 URL 验证三条链路各自能返回有效结果
3. **错误注入测试**：模拟各层超时/空响应，验证降级链完整

## 后续可能的扩展（当前不做）

- Tier 4: 可选的 Browser Rendering (Puppeteer) —— 建议留给 RedNote
- Tier 5: Nitter 公共实例抓取
- 电路断路器 (Circuit Breaker)：连续失败 N 次后跳过该源一段时间
- 健康检查轮询：定期检查各源是否可用
