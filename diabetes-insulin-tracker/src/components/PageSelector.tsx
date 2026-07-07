// PageSelector — choose the Notion page used as the data root.
// i18n via useI18n hook, with motion animations.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { NotionService } from '../services/notionService';
import { getSnapshot, setRootPage, useAppStore } from '../state/appStore';
import { useI18n } from '../services/i18n';

interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  lastEdited: string;
}

/** Injectable page loader (defaults to a store-token-backed NotionService). */
export type SearchPagesFn = () => Promise<NotionPage[]>;

export interface PageSelectorProps {
  searchPages?: SearchPagesFn;
}

const defaultSearchPages: SearchPagesFn = () => {
  const token = getSnapshot().accessToken ?? '';
  return new NotionService(token).searchPages();
};

export default function PageSelector({ searchPages = defaultSearchPages }: PageSelectorProps) {
  const { accessToken } = useAppStore();
  const { t } = useI18n();
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const results = await searchPages();
      setPages(results);
      setStatus('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [searchPages]);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const filtered = query.trim()
    ? pages.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    : pages;

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
        <p role="status" aria-live="polite">
          {t('page.loading')}
        </p>
      )}

      {status === 'error' && (
        <div role="alert">
          <p>{t('page.error')}: {error}</p>
          <motion.button
            type="button"
            onClick={() => void load()}
            whileTap={{ scale: 0.95 }}
          >
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
    </motion.section>
  );
}
