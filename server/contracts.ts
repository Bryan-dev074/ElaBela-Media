import type { Campaign, Job, Trend } from '../shared/types.js';
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
    context: IntegrationContext<{ variantId?: string; slot?: number }>,
  ) => Promise<CampaignIntegrationResult>;
  publish?: (context: IntegrationContext<{ revision: number }>) => Promise<CampaignIntegrationResult>;
  reconcile?: (context: IntegrationContext<{ revision?: number }>) => Promise<CampaignIntegrationResult>;
  searchTrends?: (context: TrendSearchContext) => Promise<TrendSearchResult>;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
