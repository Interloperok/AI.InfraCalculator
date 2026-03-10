# Architecture

## 1) High-level architecture

- Frontend (`frontend/`): React UI for calculator, GPU browsing, and optimization results.
- Backend (`backend/`): FastAPI API with sizing engine, GPU catalog services, and report generation.
- Data source: normalized GPU catalog JSON in backend storage.

## 2) Backend layers

- `backend/main.py`: FastAPI app composition, routes, startup/shutdown lifecycle.
- `backend/api/`: thin HTTP handlers, response mapping, and transport-level concerns.
- `backend/services/`: orchestration and business logic (`sizing_service`, `gpu_catalog_service`, `gpu_refresh_service`, `auto_optimize_service`, `report_service`).
- `backend/services/gpu_catalog_pipeline/`: GPU catalog ingestion pipeline (`scraper`, `normalizer`).
- `backend/core/sizing_math.py`: pure deterministic math functions (critical core math scope).
- `backend/models/`: Pydantic input/output contracts.
- `backend/settings.py`: typed environment configuration.
- `backend/logging_config.py`: unified logger configuration.

### Backend flow (`POST /v1/size`)

1. Request is validated by `SizingInput` model.
2. Endpoint handler delegates to `services/sizing_service.py`.
3. Service composes calculations from `core/sizing_math.py`.
4. Result is returned as `SizingOutput`.

### Backend flow (`POST /v1/auto-optimize`)

1. Request is validated by `AutoOptimizeInput`.
2. Service iterates candidate configurations (GPU/TP/quantization etc.).
3. Each candidate calls sizing service/core math.
4. Best candidates are ranked and returned in `AutoOptimizeResponse`.

## 3) Frontend architecture

Current frontend is feature-oriented:

- `frontend/src/features/calculator/`
  - `Calculator.js`
  - `CalculatorForm.js`
  - `ResultsDisplay.js`
- `frontend/src/features/gpu/`
  - `GpuFilterModal.js`
- `frontend/src/features/optimization/`
  - `OptimizeResultsTable.js`
- `frontend/src/services/api.ts`

Flow:
1. User edits form/presets in calculator feature.
2. Frontend sends API requests via `src/services/api.ts`.
3. Response data is transformed in UI components and rendered as cards/charts/tables.

## 4) Testing strategy

Backend:
- Unit tests for sizing behavior (`backend/tests/test_sizing.py`)
- Golden regression tests (`backend/tests/test_golden_sizing.py`)
- Property-based tests with Hypothesis (`backend/tests/test_sizing_properties.py`)
- API integration tests (`backend/tests/test_api_integration.py`)

Frontend:
- Unit/component tests (`frontend/src/**/*.test.js`)
- E2E smoke tests (`frontend/e2e/*.spec.ts`)

## 5) quality and tooling

Backend quality pipeline uses Python 3.14 + uv with:
- `ruff` (lint + format)
- `ty` and `mypy` (type checking)
- `pytest` + `coverage.py`

Frontend quality pipeline uses:
- `eslint`
- `prettier`
- `tsc --noEmit`
- `jest` and `playwright`

Related details are listed in `docs/tooling-matrix.md`.
