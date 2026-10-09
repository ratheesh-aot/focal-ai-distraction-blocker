import { describe, expect, it } from 'vitest';
import { signatureOf, summarize } from '../src/content/summarize';
import { fakeMeasure, loadHtml, VIEWPORT } from './helpers';

const one = (html: string, locks = false) => {
  const doc = loadHtml(`<body>${html}</body>`);
  const el = doc.body.firstElementChild!;
  return summarize(el, fakeMeasure(el), VIEWPORT, locks);
};

describe('summarize', () => {
  it('describes a fixed consent banner compactly', () => {
    const { summary, features } = one(
      '<div id="cmp" class="cmp-banner" role="dialog" data-pos="fixed" data-rect="1000,280,520,0" data-z="99">We use cookies. <button>Accept all</button><button> Reject all </button></div>',
      true,
    );
    expect(summary.tag).toBe('div');
    expect(summary.role).toBe('dialog');
    expect(summary.classes).toContain('cmp-banner');
    expect(summary.buttons).toEqual(['Accept all', 'Reject all']);
    expect(summary.position).toBe('fixed bottom, covers 35% of viewport');
    expect(summary.locks_scroll).toBe(true);
    expect(summary.z_index).toBe(99);
    expect(features).toMatchObject({ fixed: true, coverage: 0.35, zIndex: 99, locksScroll: true });
  });

  it('records the iframe host and flags ad hosts', () => {
    const { summary, features } = one('<iframe src="https://tpc.googlesyndication.com/x" data-rect="300,250,0,0"></iframe>');
    expect(summary.iframe_src).toBe('tpc.googlesyndication.com');
    expect(features.adHost).toBe(true);
  });

  it('truncates text to 300 chars and keeps at most 6 buttons', () => {
    const buttons = Array.from({ length: 9 }, (_, i) => `<button>b${i}</button>`).join('');
    const { summary } = one(`<div>${'word '.repeat(200)}${buttons}</div>`);
    expect(summary.text!.length).toBeLessThanOrEqual(300);
    expect(summary.buttons).toHaveLength(6);
  });

  it('leaves out text and buttons that are not rendered', () => {
    const tabs = Array.from({ length: 8 }, (_, i) => `<button>Tab ${i}</button>`).join('');
    const { summary } = one(
      `<div>This website uses cookies.<div style="display: none">${tabs} secret details</div><button>Accept</button></div>`,
    );
    expect(summary.buttons).toEqual(['Accept']);
    expect(summary.text).not.toContain('secret details');
    expect(summary.text).toContain('This website uses cookies.');
  });

  it('omits empty fields', () => {
    const { summary } = one('<div data-rect="100,100,0,0"></div>');
    expect(summary).not.toHaveProperty('text');
    expect(summary).not.toHaveProperty('buttons');
    expect(summary).not.toHaveProperty('classes');
  });
});

describe('signatureOf', () => {
  it('is stable when generated class hashes change', () => {
    const a = one('<div class="css-1a2b3c banner">Hello there</div>').summary;
    const b = one('<div class="css-9z8y7x banner">Hello there</div>').summary;
    expect(signatureOf(a)).toBe(signatureOf(b));
  });

  it('differs when the text differs', () => {
    const a = one('<div class="banner">Hello there</div>').summary;
    const b = one('<div class="banner">Goodbye now</div>').summary;
    expect(signatureOf(a)).not.toBe(signatureOf(b));
  });
});
