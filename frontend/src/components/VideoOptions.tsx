import type { VideoFormat } from '../types';

interface VideoOptionsProps {
  videos: VideoFormat[];
  downloadingKey: string | null;
  downloadProgress: { loaded: number; total: number } | null;
  triggerDownload: (url: string, quality: string) => void;
  formatBytes: (bytes: number) => string;
}

export function VideoOptions({
  videos,
  downloadingKey,
  downloadProgress,
  triggerDownload,
  formatBytes,
}: VideoOptionsProps) {
  if (videos.length > 0) {
    return (
      <div className="format-list">
        {videos.map((format, idx) => (
          <div key={idx} className="format-item">
            <div className="format-info">
              <span className="quality-label">{format.quality}</span>
              <span className="resolution">
                {format.width}x{format.height}
              </span>
              {format.size && (
                <span className="size">
                  {(format.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => triggerDownload(format.url, format.quality)}
              disabled={!!downloadingKey}
              className="download-btn-small"
            >
              {downloadingKey === `video_${format.quality}` ? (
                <span className="download-progress-text">
                  {downloadProgress?.total && downloadProgress.total > 0
                    ? `${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%`
                    : downloadProgress?.loaded
                      ? `${formatBytes(downloadProgress.loaded)}`
                      : '0%'}
                </span>
              ) : '下载 MP4'}
            </button>
          </div>
        ))}
      </div>
    );
  } else {
    return <p className="no-media-text">未提取到匹配的视频流地址</p>;
  }
}

export default VideoOptions;