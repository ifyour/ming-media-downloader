import React, { useState, useEffect } from 'react';
import './App.css';

interface Author {
  name: string;
  avatar: string;
  screen_name?: string;
}

interface VideoFormat {
  url: string;
  width: number;
  height: number;
  quality: string;
  size?: number;
  bitrate?: number;
}

interface MediaResult {
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

interface HistoryItem {
  id: string;
  platform: 'xiaohongshu' | 'twitter';
  type: 'video' | 'images';
  title: string;
  url: string;
  timestamp: number;
}

// Proxy image through worker to bypass hotlink protection
function proxiedImage(url: string): string {
  if (!url) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function App() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);

  // Load download history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('download_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save history helper
  const addToHistory = (item: Omit<HistoryItem, 'timestamp'>) => {
    const newItem: HistoryItem = { ...item, timestamp: Date.now() };
    const updated = [newItem, ...history.filter(h => h.url !== item.url)].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('download_history', JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('download_history');
  };

  // Extract URL from input text (handles mobile share sheet text with Chinese + link)
  // Xiaohongshu shares typically look like: "12 小甜甜发布了一篇小红书笔记... http://xhslink.com/xxx"
  const extractUrl = (text: string): string | null => {
    // Match URLs starting with http/https, stopping at whitespace or Chinese punctuation
    const urlPattern = /https?:\/\/[^\s\u3002\uff0c\u3001\uff01\uff1f\u300a\u300b\u201c\u201d\uff08\uff09()<>]+/i;
    const match = text.match(urlPattern);
    if (match) {
      // Clean trailing punctuation that might have been captured
      return match[0].replace(/[.,;:!?]+$/, '');
    }
    return null;
  };

  // Auto-extract and display URL when input changes
  const handleInputChange = (text: string) => {
    setInputText(text);
    const url = extractUrl(text);
    // Show extracted URL only if input contains extra text beyond the URL
    if (url && text.trim() !== url) {
      setExtractedUrl(url);
    } else {
      setExtractedUrl(null);
    }
  };

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const targetUrl = extractUrl(inputText);
    if (!targetUrl) {
      setError('请输入或粘贴有效的链接地址 (小红书分享链接或X/Twitter推文链接)');
      return;
    }

    setIsLoading(true);
    setLoadingStep('正在分析链接格式...');

    try {
      // Step simulation for good UI feedback
      setTimeout(() => setLoadingStep('正在请求服务器解析...'), 800);
      setTimeout(() => setLoadingStep('正在提取原始视频流 (无水印)...'), 1600);

      const response = await fetch(`/api/parse?url=${encodeURIComponent(targetUrl)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `解析失败 (HTTP ${response.status})`);
      }

      const data: MediaResult = await response.json();
      setResult(data);

      // Add to history
      addToHistory({
        id: data.id,
        platform: data.platform,
        type: data.type,
        title: data.title || data.desc || '无标题内容',
        url: targetUrl
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || '网络连接错误，请检查您的网络或稍后再试');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const triggerDownload = async (url: string, quality: string) => {
    if (!result || downloadingKey) return;
    const key = `video_${quality}`;
    setDownloadingKey(key);
    const filename = `${result.platform}_${result.id}_${quality}.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
    await fetchAndSave(downloadUrl, filename);
    setDownloadingKey(null);
  };

  const downloadImage = async (url: string, index: number) => {
    if (!result || downloadingKey) return;
    const key = `img_${index}`;
    setDownloadingKey(key);
    const extension = url.includes('.png') ? 'png' : 'jpg';
    const filename = `${result.platform}_${result.id}_img_${index + 1}.${extension}`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
    await fetchAndSave(downloadUrl, filename);
    setDownloadingKey(null);
  };

  // Fetch resource as blob with progress tracking and trigger browser download
  const fetchAndSave = async (downloadUrl: string, filename: string) => {
    try {
      setDownloadProgress({ loaded: 0, total: 0 });
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

      // Get total size from Content-Length header
      const contentLength = res.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Read stream with progress tracking
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Failed to read response stream');

      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        setDownloadProgress({ loaded, total });
      }

      // Combine chunks into blob
      const blob = new Blob(chunks as BlobPart[]);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (err: any) {
      console.error('Download error:', err);
      alert(`下载失败: ${err.message}`);
    } finally {
      setDownloadProgress(null);
    }
  };

  // Format bytes to human-readable string
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleHistoryClick = (url: string) => {
    setInputText(url);
    // Automatically trigger form submit
    setTimeout(() => {
      const button = document.getElementById('parse-btn');
      button?.click();
    }, 100);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-area">
          <span className="logo-text">Ming Media Downloader</span>
        </div>
        <p className="subtitle">
          无水印下载小红书视频、图片，以及 X (Twitter) 高清推文视频
        </p>
      </header>

      <main className="app-main">
        <section className="input-card">
          <form onSubmit={handleParse} className="parse-form">
            <div className="input-wrapper">
              <div className="input-group">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="粘贴小红书分享文本或 X/Twitter 推文链接..."
                  disabled={isLoading}
                  className="url-input"
                />
                {inputText && (
                  <button
                    type="button"
                    onClick={() => { setInputText(''); setResult(null); setError(null); setExtractedUrl(null); }}
                    className="clear-btn"
                    disabled={isLoading}
                  >
                    ✕
                  </button>
                )}
              </div>
              {extractedUrl && (
                <div className="extracted-url-hint">
                  <span className="extracted-label">已识别链接:</span>
                  <span className="extracted-link">{extractedUrl}</span>
                </div>
              )}
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

          {error && (
            <div className="error-alert">
              <span className="error-icon">⚠️</span>
              <p className="error-text">{error}</p>
            </div>
          )}

          {isLoading && (
            <div className="loading-container">
              <div className="spinner"></div>
              <p className="loading-text">{loadingStep}</p>
              <div className="progress-bar-container">
                <div className="progress-bar-shimmer"></div>
              </div>
            </div>
          )}
        </section>

        {result && (
          <section className="result-card fade-in">
            <div className="platform-tag" data-platform={result.platform}>
              {result.platform === 'xiaohongshu' ? '📕 小红书' : '🐦 X (Twitter)'}
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
                  <div className="video-options">
                    {result.videos.length > 0 ? (
                      <div className="format-list">
                        {result.videos.map((format, idx) => (
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
                                  {downloadProgress?.total
                                    ? `${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%`
                                    : `${formatBytes(downloadProgress?.loaded || 0)}`}
                                </span>
                              ) : '下载 MP4'}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-media-text">未提取到匹配的视频流地址</p>
                    )}
                  </div>
                ) : (
                  <div className="image-options">
                    <h4>解析到 {result.images.length} 张原图 (无水印)</h4>
                    <div className="image-grid">
                      {result.images.map((imgUrl, idx) => (
                        <div key={idx} className="image-item">
                          <img src={proxiedImage(imgUrl)} alt={`Thumbnail ${idx + 1}`} className="thumb" />
                          <button
                            type="button"
                            onClick={() => downloadImage(imgUrl, idx)}
                            disabled={!!downloadingKey}
                            className="download-image-btn"
                          >
                            {downloadingKey === `img_${idx}` ? (
                              downloadProgress?.total
                                ? `${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%`
                                : `${formatBytes(downloadProgress?.loaded || 0)}`
                            ) : `下载原图 #${idx + 1}`}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Download Progress Bar */}
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
          </section>
        )}

        {history.length > 0 && (
          <section className="history-section">
            <div className="history-header">
              <h3>最近解析记录</h3>
              <button onClick={clearHistory} className="clear-history-btn">
                清空记录
              </button>
            </div>
            <div className="history-list">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleHistoryClick(item.url)}
                  className="history-item"
                >
                  <div className="history-meta">
                    <span className={`hist-platform ${item.platform}`}>
                      {item.platform === 'xiaohongshu' ? 'XHS' : 'X'}
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
        <p className="disclaimer">本工具仅供学习及个人备份使用，请尊重原创作者的版权利益。</p>
      </footer>
    </div>
  );
}

export default App;
