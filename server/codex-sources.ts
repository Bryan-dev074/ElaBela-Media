import { assertRemoteUrl, type FetchLike } from './remote.js';

const sourceHosts = new Set([
  'business.pinterest.com',
  'newsroom.pinterest.com',
  'www.pinterest.com',
  'pinterest.com',
  'www.instagram.com',
  'instagram.com',
  'www.facebook.com',
  'facebook.com',
  'www.tiktok.com',
  'tiktok.com',
  'www.youtube.com',
  'youtube.com',
]);

export function sourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !sourceHosts.has(url.hostname))
    throw new Error('Unsupported reference source');
  return url;
}

export function extractSourceImages(html: string, page: string): string[] {
  const found = new Set<string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const attribute of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))
      if (attribute[1] && attribute[2]) attributes.set(attribute[1].toLowerCase(), attribute[2]);
    if (
      !/^(og:image(?::url)?|twitter:image(?::src)?)$/.test(
        attributes.get('property') || attributes.get('name') || '',
      )
    )
      continue;
    const content = attributes.get('content');
    if (!content) continue;
    try {
      const url = assertRemoteUrl(new URL(content.replaceAll('&amp;', '&'), page).href);
      found.add(url.href);
    } catch {
      /* Unsupported image CDNs remain a source link, never a guessed download. */
    }
  }
  return [...found].slice(0, 4);
}

export interface SourcePreview {
  url: string;
  title: string;
  imageUrls: string[];
  checkedAt: string;
}

export async function sourceImages(value: string, fetcher: FetchLike = fetch): Promise<string[]> {
  return (await sourcePreview(value, fetcher))?.imageUrls ?? [];
}

export async function sourcePreview(
  value: string,
  fetcher: FetchLike = fetch,
): Promise<SourcePreview | undefined> {
  let url = sourceUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) return undefined;
      url = sourceUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) return undefined;
    const limit = 3 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body.cancel();
      return undefined;
    }
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > limit) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(chunk.value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const title = html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim();
    if (
      !title ||
      /login|log in|sign in|iniciar sesi[oó]n|not found|access denied|just a moment|^Pinterest$|^Instagram$|^Facebook$/i.test(
        title,
      )
    )
      return undefined;
    return {
      url: url.href,
      title: title.slice(0, 500),
      imageUrls: extractSourceImages(html, url.href),
      checkedAt: new Date().toISOString(),
    };
  }
  return undefined;
}
