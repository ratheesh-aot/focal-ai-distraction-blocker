import { describe, expect, it } from 'vitest';
import { buildQuestions, CATEGORIES, LABELS, isCategory } from '../src/shared/labels';
import { isAdHost } from '../src/shared/adDomains';

describe('labels', () => {
  it('asks one choice question with exactly the 10 labels', () => {
    const q = buildQuestions();
    expect(q.kind.type).toBe('choice');
    expect(Object.keys(q.kind.criteria).sort()).toEqual([...LABELS].sort());
    expect(LABELS).toHaveLength(10);
  });

  it('has 8 hideable categories, excluding content and navigation', () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(CATEGORIES).not.toContain('main_content');
    expect(isCategory('site_navigation')).toBe(false);
    expect(isCategory('ad')).toBe(true);
  });
});

describe('isAdHost', () => {
  it('matches listed domains and their subdomains', () => {
    expect(isAdHost('securepubads.g.doubleclick.net')).toBe(true);
    expect(isAdHost('doubleclick.net')).toBe(true);
  });
  it('does not match unrelated hosts or suffix lookalikes', () => {
    expect(isAdHost('example.com')).toBe(false);
    expect(isAdHost('notdoubleclick.net')).toBe(false);
    expect(isAdHost('')).toBe(false);
  });
});
