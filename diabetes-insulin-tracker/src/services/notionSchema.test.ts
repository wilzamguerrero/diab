import { describe, it, expect, beforeEach } from 'vitest';

import { NotionService } from './notionService';
import { NotionBlock } from '../types';
import { ensureYear, clearYearCache } from './notionSchema';

// Integration tests for notionSchema.ensureYear against a MOCKED NotionService.
//
// ensureYear must be idempotent: repeated calls for the same year must yield
// exactly one Year_Toggle and exactly one Readings_Database per year, always
// returning the same database id. These tests drive that behavior through a
// stateful in-memory fake of the NotionService methods ensureYear depends on:
//   - getBlockChildren(id)  → current children of a node
//   - createFolder(parentId, title) → appends a 'toggle' child, returns node
//   - createDatabase(parentBlockId, title, properties) → appends a
//     'child_database' child, returns { id }
//
// Feature: diabetes-insulin-tracker, Property 13: Year bootstrap idempotence
// Validates: Requirements 5.3

/**
 * A minimal stateful fake of the Notion block tree. Each node has an id, a
 * type, an ordered list of child node ids, and (for toggles) a title stored in
 * the same shape ensureYear reads via `toggle.rich_text[].plain_text`.
 */
interface FakeNode {
  id: string;
  type: string;
  children: string[];
  toggle?: { rich_text: { plain_text: string }[] };
}

class FakeNotionTree {
  private nodes = new Map<string, FakeNode>();
  private counter = 0;

  // Instrumentation: how many toggles / databases have been created.
  createdToggles: string[] = [];
  createdDatabases: string[] = [];

  constructor(rootId: string) {
    this.nodes.set(rootId, { id: rootId, type: 'page', children: [] });
  }

  private newId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  /** Directly seed an existing toggle under a parent (no instrumentation). */
  seedToggle(parentId: string, title: string): string {
    const id = this.newId('toggle');
    this.nodes.set(id, {
      id,
      type: 'toggle',
      children: [],
      toggle: { rich_text: [{ plain_text: title }] },
    });
    this.nodes.get(parentId)!.children.push(id);
    return id;
  }

  /** Directly seed an existing child_database under a parent (no instrumentation). */
  seedDatabase(parentId: string): string {
    const id = this.newId('db');
    this.nodes.set(id, { id, type: 'child_database', children: [] });
    this.nodes.get(parentId)!.children.push(id);
    return id;
  }

  /** Count toggles under the root whose title matches `title`. */
  countTogglesTitled(rootId: string, title: string): number {
    return this.nodes
      .get(rootId)!
      .children.map((cid) => this.nodes.get(cid)!)
      .filter(
        (n) =>
          n.type === 'toggle' &&
          (n.toggle?.rich_text.map((t) => t.plain_text).join('').trim() ?? '') === title,
      ).length;
  }

  /** Count child_database nodes anywhere in the tree. */
  countDatabases(): number {
    return [...this.nodes.values()].filter((n) => n.type === 'child_database').length;
  }

  /** Build a NotionService-typed fake backed by this tree. */
  asService(): NotionService {
    const tree = this;

    const service = {
      async getBlockChildren(blockId: string): Promise<NotionBlock[]> {
        const node = tree.nodes.get(blockId);
        if (!node) return [];
        return node.children.map((cid) => {
          const child = tree.nodes.get(cid)!;
          const block: NotionBlock = {
            id: child.id,
            type: child.type,
            has_children: child.children.length > 0,
          };
          if (child.toggle) (block as any).toggle = child.toggle;
          return block;
        });
      },

      async createFolder(parentId: string, title: string) {
        const id = tree.seedToggle(parentId, title);
        tree.createdToggles.push(id);
        return { id, name: title, type: 'folder' as const };
      },

      async createDatabase(parentBlockId: string, _title: string, _properties: object) {
        const id = tree.seedDatabase(parentBlockId);
        tree.createdDatabases.push(id);
        return { id };
      },
    };

    return service as unknown as NotionService;
  }
}

const ROOT = 'root-page-id';

describe('notionSchema.ensureYear — Property 13: Year bootstrap idempotence', () => {
  beforeEach(() => {
    // Reset the module-level cache so each test starts from a clean slate.
    clearYearCache();
  });

  it('creates exactly one toggle and one database across repeated calls for the same year', async () => {
    const tree = new FakeNotionTree(ROOT);
    const service = tree.asService();

    const first = await ensureYear(service, ROOT, 2025);
    const second = await ensureYear(service, ROOT, 2025);
    const third = await ensureYear(service, ROOT, 2025);

    // Same database id every time.
    expect(second).toBe(first);
    expect(third).toBe(first);

    // Exactly one toggle titled "2025" and exactly one database in the tree.
    expect(tree.countTogglesTitled(ROOT, '2025')).toBe(1);
    expect(tree.countDatabases()).toBe(1);

    // Creation side-effects happened exactly once.
    expect(tree.createdToggles).toHaveLength(1);
    expect(tree.createdDatabases).toHaveLength(1);
  });

  it('finds the existing toggle and database after the cache is cleared, creating nothing new', async () => {
    const tree = new FakeNotionTree(ROOT);

    // Pre-seed the tree so a toggle "2025" and its database already exist.
    const toggleId = tree.seedToggle(ROOT, '2025');
    const existingDbId = tree.seedDatabase(toggleId);

    const service = tree.asService();

    // Fresh module state: nothing cached, but the tree already has the schema.
    const dbId = await ensureYear(service, ROOT, 2025);

    // ensureYear discovers the existing database rather than creating a new one.
    expect(dbId).toBe(existingDbId);
    expect(tree.createdToggles).toHaveLength(0);
    expect(tree.createdDatabases).toHaveLength(0);
    expect(tree.countTogglesTitled(ROOT, '2025')).toBe(1);
    expect(tree.countDatabases()).toBe(1);
  });

  it('creates a database under a toggle that exists without one', async () => {
    const tree = new FakeNotionTree(ROOT);

    // A "2025" toggle exists but has no database yet.
    tree.seedToggle(ROOT, '2025');

    const service = tree.asService();
    const dbId = await ensureYear(service, ROOT, 2025);

    expect(dbId).toBeTruthy();
    // No new toggle created (reused the seeded one), exactly one database created.
    expect(tree.createdToggles).toHaveLength(0);
    expect(tree.createdDatabases).toHaveLength(1);
    expect(tree.countTogglesTitled(ROOT, '2025')).toBe(1);
    expect(tree.countDatabases()).toBe(1);
  });

  it('produces distinct toggles and databases for different years', async () => {
    const tree = new FakeNotionTree(ROOT);
    const service = tree.asService();

    const db2025 = await ensureYear(service, ROOT, 2025);
    const db2026 = await ensureYear(service, ROOT, 2026);

    expect(db2025).not.toBe(db2026);
    expect(tree.countTogglesTitled(ROOT, '2025')).toBe(1);
    expect(tree.countTogglesTitled(ROOT, '2026')).toBe(1);
    expect(tree.countDatabases()).toBe(2);
    expect(tree.createdToggles).toHaveLength(2);
    expect(tree.createdDatabases).toHaveLength(2);
  });
});
