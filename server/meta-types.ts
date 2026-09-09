export interface MetaPlan {
  version: 1;
  campaignId: string;
  revision: number;
  fingerprint: string;
  kind: 'image' | 'carousel';
  caption: string;
  pageId: string;
  instagramBusinessId: string;
  images: { assetId: string; path: string; sourceSha256: string; stageSha256: string }[];
}
export interface MetaAttempt {
  key: string;
  status: 'attempting' | 'succeeded' | 'unknown';
  startedAt: string;
  id?: string;
}
export interface MetaCheckpoint {
  version: 1;
  fingerprint: string;
  attempts: MetaAttempt[];
  items: { photoId?: string; imageUrl?: string; containerId?: string }[];
  instagram: {
    containerId?: string;
    mediaId?: string;
    evidence?: {
      id: string;
      caption: string;
      mediaType: string;
      permalink: string;
      containerStatus: string;
      childIds: string[];
      imageChecks: { mediaId: string; stageSha256: string; matched: boolean }[];
    };
  };
  facebook: {
    postId?: string;
    evidence?: { id: string; message: string; isPublished: boolean; permalink: string; photoIds: string[] };
  };
}
export interface MetaWorkerRequest {
  mode: 'publish' | 'reconcile';
  plan: MetaPlan;
  planPath: string;
  statePath: string;
  metaBusinessDir: string;
}
export type MetaWorker = (request: MetaWorkerRequest) => Promise<MetaCheckpoint>;
