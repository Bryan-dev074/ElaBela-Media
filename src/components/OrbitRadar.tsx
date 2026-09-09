import { ArrowRight, Check, Droplets, Flower2, Heart, Paintbrush, Sparkles, Waves } from 'lucide-react';
import { type RadarTopic, type ResearchStyle, radarTopics, researchStyles } from '../../shared/radar';

const icons = {
  makeup: Paintbrush,
  skincare: Droplets,
  nails: Flower2,
  fragrance: Sparkles,
  hair: Waves,
  lifestyle: Heart,
};

export function OrbitRadar({
  topic,
  style,
  onTopic,
  onStyle,
  onExplore,
  onExploreAll,
  busy,
  count,
}: {
  topic?: RadarTopic;
  style: ResearchStyle;
  onTopic: (topic?: RadarTopic) => void;
  onStyle: (style: ResearchStyle) => void;
  onExplore: () => void;
  onExploreAll: () => void;
  busy: boolean;
  count: number;
}) {
  return (
    <section className="radar-discovery" aria-label="Explorar el universo de belleza">
      <div className="orbit-area">
        <p className="orbit-instruction">Elegí un universo. Encontrá tu próxima idea.</p>
        <fieldset className="orbit-map" aria-label="Categorías del radar">
          <div className="orbit-rings" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="orbit-satellite one" />
            <span className="orbit-satellite two" />
            <span className="orbit-satellite three" />
          </div>
          <button
            className="orbit-core"
            type="button"
            onClick={onExplore}
            disabled={busy}
            aria-label={`Explorar ${topic?.label || 'tendencias de belleza'}`}
          >
            <Sparkles size={21} aria-hidden="true" />
            <strong>
              {topic?.label || (
                <>
                  Tendencias
                  <br />
                  de belleza
                </>
              )}
            </strong>
            <span>
              {busy ? 'Investigando' : 'Explorar'} <ArrowRight size={13} aria-hidden="true" />
            </span>
          </button>
          {radarTopics.map((item) => {
            const Icon = icons[item.id];
            return (
              <button
                type="button"
                className={`orbit-topic orbit-${item.id}`}
                key={item.id}
                aria-pressed={topic?.id === item.id}
                aria-label={item.label}
                onClick={() => onTopic(topic?.id === item.id ? undefined : item)}
              >
                <span className="orbit-topic-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="orbit-topic-copy">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                {topic?.id === item.id && (
                  <Check className="orbit-topic-check" size={13} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </fieldset>
        <button type="button" className="text-button orbit-reset" disabled={busy} onClick={onExploreAll}>
          Explorar todas las categorías <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="radar-direction">
        <div className="direction-caption">
          <span />
          Tu dirección creativa
        </div>
        <h2>{topic?.label || 'Un mundo de ideas por descubrir.'}</h2>
        <p className="direction-description">
          {topic?.description ||
            'Elegí una categoría del radar y descubrí cómo llevarla al universo ElaBela.'}
        </p>
        <fieldset className="research-styles">
          <legend>En la próxima búsqueda</legend>
          {researchStyles.map((item) => (
            <button key={item} type="button" aria-pressed={style === item} onClick={() => onStyle(item)}>
              {item}
            </button>
          ))}
        </fieldset>
        <button className="button direction-search" type="button" disabled={busy} onClick={onExplore}>
          Preparar búsqueda <ArrowRight size={16} aria-hidden="true" />
        </button>
        <p className="direction-note">Podés ajustar la búsqueda antes de empezar.</p>
        <div className="direction-library" role="status">
          <span className="direction-library-count">{count}</span>
          <span>
            {count === 1 ? 'referencia en tu biblioteca' : 'referencias en tu biblioteca'}
            {topic ? ` sobre ${topic.label.toLocaleLowerCase()}` : ''}
          </span>
        </div>
      </div>
    </section>
  );
}
