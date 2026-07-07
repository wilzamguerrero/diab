// NotionConnect — Notion OAuth connection gate.
//
// Responsibilities (design.md → NotionConnect: Requirements 1.1, 1.4):
//   - Present a Notion connection action before any data recording is allowed
//     (Req 1.1). While disconnected the component shows a clear "Connect Notion"
//     call-to-action and does NOT render its gated children.
//   - Drive the reused OAuth flow: clicking connect navigates to the URL from
//     `NotionService.getOAuthUrl(...)`. When Notion redirects back with a `?code`
//     the code is exchanged via `NotionService.exchangeOAuthCode(...)`.
//   - On a successful exchange, store the access token and mark the app
//     connected (`setConnection`), then reveal the gated children.
//   - On a failed exchange (an `error` field in the result or a thrown error),
//     display an error message and REMAIN disconnected (Req 1.4) — the store's
//     connection state is never touched on failure.
//
// The component reflects connection state from the shared app store so parents
// can simply wrap gated UI (recording, profile persistence) as children.
//
// Testability: the OAuth `exchange` function and the authorization `code` are
// injectable via props so component tests can simulate success/failure without
// a live browser redirect. They default to the real service and the current
// URL respectively.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  NotionService,
  NOTION_OAUTH_CLIENT_ID,
} from '../services/notionService';
import { setConnection, useAppStore } from '../state/appStore';

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
  /**
   * Gated content rendered ONLY once a Notion workspace is connected. Keeping
   * recording/profile UI as children ensures it is unreachable pre-connection
   * (Req 1.1).
   */
  children?: ReactNode;
  /**
   * Optional override for the connect action. When omitted, the default action
   * navigates the browser to the Notion OAuth authorization URL.
   */
  onConnect?: () => void;
  /**
   * Optional override for the OAuth code exchange. Defaults to
   * `NotionService.exchangeOAuthCode`. Injected primarily for testing.
   */
  exchangeCode?: ExchangeCodeFn;
  /** OAuth client id. Defaults to the configured `NOTION_OAUTH_CLIENT_ID`. */
  clientId?: string;
  /** OAuth redirect URI. Defaults to the current page origin + path. */
  redirectUri?: string;
  /**
   * The OAuth authorization code returned by Notion. Defaults to reading the
   * `code` query parameter from the current URL on mount. Pass `null` to
   * explicitly disable URL-based detection (e.g. in tests).
   */
  oauthCode?: string | null;
}

/** Compute a sensible default redirect URI from the current location. */
function defaultRedirectUri(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  const { origin, pathname } = window.location;
  const normalizedPath = pathname.replace(/\/+$/, '');
  return normalizedPath ? `${origin}${normalizedPath}` : origin;
}

/** Read the `code` query parameter from the current URL, if present. */
function readCodeFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    return new URLSearchParams(window.location.search).get('code');
  } catch {
    return null;
  }
}

/** Generate a random CSRF state token with a safe fallback. */
function generateState(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to fallback
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  // Guard so the one-shot code exchange runs at most once per code.
  const exchangeStarted = useRef(false);

  const resolvedRedirectUri = redirectUri ?? defaultRedirectUri();

  // Resolve the authorization code: explicit prop wins; `undefined` means
  // "read from the URL"; `null` means "no code".
  const code =
    oauthCode === undefined ? readCodeFromUrl() : oauthCode;

  const runExchange = useCallback(
    async (authCode: string) => {
      setPhase('exchanging');
      setError(null);
      try {
        const result = await exchangeCode(authCode, resolvedRedirectUri);
        if (result.error || !result.access_token) {
          // Failure: surface the error and stay disconnected (Req 1.4).
          setError(result.error || 'Notion connection failed. Please try again.');
          setPhase('error');
          return;
        }
        // Success: persist token + mark connected.
        setConnection(result.access_token);
        setPhase('idle');
      } catch {
        // Thrown/network failure: stay disconnected (Req 1.4).
        setError('Notion connection failed. Please try again.');
        setPhase('error');
      }
    },
    [exchangeCode, resolvedRedirectUri],
  );

  // On mount (or when a code first becomes available), complete the exchange.
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
      setError('Notion OAuth client id is not configured.');
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
  }, [onConnect, clientId, resolvedRedirectUri]);

  // Connected: reveal gated children.
  if (connected) {
    return <>{children}</>;
  }

  // Disconnected: present the connection action (Req 1.1).
  return (
    <section aria-label="Notion connection" className="notion-connect">
      <h2>Connect Notion</h2>
      <p>
        Connect your Notion workspace to record and store your readings. Data
        recording is unavailable until you connect.
      </p>

      {phase === 'error' && error && (
        <p role="alert" className="notion-connect__error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={phase === 'exchanging'}
      >
        {phase === 'exchanging' ? 'Connecting…' : 'Connect Notion'}
      </button>
    </section>
  );
}
