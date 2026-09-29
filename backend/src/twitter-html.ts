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

function createMetaCollector(): {
  meta: CollectedMeta;
  element: (el: Element) => void;
} {
  const meta: CollectedMeta = {
    title: '',
    images: [],
    videoUrl: '',
    videoSecureUrl: '',
    videoWidth: 0,
    videoHeight: 0,
    videoType: '',
    creator: '',
  };

  return {
    meta,
    element(el: Element) {
      const property = el.getAttribute('property') || '';
      const name = el.getAttribute('name') || '';
      const content = el.getAttribute('content');
      if (!content) return;

      switch (property) {
        case 'og:title':
          meta.title = content;
          break;
        case 'og:image':
          meta.images.push(content);
          break;
        case 'og:video':
          meta.videoUrl = content;
          break;
        case 'og:video:secure_url':
          meta.videoSecureUrl = content;
          break;
        case 'og:video:width':
          meta.videoWidth = parseInt(content, 10) || 0;
          break;
        case 'og:video:height':
          meta.videoHeight = parseInt(content, 10) || 0;
          break;
        case 'og:video:type':
          meta.videoType = content;
          break;
        default:
          if (name === 'twitter:creator') {
            meta.creator = content;
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
  const collector = createMetaCollector();

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
      .on('meta[property^="og:"], meta[name^="twitter:"]', collector)
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
