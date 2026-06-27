import { useState, useCallback } from 'react';
import type { MediaResult, HistoryItem } from './types';
import { getErrorMessage } from './utils';

export function useParseState() {
  const [inputText, setInputText] = useState('');
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  return {
    inputText, setInputText,
    extractedUrl, setExtractedUrl,
    result, setResult,
    error, setError,
  };
}

export function useLoadingState() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  return { isLoading, setIsLoading, loadingStep, setLoadingStep };
}

export function useHistoryState() {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('download_history');
    if (!saved) return [];
    try {
      return JSON.parse(saved) as HistoryItem[];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  return { history, setHistory };
}

export function useDownload(result: MediaResult | null) {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number } | null>(null);

  const fetchAndSave = useCallback(async (downloadUrl: string, filename: string) => {
    try {
      setDownloadProgress({ loaded: 0, total: 0 });
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

      const contentLength = res.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

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
    } catch (err) {
      console.error('Download error:', err);
      alert(`下载失败: ${getErrorMessage(err)}`);
    } finally {
      setDownloadProgress(null);
    }
  }, []);

  const triggerDownload = useCallback(async (url: string, quality: string) => {
    if (!result || downloadingKey) return;
    const key = `video_${quality}`;
    setDownloadingKey(key);
    const filename = `${result.platform}_${result.id}_${quality}.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
    await fetchAndSave(downloadUrl, filename);
    setDownloadingKey(null);
  }, [result, downloadingKey, fetchAndSave]);

  const downloadImage = useCallback(async (url: string, index: number) => {
    if (!result || downloadingKey) return;
    const key = `img_${index}`;
    setDownloadingKey(key);
    const extension = url.includes('.png') ? 'png' : 'jpg';
    const filename = `${result.platform}_${result.id}_img_${index + 1}.${extension}`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
    await fetchAndSave(downloadUrl, filename);
    setDownloadingKey(null);
  }, [result, downloadingKey, fetchAndSave]);

  return { downloadingKey, downloadProgress, triggerDownload, downloadImage };
}
