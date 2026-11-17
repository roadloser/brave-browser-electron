export function translationRuntimeSource(argumentsValue: unknown) {
  const input = argumentsValue as { action: 'start' | 'status' | 'cancel' | 'undo'; generation: number; script?: string; apiKey?: string; targetLanguage?: string };
  return `(() => {
    const input = ${JSON.stringify(input)};
    const key = '__braveTranslationRuntime';
    const cancelledKey = '__braveTranslationCancelledGeneration';
    const generation = input.generation;
    const existing = globalThis[key];
    if (input.action === 'status') return existing?.generation === generation ? existing.snapshot() : null;
    if (input.action === 'cancel' || input.action === 'undo') {
      globalThis[cancelledKey] = Math.max(globalThis[cancelledKey] || 0, generation);
      if (existing?.generation === generation) existing.stop(input.action === 'undo' ? 'idle' : 'cancelled');
      return existing?.generation === generation ? existing.snapshot() : null;
    }
    if (generation <= (globalThis[cancelledKey] || 0) || existing?.generation > generation) {
      return { status: 'cancelled', sourceLanguage: 'auto' };
    }
    if (existing?.generation === generation) return existing.snapshot();
    if (existing) {
      existing.stop('cancelled');
      if (existing.snapshot().status === 'failed') return existing.snapshot();
    }
    const requests = new Set();
    const styles = new Set();
    let library;
    const timers = new Set();
    const schedule = (callback, milliseconds) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!stopped) callback(); }, milliseconds);
      timers.add(timer);
      return timer;
    };
    const clearTimers = () => { timers.forEach((timer) => clearTimeout(timer)); timers.clear(); };
    let stopped = false;
    let state = { status: 'translating', sourceLanguage: document.documentElement.lang || 'auto', error: undefined };
    const snapshot = () => ({ ...state });
    const stop = (status) => {
      stopped = true;
      clearTimers();
      requests.forEach((request) => request.abort());
      requests.clear();
      let restored = true;
      try { if (library) library.restore(); } catch { restored = false; }
      if (XMLHttpRequest.prototype.open === patchedOpen) XMLHttpRequest.prototype.open = originalOpen;
      styles.forEach((style) => style.remove());
      styles.clear();
      window.removeEventListener('pagehide', pageHide);
      input.apiKey = undefined; input.script = undefined;
      if (globalThis.cr?.googleTranslate === callbacks) globalThis.cr.googleTranslate = previousCallbacks;
      state.status = restored ? status : 'failed';
      if (!restored) state.error = '恢复原文失败，请重新加载页面';
    };
    const fail = (message) => {
      stop('failed');
      state.error = state.error || message;
    };
    const officialUrl = (value) => {
      const url = new URL(value, 'https://translate.brave.com');
      if (url.pathname.includes('gen204')) return null;
      url.protocol = 'https:';
      url.host = 'translate.brave.com';
      url.pathname = url.pathname.replace('/translate_static/', '/static/v1/');
      if (!url.pathname.startsWith('/static/v1/') && url.pathname !== '/translate_a/t') throw new Error('翻译资源地址不受支持');
      return url.href;
    };
    const originalOpen = globalThis.__braveTranslateOriginalOpen || XMLHttpRequest.prototype.open;
    globalThis.__braveTranslateOriginalOpen = originalOpen;
    const patchedOpen = function(method, url, async = true, user, password) {
      if (stopped) throw new DOMException('翻译操作已取消', 'AbortError');
      requests.add(this);
      this.addEventListener('loadend', () => requests.delete(this), { once: true });
      const rewritten = officialUrl(String(url));
      if (!rewritten) return originalOpen.call(this, method, 'data:text/plain,', async);
      return originalOpen.call(this, method, rewritten, async, user, password);
    };
    XMLHttpRequest.prototype.open = patchedOpen;
    const fetchResource = (url, receive) => {
      if (stopped) return;
      const request = new XMLHttpRequest();
      request.open('GET', officialUrl(url), true);
      request.timeout = 20000;
      request.onload = () => {
        if (stopped) return;
        if (request.status !== 200) return fail('翻译资源加载失败（' + request.status + '）');
        try { receive(request.responseText); } catch { fail('翻译脚本执行失败'); }
      };
      request.onerror = () => { if (!stopped) fail('翻译服务连接失败'); };
      request.ontimeout = () => { if (!stopped) fail('翻译服务请求超时'); };
      request.send();
    };
    globalThis.cr = globalThis.cr || {};
    const previousCallbacks = globalThis.cr.googleTranslate;
    const callbacks = {
      onLoadJavascript(url) {
        fetchResource(url, (source) => {
          const empty = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
          const processed = source
            .replaceAll('"//"+po+"/gen204?"+Bo(b)', JSON.stringify(empty))
            .replaceAll('https://www.gstatic.com/images/branding/product/1x/translate_24dp.png', empty);
          new Function(processed).call(globalThis);
        });
      },
      onLoadCSS(url) {
        fetchResource(url, (source) => {
          const style = document.createElement('style');
          style.textContent = source.replaceAll('//www.gstatic.com/images/branding/product/2x/translate_24dp.png', 'data:,')
            + '.goog-te-spinner-pos,#goog-gt-tt{display:none!important}';
          document.head.appendChild(style);
          styles.add(style);
        });
      },
      onTranslateElementLoad() {
        if (stopped) return;
        clearTimers();
        try {
          library = globalThis.google.translate.TranslateService({
            key: input.apiKey, serverParams: '', timeInfo: { fetchStart: Date.now(), fetchEnd: Date.now() }, useSecureConnection: true
          });
          input.apiKey = undefined;
          const deadline = Date.now() + 10000;
          const ready = () => {
            if (stopped) return;
            if (!library.isAvailable()) {
              if (Date.now() > deadline) return fail('翻译服务初始化超时');
              schedule(ready, 100);
              return;
            }
            try {
              library.translatePage('auto', input.targetLanguage, (progress, finished, error) => {
                if (stopped) return;
                if (error) return fail(error === 2 ? '不支持此语言' : '翻译失败，已恢复原文');
                if (finished) {
                  clearTimers();
                  state.status = 'translated';
                  state.sourceLanguage = library.getDetectedLanguage ? library.getDetectedLanguage() : 'und';
                }
              });
              if (state.status === 'translating') schedule(() => fail('翻译超时，已恢复原文'), 60000);
            } catch { fail('翻译失败，已恢复原文'); }
          };
          ready();
        } catch { fail('翻译服务初始化失败'); }
      },
      onTranslateElementError() { fail('翻译脚本执行失败'); }
    };
    globalThis.cr.googleTranslate = callbacks;
    const pageHide = () => stop('cancelled');
    globalThis[key] = { generation, snapshot, stop };
    window.addEventListener('pagehide', pageHide, { once: true });
    schedule(() => fail('翻译资源加载超时'), 30000);
    try { new Function(input.script).call(globalThis); }
    catch { fail('翻译脚本执行失败'); }
    input.script = undefined;
    return snapshot();
  })()`;
}
