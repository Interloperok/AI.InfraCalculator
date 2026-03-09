# AI Server Calculator

Калькулятор требований к серверной инфраструктуре для AI/LLM моделей. FastAPI backend + React frontend.

## Быстрый старт

```bash
git clone <repository-url>
cd AI.ServerCalculationApp_repo
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger: http://localhost:8000/docs

## Локальный запуск

**Backend:**
```bash
cd app
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

Для frontend создайте `.env` с `REACT_APP_API_URL=http://localhost:8000` (см. `.env.example`).

## Структура

- `app/` — FastAPI backend (расчёт серверов, каталог GPU из Wikipedia)
- `frontend/` — React UI с Tailwind, Recharts

## API

- `POST /v1/size` — расчёт требований к серверам
- `POST /v1/whatif` — сравнение сценариев
- `GET /v1/gpus` — каталог GPU (NVIDIA, AMD, Intel)
- `GET /healthz` — health check

Полная схема: http://localhost:8000/docs

## Стек

Backend: FastAPI, Pydantic, Uvicorn, Pandas. Frontend: React, Tailwind CSS, Recharts, Axios.

## Вклад в проект

1. Fork репозитория
2. Создайте ветку (`git checkout -b feature/...`)
3. Commit (`git commit -m '...'`)
4. Push (`git push origin feature/...`)
5. Откройте Pull Request

## Лицензия

См. [LICENSE](LICENSE).
