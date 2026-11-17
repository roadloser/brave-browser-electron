import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { TabSnapshot } from '../../shared/contracts/browser-core';
import type { FindResult } from '../../shared/contracts/browser-actions';
import { browserClient } from '../client/browser-client';
import { IconButton } from '../components/icon-button';
import { useBrowserStore } from './browser-store';

export function FindBar({ tab }: { tab?: TabSnapshot }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const generation = useRef(0);
  const latest = useRef<FindResult | null>(null);
  useEffect(() => {
    const show = () => { setOpen(true); requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); }); };
    window.addEventListener('brave:find-page', show);
    return () => window.removeEventListener('brave:find-page', show);
  }, []);
  useEffect(() => {
    if (!tab) return;
    setResult(null); request.current = 0; latest.current = null;
    const dispose = browserClient.on('browser.findResult', (next) => {
      if (next.tabId !== tab.id) return;
      latest.current = next;
      if (next.requestId === request.current) setResult(next);
    });
    return () => { dispose(); browserClient.command('browser.stopFind', { tabId: tab.id }).catch(() => undefined); };
  }, [tab?.id]);
  useEffect(() => {
    if (!open || !tab) return;
    if (!text) { browserClient.command('browser.stopFind', { tabId: tab.id }).catch(() => undefined); setResult(null); return; }
    const timer = setTimeout(() => void find(true, false), 120);
    return () => clearTimeout(timer);
  }, [open, text, matchCase, tab?.id]);
  async function find(forward: boolean, findNext: boolean) {
    if (!tab || !text) return;
    const current = ++generation.current;
    try {
      const next = await browserClient.command('browser.find', { tabId: tab.id, text, forward, findNext, matchCase });
      if (current !== generation.current) return;
      request.current = next.requestId;
      if (latest.current?.requestId === next.requestId) setResult(latest.current);
    } catch (error) { useBrowserStore.getState().reportError(error); }
  }
  function close() {
    setOpen(false); generation.current++;
    if (tab) browserClient.command('browser.stopFind', { tabId: tab.id }).catch(useBrowserStore.getState().reportError);
  }
  if (!open || !tab || tab.url.startsWith('brave:')) return null;
  return (
    <form className="find-bar" onSubmit={(event) => { event.preventDefault(); void find(true, true); }}>
      <input ref={input} value={text} onChange={(event) => setText(event.target.value)} aria-label="在页面中查找" placeholder="在页面中查找"
        onKeyDown={(event) => { if (event.key === 'Escape') close(); if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); void find(false, true); } }} />
      <span aria-live="polite">{result ? `${result.activeMatchOrdinal}/${result.matches}` : ''}</span>
      <label><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />区分大小写</label>
      <IconButton label="上一个匹配" disabled={!text} onClick={() => void find(false, true)}><ArrowUp size={15} /></IconButton>
      <IconButton label="下一个匹配" disabled={!text} onClick={() => void find(true, true)}><ArrowDown size={15} /></IconButton>
      <IconButton label="关闭查找" onClick={close}><X size={15} /></IconButton>
    </form>
  );
}
