export interface Author {
  name: string;
  avatar: string;
  screen_name?: string;
}

export interface VideoFormat {
  url: string;
  width: number;
  height: number;
  quality: string;
  size?: number;
  bitrate?: number;
}

export interface MediaResult {
  platform: 'xiaohongshu' | 'twitter';
  id: string;
  type: 'video' | 'images';
  title: string;
  desc: string;
  cover: string;
  author: Author;
  videos: VideoFormat[];
  images: string[];
}

export interface HistoryItem {
  id: string;
  platform: 'xiaohongshu' | 'twitter';
  type: 'video' | 'images';
  title: string;
  url: string;
  timestamp: number;
}