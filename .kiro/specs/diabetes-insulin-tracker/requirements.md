# Requirements Document

## Introduction

The Diabetes Insulin Tracker is a new web application (Vite + React + TypeScript) that helps a diabetic patient record blood glucose readings, calculate suggested insulin doses using the standard clinical model, browse historical data across multiple time ranges, and view metrics tailored to both the patient and their doctor. All data is persisted to Notion from the first release, reusing the existing Notion connection layer (`notionService.ts`, `api/notion.ts`, `api/notion-oauth.ts`) from the prior project.

Because the application computes insulin dosing, which is medically sensitive, every calculated dose is treated as a non-binding suggestion that requires patient or doctor validation, and a clear medical disclaimer is always presented.

## Glossary

- **Tracker**: The Diabetes Insulin Tracker web application as a whole.
- **Calculator**: The subsystem that computes a suggested insulin dose from patient parameters and inputs.
- **Recorder**: The subsystem that captures and submits blood glucose readings and meal data.
- **History_View**: The subsystem that retrieves and displays historical readings across day, week, month, and year ranges.
- **Metrics_View**: The subsystem that aggregates readings into patient-facing and doctor-facing metrics.
- **Notion_Service**: The reused and extended data-access layer that reads from and writes to Notion.
- **Patient_Profile**: The set of personal clinical parameters for one patient, comprising the insulin-to-carbohydrate ratio, the insulin sensitivity factor, and the target blood glucose.
- **Insulin_to_Carb_Ratio**: The number of grams of carbohydrate covered by one unit of insulin (I:C ratio).
- **Insulin_Sensitivity_Factor**: The expected drop in blood glucose in mg/dL per one unit of insulin (ISF).
- **Target_Glucose**: The desired blood glucose value in mg/dL configured by the patient.
- **Current_Glucose**: The measured blood glucose value in mg/dL entered for a calculation or reading.
- **Carbohydrate_Amount**: The grams of carbohydrate to be consumed, entered directly or derived from the food table.
- **Food_Table**: A reference list of food items and their carbohydrate content per serving.
- **Suggested_Dose**: The insulin dose in units produced by the Calculator, presented as a non-binding suggestion.
- **Reading**: A single blood glucose record, labeled as pre-meal or post-meal, with timestamp and value.
- **Meal_Tag**: A label on a reading indicating whether it was taken before a meal (pre) or after a meal (post).
- **Personal_Info_Toggle**: A Notion toggle list block that stores the patient's personal information.
- **Year_Toggle**: A Notion toggle list block created for a calendar year that contains that year's readings database.
- **Readings_Database**: A Notion database, contained within a Year_Toggle, that stores Reading records for that year.
- **Medical_Disclaimer**: A statement clarifying that suggested doses are not medical advice and require professional validation.

## Requirements

### Requirement 1: Notion connection and data-layer reuse

**User Story:** As a patient, I want the Tracker to connect to my Notion workspace using the existing connection code, so that my data is stored in my own Notion account from the start.

#### Acceptance Criteria

1. WHERE the patient has not connected a Notion account, THE Tracker SHALL present a Notion connection action before allowing data recording.
2. WHEN the patient initiates a Notion connection, THE Notion_Service SHALL complete the OAuth code exchange using the reused OAuth endpoint.
3. WHEN a Notion API request is made, THE Notion_Service SHALL route the request through the reused serverless proxy using Notion API version 2022-06-28.
4. IF the OAuth code exchange fails, THEN THE Tracker SHALL display an error message and SHALL retain the disconnected state.
5. THE Notion_Service SHALL provide create, read, and query operations for the Readings_Database in addition to the existing block and page operations.

### Requirement 2: Patient profile configuration

**User Story:** As a patient, I want to configure my personal insulin parameters, so that dose suggestions are calculated for my body.

#### Acceptance Criteria

1. WHEN the patient saves the Patient_Profile, THE Tracker SHALL persist the Insulin_to_Carb_Ratio, Insulin_Sensitivity_Factor, and Target_Glucose to the Personal_Info_Toggle in Notion.
2. IF the Insulin_to_Carb_Ratio is less than or equal to 0, THEN THE Tracker SHALL reject the value and SHALL display a validation message.
3. IF the Insulin_Sensitivity_Factor is less than or equal to 0, THEN THE Tracker SHALL reject the value and SHALL display a validation message.
4. IF the Target_Glucose is outside the range 40 to 400 mg/dL, THEN THE Tracker SHALL reject the value and SHALL display a validation message.
5. WHEN the Tracker loads and a Personal_Info_Toggle exists, THE Tracker SHALL retrieve the stored Patient_Profile from Notion.

### Requirement 3: Insulin dose calculation

**User Story:** As a patient, I want the Calculator to suggest an insulin dose, so that I have a reference before administering insulin.

#### Acceptance Criteria

1. WHEN the patient requests a calculation with a Current_Glucose and a Carbohydrate_Amount, THE Calculator SHALL compute the Suggested_Dose as (Carbohydrate_Amount ÷ Insulin_to_Carb_Ratio) + ((Current_Glucose − Target_Glucose) ÷ Insulin_Sensitivity_Factor).
2. IF the Patient_Profile is incomplete, THEN THE Calculator SHALL withhold the calculation and SHALL prompt the patient to complete the Patient_Profile.
3. IF the computed Suggested_Dose is less than 0, THEN THE Calculator SHALL present a Suggested_Dose of 0 units.
4. WHEN the Calculator presents a Suggested_Dose, THE Calculator SHALL display the Medical_Disclaimer alongside the Suggested_Dose.
5. WHEN the Calculator presents a Suggested_Dose, THE Calculator SHALL require the patient to confirm the Suggested_Dose before it is recorded.
6. WHEN the Calculator presents a Suggested_Dose, THE Calculator SHALL round the displayed value to one decimal place.

### Requirement 4: Food table for carbohydrate entry

**User Story:** As a patient, I want to pick foods from a table, so that I can determine carbohydrate amounts without manual lookup.

#### Acceptance Criteria

1. THE Calculator SHALL provide a Food_Table listing food items with carbohydrate content per serving.
2. WHEN the patient selects a food item and a serving quantity, THE Calculator SHALL compute the Carbohydrate_Amount as the item's carbohydrate content multiplied by the serving quantity.
3. WHEN the patient selects one or more food items, THE Calculator SHALL set the Carbohydrate_Amount to the sum of the selected items' carbohydrate contributions.
4. WHERE the patient enters a Carbohydrate_Amount manually, THE Calculator SHALL use the manually entered value for the calculation.

### Requirement 5: Rapid blood glucose recording

**User Story:** As a patient, I want to record a glucose reading quickly, so that logging does not interrupt my routine.

#### Acceptance Criteria

1. WHEN the patient submits a Reading, THE Recorder SHALL capture the Current_Glucose value, the Meal_Tag, and a timestamp.
2. WHEN the patient submits a Reading, THE Recorder SHALL persist the Reading to the Readings_Database for the year matching the Reading timestamp.
3. IF no Year_Toggle exists for the year of the Reading timestamp, THEN THE Recorder SHALL create the Year_Toggle and its Readings_Database before persisting the Reading.
4. IF the Current_Glucose is outside the range 20 to 600 mg/dL, THEN THE Recorder SHALL reject the Reading and SHALL display a validation message.
5. WHEN the patient submits a Reading, THE Recorder SHALL require selection of a Meal_Tag of either pre-meal or post-meal.
6. IF persisting a Reading to Notion fails, THEN THE Recorder SHALL notify the patient that the Reading was not saved.

### Requirement 6: History across time ranges

**User Story:** As a patient, I want to view my readings by day, week, month, and year, so that I can see trends over time.

#### Acceptance Criteria

1. WHEN the patient selects a day, week, month, or year range, THE History_View SHALL retrieve the Reading records that fall within the selected range from Notion.
2. WHEN the History_View displays Reading records, THE History_View SHALL show each Reading's value, Meal_Tag, and timestamp.
3. WHILE Reading records are being retrieved from Notion, THE History_View SHALL display a loading indicator.
4. IF no Reading records exist within the selected range, THEN THE History_View SHALL display an empty-state message.
5. WHEN Reading records span more than one Notion page of results, THE History_View SHALL retrieve all pages before completing the display.

### Requirement 7: Patient and doctor metrics

**User Story:** As a patient and as a doctor, I want aggregated metrics from the readings, so that we can assess glucose control.

#### Acceptance Criteria

1. WHEN the Metrics_View is displayed for a selected range, THE Metrics_View SHALL compute the average Current_Glucose across the Reading records in that range.
2. WHEN the Metrics_View is displayed for a selected range, THE Metrics_View SHALL compute the count of Reading records labeled pre-meal and the count labeled post-meal separately.
3. WHEN the Metrics_View is displayed for a selected range, THE Metrics_View SHALL compute the minimum and maximum Current_Glucose values in that range.
4. WHERE the doctor-facing metrics are selected, THE Metrics_View SHALL present the proportion of Reading records within the Target_Glucose range.
5. IF no Reading records exist within the selected range, THEN THE Metrics_View SHALL display an empty-state message instead of computed metrics.

### Requirement 8: Medical safety and disclaimer

**User Story:** As a patient, I want clear medical safety guidance, so that I understand suggested doses are not a substitute for professional judgment.

#### Acceptance Criteria

1. THE Tracker SHALL present the Medical_Disclaimer on the insulin calculation screen.
2. WHEN a Suggested_Dose is displayed, THE Calculator SHALL label the value as a suggestion requiring patient or doctor validation.
3. WHERE the patient uses the Calculator for the first time, THE Tracker SHALL require acknowledgment of the Medical_Disclaimer before presenting a Suggested_Dose.
