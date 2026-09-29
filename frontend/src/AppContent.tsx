import { useState, useCallback } from 'react';
import type { MediaResult, HistoryItem } from './types';
import { proxiedImage, formatBytes } from './utils';
import { VideoOptions } from './components/VideoOptions';
import { ImageOptions } from './components/ImageOptions';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';

interface AppContentProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputText: string;
  extractedUrl: string | null;
  isLoading: boolean;
  loadingStep: string;
  error: string | null;
  result: MediaResult | null;
  shareId: string | null;
  history: HistoryItem[];
  downloadingKey: string | null;
  downloadProgress: { loaded: number; total: number } | null;
  triggerDownload: (url: string, quality: string) => Promise<void>;
  downloadImage: (url: string, index: number) => Promise<void>;
  onInputChange: (text: string) => void;
  onParse: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onClearResult: () => void;
  onClearHistory: () => void;
  onHistoryClick: (url: string) => void;
  onLogoClick: () => void;
}

function ShareBox({ shareId }: { shareId: string }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById('share-url-input') as HTMLInputElement;
      input?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  return (
    <div className="share-section">
      <div className="share-header">
        <span className="share-label">分享链接</span>
      </div>
      <div className="share-link-row">
        <input
          id="share-url-input"
          type="text"
          readOnly
          value={shareUrl}
          className="share-link-input"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          type="button"
          className={`copy-share-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? '已复制' : '复制链接'}
        </button>
      </div>
    </div>
  );
}

function AppContent({
  inputRef,
  inputText,
  extractedUrl,
  isLoading,
  loadingStep,
  error,
  result,
  shareId,
  history,
  downloadingKey,
  downloadProgress,
  triggerDownload,
  downloadImage,
  onInputChange,
  onParse,
  onClearResult,
  onClearHistory,
  onHistoryClick,
  onLogoClick,
}: AppContentProps) {
  return (
    <div className="app-container">
      <PWAUpdatePrompt />
      <header className="app-header">
        <button
          type="button"
          className="logo-area"
          onClick={onLogoClick}
          aria-label="回到首页"
        >
          <span className="logo-text">Ming Media Downloader</span>
        </button>
        <p className="subtitle">
          无水印下载小红书和 𝕏 视频
        </p>
      </header>

      <main className="app-main">
        <section className="input-card">
          <form onSubmit={onParse} className="parse-form">
            <div className="input-wrapper">
              <div className="input-group">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => onInputChange(e.target.value)}
                  placeholder="粘贴小红书分享文本或 𝕏 推文链接..."
                  disabled={isLoading}
                  className="url-input"
                />
              </div>
            </div>
            <button
              type="submit"
              id="parse-btn"
              disabled={isLoading || !inputText.trim()}
              className={`submit-btn ${isLoading ? 'loading' : ''}`}
            >
              {isLoading ? '解析中...' : '解析链接'}
            </button>
          </form>

          {extractedUrl && (
            <div className="extracted-url-hint">
              <span className="extracted-label">识别到链接：</span>
              <span className="extracted-link">{extractedUrl}</span>
            </div>
          )}

          {error && (
            <div className="error-alert">
              <span className="error-icon">⚠️</span>
              <p className="error-text">{error}</p>
            </div>
          )}

          {isLoading && (
            <div className="loading-container">
              <p className="loading-text">{loadingStep}</p>
              <div className="progress-bar-container">
                <div className="progress-bar-shimmer"></div>
              </div>
            </div>
          )}
        </section>

        {result && (
          <section className="result-card fade-in">
            <button
              type="button"
              className="result-card-clear-btn"
              onClick={onClearResult}
              aria-label="清除结果"
            >
              ✕
            </button>
            <div className="platform-tag" data-platform={result.platform}>
              {result.platform === 'rednote' ? '📕 小红书' : '🐦 X (Twitter)'}
            </div>

            <div className="result-header">
              <img
                src={proxiedImage(result.author.avatar) || 'https://via.placeholder.com/150'}
                alt={result.author.name}
                className="author-avatar"
              />
              <div className="author-info">
                <h3>{result.author.name}</h3>
                {result.author.screen_name && (
                  <span className="author-handle">@{result.author.screen_name}</span>
                )}
              </div>
            </div>

            <div className="content-detail">
              {result.title && <h2 className="content-title">{result.title}</h2>}
              {result.desc && <p className="content-desc">{result.desc}</p>}
            </div>

            <div className="media-preview-container">
              <div className="cover-wrapper">
                <img
                  src={proxiedImage(result.cover) || 'https://via.placeholder.com/600'}
                  alt="Cover Preview"
                  className="media-cover"
                />
                <span className="type-badge">
                  {result.type === 'video' ? '🎬 视频' : '🖼️ 图片集'}
                </span>
              </div>

              <div className="download-actions">
                {result.type === 'video' ? (
                  <VideoOptions
                    videos={result.videos}
                    downloadingKey={downloadingKey}
                    downloadProgress={downloadProgress}
                    triggerDownload={triggerDownload}
                    formatBytes={formatBytes}
                  />
                ) : (
                  <ImageOptions
                    images={result.images}
                    downloadingKey={downloadingKey}
                    downloadProgress={downloadProgress}
                    downloadImage={downloadImage}
                    formatBytes={formatBytes}
                  />
                )}
              </div>

              {downloadingKey && downloadProgress && (
                <div className="download-progress-bar-container">
                  <div className="download-progress-info">
                    <span className="download-progress-label">正在下载...</span>
                    <span className="download-progress-stats">
                      {formatBytes(downloadProgress.loaded)}
                      {downloadProgress.total > 0 && ` / ${formatBytes(downloadProgress.total)}`}
                    </span>
                  </div>
                  <div className="download-progress-bar">
                    <div
                      className="download-progress-fill"
                      style={{
                        width: downloadProgress.total > 0
                          ? `${Math.min((downloadProgress.loaded / downloadProgress.total) * 100, 100)}%`
                          : '100%',
                      }}
                    />
                    {downloadProgress.total === 0 && (
                      <div className="download-progress-indeterminate" />
                    )}
                  </div>
                </div>
              )}
            </div>

            {shareId && <ShareBox shareId={shareId} />}
          </section>
        )}

        {history.length > 0 && (
          <section className="history-section">
            <div className="history-header">
              <h3>最近解析记录</h3>
              <button onClick={onClearHistory} className="clear-history-btn">
                清空记录
              </button>
            </div>
            <div className="history-list">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => onHistoryClick(item.url)}
                  className="history-item"
                >
                  <div className="history-meta">
                    <span className={`hist-platform ${item.platform}`}>
                      {item.platform === 'rednote' ? 'Red' : '𝕏'}
                    </span>
                    <span className="hist-type">{item.type === 'video' ? '🎬' : '🖼️'}</span>
                  </div>
                  <div className="history-title-wrap">
                    <p className="history-title">{item.title}</p>
                    <span className="history-url">{item.url}</span>
                  </div>
                  <span className="arrow">›</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p className="disclaimer">本工具仅供个人备份使用，请尊重原创作者版权</p>
      </footer>
    </div>
  );
}

export default AppContent;
