import { NotionService } from './notionService';
import { PatientProfile } from '../types';

// Title of the dedicated toggle block that stores the patient profile JSON.
// Mirrors the alarms-sync pattern (`readAlarms`/`writeAlarms`) in NotionService,
// which persists structured config as JSON inside a code block. See design
// "Notion Data Model": Personal_Info_Toggle → code block (json) → Patient_Profile.
const PROFILE_TOGGLE_TITLE = 'Profile';
const PROFILE_CODE_CAPTION = 'Patient_Profile';

/** Extracts the plain-text title of a toggle block from its rich_text. */
function toggleTitle(block: any): string {
  return (block?.toggle?.rich_text || [])
    .map((t: any) => t.plain_text || t.text?.content || '')
    .join('')
    .trim();
}

/** Extracts the concatenated plain-text content of a code block. */
function codeContent(block: any): string {
  return (block?.code?.rich_text || [])
    .map((t: any) => t.plain_text || t.text?.content || '')
    .join('');
}

/** Finds the profile toggle block under the root page, or null if absent. */
async function findProfileToggle(service: NotionService, rootPageId: string): Promise<string | null> {
  const children = await service.getBlockChildren(rootPageId);
  for (const block of children) {
    if (block.type === 'toggle' && toggleTitle(block) === PROFILE_TOGGLE_TITLE) {
      return block.id;
    }
  }
  return null;
}

/** Finds the profile toggle, creating it under the root page when missing. */
async function findOrCreateProfileToggle(service: NotionService, rootPageId: string): Promise<string> {
  const existing = await findProfileToggle(service, rootPageId);
  if (existing) return existing;
  const node = await service.createFolder(rootPageId, PROFILE_TOGGLE_TITLE);
  return node.id;
}

/** Finds the JSON code block inside the profile toggle, or null if absent. */
async function findProfileCodeBlock(service: NotionService, toggleId: string): Promise<string | null> {
  const children = await service.getBlockChildren(toggleId);
  for (const block of children) {
    if (block.type === 'code') return block.id;
  }
  return null;
}

/** Narrows an unknown parsed value to a PatientProfile, or null if the shape is invalid. */
function toProfile(parsed: unknown): PatientProfile | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const { icRatio, isf, targetGlucose } = parsed as Record<string, unknown>;
  if (typeof icRatio !== 'number' || typeof isf !== 'number' || typeof targetGlucose !== 'number') {
    return null;
  }
  return { icRatio, isf, targetGlucose };
}

/**
 * Persists the patient profile as JSON inside the Personal_Info toggle's code block.
 * Creates the toggle and/or code block on first save.
 * See Requirements 2.1, 2.5.
 */
export async function saveProfile(
  service: NotionService,
  rootPageId: string,
  profile: PatientProfile,
): Promise<void> {
  const toggleId = await findOrCreateProfileToggle(service, rootPageId);
  const json = JSON.stringify({
    icRatio: profile.icRatio,
    isf: profile.isf,
    targetGlucose: profile.targetGlucose,
  });

  const existingBlockId = await findProfileCodeBlock(service, toggleId);
  if (existingBlockId) {
    await service.updateCodeBlock(existingBlockId, json);
    return;
  }

  const node = await service.createFile(toggleId, PROFILE_CODE_CAPTION, 'json');
  await service.updateCodeBlock(node.id, json);
}

/**
 * Reads the stored patient profile from the Personal_Info toggle's code block.
 * Returns null when no profile has been stored yet (supports load-on-mount).
 * See Requirements 2.1, 2.5.
 */
export async function loadProfile(
  service: NotionService,
  rootPageId: string,
): Promise<PatientProfile | null> {
  const toggleId = await findProfileToggle(service, rootPageId);
  if (!toggleId) return null;

  const children = await service.getBlockChildren(toggleId);
  for (const block of children) {
    if (block.type !== 'code') continue;
    const content = codeContent(block);
    if (!content.trim()) continue;
    try {
      return toProfile(JSON.parse(content));
    } catch {
      // Malformed JSON — treat as no stored profile.
      return null;
    }
  }
  return null;
}
