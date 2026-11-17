import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal, Plus, EyeOff, Minus } from 'lucide-react';
import type { NewsState } from '../../../shared/contracts/content-services';
import { browserClient } from '../../../renderer/client/browser-client';
import { IconButton } from '../../../renderer/components/icon-button';

export function NewsSourceAction({ publisherId, state, onState, onError }: {
  publisherId: string; state: NewsState; onState: (state: NewsState) => void; onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const direct = state.directFeeds.some((feed) => feed.id === publisherId);
  const followed = direct || state.enabledPublisherIds.includes(publisherId);
  if (!direct && !state.publishers.some((publisher) => publisher.id === publisherId)) return null;
  async function change(action: 'follow' | 'unfollow' | 'hide') {
    setOpen(false); setBusy(true);
    try {
      const next = direct && action !== 'follow' ? await browserClient.command('news.removeFeed', { id: publisherId }) :
        action === 'unfollow' ? await browserClient.command('news.resetPublisher', { id: publisherId }) :
          await browserClient.command('news.setPublisher', { id: publisherId, enabled: action === 'follow' });
      onState(next);
    } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <Menu.Root open={open} onOpenChange={setOpen}>
    <Menu.Trigger render={<IconButton label="新闻来源操作" disabled={busy} />}><MoreHorizontal size={17} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={4}><Menu.Popup className="browser-menu">
      <Menu.Item onClick={() => void change(followed ? 'unfollow' : 'follow')}>{followed ? <Minus size={15} /> : <Plus size={15} />}{followed ? '取消关注此来源' : '关注此来源'}</Menu.Item>
      <Menu.Item onClick={() => void change('hide')}><EyeOff size={15} />不再显示此来源</Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
