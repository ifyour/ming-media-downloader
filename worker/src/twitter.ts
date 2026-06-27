import type { MediaResult, Author, VideoFormat, JsonObj } from './types';
import { isRecord, getString, getNumber, getArray, getRecord, extractTwitterDimensions, extractTwitterQuality } from './utils';

export async function parseTwitter(url: string): Promise<MediaResult> {
  const matchId = url.match(/status\/(\d+)/);
  if (!matchId) {
    throw new Error('Invalid Twitter/X URL. Could not find Tweet status ID.');
  }
  const tweetId = matchId[1];

  const apiRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!apiRes.ok) {
    const text = await apiRes.text();
    throw new Error(`Failed to retrieve tweet information from X. Status: ${apiRes.status}. Details: ${text}`);
  }

  const data = await apiRes.json() as JsonObj;
  const tweet = getRecord(data, 'tweet');
  if (!tweet || getString(tweet, 'type') === 'tombstone') {
    throw new Error(getString(data, 'message') || 'This Tweet is unavailable or deleted.');
  }

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

  const result: MediaResult = {
    platform: 'twitter',
    id: tweetId,
    type: 'images',
    title,
    desc: title,
    cover,
    author,
    videos: [],
    images: [],
  };

  const videos: VideoFormat[] = [];
  const images: string[] = [];

  for (const media of allMedia) {
    const mediaRecord = isRecord(media) ? media : {};
    const mediaType = getString(mediaRecord, 'type');
    if (mediaType === 'video' || mediaType === 'gif') {
      result.type = 'video';

      const formats = getArray(mediaRecord, 'formats').length > 0 ? getArray(mediaRecord, 'formats') : getArray(mediaRecord, 'variants');
      const width = getNumber(mediaRecord, 'width');
      const height = getNumber(mediaRecord, 'height');
      const videoFormats = formats
        .filter((f) => {
          const formatRecord = isRecord(f) ? f : {};
          return getString(formatRecord, 'container') === 'mp4' || getString(formatRecord, 'content_type') === 'video/mp4';
        })
        .map((f) => {
          const formatRecord = isRecord(f) ? f : {};
          const formatUrl = getString(formatRecord, 'url');
          const urlDims = extractTwitterDimensions(formatUrl);
          return {
            url: formatUrl,
            width: urlDims?.width ?? width,
            height: urlDims?.height ?? height,
            quality: formatUrl.includes('/vid/') ? extractTwitterQuality(formatUrl) : 'HD',
            bitrate: getNumber(formatRecord, 'bitrate'),
          };
        });

      const mediaUrl = getString(mediaRecord, 'url');
      if (videoFormats.length === 0 && mediaUrl && mediaUrl.includes('.mp4')) {
        const urlDims = extractTwitterDimensions(mediaUrl);
        videoFormats.push({
          url: mediaUrl,
          width: urlDims?.width ?? width,
          height: urlDims?.height ?? height,
          quality: 'HD',
          bitrate: 0,
        });
      }

      videos.push(...videoFormats);
    } else if (mediaType === 'photo') {
      images.push(getString(mediaRecord, 'url'));
    }
  }

  result.videos = videos;
  result.images = images;

  const seenUrls = new Set<string>();
  result.videos = videos.filter((v) => {
    if (!v.url) return false;
    if (seenUrls.has(v.url)) return false;
    seenUrls.add(v.url);
    return true;
  });

  return result;
}
