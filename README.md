# AI Server Calculator

Полнофункциональное приложение для расчета требований к серверной инфраструктуре для AI/LLM моделей. Включает в себя FastAPI backend и React frontend с интерактивным интерфейсом.
<img width="997" height="1172" alt="image" src="https://github.com/user-attachments/assets/97951fb9-b664-4494-980c-ba4c5f902303" />


## 🚀 Быстрый старт с Docker

Самый простой способ запустить приложение:

```bash
# Клонируйте репозиторий
git clone <repository-url>
cd AI.ServerCalculationApp

# Запустите все сервисы
docker-compose up --build
```

**Доступ к приложению:**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 📋 Описание

Это приложение реализует методику расчета количества серверов для AI/LLM инфраструктуры, основанную на математических формулах для определения:

- Количества одновременно активных пользователей
- Требований к памяти GPU для модели и KV-кэша
- Пропускной способности серверов
- Итогового количества необходимых серверов

### 🔄 Автоматическое обновление GPU данных

Приложение автоматически:
- **При запуске** - обновляет каталог GPU из Wikipedia
- **Каждый час** - повторно обновляет данные для актуальности
- **В фоновом режиме** - без прерывания работы API
- **С логированием** - все операции записываются в логи

## 🏗️ Архитектура

```
AI.ServerCalculationApp/
├── backend/                     # FastAPI Backend
│   ├── main.py                # Основной API сервер
│   ├── models/                # Pydantic модели (новая структура)
│   │   ├── __init__.py      # Импорты всех моделей
│   │   ├── sizing.py        # Модели для расчета серверов
│   │   ├── gpu.py           # Модели для GPU каталога
│   │   └── README.md        # Документация моделей
│   ├── gpu_scraper.py         # Скрапер GPU данных
│   ├── pyproject.toml         # Python metadata + tool config
│   ├── uv.lock                # Lockfile для reproducible installs
│   ├── Dockerfile             # Docker конфигурация
│   └── tests/                 # Тесты
├── frontend/                    # React Frontend
│   ├── src/
│   │   ├── components/      # React компоненты
│   │   ├── services/        # API клиент
│   │   └── App.js           # Главный компонент
│   ├── package.json           # Node.js зависимости
│   └── Dockerfile             # Docker конфигурация
├── nginx/                       # Nginx конфигурация
│   ├── nginx-site.conf        # Конфигурация сайта
│   └── certbot-setup.sh       # Скрипт SSL
├── docker-compose.yml           # Локальная разработка
├── docker-compose.prod.yml      # Production
├── redeploy.sh                  # Скрипт деплоя
└── README.md                    # Этот файл
```

## 🛠️ Технологии

### Backend
- **FastAPI** - современный веб-фреймворк для Python
- **Pydantic** - валидация данных и схемы
- **Uvicorn** - ASGI сервер
- **Python 3.14** - язык программирования
- **Pandas** - обработка данных GPU
- **Requests** - HTTP клиент для скрапинга
- **APScheduler** - планировщик задач
- **LXML** - парсинг HTML таблиц

### Frontend
- **React 18** - библиотека для пользовательских интерфейсов
- **Tailwind CSS** - утилитарный CSS фреймворк
- **Recharts** - библиотека для графиков
- **Axios** - HTTP клиент

## 📊 Функциональность

### Backend API

#### Расчет серверов
- **POST /v1/size** - Расчет требований к серверам
- **POST /v1/whatif** - Сравнение сценариев "что если"

#### GPU Каталог
- **GET /v1/gpus** - Список GPU с фильтрацией и пагинацией (vendor: NVIDIA, AMD, Intel)
- **GET /v1/gpus/{gpu_id}** - Детали конкретного GPU
- **POST /v1/gpus/refresh** - Обновление данных GPU из Wikipedia
- **GET /v1/gpus/stats** - Статистика по каталогу GPU

#### Мониторинг
- **GET /healthz** - Проверка здоровья сервиса
- **GET /v1/scheduler/status** - Статус планировщика обновления GPU данных
- **GET /docs** - Интерактивная документация API

### Frontend
- Интерактивные слайдеры для всех параметров
- Двойные элементы управления (слайдеры + текстовые поля)
- Валидация целых чисел для специфических параметров
- Визуализация результатов с графиками
- Адаптивный дизайн
- Складываемые секции параметров
- Комплексная обработка ошибок

## 🔧 Установка и запуск

### Вариант 1: Docker (Рекомендуется)

```bash
# Запуск всех сервисов
docker-compose up --build

# Остановка
docker-compose down
```

### Вариант 2: Локальная разработка

#### Backend
```bash
cd backend
uv sync --frozen --all-groups
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd frontend
npm install
npm start
```

## 📖 API Документация

### Основные параметры расчета

| Параметр | Описание | Единица измерения |
|----------|----------|-------------------|
| `internal_users` | Количество внутренних пользователей | пользователей |
| `penetration_internal` | Коэффициент проникновения (0-1) | - |
| `concurrency_internal` | Коэффициент одновременности (0-1) | - |
| `prompt_tokens_P` | Количество токенов во вводе | токенов |
| `answer_tokens_A` | Количество токенов в ответе | токенов |
| `rps_per_active_user_R` | Запросов в секунду на активного пользователя | запрос/с |
| `session_duration_sec_t` | Средняя длительность сессии | секунд |
| `params_billions` | Количество параметров модели | миллиардов |
| `gpu_mem_gb` | Память GPU | ГБ |
| `gpus_per_server` | Количество GPU на сервере | штук |

### Пример запроса

```bash
curl -X POST "http://localhost:8000/v1/size" \
  -H "Content-Type: application/json" \
  -d '{
    "internal_users": 1000,
    "penetration_internal": 0.6,
    "concurrency_internal": 0.2,
    "external_users": 0,
    "penetration_external": 0.0,
    "concurrency_external": 0.0,
    "prompt_tokens_P": 300,
    "answer_tokens_A": 700,
    "rps_per_active_user_R": 0.02,
    "session_duration_sec_t": 120,
    "params_billions": 7,
    "bytes_per_param": 2,
    "overhead_factor": 1.2,
    "layers_L": 32,
    "hidden_size_H": 4096,
    "bytes_per_kv_state": 2,
    "paged_attention_gain_Kopt": 2.5,
    "gpu_mem_gb": 80,
    "gpus_per_server": 8,
    "mem_reserve_fraction": 0.07,
    "tps_per_instance": 250,
    "batching_coeff": 1.2,
    "sla_reserve": 1.25
  }'
```

## 🧮 Математическая модель

Приложение реализует комплексную методику расчета, включающую:

1. **Определение активных пользователей**
   - Внутренние и внешние пользователи
   - Коэффициенты проникновения и одновременности

2. **Расчет требований к памяти**
   - Память модели с учетом квантования
   - KV-кэш для контекста сессий
   - Оптимизации (Paged Attention)

3. **Определение пропускной способности**
   - Токены в секунду на экземпляр
   - Batching коэффициенты
   - SLA резервы

4. **Итоговый расчет серверов**
   - По памяти (количество сессий)
   - По вычислениям (RPS)
   - Максимальное значение

## 🔧 Конфигурация

### Переменные окружения

#### Backend
- `PYTHONUNBUFFERED=1` - для корректного логирования

#### Frontend
- `REACT_APP_API_URL` - URL backend API (по умолчанию: http://localhost:8000)

### Docker конфигурация

Измените порты в `docker-compose.yml`:
```yaml
services:
  backend:
    ports:
      - "8080:8000"  # Backend на порту 8080
  frontend:
    ports:
      - "3001:80"    # Frontend на порту 3001
```

## 🐛 Troubleshooting

### Проблемы с портами
```bash
# Проверить занятые порты
lsof -i :3000
lsof -i :8000
```

### Проблемы с CORS
Backend настроен на разрешение всех origins. Для продакшена измените в `backend/main.py`:
```python
origins = [
    "http://localhost:3000",
    "http://your-domain.com"
]
```

### Пересборка Docker
```bash
# Полная пересборка
docker-compose down
docker-compose up --build

# Только backend
docker-compose up --build backend
```

## 📈 Мониторинг

### Health Check
```bash
curl http://localhost:8000/healthz
```

### Логи
```bash
# Все сервисы
docker-compose logs

# Конкретный сервис
docker-compose logs backend
docker-compose logs frontend

# Следить за логами
docker-compose logs -f
```

## 🚀 Production Deployment

Для продакшена рекомендуется:

1. **Безопасность**
   - Настроить CORS для конкретных доменов
   - Использовать HTTPS
   - Настроить reverse proxy (nginx)

2. **Масштабирование**
   - Использовать Docker Swarm или Kubernetes
   - Настроить load balancer
   - Мониторинг и логирование

3. **Конфигурация**
   - Переменные окружения для секретов
   - Настройка баз данных для персистентности
   - Backup стратегии

## 📚 Дополнительная документация

- [Методология расчета](METHODOLOGY_README.md)
- [Backend документация](backend/README.md)
- [Frontend документация](frontend/README.md)

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект распространяется под лицензией, указанной в файле [LICENSE](LICENSE).

## 📞 Поддержка

Если у вас возникли вопросы или проблемы:

1. Проверьте [Troubleshooting](#-troubleshooting) секцию
2. Изучите логи приложения
3. Создайте issue в репозитории

---

**Примечание**: Это приложение предназначено для планирования инфраструктуры AI/LLM сервисов и должно использоваться в качестве инструмента для предварительной оценки требований к серверам.
