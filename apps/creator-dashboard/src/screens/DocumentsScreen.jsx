import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { FileText, Upload, Link2, Check, Trash2, Eye, Download, Plus } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { FullScreenError } from '../components/ui';
import documentService from '../services/documentService';
import logger from '../utils/logger';
import './DocumentsScreen.css';

const MAX_BYTES = 50 * 1024 * 1024;

const STAGE_LABEL = {
  cover: 'Generando portada…',
  file: 'Subiendo documento…',
  'cover-upload': 'Guardando portada…',
  done: 'Listo',
};

function formatBytes(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function DocumentCard({ doc, onCopy, onToggle, onDelete, onReplace, copiedId, busyId }) {
  const isActive = doc.status === 'active';
  const busy = busyId === doc.docId;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="dc-card"
    >
      <div className="dc-cover">
        {doc.coverUrl
          ? <img src={doc.coverUrl} alt="" className="dc-cover-img" />
          : <div className="dc-cover-empty"><FileText size={26} /></div>}
        <span className={`dc-badge ${isActive ? 'dc-badge--active' : 'dc-badge--draft'}`}>
          {isActive ? 'Publicado' : 'Borrador'}
        </span>
      </div>

      <div className="dc-body">
        <h3 className="dc-title">{doc.title}</h3>
        <p className="dc-meta">
          {[doc.hasFile ? 'PDF' : 'Sin archivo', formatBytes(doc.sizeBytes), doc.pageCount ? `${doc.pageCount} pág.` : null]
            .filter(Boolean).join(' · ')}
        </p>

        <div className="dc-stats">
          <span><Eye size={13} /> {doc.viewCount}</span>
          <span><Download size={13} /> {doc.downloadCount}</span>
        </div>

        <div className="dc-actions">
          <button className="dc-btn" onClick={() => onCopy(doc)} disabled={!isActive}>
            {copiedId === doc.docId ? <><Check size={14} /> Copiado</> : <><Link2 size={14} /> Copiar link</>}
          </button>
          <button className="dc-btn" onClick={() => onReplace(doc)} disabled={busy}>
            <Upload size={14} /> {doc.hasFile ? 'Reemplazar' : 'Subir PDF'}
          </button>
          <button
            className={`dc-btn ${isActive ? '' : 'dc-btn--primary'}`}
            onClick={() => onToggle(doc)}
            disabled={busy || !doc.hasFile}
            title={!doc.hasFile ? 'Sube el archivo antes de publicar' : undefined}
          >
            {isActive ? 'Despublicar' : 'Publicar'}
          </button>
          <button className="dc-btn dc-btn--danger" onClick={() => onDelete(doc)} disabled={busy}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function DocumentsScreenInner() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const targetDocRef = useRef(null);

  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [stage, setStage] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { data: documents = [], isLoading, error } = useQuery({
    queryKey: ['creator', 'documents'],
    queryFn: () => documentService.list(),
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['creator', 'documents'] }),
    [queryClient]
  );

  const createMutation = useMutation({
    mutationFn: (title) => documentService.create({ title }),
    onSuccess: async (created) => {
      setCreating(false);
      setNewTitle('');
      await invalidate();
      // Straight into the file picker — a document without a PDF is useless.
      targetDocRef.current = created.docId;
      fileInputRef.current?.click();
    },
    onError: (err) => {
      logger.error('documents:create-failed', err);
      showToast('No se pudo crear el documento', 'error');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ docId, status }) => documentService.update(docId, { status }),
    onSuccess: invalidate,
    onError: (err) => showToast(err?.message || 'No se pudo cambiar el estado', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId) => documentService.remove(docId),
    onSuccess: invalidate,
    onError: () => showToast('No se pudo eliminar', 'error'),
  });

  const handleCopy = useCallback(async (doc) => {
    try {
      await navigator.clipboard.writeText(doc.url);
      setCopiedId(doc.docId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('No se pudo copiar el link', 'error');
    }
  }, [showToast]);

  const handleReplace = useCallback((doc) => {
    targetDocRef.current = doc.docId;
    fileInputRef.current?.click();
  }, []);

  const handleFilePicked = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const docId = targetDocRef.current;
    if (!file || !docId) return;

    if (file.type !== 'application/pdf') {
      showToast('Por ahora solo se admiten PDF', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast('El archivo supera los 50 MB', 'error');
      return;
    }

    setBusyId(docId);
    try {
      await documentService.uploadFile(docId, file, setStage);
      await invalidate();
      showToast('Documento listo. Publícalo cuando quieras.', 'success');
    } catch (err) {
      logger.error('documents:upload-failed', err);
      showToast('Falló la subida del documento', 'error');
    } finally {
      setBusyId(null);
      setStage(null);
    }
  }, [invalidate, showToast]);

  const handleDelete = useCallback((doc) => {
    if (!window.confirm(`¿Eliminar "${doc.title}"? El link dejará de funcionar.`)) return;
    deleteMutation.mutate(doc.docId);
  }, [deleteMutation]);

  if (error) return <FullScreenError message="No pudimos cargar tus documentos" />;

  return (
    <DashboardLayout>
      <div className="dc-screen">
        <header className="dc-header">
          <div>
            <h1 className="dc-heading">Documentos</h1>
            <p className="dc-sub">
              Sube un PDF y comparte el link. Quien lo abra ve la portada y lo descarga sin crear cuenta.
            </p>
          </div>
          <button className="dc-create" onClick={() => setCreating(true)}>
            <Plus size={16} /> Nuevo documento
          </button>
        </header>

        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="dc-create-row"
            >
              <input
                autoFocus
                className="dc-input"
                placeholder="Nombre del documento"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim()) createMutation.mutate(newTitle.trim());
                  if (e.key === 'Escape') { setCreating(false); setNewTitle(''); }
                }}
              />
              <button
                className="dc-btn dc-btn--primary"
                disabled={!newTitle.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate(newTitle.trim())}
              >
                Crear y subir PDF
              </button>
              <button className="dc-btn" onClick={() => { setCreating(false); setNewTitle(''); }}>
                Cancelar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {stage && <div className="dc-stage">{STAGE_LABEL[stage] || 'Procesando…'}</div>}

        {isLoading ? (
          <div className="dc-grid">
            {[0, 1, 2].map((i) => <div key={i} className="dc-card dc-card--skeleton" />)}
          </div>
        ) : documents.length === 0 ? (
          <div className="dc-empty">
            <FileText size={30} />
            <h2>Aún no tienes documentos</h2>
            <p>Guías, planes, recetarios. Cualquier PDF que quieras repartir con un link.</p>
            <button className="dc-btn dc-btn--primary" onClick={() => setCreating(true)}>
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="dc-grid">
            <AnimatePresence mode="popLayout">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.docId}
                  doc={doc}
                  copiedId={copiedId}
                  busyId={busyId}
                  onCopy={handleCopy}
                  onReplace={handleReplace}
                  onDelete={handleDelete}
                  onToggle={(d) => toggleMutation.mutate({
                    docId: d.docId,
                    status: d.status === 'active' ? 'draft' : 'active',
                  })}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handleFilePicked}
        />
      </div>
    </DashboardLayout>
  );
}

export default function DocumentsScreen() {
  return (
    <ErrorBoundary>
      <DocumentsScreenInner />
    </ErrorBoundary>
  );
}
