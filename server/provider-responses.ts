import { ServiceError } from './contracts.js';

export interface ResponsesGenerationRequest {
  apiKey: string;
  model: string;
  payload: Record<string, unknown>;
}

export async function requestResponses(input: ResponsesGenerationRequest): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(180000),
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input.payload),
    });
  } catch {
    throw new ServiceError(
      'El proveedor no confirmó la solicitud. Puede haber consumo en tu cuenta. No se reintentó automáticamente.',
      502,
    );
  }
  if (!response.ok)
    throw new ServiceError(
      `El proveedor rechazó la solicitud (HTTP ${response.status}). Revisá modelo, permisos y saldo.`,
      502,
    );
  return response.json();
}

export function extractOutputText(response: unknown): string {
  if (!response || typeof response !== 'object')
    throw new ServiceError('El proveedor no entregó una respuesta estructurada.', 502);
  const data = response as {
    output_text?: unknown;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const text = data.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
  if (!text) throw new ServiceError('El proveedor no entregó resultados estructurados.', 502);
  return text;
}
