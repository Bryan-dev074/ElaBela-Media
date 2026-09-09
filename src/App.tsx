import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  FolderHeart,
  LayoutGrid,
  LoaderCircle,
  Menu,
  Monitor,
  Package,
  Plus,
  Radio,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { domAnimation, LazyMotion, m, useReducedMotion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap, Campaign, CreateCampaign, Trend } from '../shared/types';
import { connection, post, request, setConnection } from './api';
import { Products } from './components/Products';
import { Radar } from './components/Radar';
import { AssetImage, Empty, GitHubMark, Modal, ReferenceImage } from './components/ui';

const Studio = lazy(() => import('./components/Studio'));
type Page = 'radar' | 'saved' | 'campaigns' | 'products' | 'settings' | 'studio';
const pageNames: Record<Page, string> = {
  radar: 'Radar creativo',
  saved: 'Ideas guardadas',
  campaigns: 'Mis campañas',
  products: 'Productos',
  settings: 'Mi espacio',
  studio: 'Estudio creativo',
};
const nav = [
  { id: 'radar', icon: Radio, label: 'Radar creativo' },
  { id: 'saved', icon: Bookmark, label: 'Ideas guardadas' },
  { id: 'campaigns', icon: FolderHeart, label: 'Mis campañas' },
  { id: 'products', icon: Package, label: 'Productos' },
] as const;

export default function App() {
  const [data, setData] = useState<Bootstrap>();
  const [page, setPage] = useState<Page>('radar');
  const [campaignId, setCampaignId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean }>();
  const [newTrend, setNewTrend] = useState<Trend>();
  const [connectOpen, setConnectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(() => matchMedia('(max-width: 760px)').matches);
  const sidebar = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const previousMenuOpen = useRef(false);
  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (Object.keys(sessionStorage).some((key) => key.startsWith('elabela-copy-draft:'))) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const update = () => {
      setMobileNavigation(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileNavigation || !menuOpen) {
      if (previousMenuOpen.current && mobileNavigation) menuTrigger.current?.focus();
      previousMenuOpen.current = false;
      return;
    }
    previousMenuOpen.current = true;
    const focusable = () => [
      ...(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') ?? []),
    ];
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !sidebar.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !sidebar.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [menuOpen, mobileNavigation]);
  const systemReduced = useReducedMotion();
  const [motionPaused, setMotionPaused] = useState(
    () => localStorage.getItem('elabela-reduce-motion') === '1',
  );
  const reduced = systemReduced || motionPaused;
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = motionPaused ? 'true' : 'false';
    localStorage.setItem('elabela-reduce-motion', motionPaused ? '1' : '0');
  }, [motionPaused]);
  const reportError = useCallback((message: string) => setToast({ message, error: true }), []);
  const refresh = useCallback(async () => {
    const next = await request<Bootstrap>('/api/bootstrap');
    setData(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh()
      .catch(() => setData(undefined))
      .finally(() => setLoading(false));
  }, [refresh]);
  const running = data?.jobs.some((job) => job.status === 'queued' || job.status === 'running');
  const connected = Boolean(data);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(
      () => {
        void refresh().catch(() => {
          setData(undefined);
          reportError('Se perdió la conexión con esta PC. Tus archivos siguen guardados.');
        });
      },
      running ? 2500 : 30000,
    );
    return () => clearInterval(timer);
  }, [connected, running, refresh, reportError]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), toast.error ? 10000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function run(action: () => Promise<unknown>, success?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
      if (success) setToast({ message: success, error: false });
    } catch (error) {
      reportError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  function openCampaign(campaign: Campaign) {
    setCampaignId(campaign.id);
    navigate('studio');
  }
  function updateCampaign(campaign: Campaign) {
    setData((current) =>
      current
        ? {
            ...current,
            campaigns: current.campaigns.map((item) => (item.id === campaign.id ? campaign : item)),
          }
        : current,
    );
  }
  const campaign = data?.campaigns.find((item) => item.id === campaignId);
  return (
    <LazyMotion features={domAnimation}>
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <div className={`app-shell ${menuOpen ? 'menu-is-open' : ''}`}>
        {menuOpen && (
          <button
            type="button"
            className="sidebar-scrim"
            aria-label="Cerrar navegación"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          className="sidebar"
          id="main-navigation"
          ref={sidebar}
          inert={mobileNavigation && !menuOpen}
          aria-hidden={mobileNavigation && !menuOpen}
        >
          <button className="brand" type="button" onClick={() => navigate('radar')}>
            <img src="/brand/mark.svg" alt="" width="40" height="40" />
            <span>
              ElaBela <b>Media</b>
              <small>Tu estudio creativo</small>
            </span>
          </button>
          <div className="nav-label">CREAR CON INTENCIÓN</div>
          <nav aria-label="Principal">
            {nav.map((item) => (
              <button
                type="button"
                key={item.id}
                className={
                  page === item.id || (item.id === 'campaigns' && page === 'studio')
                    ? 'nav-item active'
                    : 'nav-item'
                }
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? 'page' : undefined}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
                {item.id === 'saved' && !!data?.trends.filter((trend) => trend.saved).length && (
                  <span className="nav-count">{data.trends.filter((trend) => trend.saved).length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="little-spark">✧</span>
            <p>
              De una buena idea
              <br />a algo muy ElaBela.
            </p>
            <small>Inspirá. Creá. Compartí.</small>
          </div>
          <div className="sidebar-bottom">
            <button
              className={`nav-item ${page === 'settings' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate('settings')}
            >
              <Settings2 size={18} />
              Mi espacio
            </button>
            <div className="workspace-badge">
              <div className="avatar">B</div>
              <span>
                Espacio de Bryan<small>ElaBela · Estudio personal</small>
              </span>
              <span className={`status-dot ${data ? 'online' : ''}`} />
            </div>
          </div>
        </aside>
        <div className="workspace" inert={mobileNavigation && menuOpen}>
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                type="button"
                aria-label="Abrir navegación"
                ref={menuTrigger}
                aria-expanded={menuOpen}
                aria-controls="main-navigation"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={21} />
              </button>
              <span>Mi espacio</span>
              <ChevronRight size={14} />
              <strong>{pageNames[page]}</strong>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className={`connection-pill ${data ? 'connected' : ''}`}
                aria-label={data ? 'PC conectada. Ver conexión' : 'Conectar PC'}
                onClick={() => setConnectOpen(true)}
              >
                <span className={`status-dot ${data ? 'online' : ''}`} />
                <span>{data ? 'PC conectada' : 'Conectar PC'}</span>
              </button>
              <a
                className="creator-credit"
                href="https://github.com/Bryan-dev074"
                target="_blank"
                rel="noreferrer"
              >
                <span className="creator-inner">
                  <GitHubMark />
                  <span>
                    <small>Creado por</small>Bryan-dev074
                  </span>
                  <ArrowRight size={14} />
                </span>
              </a>
            </div>
          </header>
          <main id="main" className="main-content" tabIndex={-1}>
            {loading ? (
              <div className="loading-state">
                <LoaderCircle className="spin" size={28} />
                <p>Abriendo tu espacio creativo…</p>
              </div>
            ) : !data ? (
              <div className="welcome-state">
                <div className="welcome-art">
                  <img src="/brand/mark.svg" alt="" />
                  <span className="welcome-orbit orbit-one" />
                  <span className="welcome-orbit orbit-two" />
                </div>
                <div className="eyebrow">Tus ideas. Tu espacio.</div>
                <h1>
                  Un estudio entero,
                  <br />
                  en tu propia PC.
                </h1>
                <p>Guardá inspiración, creá campañas y prepará cada detalle de tu próxima publicación.</p>
                <button type="button" className="button" onClick={() => setConnectOpen(true)}>
                  <Monitor size={18} />
                  Conectar mi estudio
                </button>
                <div className="local-explainer">
                  <CircleHelp size={19} />
                  <p>
                    Abrí <strong>Iniciar ElaBela Media</strong> en la carpeta del proyecto. El servicio guarda
                    tus imágenes y conecta las herramientas mientras tu PC está encendida.
                  </p>
                </div>
              </div>
            ) : (
              <m.div
                key={page}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {(page === 'radar' || page === 'saved') && (
                  <Radar
                    trends={data.trends}
                    savedOnly={page === 'saved'}
                    working={busy}
                    researchProvider={data.status.researchProvider}
                    searchJob={[...data.jobs].reverse().find((job) => job.type === 'search')}
                    onUse={setNewTrend}
                    onSave={(trend) =>
                      void run(() =>
                        request(`/api/trends/${trend.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ saved: !trend.saved }),
                        }),
                      )
                    }
                    onSearch={(query) =>
                      void run(
                        () => post('/api/trends/search', { query }),
                        'La búsqueda quedó registrada en tu Radar.',
                      )
                    }
                    onImport={(file) =>
                      void run(async () => {
                        const parsed: unknown = JSON.parse(await file.text());
                        await post('/api/trends/import', Array.isArray(parsed) ? { trends: parsed } : parsed);
                      }, 'Ideas importadas. Tus favoritas siguen guardadas.')
                    }
                  />
                )}
                {page === 'products' && <Products onError={reportError} />}
                {page === 'campaigns' && (
                  <>
                    <div className="page-intro">
                      <div>
                        <div className="eyebrow">De idea a publicación</div>
                        <h1>Tus campañas, tomando forma.</h1>
                        <p>Cada propuesta y cada versión, en su lugar.</p>
                      </div>
                      <button className="button" type="button" onClick={() => navigate('radar')}>
                        <Plus size={17} />
                        Nueva campaña
                      </button>
                    </div>
                    {data.campaigns.length ? (
                      <div className="campaign-grid">
                        {[...data.campaigns].reverse().map((item) => {
                          const trend = data.trends.find((entry) => entry.id === item.trendId);
                          const cover =
                            item.finalAssetIds[0] ||
                            item.variants.flatMap((variant) => variant.assetIds).find(Boolean);
                          return (
                            <button
                              type="button"
                              className="campaign-card"
                              key={item.id}
                              onClick={() => openCampaign(item)}
                            >
                              <div className="campaign-cover">
                                {cover ? (
                                  <AssetImage id={cover} alt={item.title} />
                                ) : (
                                  <ReferenceImage
                                    reference={trend?.references[0]}
                                    alt={`Referencia para ${item.title}`}
                                  />
                                )}
                                <span className="tag">
                                  {item.publication?.status === 'verified'
                                    ? 'Publicada'
                                    : item.finalAssetIds.length === item.slideCount
                                      ? 'En revisión'
                                      : 'En creación'}
                                </span>
                              </div>
                              <div className="campaign-info">
                                <h2>{item.title}</h2>
                                <p>
                                  {item.slideCount} piezas · {item.variantCount} propuestas ·{' '}
                                  {item.language === 'es' ? 'Español' : 'Português'}
                                </p>
                                <span>
                                  Actualizada el {new Date(item.updatedAt).toLocaleDateString('es-PY')}
                                  <ArrowRight size={17} />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Empty
                        icon={<FolderHeart size={35} />}
                        title="La primera campaña empieza con una idea."
                      >
                        <p>Explorá el Radar y elegí una referencia para empezar.</p>
                        <button type="button" className="button" onClick={() => navigate('radar')}>
                          Explorar ideas
                          <ArrowRight size={17} />
                        </button>
                      </Empty>
                    )}
                  </>
                )}
                {page === 'studio' && campaign && (
                  <Suspense
                    fallback={
                      <div className="loading-state">
                        <LoaderCircle className="spin" />
                        Abriendo estudio…
                      </div>
                    }
                  >
                    <Studio
                      key={campaign.id}
                      campaign={campaign}
                      assets={data.assets}
                      trends={data.trends}
                      jobs={data.jobs}
                      status={data.status}
                      onUpdate={updateCampaign}
                      onRefresh={refresh}
                      onError={reportError}
                      onBack={() => navigate('campaigns')}
                    />
                  </Suspense>
                )}
                {page === 'studio' && !campaign && (
                  <Empty icon={<LayoutGrid size={32} />} title="Elegí una campaña para continuar.">
                    <button className="button" type="button" onClick={() => navigate('campaigns')}>
                      Ver mis campañas
                    </button>
                  </Empty>
                )}
                {page === 'settings' && (
                  <Settings
                    data={data}
                    motionPaused={motionPaused}
                    onMotionChange={setMotionPaused}
                    onConnect={() => setConnectOpen(true)}
                    onSave={(origins) =>
                      void run(
                        () => post('/api/settings', { allowedOrigins: origins }),
                        'Conexión actualizada.',
                      )
                    }
                    busy={busy}
                  />
                )}
              </m.div>
            )}
          </main>
          <footer className="workspace-footer">
            <span>
              ElaBela Media <span>·</span> Hecho para crear con calma.
            </span>
            <span>
              ES / PT-BR <span>·</span> 4:5
            </span>
          </footer>
        </div>
      </div>
      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="Conectar tu estudio"
        description="Tus archivos y las conexiones con las redes se administran en esta PC."
      >
        <ConnectionForm
          onConnect={async (base, token) => {
            setConnection(base, token);
            await refresh();
            setConnectOpen(false);
            setToast({ message: 'Tu estudio está conectado.', error: false });
          }}
          onError={reportError}
        />
      </Modal>
      <Modal
        open={!!newTrend}
        onClose={() => setNewTrend(undefined)}
        title="Dale forma a tu campaña"
        description="Elegí los productos y la cantidad de piezas. Después trabajamos los textos."
        wide
      >
        {newTrend && (
          <CreateForm
            trend={newTrend}
            onError={reportError}
            onCreate={async (input) => {
              const created = await post<Campaign>('/api/campaigns', input);
              await refresh();
              setNewTrend(undefined);
              openCampaign(created);
            }}
          />
        )}
      </Modal>
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.error ? <CircleHelp size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar aviso"
            onClick={() => setToast(undefined)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {busy && (
        <div className="operation-indicator" role="status">
          <LoaderCircle className="spin" size={17} />
          Guardando en tu estudio…
        </div>
      )}
    </LazyMotion>
  );
}

function ConnectionForm({
  onConnect,
  onError,
}: {
  onConnect: (base: string, token: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [base, setBase] = useState(
    connection().base ||
      (['localhost', '127.0.0.1'].includes(location.hostname) ? '' : 'http://127.0.0.1:4317'),
  );
  const [token, setToken] = useState(connection().token);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onConnect(base, token)
          .catch((error) => onError((error as Error).message))
          .finally(() => setBusy(false));
      }}
    >
      <div className="connection-steps">
        <p>
          <strong>1.</strong> Abrí <b>Iniciar ElaBela Media</b> en tu PC.
        </p>
        <p>
          <strong>2.</strong> La página local se conecta automáticamente. Para Vercel, usá el enlace de
          conexión que genera el iniciador.
        </p>
        <p>
          <strong>3.</strong> Permití el acceso a la red local si el navegador lo solicita.
        </p>
      </div>
      <details>
        <summary>Conexión manual</summary>
        <label className="field">
          Dirección del servicio
          <input
            value={base}
            onChange={(event) => setBase(event.target.value)}
            placeholder="Vacío para la página local"
          />
        </label>
        <label className="field">
          Código de conexión
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <p className="help-text">
          El código permanece en esta pestaña. Los tokens de Meta y de generación permanecen en el servicio
          local.
        </p>
      </details>
      <div className="modal-actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Monitor size={17} />}Conectar
        </button>
      </div>
    </form>
  );
}

function CreateForm({
  trend,
  onCreate,
  onError,
}: {
  trend: Trend;
  onCreate: (input: CreateCampaign) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(trend.title);
  const [language, setLanguage] = useState<'es' | 'pt'>('es');
  const [count, setCount] = useState(trend.suggestedSlides);
  const [selected, setSelected] = useState(trend.productIds);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onCreate({
          title,
          trendId: trend.id,
          productIds: selected,
          language,
          slideCount: count,
          variantCount: 3,
        })
          .catch((error) => onError((error as Error).message))
          .finally(() => setBusy(false));
      }}
    >
      <div className="brief-fields">
        <label className="field">
          Nombre de la campaña
          <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={150} />
        </label>
        <label className="field">
          Idioma de la publicación
          <select value={language} onChange={(event) => setLanguage(event.target.value as 'es' | 'pt')}>
            <option value="es">Español · Paraguay</option>
            <option value="pt">Português · Brasil</option>
          </select>
        </label>
        <label className="field">
          Piezas por propuesta
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((pieces) => (
              <option key={pieces} value={pieces}>
                {pieces} {pieces === 1 ? 'imagen' : 'imágenes'}
                {pieces === trend.suggestedSlides ? ' · como la referencia' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="brief-summary">
        <Sparkles size={18} />
        <span>
          <strong>
            3 propuestas × {count} piezas = {count * 3} imágenes.
          </strong>{' '}
          Vas a poder combinar tus favoritas en un carrusel final.
        </span>
      </div>
      <h3>Elegí los protagonistas</h3>
      <p className="help-text">
        Ya seleccionamos {trend.productIds.length} productos que pueden acompañar esta idea. Podés cambiarlos.
      </p>
      <Products
        compact
        selected={selected}
        onToggle={(product) =>
          setSelected((current) =>
            current.includes(product.id)
              ? current.filter((id) => id !== product.id)
              : [...current, product.id],
          )
        }
        onError={onError}
      />
      <div className="modal-actions sticky-actions">
        <span className="help-text">
          {selected.length} productos · {language === 'es' ? 'ES' : 'PT-BR'}
        </span>
        <button className="button" type="submit" disabled={busy || !selected.length}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}Continuar con los
          textos
        </button>
      </div>
    </form>
  );
}

function Settings({
  data,
  motionPaused,
  onMotionChange,
  onConnect,
  onSave,
  busy,
}: {
  data: Bootstrap;
  motionPaused: boolean;
  onMotionChange: (value: boolean) => void;
  onConnect: () => void;
  onSave: (origins: string[]) => void;
  busy: boolean;
}) {
  const [origins, setOrigins] = useState(
    data.status.allowedOrigins.filter((origin) => origin.startsWith('https:')).join('\n'),
  );
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">Todo, en su lugar</div>
          <h1>Tu espacio de trabajo.</h1>
          <p>Conectá las herramientas que acompañan tu proceso.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-panel">
          <Sparkles size={22} />
          <h2>Un ritmo más tranquilo</h2>
          <p>
            Podés pausar la luz del enlace de autor y las transiciones. También respetamos la preferencia de
            movimiento de tu dispositivo.
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={motionPaused}
              onChange={(event) => onMotionChange(event.target.checked)}
            />
            Reducir animaciones
          </label>
        </section>
        <section className="settings-panel">
          <Monitor size={22} />
          <h2>El estudio en esta PC</h2>
          <p>
            El programa local guarda referencias, campañas y originales dentro de la carpeta del proyecto.
            Debe estar abierto para trabajar desde la web.
          </p>
          <span className="status-label">
            <span className="status-dot online" />
            Conectado
          </span>
          <button type="button" className="button secondary" onClick={onConnect}>
            Ver conexión
          </button>
        </section>
        <section className="settings-panel">
          <Sparkles size={22} />
          <h2>Investigar con Codex</h2>
          <p>
            {data.status.researchProvider === 'api'
              ? 'Este servicio usa el proveedor API opcional para investigar.'
              : 'El botón del radar inicia Codex en esta PC con tu sesión. Los hallazgos vuelven con sus fuentes y referencias. No necesitás una clave API para investigar.'}
          </p>
          <span className="tag">
            {data.status.researchReady ? 'Sesión detectada al iniciar' : 'La sesión se comprueba al buscar'}
          </span>
          <p className="help-text">
            Cada investigación usa los límites de tu cuenta. La PC y el servicio deben seguir encendidos.
          </p>
        </section>
        <section className="settings-panel">
          <Sparkles size={22} />
          <h2>Generación de imágenes</h2>
          <p>
            {data.status.generationConfigured
              ? 'Hay una clave configurada en el servicio. Cada generación utiliza tu cuenta del proveedor.'
              : 'Podés investigar con Codex e importar imágenes. Para generar imágenes desde la página, configurá OPENAI_API_KEY en el archivo .env local.'}
          </p>
          <span className="tag">
            {data.status.generationConfigured ? 'Configurada · uso con costo' : 'Pendiente de configurar'}
          </span>
        </section>
        <section className="settings-panel">
          <FolderHeart size={22} />
          <h2>Instagram y Facebook</h2>
          <p>
            La publicación utiliza la conexión de MetaBusiness de esta PC. Solo se envía el carrusel final que
            revises y confirmes.
          </p>
          <span className="tag">
            {data.status.metaConfigured ? 'Credencial local encontrada' : 'Conexión pendiente'}
          </span>
          <p className="help-text">Encontrar la credencial no verifica permisos de publicación vigentes.</p>
        </section>
        <section className="settings-panel">
          <Package size={22} />
          <h2>Catálogo ElaBela</h2>
          <p>
            <strong>{data.status.catalogueCount.toLocaleString('es-PY')} productos</strong> disponibles para
            explorar en tu biblioteca.
          </p>
          <p className="help-text">
            Última lectura:{' '}
            {data.status.catalogueObservedAt
              ? new Date(`${data.status.catalogueObservedAt.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
                  'es-PY',
                )
              : 'Sin sincronización'}
            . El stock se confirma en la tienda.
          </p>
          <a className="source-link" href="https://lista.elabela.com.py/" target="_blank" rel="noreferrer">
            Abrir catálogo oficial
            <ArrowRight size={15} />
          </a>
        </section>
      </div>
      <section className="settings-panel vercel-panel">
        <h2>Abrir el estudio desde Vercel</h2>
        <p>
          Agregá la dirección exacta de tu página para permitirle conectar con este servicio. Hacé este cambio
          desde la página local.
        </p>
        <label className="field">
          Direcciones permitidas · una por línea
          <textarea
            rows={3}
            placeholder="https://tu-proyecto.vercel.app"
            value={origins}
            onChange={(event) => setOrigins(event.target.value)}
          />
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            onSave([
              ...data.status.allowedOrigins.filter((origin) => !origin.startsWith('https:')),
              ...origins
                .split('\n')
                .map((origin) => origin.trim())
                .filter(Boolean),
            ])
          }
        >
          Guardar direcciones
        </button>
      </section>
    </>
  );
}
