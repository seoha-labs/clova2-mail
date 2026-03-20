import DOMPurify from 'dompurify';
import { marked } from 'marked';

const SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'b', 'i',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'code', 'pre',
    'span', 'div',
  ],
  ALLOWED_ATTR: [],
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'form',
    'input', 'textarea', 'select', 'button', 'a', 'img',
  ],
  FORBID_ATTR: [
    'onerror', 'onload', 'onclick', 'onmouseover',
    'href', 'src', 'action', 'style',
  ],
};

export function stripHtmlFromTemplate(template: string): string {
  return template.replace(/<[^>]*>/g, '');
}

export function renderSafeHtml(markdown: string): string {
  const rawHtml = marked(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
}

export function injectEmailStyles(html: string): string {
  const styles = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
      h1, h2, h3 { color: #1a1a1a; border-bottom: 1px solid #eee; padding-bottom: 8px; }
      hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
      ul, ol { padding-left: 20px; }
      li { margin-bottom: 4px; }
      blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #666; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f5f5f5; }
    </style>
  `;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>${html}</body></html>`;
}
