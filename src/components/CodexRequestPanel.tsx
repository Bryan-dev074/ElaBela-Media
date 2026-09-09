import { Check, Copy, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Campaign, CodexGenerationRequest } from '../../shared/types';
import { Modal } from './ui';
import './codex-request.css';

export function CodexRequestPanel({
  open,
  campaign,
  request,
  busy,
  returnFocusTo,
  onClose,
  onCancel,
  onRefresh,
  onError,
}: {
  open: boolean;
  campaign: Campaign;
  request: CodexGenerationRequest;
  busy: boolean;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  onCancel: () => void;
  onRefresh: () => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const instruction = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const pending = request.status === 'ready' || request.status === 'partial';
  async function copyInstruction() {
    try {
      await navigator.clipboard.writeText(request.instruction);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
      instruction.current?.focus();
      instruction.current?.select();
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tu pedido para Codex"
      description={
        pending
          ? 'Copiá la instrucción en este chat de Codex para que preparemos las imágenes y las importemos a tu campaña.'
          : 'Consultá el estado del pedido y las piezas que se importaron a tu campaña.'
      }
      returnFocusTo={returnFocusTo}
      wide
    >
      <div className="codex-request-panel">
        <div className="codex-request-state">
          <strong>
            {request.status === 'cancelled'
              ? 'Pedido cancelado'
              : request.status === 'completed'
                ? 'Todas las imágenes del pedido están importadas'
                : 'Pendiente de generar en el chat'}
          </strong>
          <p role="status">
            {request.completed} de {request.total} imágenes importadas
          </p>
          <progress aria-label="Imágenes importadas" max={request.total || 1} value={request.completed} />
        </div>
        {request.status === 'cancelled' ? (
          <p>Este pedido dejó de aceptar imágenes. Las piezas ya importadas y sus originales se conservan.</p>
        ) : (
          <>
            <p>
              {pending
                ? 'El pedido está guardado en tu PC. Pegá la instrucción en el chat para iniciar la generación; las imágenes aparecerán acá cuando se importen.'
                : 'Revisá las piezas en las propuestas y elegí cuáles usar en el carrusel final.'}
            </p>
            <label className="field">
              Instrucción para pegar en el chat de Codex
              <textarea ref={instruction} value={request.instruction} rows={5} readOnly spellCheck={false} />
            </label>
            <div className="codex-request-copy">
              <button className="button" type="button" onClick={() => void copyInstruction()}>
                {copyState === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                {copyState === 'copied' ? 'Instrucción copiada' : 'Copiar instrucción'}
              </button>
              {copyState !== 'idle' && (
                <p className="help-text" role="status">
                  {copyState === 'copied'
                    ? 'Pegala en este chat de Codex para continuar.'
                    : 'No se pudo copiar. La instrucción está seleccionada: presioná Ctrl+C o usá Copiar en el menú del dispositivo.'}
                </p>
              )}
            </div>
          </>
        )}
        <details className="codex-request-targets">
          <summary>Ver destinos de las {request.total} imágenes</summary>
          <ul>
            {request.targets.map((target) => (
              <li key={`${target.variantId}-${target.slot}`}>
                <span>
                  {campaign.variants.find((variant) => variant.id === target.variantId)?.label || 'Propuesta'}{' '}
                  · Pieza {target.slot + 1}
                </span>
                <span>
                  {target.assetId ? 'Importada' : request.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                </span>
              </li>
            ))}
          </ul>
        </details>
        {pending && (
          <p className="help-text">
            Cancelar deja de aceptar imágenes de este pedido; no detiene una generación que ya empezaste en el
            chat.
          </p>
        )}
        <div className="modal-actions">
          {pending && (
            <button
              className="button secondary"
              type="button"
              onClick={onCancel}
              disabled={busy || refreshing}
            >
              Cancelar pedido
            </button>
          )}
          <button
            className="button secondary"
            type="button"
            disabled={busy || refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
              } catch (error) {
                onError((error as Error).message);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Consultando importaciones…' : 'Actualizar importaciones'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
