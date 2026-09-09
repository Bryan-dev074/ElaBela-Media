import { expect, it } from 'vitest';
import { z } from 'zod';
import { modelSchema } from './model-schema.js';

it('removes unsupported URI formats from transport while retaining required structure and runtime URL validation', () => {
  const schema = z.object({ trends: z.array(z.object({ sourceUrl: z.url().startsWith('https://') })) });
  const transport = modelSchema(schema);
  expect(JSON.stringify(transport)).not.toContain('"format":"uri"');
  expect(transport.required).toEqual(['trends']);
  expect(schema.safeParse({ trends: [{ sourceUrl: 'not-a-url' }] }).success).toBe(false);
  expect(schema.safeParse({ trends: [{ sourceUrl: 'https://business.pinterest.com/' }] }).success).toBe(true);
});
