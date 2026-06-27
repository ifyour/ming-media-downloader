export function extractUrl(text: string): string | null {
  const urlPattern = /https?:\/\/[^\s\u3002\uff0c\u3001\uff01\uff1f\u300a\u300b\u201c\u201d\uff08\uff09()<>]+/i;
  const match = text.match(urlPattern);
  if (match) {
    return match[0].replace(/[.,;:!?]+$/, '');
  }
  return null;
}