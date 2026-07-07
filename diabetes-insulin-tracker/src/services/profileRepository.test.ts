import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { saveProfile, loadProfile } from './profileRepository';
import type { NotionService } from './notionService';
import type { PatientProfile } from '../types';

// Integration tests for the profile round-trip.
//
// These exercise `saveProfile` + `loadProfile` against a stateful, in-memory
// fake NotionService that mirrors the real block shapes the repository relies
// on: toggle blocks expose `toggle.rich_text[].plain_text`, and code blocks
// expose `code.rich_text[].plain_text`. Saved code-block content is retained
// so it can be read back, exactly as the real Notion API would persist it.
//
// Feature: diabetes-insulin-tracker, Property 1: Patient profile round-trip
// Validates: Requirements 2.1, 2.5

const ROOT_PAGE_ID = 'root-page';

/** Splits a string into <=size chunks, mirroring Notion's rich_text chunking. */
function splitToChunks(content: string, size: number): string[] {
  if (content.length === 0) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += size) {
    chunks.push(content.slice(i, i + size));
  }
  return chunks;
}

/**
 * Stateful in-memory fake of the subset of NotionService that
 * profileRepository consumes. Blocks are stored in a flat map keyed by id,
 * with a separate parent -> childIds index to answer getBlockChildren.
 */
class FakeNotionService {
  private seq = 0;
  private blocks = new Map<string, any>();
  private childIndex = new Map<string, string[]>();

  private genId(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  private addChild(parentId: string, childId: string): void {
    const list = this.childIndex.get(parentId) ?? [];
    list.push(childId);
    this.childIndex.set(parentId, list);
  }

  async getBlockChildren(id: string): Promise<any[]> {
    const ids = this.childIndex.get(id) ?? [];
    return ids.map((cid) => this.blocks.get(cid));
  }

  async createFolder(parentId: string, title: string): Promise<any> {
    const id = this.genId('toggle');
    this.blocks.set(id, {
      id,
      type: 'toggle',
      has_children: true,
      toggle: { rich_text: [{ plain_text: title, text: { content: title } }] },
    });
    this.addChild(parentId, id);
    return { id, name: title, type: 'folder' };
  }

  async createFile(parentId: string, name: string, language: string): Promise<any> {
    const id = this.genId('code');
    this.blocks.set(id, {
      id,
      type: 'code',
      has_children: false,
      code: {
        rich_text: [{ plain_text: '', text: { content: '' } }],
        language,
        caption: [{ text: { content: name } }],
      },
    });
    this.addChild(parentId, id);
    return { id, name, type: 'file', language };
  }

  async updateCodeBlock(blockId: string, content: string): Promise<void> {
    const block = this.blocks.get(blockId);
    if (!block || block.type !== 'code') {
      throw new Error(`updateCodeBlock: no code block with id ${blockId}`);
    }
    // Mirror the real service, which splits long content across rich_text runs.
    block.code.rich_text = splitToChunks(content, 100).map((chunk) => ({
      plain_text: chunk,
      text: { content: chunk },
    }));
  }
}

/** Casts the fake to the NotionService surface the repository expects. */
function makeService(): NotionService {
  return new FakeNotionService() as unknown as NotionService;
}

// Generator for valid PatientProfiles per Requirement 2.1:
// icRatio > 0, isf > 0, targetGlucose in [40, 400]. Finite doubles round-trip
// exactly through JSON, so equality is well-defined.
const validProfile = fc.record<PatientProfile>({
  icRatio: fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }),
  isf: fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }),
  targetGlucose: fc.double({ min: 40, max: 400, noNaN: true, noDefaultInfinity: true }),
});

describe('profileRepository round-trip (mocked NotionService)', () => {
  it('loadProfile returns null when no profile has been saved yet', async () => {
    const service = makeService();
    await expect(loadProfile(service, ROOT_PAGE_ID)).resolves.toBeNull();
  });

  it('round-trips several representative profiles', async () => {
    const examples: PatientProfile[] = [
      { icRatio: 10, isf: 50, targetGlucose: 120 },
      { icRatio: 0.1, isf: 0.1, targetGlucose: 40 },
      { icRatio: 999.9, isf: 500.25, targetGlucose: 400 },
      { icRatio: 15.5, isf: 33.3, targetGlucose: 100 },
    ];
    for (const profile of examples) {
      const service = makeService();
      await saveProfile(service, ROOT_PAGE_ID, profile);
      await expect(loadProfile(service, ROOT_PAGE_ID)).resolves.toEqual(profile);
    }
  });

  it('re-saving overwrites the stored profile (single code block reused)', async () => {
    const service = makeService();
    await saveProfile(service, ROOT_PAGE_ID, { icRatio: 10, isf: 50, targetGlucose: 120 });
    const updated: PatientProfile = { icRatio: 12, isf: 45, targetGlucose: 110 };
    await saveProfile(service, ROOT_PAGE_ID, updated);
    await expect(loadProfile(service, ROOT_PAGE_ID)).resolves.toEqual(updated);
  });

  // Property 1: serializing a valid PatientProfile then reading it back yields
  // an equal profile.
  it('Property 1: saveProfile then loadProfile yields an equal profile', async () => {
    await fc.assert(
      fc.asyncProperty(validProfile, async (profile) => {
        const service = makeService();
        await saveProfile(service, ROOT_PAGE_ID, profile);
        const loaded = await loadProfile(service, ROOT_PAGE_ID);
        expect(loaded).toEqual(profile);
      }),
      { numRuns: 200 },
    );
  });
});
