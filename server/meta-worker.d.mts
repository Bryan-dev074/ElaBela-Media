import type { MetaCheckpoint, MetaPlan } from './meta-types.js';
export interface WorkerDependencies {
  mode: 'publish' | 'reconcile';
  api: {
    uploadFacebookPhoto(path: string): Promise<string>;
    getFacebookImageUrl(id: string): Promise<string>;
    createInstagramItem(url: string): Promise<string>;
    createInstagramCarousel(ids: string[], caption: string): Promise<string>;
    publishInstagramCarousel(id: string): Promise<string>;
    publishFacebookCarousel(ids: string[], caption: string): Promise<string>;
    waitForInstagramContainer(id: string): Promise<unknown>;
  };
  request(
    path: string,
    options: { method: 'GET' | 'POST'; params: Record<string, string | number> },
  ): Promise<Record<string, unknown>>;
  fetchImage?(url: string): Promise<Buffer>;
  saveState(state: MetaCheckpoint): Promise<void>;
  now?(): string;
}
export function executeMetaPlan(
  plan: MetaPlan,
  state: MetaCheckpoint,
  dependencies: WorkerDependencies,
): Promise<MetaCheckpoint>;
export function matchImagesInOrder(expected: Buffer[], actual: Buffer[]): Promise<boolean[]>;
