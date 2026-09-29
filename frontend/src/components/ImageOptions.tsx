import { proxiedImage } from '../utils';
interface ImageOptionsProps {
  images: string[];
  downloadingKey: string | null;
  downloadProgress: { loaded: number; total: number } | null;
  downloadImage: (url: string, index: number) => void;
  formatBytes: (bytes: number) => string;
}

export function ImageOptions({
  images,
  downloadingKey,
  downloadProgress,
  downloadImage,
  formatBytes,
}: ImageOptionsProps) {
  return (
    <div className="image-options">
      <h4>解析到 {images.length} 张原图 (无水印)</h4>
      <div className="image-grid">
        {images.map((imgUrl, idx) => (
          <div key={idx} className="image-item">
            <img src={proxiedImage(imgUrl)} alt={`Thumbnail ${idx + 1}`} className="thumb" />
            <button
              type="button"
              onClick={() => downloadImage(imgUrl, idx)}
              disabled={!!downloadingKey}
              className="download-image-btn"
            >
              {downloadingKey === `img_${idx}` ? (
                downloadProgress?.total && downloadProgress.total > 0
                  ? `${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%`
                  : downloadProgress?.loaded
                    ? `${formatBytes(downloadProgress.loaded)}`
                    : '0%'
              ) : `下载原图 #${idx + 1}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ImageOptions;