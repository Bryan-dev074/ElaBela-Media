import { Check, ExternalLink, Package, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Product } from '../../shared/types';
import { request } from '../api';

export function Products({
  selected,
  onToggle,
  onError,
  compact = false,
}: {
  selected?: string[];
  onToggle?: (product: Product) => void;
  onError: (message: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [chosenProducts, setChosenProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    items: Product[];
    total: number;
    categories: string[];
    brands: string[];
  }>({ items: [], total: 0, categories: [], brands: [] });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      setLoading(true);
      void request<typeof result>(
        `/api/products?${new URLSearchParams({ q: query, category, brand, page: String(page) })}`,
      )
        .then((data) => {
          if (active) setResult(data);
        })
        .catch((error) => {
          if (active) onError((error as Error).message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, category, brand, page, onError]);
  useEffect(() => {
    let active = true;
    if (!selected) return;
    void Promise.all(selected.map((id) => request<Product>(`/api/products/${encodeURIComponent(id)}`)))
      .then((items) => {
        if (active) setChosenProducts(items);
      })
      .catch((error) => {
        if (active) onError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [selected, onError]);
  return (
    <div className={compact ? 'product-picker' : ''}>
      {!compact && (
        <div className="page-intro">
          <div>
            <div className="eyebrow">El universo ElaBela</div>
            <h1>Un producto. Muchas posibilidades.</h1>
            <p>Encontrá el protagonista de tu próxima campaña.</p>
          </div>
          <span className="tag">
            <Package size={15} />
            Catálogo local
          </span>
        </div>
      )}
      {!!chosenProducts.length && onToggle && (
        <fieldset className="chosen-products" aria-label="Productos elegidos">
          {chosenProducts.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => onToggle(product)}
              aria-label={`Quitar de la campaña: ${product.name}`}
            >
              <img src={product.thumbnailUrl} alt="" />
              <span>{product.name}</span>
              <X size={13} />
            </button>
          ))}
        </fieldset>
      )}
      <div className="product-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar producto, marca o código"
            aria-label="Buscar producto, marca o código"
          />
        </label>
        <select
          aria-label="Categoría de producto"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las categorías</option>
          {result.categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Marca de producto"
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las marcas</option>
          {result.brands.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="collection-label">
        <span aria-live="polite">
          {loading ? 'Buscando productos…' : `${result.total.toLocaleString('es-PY')} productos`}
        </span>
        {selected && <span>{selected.length}/8 seleccionados</span>}
      </div>
      <div className="product-grid">
        {result.items.map((product) => (
          <article
            key={product.id}
            className={`product-card ${selected?.includes(product.id) ? 'selected' : ''}`}
          >
            {onToggle ? (
              <button
                type="button"
                disabled={!!selected && selected.length >= 8 && !selected.includes(product.id)}
                className="product-visual"
                onClick={() => onToggle(product)}
                aria-label={`${selected?.includes(product.id) ? 'Quitar' : 'Seleccionar'} ${product.name}`}
                aria-pressed={selected?.includes(product.id)}
              >
                <img src={product.thumbnailUrl} alt={product.name} loading="lazy" />
                <span className="selection-check">
                  {selected?.includes(product.id) && <Check size={14} />}
                </span>
              </button>
            ) : (
              <a className="product-visual" href={product.productUrl} target="_blank" rel="noreferrer">
                <img src={product.thumbnailUrl} alt={product.name} loading="lazy" />
              </a>
            )}
            <span className="brand-name">{product.brand}</span>
            <h3>{product.name}</h3>
            <div className="product-info">
              <span>Cód. {product.id}</span>
              <a
                href={product.productUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ver ficha de ${product.name}`}
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </article>
        ))}
      </div>
      {!loading && result.items.length === 0 && (
        <p className="empty-inline">No encontramos productos con esa búsqueda.</p>
      )}
      <div className="pagination">
        <button
          type="button"
          className="button secondary small"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(result.total / 36))}
        </span>
        <button
          type="button"
          className="button secondary small"
          disabled={page * 36 >= result.total}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
      {!compact && (
        <p className="help-text">
          Productos que figuraban en stock al sincronizar. Revisá disponibilidad, tono y precio en la ficha
          antes de incluirlos en una campaña.
        </p>
      )}
    </div>
  );
}
