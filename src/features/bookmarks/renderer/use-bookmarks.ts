import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookmarksState } from '../../../shared/contracts/bookmarks';
import type { CommandInput, CommandName } from '../../../shared/contracts/envelope';
import { browserClient } from '../../../renderer/client/browser-client';

type BookmarkMutation = Extract<CommandName, 'bookmarks.create' | 'bookmarks.update' | 'bookmarks.move' | 'bookmarks.remove' | 'bookmarks.addCurrentTab'>;

export function useBookmarks() {
  const [state, setState] = useState<BookmarksState>({ nodes: [], revision: -1 });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const mutating = useRef(false);
  const accept = useCallback((next: BookmarksState) => {
    if (active.current) setState(previous => next.revision >= previous.revision ? next : previous);
  }, []);
  const refresh = useCallback(async () => {
    try {
      accept(await browserClient.command('bookmarks.list', {}));
      if (active.current) setError('');
    } catch (problem) {
      if (active.current) setError(problem instanceof Error ? problem.message : '书签读取失败');
    }
  }, [accept]);

  useEffect(() => {
    active.current = true;
    const unsubscribe = browserClient.on('bookmarks.changed', accept);
    void refresh();
    return () => { active.current = false; unsubscribe(); };
  }, [accept, refresh]);

  async function mutate<Name extends BookmarkMutation>(command: Name, input: CommandInput<Name>) {
    if (mutating.current) return false;
    mutating.current = true;
    setPending(true);
    setError('');
    try {
      accept(await browserClient.command(command, input));
      return true;
    } catch (problem) {
      if (active.current) setError(problem instanceof Error ? problem.message : '书签保存失败，请重试');
      return false;
    } finally {
      mutating.current = false;
      if (active.current) setPending(false);
    }
  }

  return { ...state, error, pending, mutate, refresh };
}
