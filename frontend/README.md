# Frontend (React)

Frontend UI for AI/LLM sizing calculator.

## Stack

- React 18 (Create React App)
- Tailwind CSS 3 (semantic colour tokens, light / dark / system theme)
- React context i18n (en / ru)
- Recharts (donuts, charts), lucide-react (icons), react-joyride (tour)
- mammoth (in-browser docx → HTML for the bundled methodology drawer)
- Axios API client
- ESLint + Prettier
- TypeScript checks via `tsc --noEmit`
- Jest unit tests + Playwright smoke tests

## Offline-first

The methodology document is bundled into the image at
`public/llm-methodology.docx`. The Documentation drawer fetches it
locally and renders it via mammoth — no Google Docs iframe, no
outbound traffic. Combined with the `proxy.enabled=false` default and
the curated LLM catalog (selectable as the LLM source mode), the
calculator runs in fully air-gapped environments.

## Single-ingress topology

The bundled `nginx.conf.template` reverse-proxies the full backend API
surface (`/v1/*`, `/healthz`, `/docs`, `/redoc`, `/openapi.json`) to
the in-cluster backend Service. A single port-forward (or single
ingress rule) against the frontend Service exposes the UI plus all
backend endpoints on the same host.

## Local run

```bash
cd frontend
npm install
npm start
```

App URL: [http://localhost:3000](http://localhost:3000)

Backend API defaults:

- development: `http://localhost:8000`
- production: same-origin (`""`, e.g. `/v1/...` via reverse proxy)

## Environment

Optional `.env`:

```dotenv
REACT_APP_API_URL=http://localhost:8000
```

For Create React App this variable is injected at build time.

For Docker builds, pass it as a build arg (not runtime container env):

```bash
REACT_APP_API_URL=https://your-api.example.com docker compose build frontend
```

## Structure

```text
frontend/src/
├── features/
│   ├── calculator/      # Calculator form and result visualization
│   ├── gpu/             # GPU filter modal and related UI
│   └── optimization/    # Auto-optimize results table
├── services/
│   └── api.ts           # Backend API calls + error mapping
├── App.js               # App shell + guided tour + docs drawer
└── index.js             # React entrypoint
```

## Quality checks

```bash
cd frontend
npm run lint
npm run format:check
npm run typecheck
```

## Tests and coverage

```bash
cd frontend
npm run test:ci -- --coverage
npm run test:e2e
```

Coverage threshold (global lines) is enforced in `package.json`.
