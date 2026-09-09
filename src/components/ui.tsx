import * as Dialog from '@radix-ui/react-dialog';
import { Download, Image as ImageIcon, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { Asset, Reference } from '../../shared/types';
import { downloadAsset, useAsset } from '../api';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  returnFocusTo?: HTMLElement | null;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'modal-wide' : ''}`}
          onCloseAutoFocus={(event) => {
            if (returnFocusTo?.isConnected && !returnFocusTo.matches(':disabled')) {
              event.preventDefault();
              returnFocusTo.focus();
            }
          }}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Cerrar">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? 'muted' : 'sr-only'}>
            {description || title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function AssetImage({ id, alt, preview = true }: { id: string; alt: string; preview?: boolean }) {
  const url = useAsset(id, preview);
  return url ? (
    <img src={url} alt={alt} loading="lazy" draggable={false} />
  ) : (
    <div className="image-placeholder">
      <ImageIcon size={28} />
      <span>Cargando imagen</span>
    </div>
  );
}
export function ReferenceImage({ reference, alt }: { reference?: Reference; alt: string }) {
  const url = useAsset(reference?.assetId);
  return reference ? (
    <img src={url || reference.url} alt={alt} loading="lazy" draggable={false} />
  ) : (
    <div className="image-placeholder">
      <ImageIcon size={28} />
      <span>Referencia por agregar</span>
    </div>
  );
}
export function AssetViewer({ asset, onClose }: { asset?: Asset; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  return (
    <Modal
      open={!!asset}
      onClose={() => {
        setZoom(false);
        setDownloadError('');
        onClose();
      }}
      title="Tu imagen, en detalle"
      description={
        asset
          ? `${asset.width} × ${asset.height} · ${(asset.bytes / 1024 / 1024).toFixed(1)} MB · Archivo original`
          : undefined
      }
      wide
    >
      {asset && (
        <>
          <div className={`original-view ${zoom ? 'actual-size' : ''}`}>
            <AssetImage id={asset.id} alt={asset.filename} preview={false} />
          </div>
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setZoom(!zoom)}>
              {zoom ? <ZoomOut size={17} /> : <ZoomIn size={17} />}
              {zoom ? 'Ajustar a pantalla' : 'Ver al 100 %'}
            </button>
            <button
              className="button"
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                setDownloadError('');
                try {
                  await downloadAsset(asset.id, asset.filename);
                } catch (error) {
                  setDownloadError((error as Error).message);
                } finally {
                  setDownloading(false);
                }
              }}
            >
              <Download size={17} />
              {downloading ? 'Descargando…' : 'Descargar original'}
            </button>
          </div>
          {downloadError && (
            <p role="alert" className="inline-notice">
              {downloadError}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </div>
  );
}
export function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17" aria-hidden="true">
      <path d="M12 .8a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.37-3.9-1.37-.53-1.35-1.3-1.71-1.3-1.71-1.06-.73.08-.72.08-.72 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.57-.3-5.28-1.29-5.28-5.74 0-1.27.46-2.3 1.2-3.1-.12-.3-.52-1.47.12-3.05 0 0 .98-.31 3.17 1.19a11.05 11.05 0 0 1 5.77 0c2.2-1.5 3.16-1.19 3.16-1.19.64 1.58.24 2.75.12 3.05.75.8 1.2 1.83 1.2 3.1 0 4.46-2.72 5.43-5.3 5.72.42.36.79 1.07.79 2.16v3.25c0 .31.2.67.8.56A11.5 11.5 0 0 0 12 .8Z" />
    </svg>
  );
}
