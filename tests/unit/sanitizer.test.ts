import { describe, it, expect } from 'vitest';
import { renderSafeHtml, stripHtmlFromTemplate, injectEmailStyles } from '../../src/content/sanitizer';

describe('stripHtmlFromTemplate', () => {
  it('removes HTML tags from template', () => {
    const input = '<div>Hello</div> <script>alert("xss")</script> **bold**';
    const result = stripHtmlFromTemplate(input);
    expect(result).toBe('Hello alert("xss") **bold**');
    expect(result).not.toContain('<div>');
    expect(result).not.toContain('<script>');
  });

  it('preserves Markdown syntax', () => {
    const input = '## Title\n\n- item 1\n- item 2\n\n**bold** and *italic*';
    const result = stripHtmlFromTemplate(input);
    expect(result).toBe(input);
  });

  it('handles empty string', () => {
    expect(stripHtmlFromTemplate('')).toBe('');
  });
});

describe('renderSafeHtml', () => {
  it('converts Markdown to HTML', () => {
    const markdown = '## Hello\n\n- item 1\n- item 2';
    const html = renderSafeHtml(markdown);
    expect(html).toContain('<h2>');
    expect(html).toContain('<li>');
  });

  it('removes script tags', () => {
    const markdown = 'Hello <script>alert("xss")</script> world';
    const html = renderSafeHtml(markdown);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert');
  });

  it('removes anchor tags', () => {
    const markdown = 'Click <a href="http://evil.com">here</a>';
    const html = renderSafeHtml(markdown);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
  });

  it('removes img tags with event handlers', () => {
    const markdown = '<img src="x" onerror="alert(1)">';
    const html = renderSafeHtml(markdown);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
  });

  it('removes style attributes', () => {
    const markdown = '<div style="display:none">hidden</div>';
    const html = renderSafeHtml(markdown);
    expect(html).not.toContain('style');
    expect(html).toContain('hidden');
  });

  it('preserves safe tags', () => {
    const markdown = '**bold** and *italic*\n\n## heading\n\n- list item';
    const html = renderSafeHtml(markdown);
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('<h2>');
    expect(html).toContain('<li>');
  });
});

describe('injectEmailStyles', () => {
  it('wraps HTML with doctype and styles', () => {
    const html = '<h2>Title</h2><p>Body</p>';
    const result = injectEmailStyles(html);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<style>');
    expect(result).toContain('<body>');
    expect(result).toContain(html);
  });
});
