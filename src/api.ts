import { useEffect, useState } from 'react';

const pairingParams = new URLSearchParams(window.location.hash.slice(1));
const pairing = pairingParams.get('pair');
if (pairing) {
  setConnection(pairingParams.get('service') || '', pairing);
  window.history.replaceState(null, '', window.location.pathname);
}
export function connection() {
  return {
    base: localStorage.getItem('elabela-service') || '',
    token: sessionStorage.getItem('elabela-session') || '',
  };
}
export function setConnection(base: string, token: string) {
  const clean = base.trim().replace(/\/$/, '');
  if (clean) {
    const parsed = new URL(clean);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
      throw new Error('Usá la dirección local de esta PC.');
  }
  localStorage.setItem('elabela-service', clean);
  sessionStorage.setItem('elabela-session', token.trim());
}
export function isLocalPage() {
  return (
    window.location.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)
  );
}
export async function connectLocal() {
  if (!isLocalPage()) throw new Error('Usá el enlace de conexión que abre el iniciador de esta PC.');
  const response = await fetch('/api/local-connection', {
    method: 'POST',
    headers: { 'x-elabela-connect': 'local' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  }).catch(() => {
    throw new Error(
      'No se pudo conectar con el servicio local. Abrí Iniciar ElaBela Media y volvé a intentar.',
    );
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.token !== 'string' || !data.token) {
    throw new Error(
      typeof data.error === 'string' ? data.error : 'Abrí Iniciar ElaBela Media para conectar esta página.',
    );
  }
  setConnection('', data.token);
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { base, token } = connection();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}${path}`, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'No se pudo completar la operación.' }));
    throw new Error(typeof data.error === 'string' ? data.error : 'Revisá los datos e intentá otra vez.');
  }
  return response.json() as Promise<T>;
}
export const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const blobs = new Map<string, Promise<string>>();
async function assetBlob(id: string, preview: boolean) {
  const { base, token } = connection();
  const path = `/api/assets/${encodeURIComponent(id)}${preview ? '/preview' : ''}`;
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('No se pudo abrir esta imagen.');
  return URL.createObjectURL(await response.blob());
}
export function useAsset(id?: string | null, preview = true) {
  return useAssetState(id, preview).url;
}
export function useAssetState(id?: string | null, preview = true) {
  const key = id ? `${connection().base}/${id}/${preview}` : undefined;
  const [state, setState] = useState<{ key?: string; url?: string; failed: boolean }>({ failed: false });
  useEffect(() => {
    if (!id || !key) return;
    let active = true;
    let blob = blobs.get(key);
    if (!blob) {
      blob = assetBlob(id, preview);
      blobs.set(key, blob);
    }
    blob
      .then((value) => {
        if (active) setState({ key, url: value, failed: false });
      })
      .catch(() => {
        blobs.delete(key);
        if (active) setState({ key, failed: true });
      });
    return () => {
      active = false;
    };
  }, [id, key, preview]);
  return key && state.key === key ? state : { url: undefined, failed: false };
}
export async function downloadAsset(id: string, filename: string) {
  const url = await assetBlob(id, false);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
