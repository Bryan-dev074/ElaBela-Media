import { hasBeautySubject, hasUnrelatedSubject } from '../shared/radar.js';
import { assertRemoteUrl, type FetchLike } from './remote.js';

const sourceHosts = new Set([
  'business.pinterest.com',
  'newsroom.pinterest.com',
  'www.pinterest.com',
  'pinterest.com',
  'br.pinterest.com',
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

export function isConcreteVisualSource(value: string): boolean {
  try {
    const url = sourceUrl(value);
    if (['www.pinterest.com', 'pinterest.com', 'br.pinterest.com'].includes(url.hostname))
      return /^\/pin\/(?:[\w-]+--)?\d+\/?$/.test(url.pathname);
    if (['www.instagram.com', 'instagram.com'].includes(url.hostname))
      return /^\/(?:p|reel)\/[\w-]+\/?$/.test(url.pathname);
    if (['www.tiktok.com', 'tiktok.com'].includes(url.hostname))
      return /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname);
    if (['www.youtube.com', 'youtube.com'].includes(url.hostname))
      return (
        (url.pathname === '/watch' && /^[\w-]+$/.test(url.searchParams.get('v') || '')) ||
        /^\/shorts\/[\w-]+\/?$/.test(url.pathname)
      );
    return (
      ['www.facebook.com', 'facebook.com'].includes(url.hostname) &&
      /^\/[^/]+\/posts\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function classifyVisualSource(value: string, subject: string) {
  if (!isConcreteVisualSource(value))
    return {
      visualStatus: 'context' as const,
      visualReason:
        'La fuente es un informe, tablero o página general; su portada no es una referencia de producto.',
    };
  if (!hasBeautySubject(subject) || hasUnrelatedSubject(subject))
    return {
      visualStatus: 'unavailable' as const,
      visualReason: 'La página no acredita un ejemplo específico de cosméticos o belleza.',
    };
  return { visualStatus: 'example' as const, visualReason: undefined };
}

export function assertVisualImageUrl(value: string): URL {
  const url = assertRemoteUrl(value);
  if (
    url.hostname === 's.pinimg.com' ||
    hasUnrelatedSubject(url.pathname) ||
    /(?:^|[/_-])(?:logo|placeholder|default|og[-_]image|share[-_]image)(?:[./_-]|$)/i.test(url.pathname)
  )
    throw new Error('Generic or unrelated reference image');
  return url;
}

export function isVisualImageUrl(value: string): boolean {
  try {
    assertVisualImageUrl(value);
    return true;
  } catch {
    return false;
  }
}

export function extractSourceImages(html: string, page: string): string[] {
  const found = new Set<string>();
  for (const attributes of metadata(html)) {
    if (
      !/^(og:image(?::url)?|twitter:image(?::src)?)$/.test(
        attributes.get('property') || attributes.get('name') || '',
      )
    )
      continue;
    const content = attributes.get('content');
    if (!content) continue;
    try {
      const url = assertVisualImageUrl(new URL(content.replaceAll('&amp;', '&'), page).href);
      found.add(url.href);
    } catch {
      /* Unsupported image CDNs remain a source link, never a guessed download. */
    }
  }
  return [...found].slice(0, 4);
}

function metadata(html: string): Map<string, string>[] {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).map((tag) => {
    const attributes = new Map<string, string>();
    for (const attribute of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))
      if (attribute[1] && attribute[3]) attributes.set(attribute[1].toLowerCase(), attribute[3]);
    return attributes;
  });
}

export interface SourcePreview {
  url: string;
  title: string;
  imageUrls: string[];
  checkedAt: string;
  visualStatus?: 'example' | 'context' | 'unavailable';
  visualReason?: string;
  subjectRelevant?: boolean;
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
    const descriptions = metadata(html)
      .filter((attributes) =>
        /^(?:og:description|description|og:title)$/.test(
          attributes.get('property') || attributes.get('name') || '',
        ),
      )
      .map((attributes) => attributes.get('content') || '')
      .join(' ');
    const classification = classifyVisualSource(url.href, `${title} ${descriptions}`);
    const imageUrls = classification.visualStatus === 'example' ? extractSourceImages(html, url.href) : [];
    return {
      url: url.href,
      title: title.slice(0, 500),
      imageUrls,
      checkedAt: new Date().toISOString(),
      subjectRelevant: classification.visualStatus === 'example',
      ...classification,
      ...(classification.visualStatus === 'example' && !imageUrls.length
        ? ({
            visualStatus: 'unavailable',
            visualReason:
              'La publicación es pertinente, pero no ofrece una imagen verificable en los dominios admitidos.',
          } as const)
        : {}),
    };
  }
  return undefined;
}
