import { NotionService } from './notionService';
import { NotionBlock, NotionToggleBlock } from '../types';

// In-module cache mapping "year-db:{rootPageId}:{year}" → databaseId.
// Ensures repeated ensureYear calls are idempotent within a session and
// avoid redundant Notion scans/creations.
const yearDbCache = new Map<string, string>();

function cacheKey(rootPageId: string, year: number): string {
  return `year-db:${rootPageId}:${year}`;
}

/** Reset the module cache. Primarily useful for tests. */
export function clearYearCache(): void {
  yearDbCache.clear();
}

/** Extract the plain-text title of a toggle block. */
function toggleTitle(block: NotionBlock): string {
  const richText = (block as NotionToggleBlock).toggle?.rich_text || [];
  return richText.map((t) => t.plain_text || '').join('').trim();
}

/**
 * Database properties for a per-year Readings database:
 * Name (title), Glucose (number), Meal_Tag (select: pre/post), Timestamp (date).
 */
function readingsDatabaseProperties(): object {
  return {
    Name: { title: {} },
    Glucose: { number: {} },
    Meal_Tag: {
      select: {
        options: [
          { name: 'pre' },
          { name: 'post' },
        ],
      },
    },
    Timestamp: { date: {} },
  };
}

/**
 * Guarantee that the Year_Toggle and its Readings_Database exist for the given
 * year under the root page, returning the database id. Idempotent: repeated
 * calls neither create duplicate toggles nor duplicate databases.
 *
 * Algorithm:
 *   1. Cache lookup by "year-db:{rootPageId}:{year}".
 *   2. Scan root page children for a Year_Toggle titled String(year).
 *   3. If found, scan its children for a child_database block → databaseId.
 *   4. Otherwise create the toggle and a database beneath it.
 *   5. Cache and return the databaseId.
 *
 * Validates: Requirements 5.3
 */
export async function ensureYear(
  service: NotionService,
  rootPageId: string,
  year: number,
): Promise<string> {
  const key = cacheKey(rootPageId, year);
  const cached = yearDbCache.get(key);
  if (cached) return cached;

  const yearLabel = String(year);

  // Scan root page children for an existing Year_Toggle titled String(year).
  // getBlockChildren paginates internally, so a single call yields all children.
  const rootChildren = await service.getBlockChildren(rootPageId);
  const yearToggle = rootChildren.find(
    (block) => block.type === 'toggle' && toggleTitle(block) === yearLabel,
  );

  let databaseId: string | undefined;

  if (yearToggle) {
    // Look for an existing child database under the toggle.
    const toggleChildren = await service.getBlockChildren(yearToggle.id);
    const existingDb = toggleChildren.find((block) => block.type === 'child_database');
    if (existingDb) {
      databaseId = existingDb.id;
    } else {
      // Toggle exists but has no database yet; create one under it.
      const created = await service.createDatabase(
        yearToggle.id,
        `Readings ${yearLabel}`,
        readingsDatabaseProperties(),
      );
      databaseId = created.id;
    }
  } else {
    // No toggle for this year: create the toggle, then the database under it.
    const toggle = await service.createFolder(rootPageId, yearLabel);
    const created = await service.createDatabase(
      toggle.id,
      `Readings ${yearLabel}`,
      readingsDatabaseProperties(),
    );
    databaseId = created.id;
  }

  yearDbCache.set(key, databaseId);
  return databaseId;
}
