import { ArrowDownToLine, ArrowRight, Bookmark, ExternalLink, Plus, Search, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { platformForSource } from '../../shared/sources';
import type { Job, Trend } from '../../shared/types';
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
  const [category, setCategory] = useState('Todas');
  const [detail, setDetail] = useState<Trend>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [newQuery, setNewQuery] = useState(
    'Estilos de carrusel de belleza y maquillaje para Paraguay y Brasil',
  );
  const input = useRef<HTMLInputElement>(null);
  const categories = ['Todas', ...new Set(trends.map((trend) => trend.category))];
  const filtered = trends.filter(
    (trend) =>
      (!savedOnly || trend.saved) &&
      (category === 'Todas' || category === trend.category) &&
      `${trend.title} ${trend.summary} ${trend.keywords.join(' ')}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const selected = detail ? trends.find((trend) => trend.id === detail.id) : undefined;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            {savedOnly ? 'Tu biblioteca de inspiración' : 'El comienzo de algo lindo'}
          </div>
          <h1>{savedOnly ? 'Ideas que querés guardar.' : 'Tu próxima gran idea está acá.'}</h1>
          <p>Descubrí estilos, encontrá el producto perfecto y hacelo tuyo.</p>
        </div>
        <button
          className="button"
          type="button"
          disabled={searchJob?.status === 'running' || searchJob?.status === 'queued'}
          onClick={() => setSearchOpen(true)}
        >
          <Sparkles size={17} />
          {researchProvider === 'codex' ? 'Investigar con Codex' : 'Buscar nuevas ideas'}
        </button>
      </div>
      {searchJob && (
        <div className="inline-notice" role="status">
          <Sparkles size={17} />
          <span>{searchJob.message}</span>
        </div>
      )}
      <div className="radar-toolbar">
        <fieldset className="tabs" aria-label="Categorías">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={category === item}
              className={category === item ? 'active' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </fieldset>
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
              {platformForSource(trend.sourceUrl)}
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
          <p>Guardá las referencias que te gusten o buscá una nueva dirección creativa.</p>
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
              <span className="tag">{selected.sourceName}</span>
              <h3>Por qué puede funcionar con ElaBela</h3>
              <p>{selected.rationale}</p>
              <dl>
                <div>
                  <dt>Dónde lo encontramos</dt>
                  <dd>
                    {platformForSource(selected.sourceUrl)} · {selected.sourceName}
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
                <ExternalLink size={16} />
                Abrir fuente original · {platformForSource(selected.sourceUrl)}
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
            onSearch(newQuery);
            setSearchOpen(false);
          }}
        >
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
            <button className="button" type="submit" disabled={working || !newQuery.trim()}>
              <Search size={17} />
              {researchProvider === 'codex' ? 'Iniciar investigación' : 'Buscar ideas'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
