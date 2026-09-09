import { expect, test } from 'vitest';
import { matchesRadarTopic, radarTopics } from './radar';

test('nail discovery distinguishes the Spanish letter ñ from the pronoun unas', () => {
  const nails = radarTopics.find((topic) => topic.id === 'nails');
  expect(nails).toBeDefined();
  const trend = (title: string) => ({ title, category: 'Editorial', summary: '', keywords: [] });
  expect(matchesRadarTopic(trend('Unas ideas para fotografiar perfumes'), nails)).toBe(false);
  expect(matchesRadarTopic(trend('Uñas de verano'), nails)).toBe(true);
  expect(matchesRadarTopic(trend('UÑAS de verano'), nails)).toBe(true);
  expect(matchesRadarTopic(trend('Unhas de verão'), nails)).toBe(true);
});
