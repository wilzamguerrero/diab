// NotionConnect — Notion OAuth connection gate.
//
// Requirements 1.1, 1.4: Present a connection action before recording is allowed.
// i18n via useI18n hook, with motion animations.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  NotionService,
  NOTION_OAUTH_CLIENT_ID,
} from '../services/notionService';
import { setConnection, useAppStore } from '../state/appStore';
import { useI18n } from '../services/i18n';

/** Shape of the OAuth exchange result this component relies on. */
export interface OAuthExchangeResult {
  access_token?: string;
  error?: string;
  workspace_name?: string;
}

/** Injectable OAuth code-exchange function (defaults to NotionService). */
export type ExchangeCodeFn = (
  code: string,
  redirectUri: string,
) => Promise<OAuthExchangeResult>;

export interface NotionConnectProps {
  children?: ReactNode;
  onConnect?: () => void;
  exchangeCode?: ExchangeCodeFn;
  clientId?: string;
  redirectUri?: string;
  oauthCode?: string | null;
}

function defaultRedirectUri(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  const { origin, pathname } = window.location;
  const normalizedPath = pathname.replace(/\/+$/, '');
  return normalizedPath ? `${origin}${normalizedPath}` : origin;
}

function readCodeFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    return new URLSearchParams(window.location.search).get('code');
  } catch {
    return null;
  }
}

function generateState(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Remove OAuth query params (code, state) from the URL without reloading. */
function cleanOAuthParams(): void {
  if (typeof window === 'undefined' || !window.history) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.pathname + url.search);
}

type Phase = 'idle' | 'exchanging' | 'error';

export default function NotionConnect({
  children,
  onConnect,
  exchangeCode = NotionService.exchangeOAuthCode,
  clientId = NOTION_OAUTH_CLIENT_ID,
  redirectUri,
  oauthCode,
}: NotionConnectProps) {
  const { connected } = useAppStore();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  const resolvedRedirectUri = redirectUri ?? defaultRedirectUri();
  const code = oauthCode === undefined ? readCodeFromUrl() : oauthCode;

  const runExchange = useCallback(
    async (authCode: string) => {
      setPhase('exchanging');
      setError(null);
      try {
        const result = await exchangeCode(authCode, resolvedRedirectUri);
        if (result.error || !result.access_token) {
          setError(result.error || t('notion.error'));
          setPhase('error');
          // Clean URL so stale code isn't retried
          cleanOAuthParams();
          return;
        }
        setConnection(result.access_token);
        setPhase('idle');
        // Remove code/state from URL to prevent re-exchange on reload
        cleanOAuthParams();
      } catch {
        setError(t('notion.error'));
        setPhase('error');
        cleanOAuthParams();
      }
    },
    [exchangeCode, resolvedRedirectUri, t],
  );

  useEffect(() => {
    if (connected) return;
    if (!code) return;
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    void runExchange(code);
  }, [code, connected, runExchange]);

  const handleConnect = useCallback(() => {
    setError(null);
    if (onConnect) {
      onConnect();
      return;
    }
    if (!clientId) {
      setError(t('notion.clientError'));
      setPhase('error');
      return;
    }
    const url = NotionService.getOAuthUrl(
      clientId,
      resolvedRedirectUri,
      generateState(),
    );
    if (typeof window !== 'undefined' && window.location) {
      window.location.assign(url);
    }
  }, [onConnect, clientId, resolvedRedirectUri, t]);

  if (connected) {
    return <>{children}</>;
  }

  // While exchanging the OAuth code, show a minimal loader instead of the full card
  if (phase === 'exchanging') {
    return (
      <motion.div
        aria-label="Conectando con Notion"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '4px solid rgba(200,255,0,0.3)',
            borderTopColor: '#c8ff00',
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        />
        <p style={{ marginTop: '1rem', fontWeight: 600, opacity: 0.7 }}>Conectando con Notion...</p>
      </motion.div>
    );
  }

  return (
    <motion.section
      aria-label="Conexión de Notion"
      className="notion-connect"
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <h2>{t('notion.title')}</h2>
      <p>{t('notion.description')}</p>

      {phase === 'error' && error && (
        <motion.p
          role="alert"
          className="notion-connect__error"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.p>
      )}

      <motion.button
        type="button"
        onClick={handleConnect}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {t('notion.button')}
      </motion.button>
    </motion.section>
  );
}
