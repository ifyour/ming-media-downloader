import { useRef, useEffect } from 'react';
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    }
  };

  const handleParse = async (e: React.FormEvent<HTMLFormElement>) => {
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
      setTimeout(() => setLoadingStep('正在请求服务器解析...'), 800);
      setTimeout(() => setLoadingStep('正在提取原始视频流 (无水印)...'), 1600);

      const response = await fetch(`/api/parse?url=${encodeURIComponent(targetUrl)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `解析失败 (HTTP ${response.status})`);
      }

      const data: MediaResult = await response.json();
      setResult(data);

      addToHistory({
        id: data.id,
        platform: data.platform,
        type: data.type,
        title: data.title || data.desc || '无标题内容',
        url: targetUrl,
      });
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

  return (
    <AppContent
      inputRef={inputRef}
      inputText={inputText}
      extractedUrl={extractedUrl}
      isLoading={isLoading}
      loadingStep={loadingStep}
      error={error}
      result={result}
      history={history}
      downloadingKey={downloadingKey}
      downloadProgress={downloadProgress}
      triggerDownload={triggerDownload}
      downloadImage={downloadImage}
      onInputChange={handleInputChange}
      onParse={handleParse}
      onClearResult={() => { setInputText(''); setResult(null); setError(null); setExtractedUrl(null); }}
      onClearHistory={clearHistory}
      onHistoryClick={handleHistoryClick}
    />
  );
}
