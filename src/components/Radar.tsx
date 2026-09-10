import {
  ArrowDownToLine,
  ArrowRight,
  Bookmark,
  Check,
  ExternalLink,
  Plus,
  Search,
  Sparkles,
  X,
  ZoomIn,
} from 'lucide-react';
import { useRef, useState } from 'react';
import {
  matchesRadarTopic,
  normalizeRadarText,
  type RadarTopic,
  type ResearchStyle,
  radarResearchQuery,
  radarTopics,
} from '../../shared/radar';
import { platformForSource } from '../../shared/sources';
import type { Job, Reference, Trend } from '../../shared/types';
import { OrbitRadar } from './OrbitRadar';
import { SocialSource } from './SocialSource';
import { Modal, ReferenceImage } from './ui';

export function Radar({
  trends,
  savedOnly,
  onSave,
  onUse,
  onSearch,
  onImport,
  working,
  searchJob,
  researchProvider = 'codex',
}: {
  trends: Trend[];
  savedOnly: boolean;
  onSave: (trend: Trend) => void;
  onUse: (trend: Trend, referenceId?: string) => void;
  onSearch: (query: string) => void;
  onImport: (file: File) => void;
  working: boolean;
  searchJob?: Job;
  researchProvider?: 'codex' | 'api';
}) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<RadarTopic>();
  const [style, setStyle] = useState<ResearchStyle>('Inspiración');
  const [source, setSource] = useState('Todas');
  const [detail, setDetail] = useState<Trend>();
  const [collection, setCollection] = useState<'visual' | 'all'>(savedOnly ? 'all' : 'visual');
  const [chosenReference, setChosenReference] = useState<string>();
  const [previewReference, setPreviewReference] = useState<Reference>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [newQuery, setNewQuery] = useState(radarResearchQuery(undefined, 'Inspiración'));
  const input = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLElement | null>(null);
  const previewTrigger = useRef<HTMLElement | null>(null);
  const topicTrends = trends.filter(
    (trend) => (!savedOnly || trend.saved) && matchesRadarTopic(trend, topic),
  );
  const sources = [...new Set(trends.map((trend) => platformForSource(trend.sourceUrl)))];
  const filtered = topicTrends.filter(
    (trend) =>
      (collection === 'all' ||
        (trend.references.length > 0 && !['context', 'unavailable'].includes(trend.visualStatus || ''))) &&
      (source === 'Todas' || platformForSource(trend.sourceUrl) === source) &&
      normalizeRadarText(`${trend.title} ${trend.summary} ${trend.keywords.join(' ')}`).includes(
        normalizeRadarText(query),
      ),
  );
  const searchBusy = searchJob?.status === 'running' || searchJob?.status === 'queued';
  const openSearch = (searchTopic: RadarTopic | undefined) => {
    if (searchBusy) return;
    searchTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNewQuery(radarResearchQuery(searchTopic, style));
    setSearchOpen(true);
  };
  const prepareSearch = () => openSearch(topic);
  const selectTopic = (next?: RadarTopic) => {
    setTopic(next);
    setQuery('');
    setSource('Todas');
  };
  const exploreAll = () => {
    if (searchBusy) return;
    selectTopic(undefined);
    openSearch(undefined);
  };
  const selected = detail ? trends.find((trend) => trend.id === detail.id) : undefined;
  const needsReference =
    !!selected?.references.length &&
    !['context', 'unavailable'].includes(selected.visualStatus || '') &&
    !chosenReference;
  const openDetail = (trend: Trend) => {
    setChosenReference(undefined);
    setDetail(trend);
  };
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">{savedOnly ? 'Tu biblioteca de inspiración' : 'Radar de tendencias'}</div>
          <h1>{savedOnly ? 'Ideas que querés guardar.' : 'Tu próxima gran idea está acá.'}</h1>
          <p>
            {savedOnly
              ? 'Tus referencias favoritas, listas para convertirse en una campaña.'
              : 'Explorá, inspirate y encontrá una dirección para crear.'}
          </p>
        </div>
        <button
          className="button"
          type="button"
          disabled={searchBusy}
          aria-describedby={searchBusy ? 'research-status' : undefined}
          onClick={prepareSearch}
        >
          <Sparkles size={17} />
          {searchBusy
            ? searchJob.status === 'queued'
              ? 'Investigación en cola…'
              : 'Investigando…'
            : researchProvider === 'codex'
              ? 'Investigar con Codex'
              : 'Buscar nuevas ideas'}
        </button>
      </div>
      {searchJob && (
        <div id="research-status" className="inline-notice" role="status">
          <Sparkles size={17} aria-hidden="true" />
          <span>
            {searchJob.message}
            {searchBusy && (
              <>
                <br />
                Podrás iniciar otra búsqueda cuando termine.
              </>
            )}
          </span>
        </div>
      )}
      {!savedOnly && (
        <OrbitRadar
          topic={topic}
          style={style}
          onTopic={selectTopic}
          onStyle={setStyle}
          onExplore={prepareSearch}
          onExploreAll={exploreAll}
          busy={searchBusy}
          count={topicTrends.length}
        />
      )}
      <div className="reference-heading">
        <div>
          <h2>{savedOnly ? 'Tu selección de ideas' : 'Biblioteca de referencias'}</h2>
          <p>Imágenes, estilos y fuentes para darle forma a lo que viene.</p>
        </div>
        <label className="search-field compact">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en tus ideas"
            aria-label="Buscar en tus ideas"
          />
        </label>
      </div>
      <fieldset className="reference-views" aria-label="Vista de la biblioteca">
        <button type="button" aria-pressed={collection === 'visual'} onClick={() => setCollection('visual')}>
          Referencias visuales
        </button>
        <button type="button" aria-pressed={collection === 'all'} onClick={() => setCollection('all')}>
          Todas las ideas
        </button>
      </fieldset>
      <div className="reference-filters">
        <label>
          Categoría
          <select
            aria-label="Categoría de las referencias"
            value={topic?.id || 'all'}
            onChange={(event) => selectTopic(radarTopics.find((item) => item.id === event.target.value))}
          >
            <option value="all">Todas las categorías</option>
            {radarTopics.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fuente
          <select
            aria-label="Fuente de las referencias"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="Todas">Todas las fuentes</option>
            {sources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        {(topic || query || source !== 'Todas') && (
          <button type="button" className="text-button" onClick={() => selectTopic(undefined)}>
            <X size={13} />
            Limpiar filtros
          </button>
        )}
      </div>
      <div className="collection-label">
        <span>
          {filtered.length} {filtered.length === 1 ? 'idea para explorar' : 'ideas para explorar'}
        </span>
        <div>
          <button className="text-button" type="button" onClick={() => input.current?.click()}>
            <ArrowDownToLine size={15} />
            Importar hallazgos
          </button>
          <input
            ref={input}
            type="file"
            aria-label="Importar hallazgos JSON"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <div className={`trend-grid ${collection === 'visual' ? 'visual-library' : ''}`}>
        {filtered.map((trend, index) => (
          <article className={`trend-card ${index === 0 ? 'feature-trend' : ''}`} key={trend.id}>
            <div className="trend-image-wrap">
              <button
                className="trend-image"
                type="button"
                onClick={() => openDetail(trend)}
                aria-label={`Ver idea: ${trend.title}`}
              >
                <ReferenceImage
                  reference={
                    ['context', 'unavailable'].includes(trend.visualStatus || '')
                      ? undefined
                      : trend.references[0]
                  }
                  alt={trend.references[0]?.title || trend.title}
                />
                <span className="format-label">
                  {trend.suggestedSlides} piezas · {trend.format}
                </span>
              </button>
              <button
                className={`save-button ${trend.saved ? 'saved' : ''}`}
                type="button"
                aria-label={trend.saved ? `Quitar ${trend.title} de guardados` : `Guardar ${trend.title}`}
                aria-pressed={trend.saved}
                onClick={() => onSave(trend)}
              >
                <Bookmark size={18} fill={trend.saved ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="trend-meta">
              <span className="category-dot" style={{ background: trend.palette[0] }} />
              {trend.category}
              <span className="meta-separator">·</span>
              <SocialSource url={trend.sourceUrl} />
            </div>
            <button className="card-title" type="button" onClick={() => openDetail(trend)}>
              {trend.title}
              <ArrowRight size={18} />
            </button>
            <p>{trend.summary}</p>
            {trend.visualStatus !== 'example' && trend.visualReason && (
              <p className="help-text">{trend.visualReason}</p>
            )}
            <div className="trend-footer">
              <span>
                {trend.evidence === 'annual'
                  ? 'Dirección 2026'
                  : trend.evidence === 'recent'
                    ? 'Señal reciente'
                    : 'Idea editorial'}
              </span>
              <span>
                {new Date(trend.observedAt).toLocaleDateString('es-PY', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <Bookmark size={32} />
          <h2>
            {savedOnly
              ? 'Tus favoritas empiezan acá.'
              : collection === 'visual'
                ? 'Todavía no hay referencias visuales con ese filtro.'
                : 'Todavía no hay ideas con ese filtro.'}
          </h2>
          <p>
            {topic
              ? `Podés investigar nuevas ideas de ${topic.label.toLocaleLowerCase()} o explorar otra categoría.`
              : 'Guardá las referencias que te gusten o buscá una nueva dirección creativa.'}
          </p>
          {collection === 'visual' && (
            <button className="text-button" type="button" onClick={() => setCollection('all')}>
              Ver ideas e informes sin imagen
            </button>
          )}
          <button type="button" className="button secondary" disabled={searchBusy} onClick={prepareSearch}>
            <Sparkles size={16} />
            Investigar nuevas referencias
          </button>
        </div>
      )}
      <div className="editorial-note">
        <span className="mini-mark">e.</span>
        <div>
          <strong>La inspiración es el punto de partida.</strong>
          <p>
            Las imágenes son referencias de sus fuentes. Tu campaña tendrá composición, productos y textos
            propios.
          </p>
        </div>
      </div>
      <Modal
        open={!!selected}
        onClose={() => {
          if (previewReference) setPreviewReference(undefined);
          else setDetail(undefined);
        }}
        title={selected?.title || 'Idea'}
        description={selected?.summary}
        wide
      >
        {selected && (
          <div className="trend-detail">
            <div className="reference-gallery">
              {(selected.references.length === 0 ||
                selected.visualStatus === 'context' ||
                selected.visualStatus === 'unavailable') && (
                <p className="help-text">
                  {selected.visualReason ||
                    'Esta fuente no permitió recuperar una imagen de referencia. Podés consultar la publicación desde su enlace original.'}
                </p>
              )}
              {!['context', 'unavailable'].includes(selected.visualStatus || '') &&
                selected.references.map((reference) => (
                  <figure
                    key={reference.id}
                    className={`reference-choice ${chosenReference === reference.id ? 'is-chosen' : ''}`}
                  >
                    <button
                      className="reference-enlarge"
                      type="button"
                      onClick={(event) => {
                        previewTrigger.current = event.currentTarget;
                        setPreviewReference(reference);
                      }}
                      aria-label={`Ampliar referencia: ${reference.title}`}
                    >
                      <ReferenceImage reference={reference} alt={reference.title} />
                      <span>
                        <ZoomIn size={17} /> Ampliar
                      </span>
                    </button>
                    <figcaption>{reference.title}</figcaption>
                    <div className="reference-choice-actions">
                      <button
                        className="button secondary small"
                        type="button"
                        aria-label={`Elegir referencia: ${reference.title}`}
                        aria-pressed={chosenReference === reference.id}
                        onClick={() => setChosenReference(reference.id)}
                      >
                        {chosenReference === reference.id ? <Check size={16} /> : <Plus size={16} />}
                        {chosenReference === reference.id ? 'Imagen elegida' : 'Elegir esta imagen'}
                      </button>
                      <a
                        className="source-link"
                        href={reference.sourceUrl || selected.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <SocialSource url={reference.sourceUrl || selected.sourceUrl} />
                        <ExternalLink size={14} />
                        <span className="sr-only">Fuente de {reference.title}</span>
                      </a>
                    </div>
                  </figure>
                ))}
            </div>
            <div className="trend-brief">
              <span className="tag">
                <SocialSource url={selected.sourceUrl} />
              </span>
              <h3>Por qué puede funcionar con ElaBela</h3>
              <p>{selected.rationale}</p>
              <dl>
                <div>
                  <dt>Dónde lo encontramos</dt>
                  <dd>
                    <SocialSource url={selected.sourceUrl} />
                    <span className="source-credit">{selected.sourceName}</span>
                  </dd>
                </div>
                <div>
                  <dt>Formato sugerido</dt>
                  <dd>
                    {selected.suggestedSlides} piezas · {selected.format}
                  </dd>
                </div>
                <div>
                  <dt>Evidencia</dt>
                  <dd>
                    {selected.evidence === 'annual'
                      ? 'Predicción / dirección anual'
                      : selected.evidence === 'recent'
                        ? 'Señal reciente · revisar fecha y mercado'
                        : 'Propuesta editorial'}
                  </dd>
                </div>
                <div>
                  <dt>Mercado</dt>
                  <dd>{selected.region}</dd>
                </div>
                <div>
                  <dt>Consultado</dt>
                  <dd>{new Date(selected.observedAt).toLocaleDateString('es-PY')}</dd>
                </div>
                {selected.publishedAt && (
                  <div>
                    <dt>Fecha de la fuente</dt>
                    <dd>{selected.publishedAt.slice(0, 10)}</dd>
                  </div>
                )}
              </dl>
              <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                <SocialSource url={selected.sourceUrl} />
                <span>Abrir fuente original</span>
                <ExternalLink size={14} />
              </a>
              <div className="detail-actions">
                <button
                  className="button"
                  type="button"
                  disabled={needsReference}
                  onClick={() => {
                    onUse(selected, chosenReference);
                    setDetail(undefined);
                  }}
                >
                  <Plus size={17} />
                  {needsReference
                    ? 'Elegí una imagen para continuar'
                    : chosenReference
                      ? 'Crear con esta imagen'
                      : 'Crear con esta idea'}
                </button>
                <button className="button secondary" type="button" onClick={() => onSave(selected)}>
                  <Bookmark size={17} />
                  {selected.saved ? 'Guardada' : 'Guardar idea'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!previewReference}
        returnFocusTo={previewTrigger.current}
        onClose={() => setPreviewReference(undefined)}
        title={previewReference?.title || 'Referencia visual'}
        description="Imagen original de la fuente. La campaña tendrá sus propios productos y textos."
        wide
      >
        {previewReference && (
          <div className="reference-original">
            <ReferenceImage reference={previewReference} alt={previewReference.title} preview={false} />
          </div>
        )}
      </Modal>
      <Modal
        open={searchOpen}
        returnFocusTo={searchTrigger.current}
        onClose={() => setSearchOpen(false)}
        title="Busquemos algo nuevo"
        description="Tendencias, estilos visuales, tutoriales o humor: contá qué te gustaría explorar."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (working || searchBusy || !newQuery.trim()) return;
            onSearch(newQuery.trim());
            setSearchOpen(false);
          }}
        >
          <div className="search-direction-tags">
            <span className="tag">{topic?.label || 'Todas las categorías'}</span>
            <span className="tag">{style}</span>
          </div>
          <label className="field">
            Qué querés encontrar
            <textarea
              value={newQuery}
              onChange={(event) => setNewQuery(event.target.value)}
              rows={4}
              required
              maxLength={500}
            />
          </label>
          <p className="help-text">
            La búsqueda guardará sus fuentes y resultados. Después elegís cuáles conservar en tus favoritos.{' '}
            {researchProvider === 'codex'
              ? 'Codex investigará en esta PC con tu sesión. Puede demorar unos minutos y utiliza los límites de tu cuenta.'
              : 'Requiere el proveedor API de búsqueda configurado en la PC.'}
          </p>
          <div className="modal-actions">
            <button className="button" type="submit" disabled={working || searchBusy || !newQuery.trim()}>
              <Search size={17} />
              {researchProvider === 'codex' ? 'Iniciar investigación' : 'Buscar ideas'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
