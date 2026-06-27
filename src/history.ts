import type { HistoryItem } from './types';

export function addToHistory(item: Omit<HistoryItem, 'timestamp'>) {
  const newItem: HistoryItem = { ...item, timestamp: Date.now() };
  const history = JSON.parse(localStorage.getItem('download_history') || '[]') as HistoryItem[];
  const updated = [newItem, ...history.filter(h => h.url !== item.url)].slice(0, 10);
  localStorage.setItem('download_history', JSON.stringify(updated));
  return updated;
}

export function clearHistory() {
  localStorage.removeItem('download_history');
  return [];
}

