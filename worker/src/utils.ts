import type { JsonValue } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getString(obj: unknown, key: string): string {
  if (!isRecord(obj)) return '';
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

export function getNumber(obj: unknown, key: string): number {
  if (!isRecord(obj)) return 0;
  const value = obj[key];
  return typeof value === 'number' ? value : 0;
}

export function getArray(obj: unknown, key: string): unknown[] {
  if (!isRecord(obj)) return [];
  const value = obj[key];
  return Array.isArray(value) ? value : [];
}

export function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const target = value[key];
  return isRecord(target) ? target : null;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(data: JsonValue, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export async function resolveUrl(url: string): Promise<string> {
  let cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }

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

export function extractTwitterDimensions(url: string): { width: number; height: number } | null {
  const match = url.match(/\/(\d+)x(\d+)/);
  if (match) {
    return {
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10),
    };
  }
  return null;
}

export function extractTwitterQuality(url: string): string {
  const dims = extractTwitterDimensions(url);
  if (dims) {
    const height = dims.height;
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return height + 'p';
  }
  return 'HD';
}
