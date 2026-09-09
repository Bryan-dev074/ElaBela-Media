import { expect, it } from 'vitest';
import { platformForSource } from './sources';

it('identifies the linked platform without trusting model labels or lookalike domains', () => {
  expect(platformForSource('https://newsroom.pinterest.com/news/report/')).toBe('Pinterest');
  expect(platformForSource('https://www.instagram.com/p/abc/')).toBe('Instagram');
  expect(platformForSource('https://instagram.com.example.com/post')).toBe('Sitio web');
  expect(platformForSource('not a URL')).toBe('Fuente por revisar');
});
