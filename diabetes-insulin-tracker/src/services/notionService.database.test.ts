import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { NotionService } from './notionService';

// Integration tests for the database operations added to NotionService.
//
// These tests exercise the real `notionFetch` transport by stubbing the global
// `fetch`. We assert on the request shapes that reach `fetch`:
// - the `endpoint` query parameter of the proxied URL (the Notion REST path)
// - the HTTP method (POST when a body is present)
// - the JSON body sent to the proxy
//
// They also verify that `queryDatabaseAll` follows the `has_more` / `next_cursor`
// cursor chain and aggregates results across every page.
//
// Validates: Requirements 1.5, 6.5

// A plain 32-hex id (formatUUID-safe: it is returned as-is with dashes stripped).
const DB_ID = 'a'.repeat(32);
const PARENT_ID = 'b'.repeat(32);

// Build a mock fetch Response-like object with a JSON payload.
function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  };
}

// Extract the decoded `endpoint` query parameter from a proxied request URL.
function endpointOf(url: string): string {
  const match = url.match(/[?&]endpoint=([^&]+)/);
  expect(match, `URL should contain endpoint param: ${url}`).not.toBeNull();
  return decodeURIComponent(match![1]);
}

// Extract the decoded `method` query parameter from a proxied request URL.
function methodParamOf(url: string): string {
  const match = url.match(/[?&]method=([^&]+)/);
  expect(match, `URL should contain method param: ${url}`).not.toBeNull();
  return decodeURIComponent(match![1]);
}

// Parse the JSON body from a fetch call's RequestInit argument.
function bodyOf(init: RequestInit | undefined): any {
  expect(init, 'fetch should be called with an init object').toBeTruthy();
  const raw = init!.body;
  expect(typeof raw, 'request body should be a JSON string').toBe('string');
  return JSON.parse(raw as string);
}

describe('NotionService database operations (mocked fetch)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let service: NotionService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = new NotionService('test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('createDatabase', () => {
    it('POSTs to /databases with a block_id parent, title rich text, and properties', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'new-db-id' }));

      const properties = {
        Name: { title: {} },
        Glucose: { number: {} },
      };
      const result = await service.createDatabase(PARENT_ID, 'Readings 2024', properties);

      expect(result).toEqual({ id: 'new-db-id' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(endpointOf(url)).toBe('/databases');
      // A body is present, so the actual HTTP method must be POST.
      expect((init as RequestInit).method).toBe('POST');
      expect(methodParamOf(url)).toBe('POST');

      const body = bodyOf(init as RequestInit);
      expect(body.parent).toEqual({ type: 'block_id', block_id: PARENT_ID });
      expect(body.title).toEqual([{ type: 'text', text: { content: 'Readings 2024' } }]);
      expect(body.properties).toEqual(properties);
    });
  });

  describe('createDatabaseRow', () => {
    it('POSTs to /pages with a database_id parent and the provided properties', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'new-row-id' }));

      const properties = {
        Glucose: { number: 120 },
        Meal_Tag: { select: { name: 'pre' } },
      };
      const result = await service.createDatabaseRow(DB_ID, properties);

      expect(result).toEqual({ id: 'new-row-id' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(endpointOf(url)).toBe('/pages');
      expect((init as RequestInit).method).toBe('POST');

      const body = bodyOf(init as RequestInit);
      expect(body.parent).toEqual({ database_id: DB_ID });
      expect(body.properties).toEqual(properties);
    });
  });

  describe('queryDatabase', () => {
    it('POSTs to /databases/{id}/query and returns a normalized single page', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'r1' }], has_more: false, next_cursor: null }),
      );

      const filterBody = { filter: { property: 'Glucose', number: { greater_than: 100 } } };
      const page = await service.queryDatabase(DB_ID, filterBody);

      expect(page).toEqual({ results: [{ id: 'r1' }], has_more: false, next_cursor: null });

      const [url, init] = fetchMock.mock.calls[0];
      expect(endpointOf(url)).toBe(`/databases/${DB_ID}/query`);
      expect((init as RequestInit).method).toBe('POST');

      const body = bodyOf(init as RequestInit);
      expect(body.filter).toEqual(filterBody.filter);
      // No cursor was supplied, so start_cursor must not be present.
      expect(body).not.toHaveProperty('start_cursor');
    });

    it('merges start_cursor into the request body when provided', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [], has_more: false, next_cursor: null }),
      );

      await service.queryDatabase(DB_ID, { filter: { property: 'x' } }, 'cursor-123');

      const [, init] = fetchMock.mock.calls[0];
      const body = bodyOf(init as RequestInit);
      expect(body.start_cursor).toBe('cursor-123');
      expect(body.filter).toEqual({ property: 'x' });
    });
  });

  describe('queryDatabaseAll', () => {
    it('aggregates every page by following the has_more / next_cursor chain', async () => {
      // First page: has_more true, hands out cursor 'c1'.
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'p1a' }, { id: 'p1b' }], has_more: true, next_cursor: 'c1' }),
      );
      // Second page: terminates the loop.
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'p2a' }], has_more: false, next_cursor: null }),
      );

      const queryBody = { filter: { property: 'Timestamp' } };
      const all = await service.queryDatabaseAll(DB_ID, queryBody);

      // Combined results contain every item from both pages, in order.
      expect(all).toEqual([{ id: 'p1a' }, { id: 'p1b' }, { id: 'p2a' }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // First request carries no cursor.
      const firstBody = bodyOf(fetchMock.mock.calls[0][1] as RequestInit);
      expect(firstBody).not.toHaveProperty('start_cursor');
      expect(firstBody.filter).toEqual(queryBody.filter);

      // Second request carries the cursor 'c1' returned by the first page.
      const secondUrl = fetchMock.mock.calls[1][0];
      expect(endpointOf(secondUrl)).toBe(`/databases/${DB_ID}/query`);
      const secondBody = bodyOf(fetchMock.mock.calls[1][1] as RequestInit);
      expect(secondBody.start_cursor).toBe('c1');
      expect(secondBody.filter).toEqual(queryBody.filter);
    });

    it('returns a single page unchanged when has_more is false on the first call', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'only' }], has_more: false, next_cursor: null }),
      );

      const all = await service.queryDatabaseAll(DB_ID, {});

      expect(all).toEqual([{ id: 'only' }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('throws a descriptive error on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse('boom', false, 400));

      await expect(service.createDatabaseRow(DB_ID, {})).rejects.toThrow(
        /Notion API error \(400\): boom/,
      );
    });
  });
});
