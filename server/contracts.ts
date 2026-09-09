import { createHash } from 'node:crypto';
import type { Campaign, CodexGenerationRequest, Job, Trend } from '../shared/types.js';
import type { Store } from './store.js';

export interface IntegrationContext<TPayload = unknown> {
  campaign: Campaign;
  payload: TPayload;
  store: Store;
}

export interface TrendSearchContext {
  query: string;
  category?: string;
  store: Store;
}

export interface CampaignIntegrationResult {
  campaign: Campaign;
  job?: Job;
}

export interface TrendSearchResult {
  trends: Trend[];
  job?: Job;
}

export interface Integrations {
  copy?: (context: IntegrationContext<Record<string, unknown>>) => Promise<CampaignIntegrationResult>;
  generate?: (
    context: IntegrationContext<{ revision?: number; variantId?: string; slot?: number }>,
  ) => Promise<CampaignIntegrationResult>;
  publish?: (context: IntegrationContext<{ revision: number }>) => Promise<CampaignIntegrationResult>;
  reconcile?: (context: IntegrationContext<{ revision?: number }>) => Promise<CampaignIntegrationResult>;
  searchTrends?: (context: TrendSearchContext) => Promise<TrendSearchResult>;
}

export function generationProvider(): 'codex-chat' | 'api' {
  return process.env.ELABELA_GENERATION_PROVIDER === 'api' ? 'api' : 'codex-chat';
}

export function pendingCodexRequest(request: CodexGenerationRequest | undefined): boolean {
  return request?.status === 'ready' || request?.status === 'partial';
}

export function codexContentHash(campaign: Campaign): string {
  const copy = campaign.copyOptions.find((option) => option.id === campaign.selectedCopyId);
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: campaign.title,
        trendId: campaign.trendId,
        referenceId: campaign.referenceId ?? null,
        productIds: campaign.productIds,
        language: campaign.language,
        slideCount: campaign.slideCount,
        variantCount: campaign.variantCount,
        variantIds: campaign.variants.map((variant) => variant.id),
        copyId: campaign.selectedCopyId,
        slides: copy?.slides,
      }),
    )
    .digest('hex');
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
