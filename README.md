AI Infrastructure Calculator
==============================

Welcome to **AI Infrastructure Calculator** – an open‑source toolkit for sizing GPU clusters for your AI workloads.
This project helps you move from hand‑wavy guesses to transparent, reproducible capacity planning for LLM inference.
<img width="1303" height="1438" alt="image" src="https://github.com/user-attachments/assets/8e07a823-d470-4d24-9860-1078f26b42b2" />

## What is this project?

AI Infrastructure Calculator (AI Server Calculator) is an open‑source tool for AI/LLM infrastructure sizing.
It combines a FastAPI backend with a React frontend and implements a formal methodology for estimating how many servers and GPUs you need to run large language models (LLMs) in production.

Try the online calculator:
👉 https://calc.aicolab.space/

Full docs:
👉 https://calc.aicolab.space/docs

Methodology (full paper, in Russian):
👉 https://docs.google.com/document/d/1_H4QWAda19SFJbaHD4oHycYAh5TdECCr/edit#heading=h.6wzccs1p9p8f

***

## Motivation

Hardware for LLM inference is highly capital‑intensive, so traditional heuristic “rule‑of‑thumb” approaches to capacity planning quickly become economically inefficient and risky.
This project implements a formalized sizing methodology that produces consistent, explainable recommendations for GPU and server counts and can be fed directly into CapEx/TCO/ROI models.

The calculator is designed to be used early in planning (to support business cases and CapEx budgeting) and continuously during the lifecycle of an AI product (to refine cluster size as telemetry accumulates).

***

## Quick Start

```bash
git clone <repository-url>
cd AI.ServerCalculationApp
docker compose up --build
```

Services:

- Frontend (UI + reverse-proxied API): http://localhost:3000
- Backend API (direct): http://localhost:8000
- OpenAPI docs: http://localhost:3000/docs (via frontend) or http://localhost:8000/docs (direct)
- ReDoc: http://localhost:3000/redoc

The frontend container reverse-proxies `/v1/*`, `/healthz`, `/docs`,
`/redoc`, and `/openapi.json` to the backend Service. In Kubernetes
this collapses to a single ingress rule on one host (see the Helm
section below).

## Air-gapped / offline mode

The methodology document is bundled into the frontend image
(`frontend/public/llm-methodology.docx`) and rendered in-browser via
mammoth — no outbound traffic to Google Docs.

The LLM source mode toggle (in the model picker) supports `Auto` /
`HuggingFace` / `Curated`. Set it to `Curated` to run fully offline:
the calculator pulls model architecture from `llm_data.json` (a copy
of the parent repo's `llm_catalog.json`) instead of probing
huggingface.co.

For enterprise proxies see the Helm proxy section below.

***

## Local Development

### Backend (`uv` + Python)

```bash
cd backend
uv sync --frozen --all-groups
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Notes:

- Backend dependency management is **uv‑only**.

### Frontend (`npm`)

```bash
cd frontend
npm install
npm start
```

Notes:

- Local Node.js/npm are required for frontend development, linting, tests, and hooks.

***

## Repository Structure

- `backend/` – FastAPI API, sizing core, services, models, and tests
- `frontend/` – React UI, API client, and end‑to‑end tests
- `docs/` – project documentation and architecture notes

***

## API Overview

- `GET /healthz` – health check
- `POST /v1/size` – infrastructure sizing
- `POST /v1/report` – Excel report generation
- `POST /v1/whatif` – scenario comparison
- `POST /v1/auto-optimize` – hardware auto‑optimization
- `GET /v1/gpus` – GPU catalog
- `GET /v1/gpus/{gpu_id}` – GPU details

Full API schema: http://localhost:8000/docs

***

## Stack

**Backend**: FastAPI, Pydantic, Uvicorn, Pandas, `uv`
**Frontend**: React, Tailwind CSS, Recharts, Axios

***

## Documentation

- Main docs index: `docs/index.md`
- Backend details: `backend/README.md`
- Frontend details: `frontend/README.md`
- Contributing guide: `CONTRIBUTING.md`

***

## Helm: outbound HTTP/HTTPS proxy

The Helm chart can route the backend's outbound traffic (e.g. the GPU-catalog
scrape, model-config lookups) through an enterprise proxy. The chart never sees
plaintext credentials — they live in a single Kubernetes Secret you manage out
of band.

**Step 1 — create the Secret.** The keys you set become env vars on the
backend container; recognized names: `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`
(and lowercase `http_proxy` / `https_proxy` / `no_proxy`). Embed credentials
directly in the URL value — URL-encode `:`, `@`, `/`, and spaces inside the
user/password. Example with auth:

```bash
kubectl create secret generic calc-proxy -n <release-namespace> \
  --from-literal=HTTPS_PROXY='http://USER:PASS@proxy.corp:3128' \
  --from-literal=HTTP_PROXY='http://USER:PASS@proxy.corp:3128' \
  --from-literal=NO_PROXY='localhost,127.0.0.1,.svc,.cluster.local'
```

For a proxy without auth, drop the `USER:PASS@` segment.

**Step 2 — point the chart at it.** Two values, both required when the proxy
is in use:

```yaml
proxy:
  enabled: true
  secretName: calc-proxy
```

Or via `--set`:

```bash
helm upgrade calc charts/ai-infra-calculator -n <ns> \
  --reuse-values --set proxy.enabled=true --set proxy.secretName=calc-proxy
```

When `proxy.enabled` is `false` (default), no proxy env vars are injected and
the Secret is not referenced. Rotating credentials is a `kubectl edit secret
calc-proxy` away — re-create or restart the backend pod afterwards so it picks
up the new env values.

***

## Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/...`)
3. Commit your changes (`git commit -m '...'`)
4. Push the branch (`git push origin feature/...`)
5. Open a Pull Request

***

## License

See [LICENSE](LICENSE).
