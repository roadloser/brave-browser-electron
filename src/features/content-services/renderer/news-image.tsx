import { useEffect, useRef, useState } from 'react';
import { browserClient } from '../../../renderer/client/browser-client';

export function NewsImage({ articleId, imageUrl, contextId }: { articleId: string; imageUrl?: string; contextId: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDataUrl(null); setFailed(false);
    if (!imageUrl || !element.current) return;
    let alive = true;
    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (requested || !entries.some((entry) => entry.isIntersecting)) return;
      requested = true; observer.disconnect();
      browserClient.command('news.image', { articleId }).then((result) => {
        if (alive) { setDataUrl(result.dataUrl); setFailed(!result.dataUrl); }
      }).catch(() => { if (alive) setFailed(true); });
    }, { rootMargin: '250px' });
    observer.observe(element.current);
    return () => { alive = false; observer.disconnect(); };
  }, [articleId, imageUrl, contextId]);
  if (!imageUrl || failed) return null;
  return <div ref={element} className="news-image" aria-hidden="true">
    {dataUrl && <img src={dataUrl} alt="" onError={() => setFailed(true)} />}
  </div>;
}
