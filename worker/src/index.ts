import type { Env, JsonValue } from './types';
import { corsHeaders, jsonResponse, errorResponse, getErrorMessage } from './utils';
import { parseWithCache } from './parse';
import { handleImageProxy, handleProxyDownload } from './handlers';

export { parseMediaUrl } from './parse';

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

    return jsonResponse({ message: 'Social Media Video Downloader API' });
  },
};
