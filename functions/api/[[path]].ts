const WORKER_ORIGIN = 'https://ming-media-downloader-api.ifyour.workers.dev';

export const onRequest = async (context: { request: Request }) => {
  const url = new URL(context.request.url);
  url.hostname = new URL(WORKER_ORIGIN).hostname;
  url.port = '';
  url.protocol = 'https:';

  const response = await fetch(url.toString(), {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body
      : undefined,
  });

  // Clone response to modify headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  return newResponse;
};
