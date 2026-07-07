import { NotionService } from './notionService';

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
    Notes: { rich_text: {} },
    Photo: { files: {} },
  };
}

/**
 * Guarantee that the Year's Readings_Database exists for the given year under
 * the root page, returning the database id. Idempotent: repeated calls neither
 * create duplicate databases nor duplicate year toggles.
 *
 * Notion does NOT allow creating a database as a child of a toggle block via
 * POST /databases. So we create the database directly as a child of the root
 * PAGE using parent: { type: 'page_id', page_id: rootPageId }.
 *
 * To organize visually we still look for/create a toggle labeled with the year
 * but the database is placed at page level (Notion inline databases can live
 * under a page). We scan the page children for a 'child_database' block whose
 * title starts with "Readings {year}".
 *
 * Algorithm:
 *   1. Cache lookup.
 *   2. Scan root page children for a child_database titled "Readings {year}".
 *   3. If found → use its id.
 *   4. Otherwise → create the database via POST /databases with parent page_id.
 *   5. Cache and return.
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
  const dbTitle = `Readings ${yearLabel}`;

  // Scan root page children for an existing database titled "Readings {year}".
  const rootChildren = await service.getBlockChildren(rootPageId);
  const existingDb = rootChildren.find(
    (block) => block.type === 'child_database' && (block as any).child_database?.title === dbTitle,
  );

  let databaseId: string;

  if (existingDb) {
    databaseId = existingDb.id;
  } else {
    // Create the database directly under the root page.
    const created = await service.createDatabaseUnderPage(
      rootPageId,
      dbTitle,
      readingsDatabaseProperties(),
    );
    databaseId = created.id;
  }

  yearDbCache.set(key, databaseId);
  return databaseId;
}
