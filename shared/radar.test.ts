import { expect, test } from 'vitest';
import { matchesRadarTopic, radarResearchQuery, radarTopics, researchStyles } from './radar';

test('every generated research query fits the API limit with room for a user preference', () => {
  for (const topic of [undefined, ...radarTopics]) {
    for (const style of researchStyles) {
      expect(
        `${radarResearchQuery(topic, style)} Usá tonos ciruela y productos de mi selección.`.length,
      ).toBeLessThanOrEqual(500);
    }
  }
});

test('nail discovery distinguishes the Spanish letter ñ from the pronoun unas', () => {
  const nails = radarTopics.find((topic) => topic.id === 'nails');
  expect(nails).toBeDefined();
  const trend = (title: string) => ({ title, category: 'Editorial', summary: '', keywords: [] });
  expect(matchesRadarTopic(trend('Unas ideas para fotografiar perfumes'), nails)).toBe(false);
  expect(matchesRadarTopic(trend('Uñas de verano'), nails)).toBe(true);
  expect(matchesRadarTopic(trend('UÑAS de verano'), nails)).toBe(true);
  expect(matchesRadarTopic(trend('Unhas de verão'), nails)).toBe(true);
});
