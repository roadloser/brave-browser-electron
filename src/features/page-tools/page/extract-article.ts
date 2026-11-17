import readabilitySource from '@mozilla/readability/Readability.js?raw';
import purifySource from 'dompurify/dist/purify.js?raw';

export function extractArticleSource() {
  return `(() => {
    const Readability = (() => { const module = { exports: {} }; ${readabilitySource}; return module.exports; })();
    const purify = (() => { const module = { exports: {} }; ${purifySource}; return module.exports; })();
    const article = new Readability(document.cloneNode(true), { maxElemsToParse: 150000 }).parse();
    if (!article || !article.textContent || article.textContent.trim().length < 80) return null;
    const content = purify.sanitize(article.content, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'video', 'audio'],
      FORBID_ATTR: ['style', 'srcset', 'id', 'name']
    });
    return {
      title: article.title || document.title,
      byline: article.byline || null,
      content,
      textContent: article.textContent,
      siteName: article.siteName || null,
      excerpt: article.excerpt || null
    };
  })()`;
}
