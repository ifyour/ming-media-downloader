import { useRef, useCallback, useEffect, useState } from 'react';
import { useParseState, useLoadingState, useHistoryState, useDownload } from './hooks';
import { extractUrl } from './extractUrl';
import { addToHistory } from './history';
import { getErrorMessage } from './utils';
import type { MediaResult } from './types';
import AppContent from './AppContent';
import './App.css';

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { inputText, setInputText, extractedUrl, setExtractedUrl, result, setResult, error, setError } = useParseState();
  const { isLoading, setIsLoading, loadingStep, setLoadingStep } = useLoadingState();
  const { history, setHistory } = useHistoryState();
  const { downloadingKey, downloadProgress, triggerDownload, downloadImage } = useDownload(result);
  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('share');
    if (!id) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShareId(id);
    setIsLoading(true);
    setLoadingStep('正在加载分享内容...');

    fetch(`/api/share?id=${encodeURIComponent(id)}`)
      .then(res => {
        if (!res.ok) return res.json().then(d => { throw new Error(d.error || '分享链接无效或已过期'); });
        return res.json();
      })
      .then(data => {
        setResult(data.result);
        setInputText(data.url);
      })
      .catch(err => {
        setError(getErrorMessage(err));
      })
      .finally(() => {
        setIsLoading(false);
        setLoadingStep('');
      });
  }, [setError, setInputText, setIsLoading, setLoadingStep, setResult]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    const url = extractUrl(text);
    if (url && text.trim() !== url) {
      setExtractedUrl(url);
    } else {
      setExtractedUrl(null);
    }
    if (!text.trim()) {
      setResult(null);
      setError(null);
      setShareId(null);
    }
  };

  const handleParse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setShareId(null);

    const targetUrl = extractUrl(inputText);
    if (!targetUrl) {
      setError('请输入或粘贴有效的链接地址 (小红书分享链接或X/Twitter推文链接)');
      return;
    }

    setIsLoading(true);
    setLoadingStep('正在分析链接格式...');

    try {
      setTimeout(() => setLoadingStep('正在请求服务器解析...'), 800);
      setTimeout(() => setLoadingStep('正在提取原始视频流 (无水印)...'), 1600);

      const response = await fetch(`/api/parse?url=${encodeURIComponent(targetUrl)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `解析失败 (HTTP ${response.status})`);
      }

      const data: MediaResult = await response.json();
      setResult(data);

      const updatedHistory = addToHistory({
        id: data.id,
        platform: data.platform,
        type: data.type,
        title: data.title || data.desc || '无标题内容',
        url: targetUrl,
      });
      setHistory(updatedHistory);

      fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, result: data }),
      })
        .then(res => res.ok ? res.json() : null)
        .then(share => {
          if (share?.shareId) {
            setShareId(share.shareId);
            const newUrl = `${window.location.pathname}?share=${share.shareId}`;
            window.history.replaceState({ shareId: share.shareId }, '', newUrl);
          }
        })
        .catch(err => console.error('Failed to create share:', err));
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('download_history');
  };

  const handleHistoryClick = (url: string) => {
    setInputText(url);
    setTimeout(() => {
      const button = document.getElementById('parse-btn');
      button?.click();
    }, 100);
  };

  const handleClearResult = useCallback(() => {
    setInputText('');
    setResult(null);
    setError(null);
    setExtractedUrl(null);
    setShareId(null);
    window.history.replaceState(null, '', window.location.pathname);
  }, [setError, setExtractedUrl, setInputText, setResult, setShareId]);

  return (
    <AppContent
      inputRef={inputRef}
      inputText={inputText}
      extractedUrl={extractedUrl}
      isLoading={isLoading}
      loadingStep={loadingStep}
      error={error}
      result={result}
      shareId={shareId}
      history={history}
      downloadingKey={downloadingKey}
      downloadProgress={downloadProgress}
      triggerDownload={triggerDownload}
      downloadImage={downloadImage}
      onInputChange={handleInputChange}
      onParse={handleParse}
      onClearResult={handleClearResult}
      onClearHistory={clearHistory}
      onHistoryClick={handleHistoryClick}
    />
  );
}
