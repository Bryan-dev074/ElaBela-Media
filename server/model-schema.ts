import { z } from 'zod';

/** The model's strict schema subset rejects URI format; Zod still validates URLs on return. */
export function modelSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    const object = value as Record<string, unknown>;
    if (object.format === 'uri' || object.format === 'url') delete object.format;
    for (const child of Object.values(object)) visit(child);
  };
  visit(json);
  return json;
}
