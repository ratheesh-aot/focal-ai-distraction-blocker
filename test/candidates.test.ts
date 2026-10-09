import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findCandidates } from '../src/content/candidates';
import { fakeMeasure, loadHtml, VIEWPORT } from './helpers';

const html = readFileSync(resolve(import.meta.dirname, 'fixtures/news.html'), 'utf8');
const find = (doc: Document, seen?: WeakSet<Element>) =>
  findCandidates(doc, { measure: fakeMeasure, viewport: VIEWPORT, seen });

describe('findCandidates', () => {
  it('finds the consent banner, ad iframe, chat bubble and share bar', () => {
    const doc = loadHtml(html);
    const found = find(doc);
    expect(found).toContain(doc.querySelector('.cmp-banner'));
    expect(found).toContain(doc.querySelector('#ad1'));
    expect(found).toContain(doc.querySelector('.intercom-launcher'));
    expect(found).toContain(doc.querySelector('.share-bar'));
  });

  it('never returns the article, or a fixed wrapper that holds the article', () => {
    const doc = loadHtml(html);
    const found = find(doc);
    expect(found).not.toContain(doc.querySelector('article'));
    expect(found).not.toContain(doc.querySelector('#content-wrapper'));
    expect(found).not.toContain(doc.body);
  });

  it('skips elements smaller than 50x20 and hidden elements', () => {
    const doc = loadHtml(html);
    const found = find(doc);
    expect(found).not.toContain(doc.querySelector('.ad-slot'));
    expect(found).not.toContain(doc.querySelector('.newsletter-modal'));
  });

  it('skips elements already processed', () => {
    const doc = loadHtml(html);
    const seen = new WeakSet<Element>([doc.querySelector('#ad1')!]);
    expect(find(doc, seen)).not.toContain(doc.querySelector('#ad1'));
  });

  it('returns the outermost candidate, not its candidate children', () => {
    const doc = loadHtml(
      '<body><div class="promo-popup" data-pos="fixed" data-rect="500,300,0,0"><div class="modal-inner" data-pos="fixed" data-rect="400,200,0,0">Hi</div></div></body>',
    );
    const found = find(doc);
    expect(found).toHaveLength(1);
    expect(found[0].className).toBe('promo-popup');
  });

  it('caps the number of candidates at 300', () => {
    const many = Array.from({ length: 400 }, (_, i) => `<div class="ad-${i} ad" data-rect="100,100,0,0">x</div>`).join('');
    expect(find(loadHtml(`<body>${many}</body>`))).toHaveLength(300);
  });

  it('ignores hidden text when deciding what is the main content (Cookiebot details tables)', () => {
    const details = '<tr><td>cookie_name</td><td>Stores the user consent state for the current domain</td></tr>'.repeat(200);
    const doc = loadHtml(
      `<body><article data-rect="700,1500,0,0"><p>${'Short story text. '.repeat(30)}</p></article>` +
        `<div id="CybotCookiebotDialog" data-pos="fixed" data-rect="1000,215,585,0">This website uses cookies.` +
        `<button>Accept</button><div hidden><table>${details}</table></div></div></body>`,
    );
    expect(find(doc)).toContain(doc.getElementById('CybotCookiebotDialog'));
  });
});
