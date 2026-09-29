export async function handleImageProxy(imageUrl: string): Promise<Response> {
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
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

export async function handleProxyDownload(url: string, filename: string): Promise<Response> {
  const mediaRes = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch media file from remote host. Status: ${mediaRes.status}`);
  }

  const headers = new Headers(mediaRes.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  headers.set('Content-Type', 'application/octet-stream');

  return new Response(mediaRes.body, {
    status: mediaRes.status,
    headers,
  });
}
