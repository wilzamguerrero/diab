# Design Document

## Overview

The Diabetes Insulin Tracker is a new Vite + React + TypeScript single-page application backed by Notion for all persistence. It reuses the serverless Notion proxy (`api/notion.ts`), the OAuth exchange endpoint (`api/notion-oauth.ts`), and the `NotionService` data-access class from `oldproject`, extending the latter with database (data source) operations required to store blood glucose readings.

The application lets a diabetic patient:

- Connect a Notion workspace via OAuth (reused flow).
- Configure a clinical profile (I:C ratio, ISF, target glucose).
- Calculate a suggested insulin bolus using the standard clinical model, optionally deriving carbohydrates from a reference food table.
- Record glucose readings quickly, routed to a per-year Notion database.
- Browse history by day/week/month/year with full pagination.
- View aggregated metrics for both patient and doctor audiences.

Because dose calculation is medically sensitive, every suggested dose is a **non-binding suggestion**. A `Medical_Disclaimer` is always visible on the calculator, first use requires explicit acknowledgment, and recording a dose requires confirmation.

The clinical model was validated against public diabetes education references: a mealtime bolus is the sum of a **carbohydrate-coverage** term (`carbs ÷ I:C ratio`) and a **glucose-correction** term (`(current − target) ÷ ISF`), which is the model encoded in Requirement 3. UX for the food table and calculator follows patterns common to established bolus calculators: a two-part breakdown (carb coverage + correction), clear units (g, mg/dL, units), and a searchable food list with per-serving carbohydrate values and adjustable serving quantities. *Content was rephrased for compliance with licensing restrictions.*

## Architecture

### High-level structure

```
diabetes-insulin-tracker/
├── api/                         # Vercel serverless functions (reused)
│   ├── notion.ts                # Generic Notion REST proxy (version 2022-06-28)
│   └── notion-oauth.ts          # OAuth authorization_code exchange
├── src/
│   ├── services/
│   │   ├── notionService.ts     # Reused + extended (block/page + database ops)
│   │   ├── notionSchema.ts      # Ensure Personal_Info_Toggle / Year_Toggle / Readings_Database
│   │   ├── readingsRepository.ts# CRUD/query over Readings_Database, pagination
│   │   └── profileRepository.ts # Read/write Patient_Profile
│   ├── domain/
│   │   ├── insulin.ts           # Pure dose calculation (formula, clamp, rounding)
│   │   ├── validation.ts        # Profile + reading validation
│   │   ├── metrics.ts           # Aggregations (avg, counts, min/max, TIR)
│   │   └── history.ts           # Range filtering, range boundaries
│   ├── data/
│   │   └── foodTable.ts         # Reference food items and carbs per serving
│   ├── components/
│   │   ├── NotionConnect.tsx        # Reused/adapted connection UI
│   │   ├── ProfileSettings.tsx      # Patient profile configuration
│   │   ├── Calculator.tsx           # Dose calculator + food table + disclaimer
│   │   ├── FoodTable.tsx            # Searchable food selection
│   │   ├── QuickRecord.tsx          # Rapid reading entry
│   │   ├── HistoryView.tsx          # Day/week/month/year history
│   │   └── MetricsView.tsx          # Patient/doctor metrics
│   ├── state/
│   │   └── appStore.ts          # Connection state, profile cache, first-use ack
│   ├── types.ts
│   └── main.tsx / App.tsx
└── vite.config.ts
```

### Layering

1. **Transport layer** — `api/notion.ts` proxies all Notion REST calls, injecting `Notion-Version: 2022-06-28` and the bearer token from the `X-Notion-Token` header. `api/notion-oauth.ts` performs the `authorization_code` exchange server-side using the client secret. Both are reused unchanged. **(Req 1.2, 1.3)**
2. **Service layer** — `NotionService` (reused) plus new modules that understand the tracker's Notion schema and expose domain-friendly methods.
3. **Domain layer** — pure, side-effect-free functions for calculation, validation, metrics, and range filtering. This is where property-based testing is focused.
4. **UI layer** — React components that render domain output and orchestrate service calls.

Because the domain layer is pure and isolated from the transport layer, transport changes (proxy details) and UI changes do not affect calculation, validation, or metric logic.

### Connection flow

```
User clicks "Connect Notion"
  → NotionService.getOAuthUrl(clientId, redirectUri, state)   [reused]
  → Notion authorize → redirect back with ?code
  → NotionService.exchangeOAuthCode(code, redirectUri)        [reused → api/notion-oauth.ts]
      success → store access_token, mark connected, ensure schema
      failure → show error, remain disconnected                (Req 1.4)
```

Until connected, `QuickRecord` and profile persistence are gated behind the connection action. **(Req 1.1)**

## Notion Data Model

All data lives under a single selected root page in the patient's Notion workspace.

```
Root Page
├── Personal_Info_Toggle            (toggle block)
│   └── code block (language: json) → Patient_Profile JSON
│         { "icRatio": number, "isf": number, "targetGlucose": number }
├── Year_Toggle "2025"              (toggle block, created on demand)
│   └── Readings_Database "Readings 2025"   (child database)
│         Properties:
│           - "Glucose" : number        (mg/dL)
│           - "Meal_Tag": select        (options: "pre", "post")
│           - "Timestamp": date         (ISO 8601)
│           - "Name"    : title         (auto label, e.g. timestamp)
├── Year_Toggle "2026"
│   └── Readings_Database "Readings 2026"
└── ...
```

Rationale:

- **Profile as JSON in a code block** mirrors the existing alarms-sync pattern in `NotionService` (`readAlarms`/`writeAlarms`), which stores structured config as JSON inside a block. This avoids introducing a separate profile database and reuses a proven approach.
- **One Readings_Database per year toggle** keeps per-year data partitioned, matching the history ranges (year is the coarsest range) and bounding query size. The year is derived from each reading's timestamp.

### Schema bootstrapping (`notionSchema.ts`)

`ensureYear(year)` guarantees the toggle and database exist, and is **idempotent**:

```
ensureYear(rootPageId, year):
  cacheKey = "year-db:" + rootPageId + ":" + year
  if cache has cacheKey: return cached databaseId
  scan root page children (paginated) for a Year_Toggle whose title == String(year)
  if found:
     find child database under it → databaseId
  else:
     create toggle block titled String(year)
     create database (POST /databases) with parent = toggle block,
        properties = { Name: title, Glucose: number, Meal_Tag: select(pre/post), Timestamp: date }
     databaseId = created.id
  cache[cacheKey] = databaseId
  return databaseId
```

Concurrent/repeat calls must not create duplicates: the scan-before-create step plus the cache ensures a single toggle/database per year. **(Req 5.3)**

### Extended `NotionService` operations

Added to the reused class (all routed through the reused proxy):

```typescript
// Create a Notion database under a parent block
createDatabase(parentBlockId: string, title: string, properties: object): Promise<{ id: string }>

// Create a page (row) in a database
createDatabaseRow(databaseId: string, properties: object): Promise<{ id: string }>

// Query a database with optional filter/sort, returns a single page of results
queryDatabase(databaseId: string, body: object, startCursor?: string):
  Promise<{ results: any[]; has_more: boolean; next_cursor: string | null }>

// Query all pages of a database (loops on has_more/next_cursor)
queryDatabaseAll(databaseId: string, body: object): Promise<any[]>
```

These use the same `notionFetch` helper, so they inherit the proxy routing, Notion version header, and error handling. **(Req 1.5)**

## Components and Interfaces

### Domain: Insulin calculation (`domain/insulin.ts`)

```typescript
export interface PatientProfile {
  icRatio: number;        // grams carb per 1 unit insulin (> 0)
  isf: number;            // mg/dL drop per 1 unit insulin (> 0)
  targetGlucose: number;  // mg/dL, 40..400
}

export interface DoseInput {
  currentGlucose: number; // mg/dL
  carbs: number;          // grams
}

export interface DoseResult {
  carbCoverage: number;   // carbs / icRatio
  correction: number;     // (currentGlucose - targetGlucose) / isf
  rawDose: number;        // carbCoverage + correction (may be negative)
  dose: number;           // clamped to >= 0, rounded to 1 decimal
}

// Returns null when profile is incomplete/invalid (calculation withheld).
export function calculateDose(profile: PatientProfile | null, input: DoseInput): DoseResult | null;

export function roundToOneDecimal(value: number): number; // round-half-up to 1 dp
```

Calculation contract:

- If `profile` is null/incomplete, return `null` (caller prompts to complete profile). **(Req 3.2)**
- `rawDose = carbs / icRatio + (currentGlucose - targetGlucose) / isf`. **(Req 3.1)**
- `dose = roundToOneDecimal(max(0, rawDose))`. **(Req 3.3, 3.6)**

### Domain: Food table carbs (`data/foodTable.ts`, used by Calculator)

```typescript
export interface FoodItem { id: string; name: string; carbsPerServing: number; unitLabel: string; }
export interface FoodSelection { item: FoodItem; quantity: number; }

// Sum of item.carbsPerServing * quantity across selections.
export function carbsFromSelections(selections: FoodSelection[]): number;   // (Req 4.2, 4.3)
```

Carbohydrate source precedence in `Calculator.tsx`:

- If a manual carbohydrate value is entered, it is used directly. **(Req 4.4)**
- Otherwise the sum from food selections is used. **(Req 4.1, 4.2, 4.3)**

### Domain: Validation (`domain/validation.ts`)

```typescript
export interface ValidationResult { valid: boolean; message?: string; }

export function validateProfile(p: {icRatio:number; isf:number; targetGlucose:number}): ValidationResult;
// icRatio > 0, isf > 0, 40 <= targetGlucose <= 400          (Req 2.2, 2.3, 2.4)

export function validateReading(r: {glucose:number; mealTag:string}): ValidationResult;
// 20 <= glucose <= 600, mealTag in {"pre","post"}           (Req 5.4, 5.5)
```

### Domain: Metrics (`domain/metrics.ts`)

```typescript
export interface Reading { glucose: number; mealTag: 'pre'|'post'; timestamp: string; }

export interface Metrics {
  count: number;
  average: number;      // mean glucose               (Req 7.1)
  preCount: number;     // count of pre-meal           (Req 7.2)
  postCount: number;    // count of post-meal          (Req 7.2)
  min: number;          // minimum glucose             (Req 7.3)
  max: number;          // maximum glucose             (Req 7.3)
}

// Returns null for empty input (caller shows empty-state).   (Req 7.5)
export function computeMetrics(readings: Reading[]): Metrics | null;

// Proportion of readings within [targetLow, targetHigh], in [0,1].  (Req 7.4)
export function timeInRange(readings: Reading[], targetLow: number, targetHigh: number): number | null;
```

### Domain: History ranges (`domain/history.ts`)

```typescript
export type RangeKind = 'day' | 'week' | 'month' | 'year';
export interface DateRange { start: Date; end: Date; } // half-open [start, end)

export function rangeFor(kind: RangeKind, anchor: Date): DateRange;

// Readings whose timestamp is within [start, end).           (Req 6.1)
export function filterInRange(readings: Reading[], range: DateRange): Reading[];
```

### Service: Readings repository (`services/readingsRepository.ts`)

```typescript
async function addReading(root: string, r: Reading): Promise<void>;
// derive year from r.timestamp → ensureYear → createDatabaseRow      (Req 5.2, 5.3)

async function getReadings(root: string, range: DateRange): Promise<Reading[]>;
// determine years spanned by range → for each, ensure/find db →
// queryDatabaseAll with date filter → map rows → filterInRange       (Req 6.1, 6.5)
```

`queryDatabaseAll` loops while `has_more`, passing `next_cursor` as `start_cursor`, aggregating every page before returning. This mirrors the existing `getBlockChildren` pagination loop in `NotionService`. **(Req 6.5)**

### UI Components

| Component | Responsibility | Requirements |
|-----------|----------------|--------------|
| `NotionConnect` | OAuth connect action, gate recording until connected, show OAuth errors | 1.1, 1.4 |
| `ProfileSettings` | Enter/validate/persist profile; load on mount | 2.1–2.5 |
| `Calculator` | Compute dose, show breakdown, disclaimer always visible, first-use ack gate, confirmation before record | 3.1–3.6, 8.1–8.3, 4.4 |
| `FoodTable` | Search foods, select items + quantities, feed carbs to Calculator | 4.1–4.3 |
| `QuickRecord` | Fast reading entry with meal tag; validate; persist; failure notice | 5.1–5.6 |
| `HistoryView` | Range selector; loading indicator; empty-state; render rows | 6.1–6.5 |
| `MetricsView` | Patient/doctor metrics; empty-state | 7.1–7.5 |

### Calculator interaction state machine

```
[FirstUse?] --not acknowledged--> show disclaimer + "I understand" → require ack   (Req 8.3)
     |
 acknowledged
     v
[Ready] --calculate--> DoseResult
     v
[Suggested] (disclaimer + "suggestion, requires validation" label shown)  (Req 3.4, 8.1, 8.2)
     |
   confirm
     v
[Confirmed] → dose may be recorded                                        (Req 3.5)
```

## Data Models

### Reading ↔ Notion row mapping

| Domain field | Notion property | Notion type |
|--------------|-----------------|-------------|
| `glucose`    | `Glucose`       | `number`    |
| `mealTag`    | `Meal_Tag`      | `select` (`pre`/`post`) |
| `timestamp`  | `Timestamp`     | `date` (ISO 8601) |
| label        | `Name`          | `title` (derived from timestamp) |

Row creation body:

```json
{
  "parent": { "database_id": "<db-id>" },
  "properties": {
    "Name":      { "title": [{ "text": { "content": "2025-05-01T08:30:00Z" } }] },
    "Glucose":   { "number": 142 },
    "Meal_Tag":  { "select": { "name": "pre" } },
    "Timestamp": { "date": { "start": "2025-05-01T08:30:00Z" } }
  }
}
```

### Query for a range (single year example)

```json
{
  "filter": {
    "and": [
      { "property": "Timestamp", "date": { "on_or_after": "2025-05-01T00:00:00Z" } },
      { "property": "Timestamp", "date": { "before":      "2025-05-08T00:00:00Z" } }
    ]
  },
  "sorts": [{ "property": "Timestamp", "direction": "ascending" }]
}
```

## Error Handling

| Condition | Handling | Requirement |
|-----------|----------|-------------|
| OAuth exchange fails | Show error, stay disconnected | 1.4 |
| Invalid profile value | Reject, show field validation message, do not persist | 2.2–2.4 |
| Profile incomplete at calculation | Withhold dose, prompt to complete profile | 3.2 |
| Invalid glucose / missing meal tag | Reject reading, show validation message | 5.4, 5.5 |
| Reading persist fails (Notion error) | Notify patient reading was not saved; keep local input | 5.6 |
| Year toggle/database missing | Auto-create before persisting (idempotent) | 5.3 |
| No readings in range | Empty-state message in History and Metrics | 6.4, 7.5 |
| Notion request error | `notionFetch` throws with status + body; surfaced as user-facing message | 1.3 |

All Notion errors propagate through the reused `notionFetch`, which throws `Notion API error (<status>): <body>`; UI layers catch and translate to friendly messages.

## Testing Strategy

**Dual approach.** Pure domain modules (`insulin`, `validation`, `metrics`, `history`, `foodTable`) are covered by property-based tests (minimum 100 iterations per property, tagged with the feature name and property number). Repository/schema modules use example and integration tests with a mocked `NotionService` (verifying call shapes and pagination), since they exercise external-service wiring rather than input-varying logic. UI presence rules (disclaimer, labels, loading, empty-state) use example-based component tests.

**Property test configuration.** Each property test runs ≥100 randomized iterations and references its design property using the tag format `Feature: diabetes-insulin-tracker, Property {number}: {property_text}`.

**Not property-tested (rationale):** OAuth wiring and Notion version header (1.2, 1.3, 1.5) are integration concerns; disclaimer/label/loading/empty-state (3.4, 8.1, 8.2, 6.3, 6.4, 7.5, 4.1, 1.1) are UI presence/edge examples; persist-failure notice (5.6) is a mocked error example.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Patient profile round-trip

For any valid Patient_Profile (icRatio > 0, isf > 0, targetGlucose in [40, 400]), serializing it to the Personal_Info_Toggle representation and then reading it back yields an equal profile.

**Validates: Requirements 2.1, 2.5**

### Property 2: Profile validation domain

For any candidate profile values, `validateProfile` accepts the profile if and only if icRatio > 0 and isf > 0 and 40 ≤ targetGlucose ≤ 400; otherwise it is rejected with a validation message.

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 3: Dose formula correctness

For any valid Patient_Profile and any DoseInput, the raw computed dose equals `(carbs ÷ icRatio) + ((currentGlucose − targetGlucose) ÷ isf)` within floating-point tolerance.

**Validates: Requirements 3.1**

### Property 4: Calculation withheld for incomplete profile

For any DoseInput and any incomplete or invalid profile, `calculateDose` returns no dose (null) and signals that the profile must be completed.

**Validates: Requirements 3.2**

### Property 5: Dose is never negative

For any valid profile and any DoseInput, the presented dose is greater than or equal to 0, even when the correction term is strongly negative.

**Validates: Requirements 3.3**

### Property 6: Dose rounded to one decimal

For any valid profile and any DoseInput, the presented dose equals the clamped raw dose rounded to one decimal place and has at most one fractional digit.

**Validates: Requirements 3.6**

### Property 7: Confirmation required before recording

For any suggested dose, the dose is not recorded until the patient confirms it.

**Validates: Requirements 3.5**

### Property 8: First-use acknowledgment gate

For any calculation request while the disclaimer has not been acknowledged (first use), no suggested dose is presented until acknowledgment is recorded.

**Validates: Requirements 8.3**

### Property 9: Carbohydrate total from selections

For any list of food selections, the computed Carbohydrate_Amount equals the sum over selections of `carbsPerServing × quantity` (and equals a single item's contribution when exactly one item is selected).

**Validates: Requirements 4.2, 4.3**

### Property 10: Manual carbohydrate override

For any set of food selections and any manually entered Carbohydrate_Amount, the calculation uses the manual value.

**Validates: Requirements 4.4**

### Property 11: Reading validation domain

For any candidate reading, it is accepted if and only if glucose is in [20, 600] and mealTag is one of {"pre", "post"}; otherwise it is rejected with a validation message.

**Validates: Requirements 5.4, 5.5**

### Property 12: Reading persistence round-trip and year routing

For any valid reading, after persisting it the reading is retrievable from the Readings_Database of the year matching its timestamp, with its glucose value, meal tag, and timestamp preserved.

**Validates: Requirements 5.1, 5.2**

### Property 13: Year bootstrap idempotence

For any year, ensuring the Year_Toggle and its Readings_Database exist any number of times results in exactly one toggle and one database for that year.

**Validates: Requirements 5.3**

### Property 14: Range retrieval correctness

For any set of readings and any selected day/week/month/year range, the retrieved set contains exactly those readings whose timestamp falls within the range.

**Validates: Requirements 6.1**

### Property 15: Pagination completeness

For any query whose results span multiple Notion pages, aggregation returns the union of all pages with no records dropped or duplicated.

**Validates: Requirements 6.5**

### Property 16: History row rendering completeness

For any reading displayed by the History_View, the rendered output includes the reading's glucose value, meal tag, and timestamp.

**Validates: Requirements 6.2**

### Property 17: Aggregate metric correctness

For any non-empty set of readings, the average equals the arithmetic mean of glucose values, the pre-meal and post-meal counts partition the total count, and the reported minimum and maximum are members of the set that bound all values.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 18: Time-in-range proportion

For any non-empty set of readings and any target range, the doctor-facing proportion equals `count(readings within target) ÷ total` and lies within [0, 1].

**Validates: Requirements 7.4**
