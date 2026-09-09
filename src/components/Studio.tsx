import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  ZoomIn,
} from 'lucide-react';
import type { DragEvent } from 'react';
import { useRef, useState } from 'react';
import { addToFinal, moveFinal, replaceFinal } from '../../shared/composition';
import type { Asset, Bootstrap, Campaign, CopyOption, Job, ServiceStatus, Trend } from '../../shared/types';
import { post, request } from '../api';
import { CodexRequestPanel } from './CodexRequestPanel';
import { AssetImage, AssetViewer, Modal, ReferenceImage } from './ui';

type Step = 'copy' | 'variants' | 'review';
interface Props {
  campaign: Campaign;
  assets: Asset[];
  trends: Trend[];
  jobs: Job[];
  status: ServiceStatus;
  onUpdate: (campaign: Campaign) => void;
  onRefresh: () => Promise<Bootstrap>;
  onError: (message: string) => void;
  onBack: () => void;
}
interface DropData {
  assetId: string;
  from?: number;
}
const dragType = 'application/x-elabela-asset';
interface CopyDraft {
  baseRevision: number;
  options: CopyOption[];
  selected: string;
}
const draftKey = (id: string) => `elabela-copy-draft:${id}`;
function readDraft(campaign: Campaign): CopyDraft | undefined {
  try {
    const draft = JSON.parse(
      sessionStorage.getItem(draftKey(campaign.id)) || 'null',
    ) as Partial<CopyDraft> | null;
    if (
      draft &&
      Number.isInteger(draft.baseRevision) &&
      typeof draft.selected === 'string' &&
      Array.isArray(draft.options) &&
      draft.options.every(
        (option) =>
          option &&
          typeof option.id === 'string' &&
          typeof option.caption === 'string' &&
          Array.isArray(option.slides),
      )
    )
      return draft as CopyDraft;
  } catch {
    /* A broken browser draft must not replace campaign data. */
  }
}

export default function Studio({
  campaign,
  assets,
  trends,
  jobs,
  status,
  onUpdate,
  onRefresh,
  onError,
  onBack,
}: Props) {
  const [step, setStep] = useState<Step>(campaign.copyApproved ? 'variants' : 'copy');
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<Asset>();
  const [replace, setReplace] = useState<string>();
  const [publishOpen, setPublishOpen] = useState(false);
  const [codexRequestOpen, setCodexRequestOpen] = useState(false);
  const codexRequestTrigger = useRef<HTMLElement | null>(null);
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [draft, setDraft] = useState<CopyDraft | undefined>(() => readDraft(campaign));
  const [savingCopy, setSavingCopy] = useState(false);
  const copySaveInFlight = useRef(false);
  const currentDraft = useRef(draft);
  const [importTarget, setImportTarget] = useState<{ variantId: string; slot: number }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const trend = trends.find((item) => item.id === campaign.trendId);
  const selectedCopy = campaign.copyOptions.find((copy) => copy.id === campaign.selectedCopyId);
  const generatedCount = campaign.variants.flatMap((variant) => variant.assetIds).filter(Boolean).length;
  const codexChat = status.generationProvider === 'codex-chat';
  const codexRequest = campaign.codexRequest;
  const pendingCodexRequest =
    codexRequest && ['ready', 'partial'].includes(codexRequest.status) ? codexRequest : undefined;
  const missingImages = campaign.variants.some((variant) => variant.assetIds.some((id) => !id));
  const reopenCodexRequest =
    !!pendingCodexRequest || (codexRequest?.status === 'completed' && !missingImages);
  const activeJob = jobs.find(
    (job) => job.campaignId === campaign.id && ['queued', 'running'].includes(job.status),
  );
  const lastJob = [...jobs].reverse().find((job) => job.campaignId === campaign.id);
  const locked =
    busy ||
    savingCopy ||
    !!activeJob ||
    ['publishing', 'unknown', 'partial', 'verified'].includes(campaign.publication?.status || '');
  const publicationLocked = locked || !!pendingCodexRequest;
  function changeDraft(next: CopyDraft | undefined) {
    currentDraft.current = next;
    setDraft(next);
    setConfirmedRevision(null);
    try {
      if (next) sessionStorage.setItem(draftKey(campaign.id), JSON.stringify(next));
      else sessionStorage.removeItem(draftKey(campaign.id));
    } catch {
      onError(
        'El navegador no pudo conservar el borrador. Guardalo en la PC antes de salir de esta pantalla.',
      );
    }
  }
  async function saveCopy(value: Campaign, advance: boolean) {
    if (locked || copySaveInFlight.current) return;
    copySaveInFlight.current = true;
    setSavingCopy(true);
    const submittedDraft = currentDraft.current;
    try {
      const saved = await request<Campaign>(`/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        body: JSON.stringify(value),
      });
      onUpdate(saved);
      await onRefresh();
      // Another Studio instance may have edited the browser draft while this request was pending.
      if (
        submittedDraft &&
        currentDraft.current === submittedDraft &&
        sessionStorage.getItem(draftKey(campaign.id)) === JSON.stringify(submittedDraft)
      ) {
        changeDraft(undefined);
      }
      if (advance) setStep('variants');
    } finally {
      copySaveInFlight.current = false;
      setSavingCopy(false);
    }
  }
  async function perform(action: () => Promise<Campaign | undefined>) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await action();
      if (next) onUpdate(next);
      await onRefresh();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveFinal(finalAssetIds: string[]) {
    if (locked) return;
    void perform(() =>
      request<Campaign>(`/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...campaign, finalAssetIds }),
      }),
    );
  }
  function chooseImage(assetId: string) {
    if (campaign.finalAssetIds.length >= campaign.slideCount) setReplace(assetId);
    else saveFinal(addToFinal(campaign.finalAssetIds, assetId, campaign.slideCount));
  }
  function startDrag(event: DragEvent, assetId: string, from?: number) {
    if (locked) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(dragType, JSON.stringify({ assetId, from }));
    event.dataTransfer.effectAllowed = from === undefined ? 'copy' : 'move';
  }
  function drop(event: DragEvent, index?: number) {
    event.preventDefault();
    event.stopPropagation();
    if (locked) return;
    try {
      const payload = JSON.parse(event.dataTransfer.getData(dragType)) as DropData;
      if (!assets.some((asset) => asset.id === payload.assetId && asset.campaignId === campaign.id)) return;
      if (payload.from !== undefined && index !== undefined && index < campaign.finalAssetIds.length)
        saveFinal(moveFinal(campaign.finalAssetIds, payload.from, index));
      else if (index !== undefined && index < campaign.finalAssetIds.length)
        saveFinal(replaceFinal(campaign.finalAssetIds, payload.assetId, index));
      else if (payload.from === undefined) chooseImage(payload.assetId);
    } catch {
      onError('No se pudo mover esta imagen. Podés usar los botones de cada pieza.');
    }
  }
  function generate(variantId?: string, slot?: number) {
    if (locked) return;
    if (codexChat && pendingCodexRequest) {
      openCodexRequest();
      return;
    }
    if (draft) {
      onError('Guardá o descartá el borrador de textos antes de generar.');
      return;
    }
    if (codexChat && document.activeElement instanceof HTMLElement) {
      codexRequestTrigger.current = document.activeElement;
    }
    void perform(async () => {
      const result = await post<{ campaign: Campaign }>(`/api/campaigns/${campaign.id}/generate`, {
        revision: campaign.revision,
        variantId,
        slot,
      });
      setStep('variants');
      if (codexChat) setCodexRequestOpen(true);
      return result.campaign;
    });
  }
  function openCodexRequest() {
    if (document.activeElement instanceof HTMLElement) codexRequestTrigger.current = document.activeElement;
    setCodexRequestOpen(true);
  }
  function openAsset(id: string) {
    setViewer(assets.find((asset) => asset.id === id));
  }
  return (
    <>
      <div className="studio-breadcrumb">
        <button type="button" className="text-button" onClick={onBack}>
          <ArrowLeft size={16} />
          Mis campañas
        </button>
        <span>/</span>
        <span>{trend?.title}</span>
      </div>
      <div className="page-intro studio-intro">
        <div>
          <div className="eyebrow">Tu estudio creativo</div>
          <h1>{campaign.title}</h1>
          <p>
            {campaign.slideCount} {campaign.slideCount === 1 ? 'pieza' : 'piezas'} por propuesta{' '}
            <span>·</span> {campaign.variantCount} propuestas <span>·</span>{' '}
            {campaign.language === 'es' ? 'Español' : 'Português do Brasil'} <span>·</span> Formato 4:5
          </p>
        </div>
        <span className="autosave">
          <CheckCheck size={15} />
          {busy || savingCopy
            ? 'Guardando…'
            : draft
              ? 'Borrador en navegador · pendiente de guardar en PC'
              : 'Guardado en tu PC'}
        </span>
      </div>
      <nav className="studio-steps" aria-label="Etapas de campaña">
        {(
          [
            { id: 'copy', label: 'Elegí los textos', done: campaign.copyApproved },
            {
              id: 'variants',
              label: 'Creá y combiná',
              done: campaign.finalAssetIds.length === campaign.slideCount,
            },
            { id: 'review', label: 'Revisá y publicá', done: campaign.publication?.status === 'verified' },
          ] as const
        ).map((item, index) => (
          <button
            key={item.id}
            className={step === item.id ? 'active' : ''}
            type="button"
            onClick={() => setStep(item.id)}
            disabled={item.id !== 'copy' && !campaign.copyApproved}
            aria-current={step === item.id ? 'step' : undefined}
          >
            <span>{item.done ? <Check size={14} /> : `0${index + 1}`}</span>
            {item.label}
            <ChevronRight size={15} />
          </button>
        ))}
      </nav>
      {draft && step !== 'copy' && (
        <div className="inline-notice" role="status">
          Tenés un borrador de textos pendiente de guardar en la PC. Revisalo antes de generar o publicar.
          <button className="text-button" type="button" onClick={() => setStep('copy')}>
            Volver al borrador
          </button>
        </div>
      )}
      {activeJob && (
        <div className="job-progress" role="status">
          <LoaderCircle className="spin" size={19} />
          <div>
            <strong>{activeJob.message}</strong>
            <progress max={activeJob.total || 1} value={activeJob.completed} />
          </div>
          <span>
            {activeJob.completed}/{activeJob.total}
          </span>
        </div>
      )}
      {!activeJob && lastJob && ['failed', 'interrupted'].includes(lastJob.status) && (
        <div className="inline-notice">{lastJob.message} Las piezas terminadas se conservan.</div>
      )}
      {campaign.publication && (
        <div className={`publication-status ${campaign.publication.status === 'verified' ? 'success' : ''}`}>
          <strong>
            {campaign.publication.status === 'verified'
              ? 'Publicación verificada'
              : campaign.publication.status === 'unknown'
                ? 'Resultado por conciliar'
                : campaign.publication.status === 'partial'
                  ? 'Publicación parcial'
                  : campaign.publication.status === 'publishing'
                    ? 'Publicando tu campaña…'
                    : 'No se completó la publicación'}
          </strong>
          <p>{campaign.publication.message}</p>
          <div>
            {campaign.publication.instagramUrl && (
              <a href={campaign.publication.instagramUrl} target="_blank" rel="noreferrer">
                Ver en Instagram
                <ExternalLink size={14} />
              </a>
            )}
            {campaign.publication.facebookUrl && (
              <a href={campaign.publication.facebookUrl} target="_blank" rel="noreferrer">
                Ver en Facebook
                <ExternalLink size={14} />
              </a>
            )}
          </div>
          {['unknown', 'partial'].includes(campaign.publication.status) && (
            <>
              <p>Consultá el resultado en Meta. Esta acción no vuelve a enviar la publicación.</p>
              <button
                className="button secondary"
                type="button"
                disabled={busy || !!activeJob}
                onClick={() =>
                  void perform(
                    async () =>
                      (
                        await post<{ campaign: Campaign }>(`/api/campaigns/${campaign.id}/reconcile`, {
                          revision: campaign.revision,
                        })
                      ).campaign,
                  )
                }
              >
                <RefreshCw size={16} />
                {busy ? 'Consultando…' : 'Consultar estado en Meta'}
              </button>
            </>
          )}
        </div>
      )}
      {step === 'copy' && (
        <>
          {pendingCodexRequest && (
            <div className="inline-notice">
              <span>
                El pedido de Codex conserva los textos de las imágenes. Para cambiarlos, cancelá el pedido;
                podés seguir editando la descripción del post.
              </span>
              <button className="text-button" type="button" onClick={openCodexRequest}>
                Ver pedido de Codex
              </button>
            </div>
          )}
          <CopyEditor
            key={campaign.id}
            campaign={campaign}
            hasImages={generatedCount > 0 || !!pendingCodexRequest}
            locked={locked}
            saving={savingCopy}
            draft={draft}
            onDraftChange={changeDraft}
            onSave={saveCopy}
            onOptions={() =>
              void perform(async () => {
                const result = await post<{ campaign: Campaign }>(`/api/campaigns/${campaign.id}/copy`);
                return result.campaign;
              })
            }
            onError={onError}
          />
        </>
      )}
      {step === 'variants' && (
        <>
          <div className="studio-context">
            <div className="context-reference">
              <ReferenceImage
                reference={trend?.references.find((reference) => reference.id === campaign.referenceId)}
                alt="Referencia de la campaña"
              />
            </div>
            <div>
              <span className="eyebrow">La dirección creativa</span>
              <h2>{trend?.title}</h2>
              <p>
                {selectedCopy?.title} · {campaign.productIds.length} productos seleccionados
              </p>
            </div>
            <button className="text-button" type="button" onClick={() => setStep('copy')}>
              Ver textos
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="section-heading">
            <div>
              <h2>Tres formas de contar tu idea.</h2>
              <p>Elegí una propuesta completa o llevá tus piezas favoritas al carrusel final.</p>
            </div>
            <div className="codex-request-actions">
              {codexChat && codexRequest && !reopenCodexRequest && (
                <button className="text-button" type="button" onClick={openCodexRequest}>
                  Ver último pedido de Codex
                </button>
              )}
              <button
                type="button"
                className="button"
                disabled={
                  locked ||
                  (!codexChat && (!status.generationConfigured || generatedCount > 0)) ||
                  (codexChat && !missingImages && !reopenCodexRequest)
                }
                onClick={() => (codexChat && reopenCodexRequest ? openCodexRequest() : generate())}
              >
                <WandSparkles size={17} />
                {codexChat
                  ? reopenCodexRequest
                    ? 'Ver pedido de Codex'
                    : generatedCount > 0
                      ? 'Preparar piezas pendientes en Codex'
                      : `Preparar ${campaign.variantCount} propuestas en Codex`
                  : `Generar ${campaign.variantCount} propuestas`}
              </button>
            </div>
          </div>
          {codexChat && (
            <div className="inline-notice codex-request-notice">
              <div>
                <strong>
                  {pendingCodexRequest
                    ? 'Pendiente de generar en el chat'
                    : 'Imágenes desde el chat de Codex'}
                </strong>
                <p>
                  {pendingCodexRequest
                    ? `${pendingCodexRequest.completed} de ${pendingCodexRequest.total} imágenes importadas. Podés seguir combinando las piezas disponibles.`
                    : 'Prepará el pedido, pegá la instrucción en este chat y revisá las imágenes cuando se importen.'}
                </p>
              </div>
            </div>
          )}
          {!codexChat && !status.generationConfigured && (
            <div className="inline-notice">
              <Sparkles size={18} />
              <span>
                La generación desde la página se habilita al configurar el proveedor en esta PC. También podés
                importar las imágenes que preparemos aquí en Codex.
              </span>
            </div>
          )}
          <div className="variant-list">
            {campaign.variants.map((variant, variantIndex) => (
              <section className="variant-row" key={variant.id}>
                <div className="variant-heading">
                  <div>
                    <span className="variant-letter">{String.fromCharCode(65 + variantIndex)}</span>
                    <div>
                      <h3>{variant.label}</h3>
                      <span>
                        {['Editorial y delicada', 'Cercana y expresiva', 'Visual y atrevida'][variantIndex] ||
                          'Otra mirada de la misma idea'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={locked || variant.assetIds.some((id) => !id)}
                    onClick={() => saveFinal(variant.assetIds.filter((id): id is string => !!id))}
                  >
                    <Copy size={14} />
                    Usar propuesta completa
                  </button>
                </div>
                <div className="slide-strip">
                  {variant.assetIds.map((assetId, slot) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Fixed numbered slots retain identity when their image is replaced.
                    <div className="proposal-piece" key={`${variant.id}-${slot + 1}`}>
                      <div className="piece-number">
                        {String(slot + 1).padStart(2, '0')}
                        <span>
                          {slot === 0
                            ? 'Apertura'
                            : slot === campaign.slideCount - 1
                              ? 'Cierre'
                              : 'Desarrollo'}
                        </span>
                      </div>
                      {assetId ? (
                        <>
                          <fieldset
                            className="piece-image"
                            aria-label={`${variant.label}, pieza ${slot + 1}`}
                            draggable={!locked}
                            onDragStart={(event) => startDrag(event, assetId)}
                          >
                            <AssetImage id={assetId} alt={`${variant.label}, pieza ${slot + 1}`} />
                            <button
                              type="button"
                              className="zoom-button"
                              onClick={() => openAsset(assetId)}
                              aria-label={`Ampliar ${variant.label}, pieza ${slot + 1}`}
                            >
                              <ZoomIn size={17} />
                            </button>
                            <span className="drag-hint">
                              <GripVertical size={14} />
                              Arrastrar
                            </span>
                          </fieldset>
                          <div className="piece-actions">
                            <button
                              type="button"
                              className="button secondary small"
                              disabled={locked}
                              onClick={() => chooseImage(assetId)}
                            >
                              <Plus size={14} />
                              Usar
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              disabled={locked || (!codexChat && !status.generationConfigured)}
                              onClick={() => generate(variant.id, slot)}
                              aria-label={
                                codexChat
                                  ? `Preparar reemplazo en Codex para ${variant.label}, pieza ${slot + 1}`
                                  : `Regenerar ${variant.label}, pieza ${slot + 1}`
                              }
                            >
                              <RefreshCw size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              disabled={locked}
                              onClick={() => {
                                setImportTarget({ variantId: variant.id, slot });
                                fileInput.current?.click();
                              }}
                              aria-label={`Importar reemplazo para ${variant.label}, pieza ${slot + 1}`}
                            >
                              <Upload size={16} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            className="empty-piece"
                            type="button"
                            disabled={locked}
                            onClick={() => {
                              setImportTarget({ variantId: variant.id, slot });
                              fileInput.current?.click();
                            }}
                            aria-label={`Importar ${variant.label}, pieza ${slot + 1}`}
                          >
                            <ImagePlus size={27} />
                            <strong>Tu imagen va acá</strong>
                            <span>Importar original 4:5</span>
                          </button>
                          <button
                            className="text-button generate-one"
                            type="button"
                            disabled={locked || (!codexChat && !status.generationConfigured)}
                            onClick={() => generate(variant.id, slot)}
                          >
                            <Sparkles size={13} />
                            {codexChat ? 'Preparar esta pieza en Codex' : 'Generar esta pieza'}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <input
            ref={fileInput}
            type="file"
            aria-label="Importar imagen de la propuesta"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && importTarget) {
                const target = importTarget;
                void perform(async () => {
                  const form = new FormData();
                  const requestedTarget = pendingCodexRequest?.targets.find(
                    (item) =>
                      item.variantId === target.variantId && item.slot === target.slot && !item.assetId,
                  );
                  if (requestedTarget && pendingCodexRequest)
                    form.append('requestId', pendingCodexRequest.id);
                  form.append('variantId', target.variantId);
                  form.append('slot', String(target.slot));
                  form.append('file', file);
                  const result = await request<{ campaign: Campaign }>(
                    `/api/campaigns/${campaign.id}/${requestedTarget ? 'codex-assets' : 'assets'}`,
                    { method: 'POST', body: form },
                  );
                  return result.campaign;
                });
              }
              event.target.value = '';
            }}
          />
        </>
      )}
      {(step === 'variants' || step === 'review') && (
        <section
          className={`final-composer ${step === 'review' ? 'review-composer' : ''}`}
          aria-label="Carrusel final"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">La combinación es tuya</span>
              <h2>
                {campaign.slideCount === 1 ? 'Tu imagen final' : 'Tu carrusel final'}
                <span className="count-badge">
                  {campaign.finalAssetIds.length}/{campaign.slideCount}
                </span>
              </h2>
              <p>
                {step === 'review'
                  ? 'Revisá el orden, cada texto y la identidad de los productos antes de publicar.'
                  : 'Arrastrá una imagen hasta acá. Soltala sobre otra para reemplazarla.'}
              </p>
            </div>
            {step === 'variants' && (
              <button
                className="button"
                type="button"
                disabled={locked || campaign.finalAssetIds.length !== campaign.slideCount}
                onClick={() => {
                  setStep('review');
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}
              >
                Revisar publicación
                <ArrowRight size={17} />
              </button>
            )}
          </div>
          <fieldset
            className="final-strip"
            aria-label="Orden del carrusel"
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(dragType)) event.preventDefault();
            }}
            onDrop={(event) => drop(event)}
          >
            {Array.from({ length: campaign.slideCount }, (_, index) => {
              const id = campaign.finalAssetIds[index];
              return (
                <fieldset
                  className={`final-slot ${id ? 'filled' : ''}`}
                  aria-label={`Posición final ${index + 1}`}
                  // biome-ignore lint/suspicious/noArrayIndexKey: Fixed numbered destinations retain identity when assets move.
                  key={`final-${index + 1}`}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(dragType)) event.preventDefault();
                  }}
                  onDrop={(event) => drop(event, index)}
                >
                  {id ? (
                    <>
                      <fieldset
                        className="piece-image"
                        aria-label={`Imagen final ${index + 1}`}
                        draggable={!locked}
                        onDragStart={(event) => startDrag(event, id, index)}
                      >
                        <AssetImage id={id} alt={`Carrusel final, pieza ${index + 1}`} />
                        <button
                          className="zoom-button"
                          type="button"
                          aria-label={`Ampliar pieza final ${index + 1}`}
                          onClick={() => openAsset(id)}
                        >
                          <ZoomIn size={17} />
                        </button>
                        <span className="final-position">{index + 1}</span>
                      </fieldset>
                      <div className="final-controls">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Mover pieza ${index + 1} a la izquierda`}
                          disabled={locked || index === 0}
                          onClick={() => saveFinal(moveFinal(campaign.finalAssetIds, index, index - 1))}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Quitar pieza final ${index + 1}`}
                          disabled={locked}
                          onClick={() =>
                            saveFinal(campaign.finalAssetIds.filter((_, slot) => slot !== index))
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Mover pieza ${index + 1} a la derecha`}
                          disabled={locked || index === campaign.finalAssetIds.length - 1}
                          onClick={() => saveFinal(moveFinal(campaign.finalAssetIds, index, index + 1))}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="final-empty">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <Plus size={22} />
                      <p>
                        Arrastrá tu favorita
                        <br />o tocá «Usar»
                      </p>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </fieldset>
          <div className="composer-footer">
            <Layers3 size={15} />
            <span>
              Las tres propuestas originales se conservan. Podés cambiar tu selección cuando quieras.
            </span>
          </div>
        </section>
      )}
      {step === 'review' && (
        <div className="review-bottom">
          <section className="caption-preview">
            <span className="eyebrow">
              Descripción del post · {campaign.language === 'es' ? 'ES' : 'PT-BR'}
            </span>
            <h2>Las palabras que acompañan.</h2>
            <p className="caption-text">{selectedCopy?.caption}</p>
            <button type="button" className="text-button" onClick={() => setStep('copy')}>
              Revisar los textos
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="publish-panel">
            <Send size={23} />
            <h2>Listo para compartir.</h2>
            <p>Se publicará en Instagram y Facebook con el orden y la descripción que ves acá.</p>
            <div className="publish-destinations">
              <span>Instagram</span>
              <span>Facebook</span>
            </div>
            <button
              type="button"
              className="button"
              disabled={
                publicationLocked ||
                !!draft ||
                campaign.finalAssetIds.length !== campaign.slideCount ||
                !status.metaConfigured
              }
              onClick={() => {
                setConfirmedRevision(null);
                setPublishOpen(true);
              }}
            >
              <Send size={16} />
              Revisar y publicar
            </button>
            {pendingCodexRequest && (
              <>
                <p className="help-text">Completá o cancelá el pedido de Codex antes de publicar.</p>
                <button className="text-button" type="button" onClick={openCodexRequest}>
                  Ver pedido de Codex
                </button>
              </>
            )}
            {!status.metaConfigured && <p className="help-text">Primero conectá MetaBusiness en esta PC.</p>}
          </section>
        </div>
      )}
      <AssetViewer asset={viewer} onClose={() => setViewer(undefined)} />
      {codexRequest && (
        <CodexRequestPanel
          key={codexRequest.id}
          open={codexRequestOpen}
          campaign={campaign}
          request={codexRequest}
          busy={locked}
          returnFocusTo={codexRequestTrigger.current}
          onClose={() => setCodexRequestOpen(false)}
          onCancel={() => {
            if (locked) return;
            void perform(
              async () =>
                (
                  await request<{ campaign: Campaign }>(`/api/campaigns/${campaign.id}/codex-request`, {
                    method: 'DELETE',
                    body: JSON.stringify({ requestId: codexRequest.id }),
                  })
                ).campaign,
            );
          }}
          onRefresh={onRefresh}
          onError={onError}
        />
      )}
      <Modal
        open={!!replace}
        onClose={() => setReplace(undefined)}
        title="Elegí qué pieza reemplazar"
        description="El carrusel ya está completo. Tu nueva elección reemplazará solo esta posición."
      >
        <div className="replace-grid">
          {campaign.finalAssetIds.map((id, index) => (
            <button
              type="button"
              // biome-ignore lint/suspicious/noArrayIndexKey: Selection targets a numbered destination; repeated images are allowed.
              key={`replace-${index + 1}`}
              onClick={() => {
                if (replace) saveFinal(replaceFinal(campaign.finalAssetIds, replace, index));
                setReplace(undefined);
              }}
            >
              <AssetImage id={id} alt={`Pieza ${index + 1}`} />
              <span>Reemplazar {index + 1}</span>
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={publishOpen}
        onClose={() => {
          if (!busy) setPublishOpen(false);
        }}
        title="Tu publicación, tal como la elegiste"
        description={`${campaign.slideCount} ${campaign.slideCount === 1 ? 'imagen' : 'imágenes'} · Instagram + Facebook · ${campaign.language === 'es' ? 'Español' : 'Português'}`}
        wide
      >
        <div className="publish-preview">
          {campaign.finalAssetIds.map((id, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: This immutable confirmation view displays the approved numbered order.
            <figure key={`publish-${index + 1}`}>
              <AssetImage id={id} alt={`Publicar, pieza ${index + 1}`} />
              <figcaption>{index + 1}</figcaption>
            </figure>
          ))}
        </div>
        <section
          className="caption-text confirmation-caption"
          aria-label="Descripción final de la publicación"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable caption needs keyboard focus for WCAG 2.1.1; verified with axe.
          tabIndex={0}
        >
          {selectedCopy?.caption}
        </section>
        <label className="check-field">
          <input
            type="checkbox"
            disabled={!!draft || !!pendingCodexRequest}
            checked={!draft && confirmedRevision === campaign.revision}
            onChange={(event) => setConfirmedRevision(event.target.checked ? campaign.revision : null)}
          />
          Revisé el orden, los textos, el logo y los productos. Quiero publicar esta versión en ambas redes.
        </label>
        {confirmedRevision !== null && confirmedRevision !== campaign.revision && (
          <p className="inline-notice" role="status">
            La campaña cambió. Revisá esta versión y confirmala otra vez antes de publicar.
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setPublishOpen(false)}
            disabled={busy}
          >
            Seguir revisando
          </button>
          <button
            type="button"
            className="button"
            disabled={!!draft || confirmedRevision !== campaign.revision || publicationLocked}
            onClick={() => {
              if (draft || confirmedRevision !== campaign.revision || publicationLocked) return;
              const revision = confirmedRevision;
              void perform(async () => {
                const approved = await post<Campaign>(`/api/campaigns/${campaign.id}/approve`, {
                  revision,
                });
                onUpdate(approved);
                const result = await post<{ campaign: Campaign }>(`/api/campaigns/${campaign.id}/publish`, {
                  revision: approved.revision,
                });
                setPublishOpen(false);
                return result.campaign;
              });
            }}
          >
            {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}Publicar ahora
          </button>
        </div>
      </Modal>
    </>
  );
}

function CopyEditor({
  campaign,
  hasImages,
  locked,
  saving,
  draft,
  onDraftChange,
  onSave,
  onOptions,
  onError,
}: {
  campaign: Campaign;
  hasImages: boolean;
  locked: boolean;
  saving: boolean;
  draft: CopyDraft | undefined;
  onDraftChange: (draft: CopyDraft | undefined) => void;
  onSave: (campaign: Campaign, advance: boolean) => Promise<void>;
  onOptions: () => void;
  onError: (message: string) => void;
}) {
  const options = draft?.options ?? campaign.copyOptions;
  const selected = draft?.selected ?? campaign.selectedCopyId ?? campaign.copyOptions[0]?.id ?? '';
  const dirty = !!draft;
  const stale = !!draft && draft.baseRevision !== campaign.revision;
  const option = options.find((item) => item.id === selected);
  function edit(next: CopyOption) {
    onDraftChange({
      baseRevision: draft?.baseRevision ?? campaign.revision,
      selected,
      options: options.map((item) => (item.id === next.id ? next : item)),
    });
  }
  function save(advance: boolean) {
    if (locked || saving || stale) return;
    void onSave(
      {
        ...campaign,
        revision: draft?.baseRevision ?? campaign.revision,
        copyOptions: options,
        selectedCopyId: selected,
        copyApproved: advance,
      },
      advance,
    ).catch((error) => onError((error as Error).message));
  }
  return (
    <div className="copy-editor">
      {stale && (
        <div className="inline-notice" role="status">
          <div>
            <p>
              La campaña cambió en la PC. Tu borrador se conserva, pero no puede reemplazar la versión nueva
              sin revisarla.
            </p>
            <details>
              <summary>Ver el texto guardado en la PC</summary>
              <p className="caption-text">
                {campaign.copyOptions.find((item) => item.id === campaign.selectedCopyId)?.caption}
              </p>
            </details>
            <button
              className="text-button"
              type="button"
              disabled={locked || saving}
              onClick={() => onDraftChange(undefined)}
            >
              Descartar mi borrador y usar la versión de la PC
            </button>
          </div>
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>Primero, encontrá las palabras.</h2>
          <p>Elegí una dirección de texto y ajustá los titulares o la descripción a tu gusto.</p>
        </div>
        {options.length > 0 && (
          <button
            className="text-button"
            type="button"
            disabled={locked || hasImages || dirty}
            onClick={onOptions}
          >
            <RefreshCw size={15} />
            Preparar otras opciones
          </button>
        )}
      </div>
      {options.length === 0 ? (
        <div className="copy-empty">
          <div className="copy-empty-icon">
            <Sparkles size={30} />
          </div>
          <h3>
            Tu idea ya tiene una dirección.
            <br />
            Ahora vamos a darle voz.
          </h3>
          <p>
            Preparamos tres opciones con textos para cada pieza y una descripción del post, en{' '}
            {campaign.language === 'es' ? 'español' : 'portugués'}.
          </p>
          <button type="button" className="button" disabled={locked} onClick={onOptions}>
            <Sparkles size={17} />
            Preparar opciones de texto
          </button>
        </div>
      ) : (
        <>
          <fieldset className="copy-options" aria-label="Opciones de texto">
            {options.map((item, index) => (
              <button
                className={`copy-choice ${item.id === selected ? 'selected' : ''}`}
                key={item.id}
                type="button"
                aria-pressed={item.id === selected}
                disabled={locked || hasImages || saving}
                onClick={() => {
                  onDraftChange({
                    baseRevision: draft?.baseRevision ?? campaign.revision,
                    options,
                    selected: item.id,
                  });
                }}
              >
                <span className="copy-choice-index">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.slides[0]?.headline}</p>
                <span className="choice-status">
                  {item.id === selected ? (
                    <>
                      <Check size={15} />
                      Seleccionada
                    </>
                  ) : (
                    'Elegir esta dirección'
                  )}
                </span>
              </button>
            ))}
          </fieldset>
          {option && (
            <>
              <div className="text-workspace">
                <section>
                  <div className="section-kicker">
                    <span>Texto dentro de las imágenes</span>
                    <span>{campaign.slideCount} piezas</span>
                  </div>
                  {option.slides.map((slide, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Text editors belong to fixed slide positions and never reorder.
                    <div className="slide-copy" key={`text-${index + 1}`}>
                      <span className="slide-copy-index">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <label className="field">
                          Titular · pieza {index + 1}
                          <input
                            value={slide.headline}
                            disabled={locked || hasImages || saving}
                            onChange={(event) =>
                              edit({
                                ...option,
                                slides: option.slides.map((item, slot) =>
                                  slot === index ? { ...item, headline: event.target.value } : item,
                                ),
                              })
                            }
                            maxLength={160}
                          />
                        </label>
                        <label className="field">
                          Texto de apoyo
                          <textarea
                            rows={2}
                            value={slide.body}
                            disabled={locked || hasImages || saving}
                            onChange={(event) =>
                              edit({
                                ...option,
                                slides: option.slides.map((item, slot) =>
                                  slot === index ? { ...item, body: event.target.value } : item,
                                ),
                              })
                            }
                            maxLength={400}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </section>
                <section className="caption-editor">
                  <div className="section-kicker">Descripción de la publicación</div>
                  <label className="field">
                    <span className="sr-only">Descripción del post</span>
                    <textarea
                      rows={13}
                      value={option.caption}
                      disabled={locked || saving}
                      onChange={(event) => edit({ ...option, caption: event.target.value })}
                      maxLength={2200}
                    />
                  </label>
                  <div className="caption-count">{option.caption.length}/2200</div>
                  <div className="copy-tip">
                    <span>✧</span>
                    <p>Una buena apertura invita a deslizar. Un buen cierre invita a conversar.</p>
                  </div>
                </section>
              </div>
              {hasImages && (
                <p className="help-text">
                  Los textos de imagen quedan fijados al crear las piezas. La descripción del post puede
                  ajustarse. Para otra dirección de texto, creá una campaña nueva.
                </p>
              )}
              <div className="copy-approval">
                <div>
                  <CheckCheck size={20} />
                  <p>
                    <strong>Vos elegís antes de generar.</strong>
                    <span>Las {campaign.variantCount} propuestas usarán estos mismos textos.</span>
                  </p>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  disabled={locked || saving || !dirty || stale}
                  onClick={() => save(false)}
                >
                  Guardar borrador
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={
                    locked ||
                    saving ||
                    stale ||
                    !option.slides.every((slide) => slide.headline.trim()) ||
                    !option.caption.trim()
                  }
                  onClick={() => save(true)}
                >
                  {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                  {campaign.copyApproved && !dirty
                    ? 'Continuar a las propuestas'
                    : 'Elegir estos textos y continuar'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
