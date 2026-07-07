// Shared TypeScript types for the Diabetes Insulin Tracker.
// These interfaces are consumed across the domain, data, service, and UI layers.

/**
 * Personal clinical parameters for one patient.
 * See Requirement 2.1.
 */
export interface PatientProfile {
  /** Grams of carbohydrate covered by 1 unit of insulin (I:C ratio, > 0). */
  icRatio: number;
  /** mg/dL drop in blood glucose per 1 unit of insulin (ISF, > 0). */
  isf: number;
  /** Desired blood glucose value in mg/dL (40..400). */
  targetGlucose: number;
}

/**
 * Inputs required to compute a suggested insulin dose.
 * See Requirement 3.1.
 */
export interface DoseInput {
  /** Measured blood glucose value in mg/dL. */
  currentGlucose: number;
  /** Grams of carbohydrate to be consumed. */
  carbs: number;
}

/**
 * Result of a dose calculation, including the two-part breakdown.
 * See Requirement 3.1, 3.3, 3.6.
 */
export interface DoseResult {
  /** carbs / icRatio */
  carbCoverage: number;
  /** (currentGlucose - targetGlucose) / isf */
  correction: number;
  /** carbCoverage + correction (may be negative). */
  rawDose: number;
  /** Clamped to >= 0 and rounded to one decimal place. */
  dose: number;
}

/**
 * A single blood glucose record.
 * See Requirement 5.1.
 */
export interface Reading {
  /** Blood glucose value in mg/dL. */
  glucose: number;
  /** Whether the reading was taken before ('pre') or after ('post') a meal. */
  mealTag: 'pre' | 'post';
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/**
 * Selectable time range granularity for history browsing.
 * See Requirement 6.1.
 */
export type RangeKind = 'day' | 'week' | 'month' | 'year';

/**
 * A half-open date range [start, end).
 * See Requirement 6.1.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * A reference food item and its carbohydrate content per serving.
 * See Requirement 4.1.
 */
export interface FoodItem {
  id: string;
  name: string;
  /** Grams of carbohydrate per serving. */
  carbsPerServing: number;
  /** Human-readable label for a single serving (e.g. "slice", "cup"). */
  unitLabel: string;
}

/**
 * A selected food item with a serving quantity.
 * See Requirement 4.2, 4.3.
 */
export interface FoodSelection {
  item: FoodItem;
  quantity: number;
}

/**
 * Outcome of a validation check with an optional message.
 * See Requirement 2.2, 5.4.
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Aggregated metrics computed over a set of readings.
 * See Requirement 7.1, 7.2, 7.3.
 */
export interface Metrics {
  count: number;
  /** Mean glucose across readings. */
  average: number;
  /** Count of pre-meal readings. */
  preCount: number;
  /** Count of post-meal readings. */
  postCount: number;
  /** Minimum glucose value. */
  min: number;
  /** Maximum glucose value. */
  max: number;
}

// ── Notion transport / block types (reused from oldproject) ──────────
// These describe the raw Notion API block/tree shapes consumed by the
// reused NotionService. They are intentionally permissive to mirror the
// Notion REST responses.

export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: any;
}

export interface NotionToggleBlock extends NotionBlock {
  type: 'toggle';
  toggle: {
    rich_text: { plain_text: string }[];
  };
}

// Node of the file tree: toggle = folder, code = file.
export interface FileTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  parentId?: string;
  language?: string;
  children?: FileTreeNode[];
  isExpanded?: boolean;
  isLoaded?: boolean;
}

export interface FileTreeSearchResult {
  id: string;
  name: string;
  language?: string;
  parentIds: string[];
  pathLabels: string[];
}
