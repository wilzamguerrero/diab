import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import { addReading, getReadings } from './readingsRepository';
import { clearYearCache } from './notionSchema';
import { rangeFor } from '../domain/history';
import type { NotionService } from './notionService';
import type { Reading } from '../types';

// Integration tests for the readings repository against a stateful, in-memory
// fake NotionService. These exercise the real ensureYear year-routing logic
// (notionSchema) and the real pagination aggregation in getReadings, while the
// fake stands in for the Notion transport layer.
//
// Feature: diabetes-insulin-tracker, Property 12: Reading persistence round-trip
//   and year routing.
// Feature: diabetes-insulin-tracker, Property 15: Pagination completeness.
//
// Validates: Requirements 5.1, 5.2, 6.5

/**
 * Stateful fake NotionService.
 *
 * Models Notion as a tree of blocks under a root page:
 *   - Year toggles (type 'toggle') created via createFolder.
 *   - A child_database under each toggle, created via createDatabase.
 *   - Rows (pages) stored per database via createDatabaseRow.
 *
 * getBlockChildren returns the block shapes ensureYear expects; queryDatabase
 * pages results with cursor semantics that mirror the real NotionService, and
 * queryDatabaseAll loops queryDatabase to aggregate every page.
 */
class FakeNotionService {
  private idCounter = 0;
  private readonly rootId: string;
  /** parent block id -> ordered child block ids */
  private readonly children = new Map<string, string[]>();
  /** block id -> block representation (toggle or child_database) */
  private readonly blocks = new Map<string, any>();
  /** database id -> stored rows (pages) */
  private readonly rows = new Map<string, any[]>();

  /** Number of rows returned per queryDatabase page. */
  pageSize: number;
  /** Instrumentation: how many times queryDatabase was invoked. */
  queryDatabaseCalls = 0;

  constructor(rootId: string, pageSize = 100) {
    this.rootId = rootId;
    this.pageSize = pageSize;
    this.children.set(rootId, []);
  }

  private nextId(prefix: string): string {
    return `${prefix}-${++this.idCounter}`;
  }

  private appendChild(parentId: string, childId: string): void {
    const kids = this.children.get(parentId) ?? [];
    kids.push(childId);
    this.children.set(parentId, kids);
  }

  async getBlockChildren(blockId: string): Promise<any[]> {
    const ids = this.children.get(blockId) ?? [];
    return ids.map((id) => {
      const block = this.blocks.get(id);
      return { ...block, has_children: (this.children.get(id)?.length ?? 0) > 0 };
    });
  }

  async createFolder(parentId: string, title: string): Promise<{ id: string }> {
    const id = this.nextId('toggle');
    this.blocks.set(id, {
      id,
      type: 'toggle',
      toggle: { rich_text: [{ plain_text: title }] },
    });
    this.children.set(id, []);
    this.appendChild(parentId, id);
    return { id };
  }

  async createDatabase(
    parentBlockId: string,
    _title: string,
    _properties: object,
  ): Promise<{ id: string }> {
    const id = this.nextId('db');
    this.blocks.set(id, { id, type: 'child_database' });
    this.rows.set(id, []);
    this.appendChild(parentBlockId, id);
    return { id };
  }

  async createDatabaseRow(databaseId: string, properties: object): Promise<{ id: string }> {
    const id = this.nextId('row');
    const arr = this.rows.get(databaseId) ?? [];
    arr.push({ id, properties });
    this.rows.set(databaseId, arr);
    return { id };
  }

  async queryDatabase(
    databaseId: string,
    _body: object,
    startCursor?: string,
  ): Promise<{ results: any[]; has_more: boolean; next_cursor: string | null }> {
    this.queryDatabaseCalls++;
    const arr = this.rows.get(databaseId) ?? [];
    const start = startCursor ? Number.parseInt(startCursor, 10) : 0;
    const end = start + this.pageSize;
    const results = arr.slice(start, end);
    const hasMore = end < arr.length;
    return { results, has_more: hasMore, next_cursor: hasMore ? String(end) : null };
  }

  async queryDatabaseAll(databaseId: string, body: object): Promise<any[]> {
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

  // ── Test-only inspection helpers ─────────────────────────────────────

  /** Resolve the database id that the year toggle routes to, if any. */
  getDbIdForYear(year: number): string | undefined {
    const rootKids = this.children.get(this.rootId) ?? [];
    for (const toggleId of rootKids) {
      const block = this.blocks.get(toggleId);
      if (block?.type === 'toggle' && block.toggle?.rich_text?.[0]?.plain_text === String(year)) {
        return (this.children.get(toggleId) ?? []).find(
          (childId) => this.blocks.get(childId)?.type === 'child_database',
        );
      }
    }
    return undefined;
  }

  /** Number of raw rows stored in a given database. */
  rowCount(databaseId: string): number {
    return (this.rows.get(databaseId) ?? []).length;
  }

  /** Distinct databases created so far. */
  get databaseCount(): number {
    return this.rows.size;
  }
}

/** Cast helper: the fake implements the subset of NotionService the repo uses. */
function asService(fake: FakeNotionService): NotionService {
  return fake as unknown as NotionService;
}

let rootCounter = 0;
function freshRootId(): string {
  return `root-page-${++rootCounter}`;
}

beforeEach(() => {
  // ensureYear caches year -> databaseId per rootPageId across calls; reset it
  // so each test's fresh fake is not shadowed by a previous test's database ids.
  clearYearCache();
});

describe('Property 12: Reading persistence round-trip and year routing', () => {
  // Generator: a reading whose timestamp lands squarely inside a single 2025
  // local day (avoiding month/year boundaries so the local calendar day is
  // unambiguous regardless of the runner's timezone).
  const reading2025 = fc.record({
    month: fc.integer({ min: 1, max: 10 }), // Feb..Nov (0-indexed)
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    glucose: fc.integer({ min: 20, max: 500 }),
    mealTag: fc.constantFrom<Reading['mealTag']>('pre', 'post'),
  });

  it('retrieves a persisted reading from the correct year with fields preserved', async () => {
    await fc.assert(
      fc.asyncProperty(reading2025, async (spec) => {
        clearYearCache();
        const rootId = freshRootId();
        const fake = new FakeNotionService(rootId);
        const service = asService(fake);

        const anchor = new Date(2025, spec.month, spec.day, spec.hour, spec.minute, 0, 0);
        const reading: Reading = {
          glucose: spec.glucose,
          mealTag: spec.mealTag,
          timestamp: anchor.toISOString(),
        };

        await addReading(service, rootId, reading);

        const dayRange = rangeFor('day', anchor);
        const result = await getReadings(service, rootId, dayRange);

        // Exactly the one reading, with every field preserved through the
        // Notion row round-trip.
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(reading);

        // It was routed to the 2025 database and stored there.
        const db2025 = fake.getDbIdForYear(2025);
        expect(db2025).toBeDefined();
        expect(fake.rowCount(db2025!)).toBe(1);
      }),
      { numRuns: 150 },
    );
  });

  it('routes readings to distinct year databases and excludes other years from a single-year range', async () => {
    const rootId = freshRootId();
    const fake = new FakeNotionService(rootId);
    const service = asService(fake);

    const anchor2025 = new Date(2025, 5, 15, 9, 30, 0, 0);
    const reading2025Val: Reading = {
      glucose: 130,
      mealTag: 'pre',
      timestamp: anchor2025.toISOString(),
    };
    const reading2026Val: Reading = {
      glucose: 180,
      mealTag: 'post',
      timestamp: new Date(2026, 5, 15, 9, 30, 0, 0).toISOString(),
    };

    await addReading(service, rootId, reading2025Val);
    await addReading(service, rootId, reading2026Val);

    // Two distinct year databases exist.
    const db2025 = fake.getDbIdForYear(2025);
    const db2026 = fake.getDbIdForYear(2026);
    expect(db2025).toBeDefined();
    expect(db2026).toBeDefined();
    expect(db2025).not.toBe(db2026);
    expect(fake.databaseCount).toBe(2);

    // Each reading is stored under its own year's database.
    expect(fake.rowCount(db2025!)).toBe(1);
    expect(fake.rowCount(db2026!)).toBe(1);

    // A 2025-only range returns only the 2025 reading.
    const result = await getReadings(service, rootId, rangeFor('day', anchor2025));
    expect(result).toEqual([reading2025Val]);
  });
});

describe('Property 15: Pagination completeness', () => {
  it('returns the union of all pages with no drops or duplicates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 260 }), // number of readings
        fc.integer({ min: 1, max: 120 }), // page size
        async (count, pageSize) => {
          clearYearCache();
          const rootId = freshRootId();
          const fake = new FakeNotionService(rootId, pageSize);
          const service = asService(fake);

          // All readings share a single 2025 day; unique timestamps (one per
          // second) act as identity so drops/duplicates are detectable.
          const base = new Date(2025, 3, 10, 0, 0, 0, 0);
          const expected: Reading[] = [];
          for (let i = 0; i < count; i++) {
            const ts = new Date(base.getTime() + i * 1000);
            const reading: Reading = {
              glucose: 100 + (i % 200),
              mealTag: i % 2 === 0 ? 'pre' : 'post',
              timestamp: ts.toISOString(),
            };
            expected.push(reading);
            await addReading(service, rootId, reading);
          }

          const result = await getReadings(service, rootId, rangeFor('day', base));

          // No drops: every stored reading comes back.
          expect(result).toHaveLength(count);

          // No duplicates: unique timestamps stay unique.
          const timestamps = result.map((r) => r.timestamp);
          expect(new Set(timestamps).size).toBe(count);

          // Union equals exactly the persisted set.
          const sortByTs = (a: Reading, b: Reading) => a.timestamp.localeCompare(b.timestamp);
          expect([...result].sort(sortByTs)).toEqual([...expected].sort(sortByTs));

          // Multi-page behavior actually exercised: expected number of page
          // fetches = ceil(count / pageSize), or 1 fetch when there are none.
          const expectedPages = count === 0 ? 1 : Math.ceil(count / pageSize);
          expect(fake.queryDatabaseCalls).toBe(expectedPages);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('aggregates across multiple pages for a large single-year dataset', async () => {
    clearYearCache();
    const rootId = freshRootId();
    const fake = new FakeNotionService(rootId, 100);
    const service = asService(fake);

    const base = new Date(2025, 6, 1, 0, 0, 0, 0);
    const total = 250;
    for (let i = 0; i < total; i++) {
      await addReading(service, rootId, {
        glucose: 90 + (i % 100),
        mealTag: i % 2 === 0 ? 'pre' : 'post',
        timestamp: new Date(base.getTime() + i * 1000).toISOString(),
      });
    }

    const result = await getReadings(service, rootId, rangeFor('day', base));
    expect(result).toHaveLength(total);
    expect(new Set(result.map((r) => r.timestamp)).size).toBe(total);
    // 250 rows / 100 per page => 3 page fetches.
    expect(fake.queryDatabaseCalls).toBe(3);
  });
});
