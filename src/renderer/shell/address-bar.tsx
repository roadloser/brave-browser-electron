import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Globe, History, LockKeyhole, Search } from 'lucide-react';
import type { TabSnapshot } from '../../shared/contracts/browser-core';
import type { HistoryEntry } from '../../shared/contracts/history';
import { browserClient } from '../client/browser-client';
import { useBrowserStore } from './browser-store';
import { usePageOverlay } from './use-page-overlay';

export function AddressBar({ tab }: { tab: TabSnapshot | undefined }) {
  const [value, setValue] = useState(tab?.url ?? '');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsId = useId();
  usePageOverlay(focused && suggestions.length > 0);

  useEffect(() => {
    if (!focused) setValue(tab?.url === 'brave://newtab' ? '' : tab?.url ?? '');
  }, [tab?.id, tab?.url, focused]);
  useEffect(() => {
    const focus = () => { inputRef.current?.focus(); inputRef.current?.select(); };
    window.addEventListener('brave:focus-address', focus);
    return () => window.removeEventListener('brave:focus-address', focus);
  }, []);
  useEffect(() => {
    setSelected(-1);
    if (!focused || value.trim().length < 2 || tab?.isPrivate) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      browserClient.command('history.query', { query: value.trim(), limit: 12 })
        .then((page) => {
          if (cancelled) return;
          const seen = new Set<string>();
          setSuggestions(page.entries.filter((entry) => {
            if (seen.has(entry.url)) return false;
            seen.add(entry.url);
            return true;
          }).slice(0, 6));
        })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value, focused, tab?.isPrivate]);

  async function navigate(url: string) {
    if (!url.trim()) return;
    try {
      if (tab) await browserClient.command('browser.navigate', { tabId: tab.id, url });
      else await browserClient.command('browser.openTab', { url });
      setSuggestions([]);
      inputRef.current?.blur();
    } catch (error) {
      useBrowserStore.getState().reportError(error);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void navigate(selected >= 0 ? suggestions[selected].url : value);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setSelected((index) => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setSelected((index) => Math.max(-1, index - 1));
    } else if (event.key === 'Escape') {
      setValue(tab?.url === 'brave://newtab' ? '' : tab?.url ?? '');
      setSuggestions([]);
      inputRef.current?.blur();
    }
  }

  return (
    <form className="address-bar" onSubmit={submit} role="search">
      <span className="address-security" title={tab?.url.startsWith('https:') ? '连接使用 HTTPS' : '地址或搜索'}>
        {focused ? <Search size={15} /> : tab?.url.startsWith('https:') ? <LockKeyhole size={15} /> : <Globe size={15} />}
      </span>
      <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={keyDown}
        aria-label="搜索或输入网址" role="combobox" aria-autocomplete="list"
        aria-expanded={focused && suggestions.length > 0} aria-controls={suggestionsId}
        aria-activedescendant={selected >= 0 ? `${suggestionsId}-${selected}` : undefined}
        placeholder="搜索或输入网址" spellCheck={false} autoComplete="off" />
      {focused && suggestions.length > 0 && (
        <div id={suggestionsId} role="listbox" className="address-suggestions">
          {suggestions.map((entry, index) => (
            <button key={entry.id} id={`${suggestionsId}-${index}`} type="button" role="option"
              aria-selected={index === selected} onMouseDown={(event) => event.preventDefault()}
              onClick={() => void navigate(entry.url)}>
              <History size={15} /><span><strong>{entry.title || entry.url}</strong><small>{entry.url}</small></span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
