import { describe, expect, it } from 'vitest';
import { band, scoreCandidate } from '../src/content/heuristics';
import { info } from './helpers';

describe('scoreCandidate', () => {
  it('scores an iframe from an ad domain as a certain ad', () => {
    const r = scoreCandidate(info({ tag: 'iframe', iframe_src: 'googleads.g.doubleclick.net' }, { adHost: true }));
    expect(r.guess).toBe('ad');
    expect(band(r.score)).toBe('hide');
  });

  it('scores a fixed, large consent banner with accept/reject buttons as a certain cookie banner', () => {
    const r = scoreCandidate(
      info(
        { text: 'We value your privacy. We use cookies to improve your experience.', buttons: ['Accept all', 'Reject all'] },
        { fixed: true, coverage: 0.35, zIndex: 9999 },
      ),
    );
    expect(r.guess).toBe('cookie_consent');
    expect(band(r.score)).toBe('hide');
  });

  it('recognises known chat vendors', () => {
    const r = scoreCandidate(info({ classes: 'intercom-launcher' }, { fixed: true }));
    expect(r.guess).toBe('chat_widget');
    expect(band(r.score)).toBe('hide');
  });

  it('recognises recommendation networks', () => {
    const r = scoreCandidate(info({ classes: 'OUTBRAIN ob-widget' }));
    expect(r.guess).toBe('recommendation_widget');
    expect(band(r.score)).toBe('hide');
  });

  it('ignores an ordinary article paragraph', () => {
    const r = scoreCandidate(info({ tag: 'p', text: 'The council voted on Tuesday to approve the budget.' }));
    expect(r.guess).toBeNull();
    expect(band(r.score)).toBe('ignore');
  });

  it('asks the model about a static element that only has an ad-like class name', () => {
    const r = scoreCandidate(info({ classes: 'ad-slot' }));
    expect(r.guess).toBe('ad');
    expect(band(r.score)).toBe('ask');
  });

  it('asks the model about a scroll-locking newsletter modal', () => {
    const r = scoreCandidate(
      info({ text: 'Subscribe to our newsletter for the best stories in your inbox' }, { fixed: true, locksScroll: true, coverage: 0.5 }),
    );
    expect(r.guess).toBe('signup_modal');
    expect(band(r.score)).not.toBe('ignore');
  });

  it('asks the model about a large floating overlay that has no tell-tale names', () => {
    const r = scoreCandidate(info({ classes: 'x-a1', text: 'Get 50% off running shoes this week' }, { fixed: true, coverage: 0.35, zIndex: 5000 }));
    expect(band(r.score)).toBe('ask');
  });

  it('still ignores small floating elements and sticky headers with no signals', () => {
    expect(band(scoreCandidate(info({ classes: 'x-a1' }, { fixed: true, coverage: 0.05, zIndex: 5000 })).score)).toBe('ignore');
    expect(band(scoreCandidate(info({ tag: 'header', text: 'Home News' }, { sticky: true, coverage: 0.08 })).score)).toBe('ignore');
  });

  it('does not treat words like "header" or "shadow" as ad keywords', () => {
    const r = scoreCandidate(info({ classes: 'header shadow-lg loaded' }));
    expect(r.guess).toBeNull();
  });
});

describe('band', () => {
  it('uses 0.85 and 0.15 as the cut-offs', () => {
    expect(band(0.85)).toBe('hide');
    expect(band(0.84)).toBe('ask');
    expect(band(0.16)).toBe('ask');
    expect(band(0.15)).toBe('ignore');
  });
});
