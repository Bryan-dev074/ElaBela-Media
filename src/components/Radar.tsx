import { ArrowDownToLine, ArrowRight, Bookmark, ExternalLink, Plus, Search, Sparkles, X } from 'lucide-react';
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
import type { Job, Trend } from '../../shared/types';
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
  onUse: (trend: Trend) => void;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [newQuery, setNewQuery] = useState(radarResearchQuery(undefined, 'Inspiración'));
  const input = useRef<HTMLInputElement>(null);
  const topicTrends = trends.filter(
    (trend) => (!savedOnly || trend.saved) && matchesRadarTopic(trend, topic),
  );
  const sources = [...new Set(trends.map((trend) => platformForSource(trend.sourceUrl)))];
  const filtered = topicTrends.filter(
    (trend) =>
      (source === 'Todas' || platformForSource(trend.sourceUrl) === source) &&
      normalizeRadarText(`${trend.title} ${trend.summary} ${trend.keywords.join(' ')}`).includes(
        normalizeRadarText(query),
      ),
  );
  const searchBusy = searchJob?.status === 'running' || searchJob?.status === 'queued';
  const prepareSearch = () => {
    setNewQuery(radarResearchQuery(topic, style));
    setSearchOpen(true);
  };
  const selectTopic = (next?: RadarTopic) => {
    setTopic(next);
    setQuery('');
    setSource('Todas');
  };
  const selected = detail ? trends.find((trend) => trend.id === detail.id) : undefined;
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
        <button className="button" type="button" disabled={searchBusy} onClick={prepareSearch}>
          <Sparkles size={17} />
          {researchProvider === 'codex' ? 'Investigar con Codex' : 'Buscar nuevas ideas'}
        </button>
      </div>
      {!savedOnly && (
        <OrbitRadar
          topic={topic}
          style={style}
          onTopic={selectTopic}
          onStyle={setStyle}
          onExplore={prepareSearch}
          busy={searchBusy}
          count={topicTrends.length}
        />
      )}
      {searchJob && (
        <div className="inline-notice" role="status">
          <Sparkles size={17} />
          <span>{searchJob.message}</span>
        </div>
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
      <div className="trend-grid">
        {filtered.map((trend, index) => (
          <article className={`trend-card ${index === 0 ? 'feature-trend' : ''}`} key={trend.id}>
            <div className="trend-image-wrap">
              <button
                className="trend-image"
                type="button"
                onClick={() => setDetail(trend)}
                aria-label={`Ver idea: ${trend.title}`}
              >
                <ReferenceImage
                  reference={trend.references[0]}
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
            <button className="card-title" type="button" onClick={() => setDetail(trend)}>
              {trend.title}
              <ArrowRight size={18} />
            </button>
            <p>{trend.summary}</p>
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
          <h2>{savedOnly ? 'Tus favoritas empiezan acá.' : 'Todavía no hay ideas con ese filtro.'}</h2>
          <p>
            {topic
              ? `Podés investigar nuevas ideas de ${topic.label.toLocaleLowerCase()} o explorar otra categoría.`
              : 'Guardá las referencias que te gusten o buscá una nueva dirección creativa.'}
          </p>
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
        onClose={() => setDetail(undefined)}
        title={selected?.title || 'Idea'}
        description={selected?.summary}
        wide
      >
        {selected && (
          <div className="trend-detail">
            <div className="reference-gallery">
              {selected.references.length === 0 && (
                <p className="help-text">
                  Esta fuente no permitió recuperar una imagen de referencia. Podés consultar la publicación
                  desde su enlace original.
                </p>
              )}
              {selected.references.map((reference) => (
                <figure key={reference.id}>
                  <ReferenceImage reference={reference} alt={reference.title} />
                  <figcaption>{reference.title}</figcaption>
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
                  onClick={() => {
                    onUse(selected);
                    setDetail(undefined);
                  }}
                >
                  <Plus size={17} />
                  Crear con esta idea
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
        open={searchOpen}
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
              maxLength={1000}
            />
          </label>
          <p className="help-text">
            La búsqueda guardará sus fuentes y resultados. Después elegís cuáles conservar en tus favoritos.
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
