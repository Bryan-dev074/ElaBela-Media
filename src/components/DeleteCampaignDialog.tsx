import { LoaderCircle, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Bootstrap, Campaign } from '../../shared/types';
import { request } from '../api';
import { Modal } from './ui';

export function DeleteCampaignDialog({
  campaign,
  trigger,
  fallbackFocusTo,
  onClose,
  onDeleted,
  onSync,
}: {
  campaign: Campaign;
  trigger: HTMLElement;
  fallbackFocusTo: HTMLElement | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onSync: (data: Bootstrap) => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const pending = campaign.codexRequest && ['ready', 'partial'].includes(campaign.codexRequest.status);

  async function remove() {
    if (submitting.current || needsReview) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await request(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: campaign.revision }),
        signal: AbortSignal.timeout(15000),
      });
      onDeleted(campaign.id);
    } catch (cause) {
      // Consultar un resultado incierto nunca vuelve a enviar la eliminación.
      try {
        const fresh = await request<Bootstrap>('/api/bootstrap', { signal: AbortSignal.timeout(8000) });
        onSync(fresh);
        const current = fresh.campaigns.find((item) => item.id === campaign.id);
        if (!current) {
          onDeleted(campaign.id);
          return;
        }
        setNeedsReview(current.revision !== campaign.revision);
        setError(
          cause instanceof Error ? cause.message : 'No se pudo eliminar la campaña. Volvé a intentarlo.',
        );
      } catch {
        setNeedsReview(true);
        setError(
          'No pudimos comprobar si se eliminó. Cerrá esta ventana y actualizá la página cuando vuelva la conexión.',
        );
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar campaña"
      description="Esta campaña dejará de aparecer en Mis campañas."
      returnFocusTo={trigger}
      fallbackFocusTo={fallbackFocusTo}
      initialFocusRef={cancel}
      dismissible={!busy}
    >
      <div className="delete-campaign-summary">
        <Trash2 size={22} aria-hidden="true" />
        <div>
          <strong>{campaign.title}</strong>
          <span>
            {campaign.slideCount} {campaign.slideCount === 1 ? 'pieza' : 'piezas'} · {campaign.variantCount}{' '}
            {campaign.variantCount === 1 ? 'propuesta' : 'propuestas'} ·{' '}
            {campaign.language === 'es' ? 'Español' : 'Português'}
          </span>
        </div>
      </div>
      <div className="delete-campaign-details">
        <p>
          Los archivos originales quedan guardados en esta PC. Esta acción no borra publicaciones de Instagram
          ni Facebook.
        </p>
        {pending && <p>El pedido pendiente de imágenes se cancelará y dejará de aceptar resultados.</p>}
        <p>Después no podrás abrir esta campaña desde la app.</p>
      </div>
      {error && (
        <p className="delete-campaign-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button ref={cancel} type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy || needsReview}
          onClick={() => void remove()}
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" aria-hidden="true" />
          ) : (
            <Trash2 size={17} aria-hidden="true" />
          )}
          {busy ? 'Eliminando…' : 'Eliminar campaña'}
        </button>
      </div>
      {busy && (
        <p className="sr-only" role="status">
          Eliminando la campaña. Conservando los originales.
        </p>
      )}
    </Modal>
  );
}
