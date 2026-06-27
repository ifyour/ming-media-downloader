import type { Env, JsonValue } from './types';
import { corsHeaders, jsonResponse, errorResponse, getErrorMessage } from './utils';
import { parseWithCache } from './parse';
import { handleImageProxy, handleProxyDownload } from './handlers';

export { parseMediaUrl } from './parse';

function generateShareId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function hashUrl(url: string): Promise<string> {
  const data = new TextEncoder().encode(url);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const urlObj = new URL(request.url);
    const path = urlObj.pathname;

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

    if (path === '/api/share') {
      if (request.method === 'POST') {
        try {
          const body = await request.json() as { url: string; result: unknown };
          if (!body.url || !body.result) {
            return errorResponse('Missing "url" or "result" in body');
          }

          const urlHash = await hashUrl(body.url);
          const existingShareId = await env.MMD_CACHE.get(`url_share:${urlHash}`);

          if (existingShareId) {
            // 续期 TTL — 失败不影响已有分享，静默处理
            await env.MMD_CACHE.put(
              `url_share:${urlHash}`, existingShareId,
              { expirationTtl: 604800 },
            ).catch((e: unknown) => console.error('Renew share TTL failed:', e));
            return jsonResponse({ shareId: existingShareId });
          }

          let shareId = generateShareId();
          let attempts = 0;
          while (await env.MMD_CACHE.get(`share:${shareId}`) !== null && attempts < 5) {
            shareId = generateShareId();
            attempts++;
          }

          await env.MMD_CACHE.put(`share:${shareId}`, JSON.stringify(body), {
            expirationTtl: 604800,
          });

          // 第二步写入失败 → 清理已写入的 share 数据，避免脏数据
          try {
            await env.MMD_CACHE.put(`url_share:${urlHash}`, shareId, {
              expirationTtl: 604800,
            });
          } catch {
            await env.MMD_CACHE.delete(`share:${shareId}`).catch(() => {});
            return errorResponse('每日分享次数已达上限，请稍后再试', 500);
          }

          return jsonResponse({ shareId });
        } catch (err) {
          return errorResponse(getErrorMessage(err), 500);
        }
      }

      if (request.method === 'GET') {
        const shareId = urlObj.searchParams.get('id');
        if (!shareId) {
          return errorResponse('Missing "id" parameter');
        }

        try {
          const data = await env.MMD_CACHE.get(`share:${shareId}`);
          if (!data) {
            return errorResponse('分享链接无效或已过期', 404);
          }
          return jsonResponse(JSON.parse(data) as JsonValue);
        } catch (err) {
          return errorResponse(getErrorMessage(err), 500);
        }
      }

      return errorResponse('Method not allowed', 405);
    }

    return jsonResponse({ message: 'Social Media Video Downloader API' });
  },
};
