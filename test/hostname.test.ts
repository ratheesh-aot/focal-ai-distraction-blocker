import { expect, it } from 'vitest';
import { hostOf } from '../src/shared/hostname';

it('normalises hosts: lowercase, strips www', () => {
  expect(hostOf('https://www.Example.com/x?y=1')).toBe('example.com');
  expect(hostOf('http://news.bbc.co.uk')).toBe('news.bbc.co.uk');
});
it('returns empty string for invalid urls', () => {
  expect(hostOf('nope')).toBe('');
});

import { isSiteDisabled } from '../src/shared/hostname';

it('treats a disabled site as covering its subdomains only', () => {
  expect(isSiteDisabled('example.com', ['example.com'])).toBe(true);
  expect(isSiteDisabled('news.example.com', ['example.com'])).toBe(true);
  expect(isSiteDisabled('badexample.com', ['example.com'])).toBe(false);
  expect(isSiteDisabled('example.com', [])).toBe(false);
});

it('returns empty string for non-web pages', () => {
  expect(hostOf('chrome-extension://abcdef/popup/index.html')).toBe('');
  expect(hostOf('chrome://settings')).toBe('');
  expect(hostOf('file:///C:/x.html')).toBe('');
});
