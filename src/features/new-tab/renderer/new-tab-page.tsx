import { useEffect, useState, type CSSProperties } from 'react';
import { Search, SlidersHorizontal, VenetianMask } from 'lucide-react';
import type { TabSnapshot, WindowSnapshot } from '../../../shared/contracts/browser-core';
import { browserClient } from '../../../renderer/client/browser-client';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';
import { useNewTab } from './use-new-tab';
import { ShortcutGrid } from './shortcut-grid';
import { BackgroundPicker } from './background-picker';
import './new-tab.css';

export function NewTabPage({ tab, window: currentWindow }: { tab: TabSnapshot; window: WindowSnapshot }) {
  const { state, error, accept, setError } = useNewTab(tab.contextId);
  const [query, setQuery] = useState('');
  const [customizing, setCustomizing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setImageFailed(false), [state?.preferences.background.value]);
  const background = state?.preferences.background;
  const image = background?.kind === 'image' ? state?.images.find((entry) => entry.id === background.value) : undefined;
  const style: CSSProperties = background?.kind === 'color' ? { background: background.value } : {};
  const gradient = background?.kind === 'gradient' ? background.value : 'dusk';

  return (
    <div className={`new-tab-page gradient-${gradient}`} style={style}>
      {image && !imageFailed && <img className="new-tab-background" src={image.dataUrl} alt="" onError={() => setImageFailed(true)} />}
      <div className="new-tab-shade" />
      <header className="new-tab-header">
        <span className="new-tab-wordmark">brave</span>
        {currentWindow.isPrivate && <span className="new-tab-private"><VenetianMask size={18} />私密窗口</span>}
      </header>
      <div className="new-tab-content">
        {state?.preferences.showClock && <time className="new-tab-clock" dateTime={now.toISOString()}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
        <form className="new-tab-search" role="search" onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) browserClient.command('browser.navigate', { tabId: tab.id, url: query.trim() })
            .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
        }}>
          <Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索网页" aria-label="搜索网页" />
          <button type="submit" aria-label="搜索">→</button>
        </form>
        {state?.preferences.showShortcuts && <ShortcutGrid shortcuts={state.preferences.shortcuts} tabId={tab.id} onState={accept} onError={setError} />}
        {currentWindow.isPrivate && <p className="private-description">此窗口的浏览记录不会保存到资料。下载的文件和您主动保存的内容仍会保留。</p>}
        {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
      </div>
      <footer className="new-tab-footer"><span>{image && !imageFailed ? image.name : ''}</span>
        <IconButton label="自定义新标签页" onClick={() => setCustomizing(true)}><SlidersHorizontal size={19} /></IconButton>
      </footer>
      {state && <BackgroundPicker state={state} open={customizing} onOpenChange={setCustomizing} onState={accept} />}
    </div>
  );
}
