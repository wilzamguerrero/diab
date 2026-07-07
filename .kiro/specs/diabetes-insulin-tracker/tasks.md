# Implementation Plan: Diabetes Insulin Tracker

## Overview

This plan builds a new Vite + React + TypeScript single-page application backed by Notion, reusing the serverless Notion proxy (`api/notion.ts`), the OAuth exchange endpoint (`api/notion-oauth.ts`), and the `NotionService` data-access class from `oldproject`. Work proceeds bottom-up: scaffold the project and shared types, implement and property-test the pure domain layer (insulin, validation, metrics, history, foodTable), extend the reused Notion service with database operations, layer schema bootstrapping and repositories on top, then build and wire the React UI. Property-based tests are focused exclusively on the pure domain modules; service and UI layers use example, integration, and component tests.

## Tasks

- [x] 1. Scaffold project and shared foundations
  - [x] 1.1 Initialize Vite + React + TypeScript project structure
    - Create `diabetes-insulin-tracker` app with Vite React-TS template layout (`src/`, `vite.config.ts`, `index.html`, `tsconfig.json`, `package.json`)
    - Create the directory structure: `src/services/`, `src/domain/`, `src/data/`, `src/components/`, `src/state/`
    - Install and configure a property-based testing setup (Vitest + fast-check) and a component testing setup (Vitest + Testing Library)
    - _Requirements: 1.1_

  - [x] 1.2 Define shared TypeScript types
    - In `src/types.ts` define `PatientProfile`, `DoseInput`, `DoseResult`, `Reading`, `RangeKind`, `DateRange`, `FoodItem`, `FoodSelection`, `ValidationResult`, `Metrics`
    - Ensure `mealTag` is typed as `'pre' | 'post'`
    - _Requirements: 2.1, 3.1, 5.1, 6.1, 7.1_

- [x] 2. Implement and property-test the insulin calculation domain
  - [x] 2.1 Implement dose calculation (`src/domain/insulin.ts`)
    - Implement `roundToOneDecimal` (round-half-up to 1 decimal place)
    - Implement `calculateDose(profile, input)`: return `null` when profile is null/incomplete/invalid; otherwise compute `carbCoverage = carbs / icRatio`, `correction = (currentGlucose - targetGlucose) / isf`, `rawDose = carbCoverage + correction`, and `dose = roundToOneDecimal(max(0, rawDose))`
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [x] 2.2 Write property test for dose formula correctness
    - **Property 3: Dose formula correctness** — raw dose equals `(carbs ÷ icRatio) + ((currentGlucose − targetGlucose) ÷ isf)` within floating-point tolerance
    - **Validates: Requirements 3.1**

  - [x] 2.3 Write property test for withheld calculation on incomplete profile
    - **Property 4: Calculation withheld for incomplete profile** — for any input and incomplete/invalid profile, `calculateDose` returns null
    - **Validates: Requirements 3.2**

  - [x] 2.4 Write property test for non-negative dose
    - **Property 5: Dose is never negative** — presented dose is always ≥ 0, even with strongly negative correction
    - **Validates: Requirements 3.3**

  - [x] 2.5 Write property test for one-decimal rounding
    - **Property 6: Dose rounded to one decimal** — presented dose equals the clamped raw dose rounded to one decimal and has at most one fractional digit
    - **Validates: Requirements 3.6**

- [x] 3. Implement and property-test validation and food table domains
  - [x] 3.1 Implement validation functions (`src/domain/validation.ts`)
    - Implement `validateProfile`: accept iff `icRatio > 0` and `isf > 0` and `40 <= targetGlucose <= 400`; otherwise return `{ valid: false, message }`
    - Implement `validateReading`: accept iff `20 <= glucose <= 600` and `mealTag in {"pre","post"}`; otherwise return `{ valid: false, message }`
    - _Requirements: 2.2, 2.3, 2.4, 5.4, 5.5_

  - [x] 3.2 Write property test for profile validation domain
    - **Property 2: Profile validation domain** — accepts iff icRatio > 0, isf > 0, targetGlucose in [40, 400]
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [x] 3.3 Write property test for reading validation domain
    - **Property 11: Reading validation domain** — accepts iff glucose in [20, 600] and mealTag in {"pre","post"}
    - **Validates: Requirements 5.4, 5.5**

  - [x] 3.4 Implement food table and carb aggregation (`src/data/foodTable.ts`)
    - Provide a reference list of `FoodItem`s with `carbsPerServing` and `unitLabel`
    - Implement `carbsFromSelections(selections)` = sum of `item.carbsPerServing * quantity`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 3.5 Write property test for carbohydrate total from selections
    - **Property 9: Carbohydrate total from selections** — total equals the sum of `carbsPerServing × quantity`, and equals a single item's contribution when one item is selected
    - **Validates: Requirements 4.2, 4.3**

- [x] 4. Implement and property-test metrics and history domains
  - [x] 4.1 Implement metrics aggregation (`src/domain/metrics.ts`)
    - Implement `computeMetrics(readings)`: return `null` for empty input; otherwise compute `count`, `average` (mean glucose), `preCount`, `postCount`, `min`, `max`
    - Implement `timeInRange(readings, targetLow, targetHigh)`: return `null` for empty input; otherwise proportion of readings within `[targetLow, targetHigh]` in `[0,1]`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 Write property test for aggregate metric correctness
    - **Property 17: Aggregate metric correctness** — average is arithmetic mean, pre/post counts partition total, min/max are members bounding all values
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 4.3 Write property test for time-in-range proportion
    - **Property 18: Time-in-range proportion** — proportion equals `count(within target) ÷ total` and lies in [0, 1]
    - **Validates: Requirements 7.4**

  - [x] 4.4 Implement history range logic (`src/domain/history.ts`)
    - Implement `rangeFor(kind, anchor)` producing half-open `[start, end)` ranges for day/week/month/year
    - Implement `filterInRange(readings, range)` returning readings whose timestamp is within `[start, end)`
    - _Requirements: 6.1_

  - [x] 4.5 Write property test for range retrieval correctness
    - **Property 14: Range retrieval correctness** — filtered set contains exactly the readings whose timestamp falls within the selected range
    - **Validates: Requirements 6.1**

- [x] 5. Checkpoint - Domain layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Reuse and extend the Notion service layer
  - [x] 6.1 Port reused transport and service code from oldproject
    - Copy/adapt `api/notion.ts` (generic REST proxy injecting `Notion-Version: 2022-06-28`) and `api/notion-oauth.ts` (authorization_code exchange) into the new project
    - Copy/adapt `NotionService` (`src/services/notionService.ts`) preserving `notionFetch`, OAuth URL/exchange, and block/page operations
    - _Requirements: 1.2, 1.3_

  - [x] 6.2 Extend NotionService with database operations
    - Add `createDatabase(parentBlockId, title, properties)`, `createDatabaseRow(databaseId, properties)`, `queryDatabase(databaseId, body, startCursor?)`, and `queryDatabaseAll(databaseId, body)` (loops on `has_more`/`next_cursor`), all routed through `notionFetch`
    - _Requirements: 1.5, 6.5_

  - [x] 6.3 Write integration tests for extended NotionService (mocked fetch)
    - Verify database op call shapes and that `queryDatabaseAll` aggregates all pages via cursor looping
    - _Requirements: 1.5, 6.5_

- [x] 7. Implement schema bootstrapping and repositories
  - [x] 7.1 Implement schema bootstrapping (`src/services/notionSchema.ts`)
    - Implement `ensureYear(rootPageId, year)`: cache lookup → scan root children (paginated) for a Year_Toggle titled `String(year)` → find child database or create toggle + database with `Name/Glucose/Meal_Tag/Timestamp` properties; idempotent, cached
    - _Requirements: 5.3_

  - [x] 7.2 Write integration tests for ensureYear idempotence (mocked NotionService)
    - **Property 13: Year bootstrap idempotence** — repeated `ensureYear` calls yield exactly one toggle and one database per year (verified against a mocked service)
    - **Validates: Requirements 5.3**

  - [x] 7.3 Implement profile repository (`src/services/profileRepository.ts`)
    - Read/write `PatientProfile` as JSON inside the Personal_Info_Toggle code block (mirroring the alarms JSON pattern); provide load-on-mount read
    - _Requirements: 2.1, 2.5_

  - [x] 7.4 Write integration tests for profile round-trip (mocked NotionService)
    - **Property 1: Patient profile round-trip** — serialize then read back yields an equal profile (verified against a mocked service)
    - **Validates: Requirements 2.1, 2.5**

  - [x] 7.5 Implement readings repository (`src/services/readingsRepository.ts`)
    - Implement `addReading(root, r)`: derive year from timestamp → `ensureYear` → `createDatabaseRow` using the documented row body
    - Implement `getReadings(root, range)`: determine years spanned → ensure/find db per year → `queryDatabaseAll` with date filter → map rows to `Reading` → `filterInRange`
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.5_

  - [x] 7.6 Write integration tests for readings repository (mocked NotionService)
    - **Property 12: Reading persistence round-trip and year routing** — persisted reading is retrievable from the correct year's database with glucose/meal tag/timestamp preserved
    - **Property 15: Pagination completeness** — multi-page queries return the union of all pages with no drops/duplicates
    - **Validates: Requirements 5.1, 5.2, 6.5**

- [x] 8. Checkpoint - Service and data layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement connection and profile UI
  - [x] 9.1 Implement app state store (`src/state/appStore.ts`)
    - Track connection state, access token, cached profile, and first-use disclaimer acknowledgment
    - _Requirements: 1.1, 8.3_

  - [x] 9.2 Implement NotionConnect component (`src/components/NotionConnect.tsx`)
    - Provide OAuth connect action, gate recording/profile persistence until connected, and show OAuth error while retaining disconnected state on failure
    - _Requirements: 1.1, 1.4_

  - [x] 9.3 Implement ProfileSettings component (`src/components/ProfileSettings.tsx`)
    - Enter profile, validate with `validateProfile` and show field messages, persist via profile repository, and load stored profile on mount
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 9.4 Write component tests for connection gating and profile validation messages
    - Verify recording is gated pre-connection, OAuth error is shown, and invalid profile values surface validation messages without persisting
    - _Requirements: 1.1, 1.4, 2.2, 2.3, 2.4_

- [x] 10. Implement calculator, food table, and recording UI
  - [x] 10.1 Implement FoodTable component (`src/components/FoodTable.tsx`)
    - Searchable food list with selectable items and adjustable serving quantities, feeding `carbsFromSelections` output to the Calculator
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 10.2 Implement Calculator component (`src/components/Calculator.tsx`)
    - Always-visible Medical_Disclaimer; first-use acknowledgment gate before presenting a dose; compute dose via `calculateDose`; show carb-coverage + correction breakdown; prompt to complete profile when withheld; manual carb entry overrides food selections; label result as a suggestion requiring validation; require confirmation before recording
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.4, 8.1, 8.2, 8.3_

  - [x] 10.3 Write property test for manual carbohydrate override
    - **Property 10: Manual carbohydrate override** — when a manual carb value is entered, the calculation uses the manual value regardless of selections
    - **Validates: Requirements 4.4**

  - [x] 10.4 Write component tests for disclaimer, acknowledgment gate, and confirmation
    - **Property 7: Confirmation required before recording** — dose is not recorded until confirmed
    - **Property 8: First-use acknowledgment gate** — no dose presented until the disclaimer is acknowledged on first use
    - Also verify disclaimer visibility and suggestion label
    - **Validates: Requirements 3.5, 8.3, 3.4, 8.1, 8.2**

  - [x] 10.5 Implement QuickRecord component (`src/components/QuickRecord.tsx`)
    - Fast reading entry capturing glucose, meal tag, and timestamp; validate via `validateReading`; require meal tag selection; persist via readings repository; notify patient when persistence fails
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

  - [x] 10.6 Write component tests for QuickRecord validation and persist-failure notice
    - Verify invalid glucose/missing meal tag rejection and the not-saved notification on persistence error
    - _Requirements: 5.4, 5.5, 5.6_

- [x] 11. Implement history and metrics UI
  - [x] 11.1 Implement HistoryView component (`src/components/HistoryView.tsx`)
    - Range selector (day/week/month/year); loading indicator while retrieving; empty-state message when none; render each reading's value, meal tag, and timestamp
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 11.2 Write component test for history row rendering completeness
    - **Property 16: History row rendering completeness** — rendered output includes each reading's glucose value, meal tag, and timestamp; also verify loading and empty-state
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [x] 11.3 Implement MetricsView component (`src/components/MetricsView.tsx`)
    - Display patient metrics (average, pre/post counts, min/max) via `computeMetrics`; doctor-facing time-in-range proportion via `timeInRange`; empty-state message when no readings
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 11.4 Write component test for metrics empty-state and doctor proportion display
    - Verify empty-state replaces computed metrics and the doctor proportion renders when selected
    - _Requirements: 7.4, 7.5_

- [x] 12. Wire the application together
  - [x] 12.1 Assemble App shell and routing (`src/App.tsx`, `src/main.tsx`)
    - Compose NotionConnect, ProfileSettings, Calculator, QuickRecord, HistoryView, and MetricsView into the app; wire the OAuth redirect callback to complete the code exchange and ensure schema on success
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 12.2 Write end-to-end integration test of the wired flow (mocked NotionService)
    - Connect → save profile → record reading → view history/metrics, verifying components share state and service calls
    - _Requirements: 1.1, 2.1, 5.2, 6.1, 7.1_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Property-based tests (fast-check, ≥100 iterations each, tagged `Feature: diabetes-insulin-tracker, Property {number}: ...`) are focused on the pure domain layer: `insulin`, `validation`, `metrics`, `history`, and `foodTable`.
- Service/schema/repository properties (1, 12, 13, 15) are verified through integration tests with a mocked `NotionService`, since they exercise external-service wiring; they still reference their design property numbers.
- UI presence rules (disclaimer, labels, loading, empty-state) and the confirmation/acknowledgment gates (Properties 7, 8, 16) use example-based component tests.
- Each task references specific requirements for traceability; checkpoints ensure incremental validation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "3.4", "4.1", "4.4"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "3.5", "4.2", "4.3", "4.5", "6.1"] },
    { "id": 4, "tasks": ["6.2"] },
    { "id": 5, "tasks": ["6.3", "7.1", "7.3", "7.5"] },
    { "id": 6, "tasks": ["7.2", "7.4", "7.6", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1", "10.5", "11.1", "11.3"] },
    { "id": 8, "tasks": ["9.4", "10.2", "10.6", "11.2", "11.4"] },
    { "id": 9, "tasks": ["10.3", "10.4"] },
    { "id": 10, "tasks": ["12.1"] },
    { "id": 11, "tasks": ["12.2"] }
  ]
}
```
