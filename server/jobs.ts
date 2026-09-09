import type { Store } from './store.js';

/** A restart never replays a remote mutation. Unfinished publication requires GET reconciliation. */
export async function recoverInterruptedJobs(store: Store): Promise<void> {
  const state = await store.bootstrap();
  for (const job of state.jobs.filter((item) => item.status === 'queued' || item.status === 'running')) {
    await store.upsertJob({
      ...job,
      status: 'interrupted',
      updatedAt: new Date().toISOString(),
      message:
        job.type === 'publish'
          ? 'El servicio se cerró durante la publicación. Consultá el estado antes de cualquier nuevo envío.'
          : 'El servicio se cerró antes de terminar. Los archivos completados siguen guardados; no se reintentó automáticamente.',
    });
    if (job.type === 'publish' && job.campaignId) {
      const campaign = store.getCampaign(job.campaignId);
      if (campaign.publication?.status === 'publishing')
        await store.saveCampaign({
          ...campaign,
          publication: {
            ...campaign.publication,
            status: 'unknown',
            updatedAt: new Date().toISOString(),
            message: 'El proceso se interrumpió. Hace falta conciliar con Meta mediante consultas de estado.',
          },
        });
    }
  }
}
