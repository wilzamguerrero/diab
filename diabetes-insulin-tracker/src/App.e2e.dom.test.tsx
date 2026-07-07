// End-to-end integration test of the wired application (task 12.2).
//
// Exercises the full wired flow against a MOCKED NotionService that stores data
// in an in-memory Notion "block tree" shared across every service instance the
// app constructs. Because App, ProfileSettings, QuickRecord, HistoryView and
// MetricsScreen each build their own `new NotionService(token)`, the fake keeps
// a single backing store at module scope so a write in one screen is visible to
// a read in another — mirroring a real shared Notion workspace.
//
// Flow verified:
//   1. Connect      → the connect gate is replaced by the tabbed app.      (Req 1.1)
//   2. Save profile → profile persists (service write recorded + cached).   (Req 2.1)
//   3. Record       → a reading row is written to the year database.        (Req 5.2)
//   4. History/Metrics → the recorded reading is retrieved and rendered
//                        (glucose value, meal tag, timestamp) and aggregated.(Req 6.1, 7.1)
//
// The fake mirrors the block shapes exercised by the real repositories/schema
// (see src/services/*.test.ts) so ensureYear + createDatabaseRow +
// queryDatabaseAll and the profile toggle/code-block round-trip interoperate.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── In-memory fake NotionService (shared across all instances) ──────────
//
// Declared via vi.hoisted so the vi.mock factory below can reference it and the
// test can reset + inspect it between runs.
const fake = vi.hoisted(() => {
  const ROOT_PAGE_ID = 'root-page';

  interface FakeNode {
    id: string;
    type: string; // 'toggle' | 'child_database' | 'code'
    title?: string;
    content?: string;
    language?: string;
    caption?: string;
  }

  interface Calls {
    getBlockChildren: number;
    createFolder: number;
    createFile: number;
    createDatabase: number;
    createDatabaseRow: number;
    updateCodeBlock: number;
    queryDatabaseAll: number;
  }

  const zeroCalls = (): Calls => ({
    getBlockChildren: 0,
    createFolder: 0,
    createFile: 0,
    createDatabase: 0,
    createDatabaseRow: 0,
    updateCodeBlock: 0,
    queryDatabaseAll: 0,
  });

  const state = {
    seq: 0,
    blocks: new Map<string, FakeNode>(),
    children: new Map<string, string[]>(),
    rows: new Map<string, any[]>(),
    calls: zeroCalls(),
  };

  function reset(): void {
    state.seq = 0;
    state.blocks.clear();
    state.children.clear();
    state.rows.clear();
    state.children.set(ROOT_PAGE_ID, []);
    state.calls = zeroCalls();
  }
  reset();

  function nextId(prefix: string): string {
    return `${prefix}-${++state.seq}`;
  }

  function appendChild(parentId: string, childId: string): void {
    const kids = state.children.get(parentId) ?? [];
    kids.push(childId);
    state.children.set(parentId, kids);
  }

  function toRichText(content: string): any[] {
    if (!content) return [{ plain_text: '', text: { content: '' } }];
    const parts: any[] = [];
    for (let i = 0; i < content.length; i += 2000) {
      const slice = content.slice(i, i + 2000);
      parts.push({ plain_text: slice, text: { content: slice } });
    }
    return parts;
  }

  class NotionServiceMock {
    apiKey: string;

    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }

    clearCache(): void {
      /* no-op for the fake */
    }

    invalidateBlock(_blockId: string): void {
      /* no-op for the fake */
    }

    async getBlockChildren(blockId: string): Promise<any[]> {
      state.calls.getBlockChildren++;
      const ids = state.children.get(blockId) ?? [];
      return ids.map((id) => {
        const block = state.blocks.get(id)!;
        const hasChildren = (state.children.get(id)?.length ?? 0) > 0;
        if (block.type === 'toggle') {
          return {
            id,
            type: 'toggle',
            has_children: hasChildren,
            toggle: {
              rich_text: [
                { plain_text: block.title ?? '', text: { content: block.title ?? '' } },
              ],
            },
          };
        }
        if (block.type === 'code') {
          return {
            id,
            type: 'code',
            has_children: false,
            code: {
              rich_text: toRichText(block.content ?? ''),
              language: block.language ?? 'plain text',
              caption: [
                { plain_text: block.caption ?? '', text: { content: block.caption ?? '' } },
              ],
            },
          };
        }
        // child_database (or any other block type)
        return { id, type: block.type, has_children: hasChildren };
      });
    }

    async createFolder(parentId: string, title: string): Promise<any> {
      state.calls.createFolder++;
      const id = nextId('toggle');
      state.blocks.set(id, { id, type: 'toggle', title });
      state.children.set(id, []);
      appendChild(parentId, id);
      return { id, name: title, type: 'folder' };
    }

    async createFile(parentId: string, name: string, language = 'plain text'): Promise<any> {
      state.calls.createFile++;
      const id = nextId('code');
      state.blocks.set(id, { id, type: 'code', content: '', language, caption: name });
      state.children.set(id, []);
      appendChild(parentId, id);
      return { id, name, type: 'file', language };
    }

    async createDatabase(
      parentBlockId: string,
      _title: string,
      _properties: object,
    ): Promise<{ id: string }> {
      state.calls.createDatabase++;
      const id = nextId('db');
      state.blocks.set(id, { id, type: 'child_database' });
      state.children.set(id, []);
      state.rows.set(id, []);
      appendChild(parentBlockId, id);
      return { id };
    }

    async createDatabaseRow(databaseId: string, properties: object): Promise<{ id: string }> {
      state.calls.createDatabaseRow++;
      const id = nextId('row');
      const arr = state.rows.get(databaseId) ?? [];
      arr.push({ id, properties });
      state.rows.set(databaseId, arr);
      return { id };
    }

    async updateCodeBlock(blockId: string, content: string): Promise<void> {
      state.calls.updateCodeBlock++;
      const block = state.blocks.get(blockId);
      if (block && block.type === 'code') {
        block.content = content;
      }
    }

    async queryDatabase(
      databaseId: string,
      _body: object,
      startCursor?: string,
    ): Promise<{ results: any[]; has_more: boolean; next_cursor: string | null }> {
      const arr = state.rows.get(databaseId) ?? [];
      const pageSize = 100;
      const start = startCursor ? Number.parseInt(startCursor, 10) : 0;
      const end = start + pageSize;
      const results = arr.slice(start, end);
      const hasMore = end < arr.length;
      return { results, has_more: hasMore, next_cursor: hasMore ? String(end) : null };
    }

    async queryDatabaseAll(databaseId: string, body: object): Promise<any[]> {
      state.calls.queryDatabaseAll++;
      let all: any[] = [];
      let hasMore = true;
      let cursor: string | undefined;
      while (hasMore) {
        const page = await this.queryDatabase(databaseId, body, cursor);
        all = [...all, ...page.results];
        hasMore = page.has_more;
        cursor = page.next_cursor ?? undefined;
      }
      return all;
    }

    static formatUUID(idOrUrl: string): string {
      return idOrUrl;
    }

    static async exchangeOAuthCode(
      _code: string,
      _redirectUri: string,
    ): Promise<{ access_token: string; workspace_name: string; error?: string }> {
      return { access_token: 'test-token', workspace_name: 'Test Workspace' };
    }

    static getOAuthUrl(_clientId: string, _redirectUri: string, _state: string): string {
      return 'https://api.notion.com/v1/oauth/authorize';
    }
  }

  return { ROOT_PAGE_ID, state, reset, NotionServiceMock };
});

// Replace the real NotionService module with the in-memory fake. Every consumer
// (App, components, notionSchema, repositories) imports from this same module,
// so a single mock covers the whole wired flow.
vi.mock('./services/notionService', () => ({
  NotionService: fake.NotionServiceMock,
  ROOT_PAGE_ID: fake.ROOT_PAGE_ID,
  NOTION_OAUTH_CLIENT_ID: 'test-client-id',
  NOTION_PORTFOLIO_KEY: '',
}));

// Imports below resolve AFTER the mock is hoisted into place.
import App from './App';
import { setConnection, setRootPage, resetStore, getSnapshot } from './state/appStore';
import { clearYearCache } from './services/notionSchema';

beforeEach(() => {
  // Reset all cross-test state so the connection, profile cache, year-db cache,
  // and in-memory Notion store never bleed between tests.
  resetStore();
  localStorage.clear();
  clearYearCache();
  fake.reset();
});

describe('App end-to-end wired flow (mocked NotionService)', () => {
  it('connects, saves a profile, records a reading, and views it in history/metrics', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // ── 1. Connection gate (Req 1.1) ──────────────────────────────────
    // Before connecting, the app shows the Notion connect gate and none of the
    // gated tabs are reachable.
    expect(
      screen.getByRole('heading', { name: /conectar notion/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /perfil/i })).not.toBeInTheDocument();

    // Simulate a successful connection AND page selection by driving the shared
    // store directly (deterministic — no browser redirect / URL ?code or page
    // search needed). The mocked NotionService backs its store at 'root-page'.
    act(() => {
      setConnection('test-token');
      setRootPage(fake.ROOT_PAGE_ID);
    });

    // The gate is replaced by the tabbed application shell.
    expect(await screen.findByRole('tab', { name: /perfil/i })).toBeInTheDocument();
    for (const label of ['Calculadora', 'Registrar', 'Historial', 'Métricas', 'Perfil']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }

    // Wait for the on-connect schema bootstrap (ensureYear) to create the
    // current year's database, so subsequent record/query calls route to it.
    await waitFor(() => {
      expect(fake.state.calls.createDatabase).toBeGreaterThanOrEqual(1);
    });

    // ── 2. Save profile (Req 2.1) ─────────────────────────────────────
    await user.click(screen.getByRole('tab', { name: /perfil/i }));

    const icInput = await screen.findByLabelText(/ratio insulina-carbohidratos/i);
    await user.type(icInput, '10');
    await user.type(screen.getByLabelText(/factor de sensibilidad/i), '50');
    await user.type(screen.getByLabelText(/glucosa objetivo/i), '120');
    await user.click(screen.getByRole('button', { name: /guardar perfil/i }));

    // A success status appears and the profile write was recorded by the
    // mocked service (persisted as JSON in the profile toggle's code block).
    expect(await screen.findByRole('status')).toHaveTextContent(/perfil guardado/i);
    expect(fake.state.calls.updateCodeBlock).toBeGreaterThanOrEqual(1);

    // Components share state via the store: the cached profile now reflects the
    // saved values.
    expect(getSnapshot().profile).toEqual({ icRatio: 10, isf: 50, targetGlucose: 120 });

    // ── 3. Record a reading (Req 5.2) ─────────────────────────────────
    await user.click(screen.getByRole('tab', { name: /registrar/i }));

    const glucoseInput = await screen.findByLabelText(/glucosa \(mg\/dL\)/i);
    await user.type(glucoseInput, '140');
    await user.click(screen.getByRole('radio', { name: /post-comida/i }));
    await user.click(screen.getByRole('button', { name: /guardar lectura/i }));

    // Success is reported and the mocked persistence captured a database row.
    expect(await screen.findByTestId('quick-record-success')).toHaveTextContent(
      /lectura guardada/i,
    );
    expect(fake.state.calls.createDatabaseRow).toBeGreaterThanOrEqual(1);

    // ── 4a. History shows the recorded reading (Req 6.1) ──────────────
    await user.click(screen.getByRole('tab', { name: /historial/i }));

    // Default range is "day"; the reading recorded "now" falls in it and is
    // rendered with its glucose value, meal tag, and timestamp.
    expect(await screen.findByText(/140 mg\/dL/)).toBeInTheDocument();
    expect(screen.getByText(/post-comida/i)).toBeInTheDocument();
    const timeEl = container.querySelector('time');
    expect(timeEl).not.toBeNull();
    expect(timeEl?.getAttribute('dateTime')).toBeTruthy();

    // A read against the mocked service actually occurred.
    expect(fake.state.calls.queryDatabaseAll).toBeGreaterThanOrEqual(1);

    // ── 4b. Metrics aggregate the recorded reading (Req 7.1) ──────────
    await user.click(screen.getByRole('tab', { name: /métricas/i }));

    // MetricsScreen loads the week's readings then renders the patient metrics;
    // with a single 140 mg/dL reading the average is 140.
    expect(await screen.findByText(/glucosa promedio/i)).toBeInTheDocument();
    // The patient metrics table is present and the average value (140 mg/dL for
    // a single 140 reading) is rendered.
    expect(screen.getByLabelText(/patient metrics/i)).toBeInTheDocument();
    expect(screen.getAllByText(/140 mg\/dL/).length).toBeGreaterThanOrEqual(1);
  });
});
