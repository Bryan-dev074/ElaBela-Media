import { describe, expect, it, vi } from 'vitest';
import { assertRemoteUrl, downloadPublic, type FetchLike } from './remote.js';

describe('descargas públicas permitidas', () => {
  it('acepta HTTPS solamente para hosts exactos de la lista', () => {
    expect(assertRemoteUrl('https://images.ctfassets.net/reference.webp').hostname).toBe(
      'images.ctfassets.net',
    );
    expect(() => assertRemoteUrl('http://images.ctfassets.net/reference.webp')).toThrow(/dominio/i);
    expect(() => assertRemoteUrl('https://evil.images.ctfassets.net/reference.webp')).toThrow(/dominio/i);
    expect(() => assertRemoteUrl('https://images.ctfassets.net.evil.test/reference.webp')).toThrow(
      /dominio/i,
    );
  });

  it('rechaza una redirección hacia un host no autorizado sin solicitarlo', async () => {
    const fetcher = vi.fn<FetchLike>(
      async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/private' } }),
    );
    await expect(downloadPublic('https://images.ctfassets.net/start.webp', 1_000, fetcher)).rejects.toThrow(
      /dominio/i,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('corta por Content-Length antes de leer un cuerpo que supera el límite', async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      cancel: cancelled,
      start() {
        // The advertised size is enough to reject before pulling data.
      },
    });
    const fetcher = vi.fn<FetchLike>(
      async () => new Response(stream, { status: 200, headers: { 'content-length': '1001' } }),
    );
    await expect(downloadPublic('https://images.ctfassets.net/large.webp', 1_000, fetcher)).rejects.toThrow(
      /grande/i,
    );
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('corta un stream cuyo tamaño real supera el límite aunque no lo anuncie', async () => {
    const fetcher = vi.fn<FetchLike>(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(700));
              controller.enqueue(new Uint8Array(400));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );
    await expect(downloadPublic('https://images.ctfassets.net/stream.webp', 1_000, fetcher)).rejects.toThrow(
      /grande/i,
    );
  });
});
