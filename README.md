# AI Server Calculator

Open-source tool for AI/LLM infrastructure sizing. The project combines a FastAPI backend with a React frontend.

## Quick Start

```bash
git clone <repository-url>
cd AI.ServerCalculationApp
docker compose up --build
```

Services:
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:8000](http://localhost:8000)
- OpenAPI docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Local Development

Backend (`uv` + Python):

```bash
cd backend
uv sync --frozen --all-groups
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend (`npm`):

```bash
cd frontend
npm install
npm start
```

Notes:
- Backend dependency management is `uv`-only.
- Local Node.js/npm are still required for frontend development, linting, tests, and hooks.

## Repository Structure

- `backend/` - FastAPI API, sizing core, services, models, and tests
- `frontend/` - React UI, API client, and end-to-end tests
- `docs/` - project documentation and architecture notes

## API Overview

- `GET /healthz` - health check
- `POST /v1/size` - infrastructure sizing
- `POST /v1/report` - Excel report generation
- `POST /v1/whatif` - scenario comparison
- `POST /v1/auto-optimize` - hardware auto-optimization
- `GET /v1/gpus` - GPU catalog
- `GET /v1/gpus/{gpu_id}` - GPU details

Full API schema: [http://localhost:8000/docs](http://localhost:8000/docs)

## Stack

Backend: FastAPI, Pydantic, Uvicorn, Pandas, `uv`

Frontend: React, Tailwind CSS, Recharts, Axios

## Documentation

- Main docs index: `docs/index.md`
- Backend details: `backend/README.md`
- Frontend details: `frontend/README.md`
- Contributing guide: `CONTRIBUTING.md`

## Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/...`)
3. Commit your changes (`git commit -m '...'`)
4. Push the branch (`git push origin feature/...`)
5. Open a Pull Request

## License

See [LICENSE](LICENSE).
