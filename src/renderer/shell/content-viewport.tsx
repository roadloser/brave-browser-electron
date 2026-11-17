import { useEffect, useRef, type ReactNode } from 'react';
import type { WindowSnapshot } from '../../shared/contracts/browser-core';
import { browserClient } from '../client/browser-client';
import { useBrowserStore } from './browser-store';

export function ContentViewport({ currentWindow, internal, children }: {
  currentWindow: WindowSnapshot;
  internal: boolean;
  children?: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const overlays = useBrowserStore((state) => state.overlays);
  const visible = !internal && overlays === 0;

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let frame = 0;
    let previous = '';
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = node.getBoundingClientRect();
        const viewport = { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
        const signature = JSON.stringify({ viewport, contentVisible: visible });
        if (signature === previous) return;
        previous = signature;
        browserClient.command('browser.setLayout', { viewport, contentVisible: visible })
          .catch(useBrowserStore.getState().reportError);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
    };
  }, [currentWindow.id, currentWindow.layout.verticalTabs, visible]);

  return <main ref={element} className="content-viewport" data-internal={internal}>{children}</main>;
}
