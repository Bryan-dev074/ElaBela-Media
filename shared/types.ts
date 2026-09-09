export type Language = 'es' | 'pt';
export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  priceText: string;
  currency: string;
  productUrl: string;
  thumbnailUrl: string;
  listedInStock: boolean;
  observedAt: string;
}
export interface Reference {
  id: string;
  url: string;
  title: string;
  assetId?: string;
  sourceUrl?: string;
}
export interface Trend {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  category: string;
  format: string;
  platform: string;
  evidence: 'recent' | 'annual' | 'editorial';
  sourceUrl: string;
  sourceName: string;
  observedAt: string;
  publishedAt?: string;
  region: string;
  productIds: string[];
  suggestedSlides: number;
  references: Reference[];
  visualStatus?: 'example' | 'context' | 'unavailable';
  visualReason?: string;
  saved: boolean;
  palette: string[];
  keywords: string[];
}
export interface SlideCopy {
  headline: string;
  body: string;
}
export interface CopyOption {
  id: string;
  title: string;
  slides: SlideCopy[];
  caption: string;
}
export interface Asset {
  id: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  campaignId?: string;
  role: 'reference' | 'generated' | 'imported';
}
export interface Variant {
  id: string;
  label: string;
  assetIds: (string | null)[];
}
export interface Publication {
  status: 'publishing' | 'partial' | 'verified' | 'unknown' | 'failed';
  fingerprint: string;
  instagramUrl?: string;
  facebookUrl?: string;
  message?: string;
  updatedAt: string;
}
export interface Campaign {
  id: string;
  title: string;
  trendId: string;
  referenceId?: string;
  productIds: string[];
  language: Language;
  slideCount: number;
  variantCount: number;
  copyOptions: CopyOption[];
  selectedCopyId: string | null;
  copyApproved: boolean;
  variants: Variant[];
  finalAssetIds: string[];
  approvedRevision: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publication?: Publication;
  codexRequest?: CodexGenerationRequest;
}
export interface CodexGenerationRequest {
  id: string;
  createdAt: string;
  status: 'ready' | 'partial' | 'completed' | 'cancelled';
  briefPath: string;
  manifestPath: string;
  instruction: string;
  contentHash: string;
  total: number;
  completed: number;
  targets: {
    variantId: string;
    slot: number;
    originalAssetId: string | null;
    assetId?: string;
    sha256?: string;
  }[];
}
export interface Job {
  id: string;
  campaignId?: string;
  type: 'generate' | 'search' | 'publish';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  total: number;
  completed: number;
  message: string;
  createdAt: string;
  updatedAt: string;
}
export interface ServiceStatus {
  connected: boolean;
  researchProvider?: 'codex' | 'api';
  researchReady?: boolean;
  generationProvider?: 'codex-chat' | 'api';
  generationConfigured: boolean;
  metaConfigured: boolean;
  catalogueCount: number;
  catalogueObservedAt: string | null;
  allowedOrigins: string[];
}
export interface Bootstrap {
  trends: Trend[];
  campaigns: Campaign[];
  assets: Asset[];
  jobs: Job[];
  status: ServiceStatus;
}
export interface CreateCampaign {
  title: string;
  trendId: string;
  referenceId?: string;
  productIds: string[];
  language: Language;
  slideCount: number;
  variantCount: number;
}
