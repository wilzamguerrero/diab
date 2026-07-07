// PageSelector — choose or create the Notion page used as the data root.
// i18n via useI18n hook, with motion animations.

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, FolderOpen } from 'lucide-react';
import { NotionService } from '../services/notionService';
import { getSnapshot, setRootPage, useAppStore } from '../state/appStore';
import { useI18n } from '../services/i18n';

interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  lastEdited: string;
}

export type SearchPagesFn = () => Promise<NotionPage[]>;

export interface PageSelectorProps {
  searchPages?: SearchPagesFn;
}

const defaultSearchPages: SearchPagesFn = () => {
  const token = getSnapshot().accessToken ?? '';
  return new NotionService(token).searchPages();
};

type Mode = 'choose' | 'create';

export default function PageSelector({ searchPages = defaultSearchPages }: PageSelectorProps) {
  const { accessToken } = useAppStore();
  const { t } = useI18n();
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('choose');

  // Create page state
  const [newPageName, setNewPageName] = useState('Mi Diabetes Tracker');
  const [parentPageId, setParentPageId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const results = await searchPages();
      setPages(results);
      setStatus('loaded');
      // Auto-select first page as parent for new page creation
      if (results.length > 0 && !parentPageId) {
        setParentPageId(results[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [searchPages, parentPageId]);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const filtered = query.trim()
    ? pages.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    : pages;

  async function handleCreatePage() {
    if (!newPageName.trim() || !parentPageId || !accessToken) return;
    setCreating(true);
    setCreateError(null);
    try {
      const service = new NotionService(accessToken);
      const result = await service.createChildPage(parentPageId, newPageName.trim());
      setRootPage(result.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear la página');
    } finally {
      setCreating(false);
    }
  }

  return (
    <motion.section
      aria-label="Seleccionar página de Notion"
      className="page-selector"
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <h2>{t('page.title')}</h2>
      <p>{t('page.description')}</p>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <motion.button
          type="button"
          onClick={() => setMode('choose')}
          whileTap={{ scale: 0.95 }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: mode === 'choose' ? '#1a1f36' : 'rgba(26,31,54,0.08)',
            color: mode === 'choose' ? '#fff' : 'rgba(26,31,54,0.7)',
            padding: '12px 16px',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '0.85rem',
            border: 'none',
          }}
        >
          <FolderOpen size={16} /> Elegir existente
        </motion.button>
        <motion.button
          type="button"
          onClick={() => setMode('create')}
          whileTap={{ scale: 0.95 }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: mode === 'create' ? '#c8ff00' : 'rgba(26,31,54,0.08)',
            color: mode === 'create' ? '#1a1f36' : 'rgba(26,31,54,0.7)',
            padding: '12px 16px',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '0.85rem',
            border: 'none',
          }}
        >
          <Plus size={16} /> Crear nueva
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'choose' ? (
          <motion.div
            key="choose"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <label className="page-selector__search">
              <span>{t('page.searchLabel')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('page.searchPlaceholder')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            {status === 'loading' && (
              <p role="status" aria-live="polite">{t('page.loading')}</p>
            )}

            {status === 'error' && (
              <div role="alert">
                <p>{t('page.error')}: {error}</p>
                <motion.button type="button" onClick={() => void load()} whileTap={{ scale: 0.95 }}>
                  {t('page.retry')}
                </motion.button>
              </div>
            )}

            {status === 'loaded' && filtered.length === 0 && (
              <p>{t('page.empty')}</p>
            )}

            {status === 'loaded' && filtered.length > 0 && (
              <ul className="page-selector__list">
                {filtered.map((page, index) => (
                  <motion.li
                    key={page.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <motion.button
                      type="button"
                      onClick={() => setRootPage(page.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {page.icon ? <span aria-hidden="true">{page.icon} </span> : null}
                      {page.title || t('page.untitled')}
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div style={{ marginBottom: '14px' }}>
              <label htmlFor="new-page-name">Nombre de la nueva página</label>
              <input
                id="new-page-name"
                type="text"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                placeholder="Ej: Mi Diabetes Tracker"
              />
            </div>

            {pages.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="parent-page-select">Crear dentro de</label>
                <select
                  id="parent-page-select"
                  value={parentPageId || ''}
                  onChange={(e) => setParentPageId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '2px solid rgba(26,31,54,0.1)',
                    font: 'inherit',
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.7)',
                  }}
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon ? `${p.icon} ` : ''}{p.title || 'Sin título'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <motion.button
              type="button"
              onClick={handleCreatePage}
              disabled={creating || !newPageName.trim() || !parentPageId}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: '#c8ff00',
                color: '#1a1f36',
                fontWeight: 800,
                width: '100%',
                padding: '14px',
              }}
            >
              {creating ? 'Creando...' : '✨ Crear página y continuar'}
            </motion.button>

            {createError && (
              <motion.p
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ marginTop: '12px' }}
              >
                {createError}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
