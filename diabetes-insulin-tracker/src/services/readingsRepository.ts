// Readings repository.
//
// Persists blood glucose readings into a per-year Notion database and queries
// them back over a date range. Year routing and schema bootstrapping are
// delegated to `ensureYear` (notionSchema); pagination and raw database
// operations are delegated to `NotionService`.
//
// See design.md ("Service: Readings repository") and the Reading↔Notion row
// mapping / range-query JSON.
//
// Requirements: 5.1, 5.2, 5.3, 6.1, 6.5

import type { NotionService } from './notionService';
import { ensureYear } from './notionSchema';
import { filterInRange } from '../domain/history';
import type { Reading, DateRange } from '../types';

/**
 * Persist a single reading.
 *
 * The target year is derived from the reading's timestamp, the corresponding
 * Year_Toggle / Readings_Database is ensured to exist, and a database row is
 * created using the documented Reading↔Notion row mapping.
 *
 * Requirements: 5.1, 5.2, 5.3
 */
export async function addReading(
  service: NotionService,
  rootPageId: string,
  r: Reading,
): Promise<void> {
  const year = new Date(r.timestamp).getFullYear();
  const databaseId = await ensureYear(service, rootPageId, year);

  await service.createDatabaseRow(databaseId, {
    Name: { title: [] },
    Glucose: { number: r.glucose },
    Meal_Tag: { select: { name: r.mealTag } },
    Timestamp: { date: { start: r.timestamp } },
    Notes: { rich_text: r.notes ? [{ text: { content: r.notes } }] : [] },
    Photo: r.photoUploadId
      ? { files: [{ type: 'file_upload', file_upload: { id: r.photoUploadId } }] }
      : { files: [] },
  });
}

/**
 * Map a raw Notion database row (page) to a domain `Reading`.
 */
function rowToReading(row: any): Reading {
  const props = row?.properties ?? {};
  const glucose = props.Glucose?.number ?? 0;
  const mealTag = (props.Meal_Tag?.select?.name ?? 'pre') as Reading['mealTag'];
  const timestamp = props.Timestamp?.date?.start ?? '';
  const notesRichText = props.Notes?.rich_text ?? [];
  const notes = notesRichText.map((t: any) => t.plain_text || '').join('') || undefined;
  const photoFiles = props.Photo?.files ?? [];
  const photoUrl = photoFiles.length > 0
    ? (photoFiles[0].file?.url || photoFiles[0].external?.url || undefined)
    : undefined;
  return { glucose, mealTag, timestamp, notes, photoUrl };
}

/**
 * Determine the calendar years spanned by a half-open range `[start, end)`.
 *
 * The end is exclusive, so the last relevant year is the year of the final
 * instant before `end` (`end - 1ms`). This avoids pulling in a trailing year
 * when a range ends exactly on January 1st.
 */
function yearsInRange(range: DateRange): number[] {
  const startYear = range.start.getFullYear();
  const lastInstant = new Date(range.end.getTime() - 1);
  const endYear = lastInstant.getFullYear();

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }
  return years;
}

/**
 * Retrieve all readings whose timestamp falls within the given range.
 *
 * For each year spanned by the range, the year's database is ensured/located
 * and queried (with a Timestamp date filter and ascending sort), paging through
 * every result. Rows are mapped to `Reading`s and finally passed through
 * `filterInRange` to enforce the exact half-open `[start, end)` boundaries.
 *
 * Requirements: 6.1, 6.5
 */
export async function getReadings(
  service: NotionService,
  rootPageId: string,
  range: DateRange,
): Promise<Reading[]> {
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  const queryBody = {
    filter: {
      and: [
        { property: 'Timestamp', date: { on_or_after: startIso } },
        { property: 'Timestamp', date: { before: endIso } },
      ],
    },
    sorts: [{ property: 'Timestamp', direction: 'ascending' }],
  };

  const readings: Reading[] = [];
  for (const year of yearsInRange(range)) {
    const databaseId = await ensureYear(service, rootPageId, year);
    const rows = await service.queryDatabaseAll(databaseId, queryBody);
    for (const row of rows) {
      readings.push(rowToReading(row));
    }
  }

  return filterInRange(readings, range);
}
