import { expect, it } from 'vitest';
import { hostOf } from '../src/shared/hostname';

it('normalises hosts: lowercase, strips www', () => {
  expect(hostOf('https://www.Example.com/x?y=1')).toBe('example.com');
  expect(hostOf('http://news.bbc.co.uk')).toBe('news.bbc.co.uk');
});
it('returns empty string for invalid urls', () => {
  expect(hostOf('nope')).toBe('');
});
