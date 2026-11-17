import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { BookOpen, Camera, Languages, ScanLine } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { browserClient } from '../../../renderer/client/browser-client';
import { IconButton } from '../../../renderer/components/icon-button';
import { usePageOverlay } from '../../../renderer/shell/use-page-overlay';
import { useBrowserStore } from '../../../renderer/shell/browser-store';
import { ReaderPanel } from './reader-panel';
import { TranslationPanel } from './translation-panel';

export function PageToolsToolbar({ tab }: { tab?: TabSnapshot }) {
  const [reader, setReader] = useState(false);
  const [translation, setTranslation] = useState(false);
  const [menu, setMenu] = useState(false);
  const [capturing, setCapturing] = useState(false);
  usePageOverlay(menu);
  const available = tab && /^https?:/.test(tab.url);
  async function capture(fullPage: boolean) {
    if (!tab) return;
    setCapturing(true); setMenu(false);
    try { await browserClient.command('pageTools.capture', { tabId: tab.id, fullPage }); }
    catch (error) { useBrowserStore.getState().reportError(error); }
    finally { setCapturing(false); }
  }
  return (
    <>
      <IconButton label="阅读模式" disabled={!available} onClick={() => setReader(true)}><BookOpen size={17} /></IconButton>
      <IconButton label="翻译页面" disabled={!available} onClick={() => setTranslation(true)}><Languages size={18} /></IconButton>
      <Menu.Root open={menu} onOpenChange={setMenu}>
        <Menu.Trigger render={<IconButton label={capturing ? '正在截图' : '网页截图'} disabled={!available || capturing} />}><Camera size={17} /></Menu.Trigger>
        <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6}><Menu.Popup className="browser-menu">
          <Menu.Item onClick={() => void capture(false)}><Camera size={16} />保存当前视口</Menu.Item>
          <Menu.Item onClick={() => void capture(true)}><ScanLine size={16} />保存完整网页</Menu.Item>
        </Menu.Popup></Menu.Positioner></Menu.Portal>
      </Menu.Root>
      {tab && <ReaderPanel key={`reader-${tab.id}`} tabId={tab.id} open={reader} onOpenChange={setReader} />}
      {tab && <TranslationPanel key={`translation-${tab.id}`} tabId={tab.id} open={translation} onOpenChange={setTranslation} />}
    </>
  );
}
