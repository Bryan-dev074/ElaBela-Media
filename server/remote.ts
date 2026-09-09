import { ServiceError } from './contracts.js';

// Downloads are intentionally limited to the reviewed store and reference CDNs.
const remoteHosts = new Set([
  'www.elabela.com.py',
  'elabela.com.py',
  'images.ctfassets.net',
  'i.pinimg.com',
  's.pinimg.com',
]);
export function assertRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError('La fuente no tiene una URL válida', 400);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !remoteHosts.has(url.hostname)
  ) {
    throw new ServiceError('Este dominio de referencia requiere importación manual', 400);
  }
  return url;
}
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function downloadPublic(
  value: string,
  limit = 20 * 1024 * 1024,
  fetcher: FetchLike = fetch,
): Promise<Buffer> {
  let url = assertRemoteUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'ElaBela-Media/0.1 (reference-library)' },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) break;
      await response.body?.cancel();
      url = assertRemoteUrl(new URL(next, url).href);
      continue;
    }
    if (!response.ok || !response.body)
      throw new ServiceError('La fuente no está disponible. Revisá la referencia.', 502);
    const advertised = Number(response.headers.get('content-length'));
    if (advertised > limit) {
      await response.body.cancel();
      throw new ServiceError('El archivo de referencia es demasiado grande', 413);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new ServiceError('El archivo de referencia es demasiado grande', 413);
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  }
  throw new ServiceError('No se pudo resolver la dirección de la fuente', 502);
}
