/**
 * Russian translation dictionary. Mirror of en.js — keep keys in sync.
 */
const ru = {
  // ── App shell ────────────────────────────────────────────────────────
  "app.title": "AI Калькулятор инфраструктуры",
  "app.subtitle": "Сайзинг GPU для LLM, VLM и OCR",
  "app.docs": "Методология",
  "app.github": "GitHub",
  "app.theme.light": "Светлая",
  "app.theme.dark": "Тёмная",
  "app.theme.system": "Системная",
  "app.theme.label": "Тема",
  "app.lang.label": "Язык",
  "app.lang.en": "EN",
  "app.lang.ru": "RU",
  "app.footer.version": "Версия",
  "app.footer.builtWith": "На FastAPI + React",
  "app.tour.start": "Запустить тур",

  // ── Calculator modes ─────────────────────────────────────────────────
  "mode.label": "Режим калькулятора",
  "mode.llm": "LLM",
  "mode.llm.subtitle": "Чат и completion",
  "mode.vlm": "VLM",
  "mode.vlm.subtitle": "Изображение → JSON",
  "mode.ocr": "OCR + LLM",
  "mode.ocr.subtitle": "Двухстадийная экстракция",

  // ── Results: shared ──────────────────────────────────────────────────
  "results.title": "Результаты расчёта",
  "results.empty": "Заполните параметры и запустите расчёт, чтобы увидеть результат.",
  "results.servers": "Серверов",
  "results.servers.subtitle": "Всего физических машин",
  "results.gpus": "Всего GPU",
  "results.gpus.subtitle": "Сервера × GPU/сервер",
  "results.sessions": "Сессий / сервер",
  "results.throughput": "Пропускная способность сервера",
  "results.throughput.unit": "req/s",
  "results.gpuPerServer": "GPU / сервер",
  "results.gpuPerInstance": "GPU / экземпляр",
  "results.instancesPerServer": "Экземпляров / сервер",
  "results.recalculate": "Пересчитать",

  // ── Card 1 (LLM): infrastructure ─────────────────────────────────────
  "results.card1.title": "Инфраструктура",

  // ── Memory / KV cards ────────────────────────────────────────────────
  "results.memory.title": "Память GPU на экземпляр",
  "results.memory.modelWeights": "Веса модели",
  "results.memory.kvAtPeak": "KV при пике",
  "results.memory.free": "Свободно / overhead",
  "results.memory.total": "Всего на экземпляр",

  // ── Latency / SLA ────────────────────────────────────────────────────
  "results.latency.ttft": "TTFT",
  "results.latency.e2e": "End-to-end задержка",
  "results.latency.target": "цель",
  "results.latency.actual": "факт",
  "results.sla.passed": "Все SLA-проверки пройдены",
  "results.sla.failed": "SLA не выполнен",
  "results.sla.recommendations": "Рекомендации",

  // ── Gateway quotas ───────────────────────────────────────────────────
  "results.gateway.title": "Квоты для шлюза",
  "results.gateway.subtitle": "Для LiteLLM / shared vLLM",
  "results.gateway.peakRpm": "Пиковый RPM",
  "results.gateway.peakTpm": "Пиковый TPM",
  "results.gateway.tpmSplit": "TPM по сторонам",
  "results.gateway.maxParallel": "Конкурентность",
  "results.gateway.sustained": "устойчивый",
  "results.gateway.in": "вход",
  "results.gateway.out": "выход",
  "results.gateway.concurrent": "одновр. запросов",
  "results.gateway.concurrentPages": "одновр. страниц",
  "results.gateway.ocrPeakRpm": "OCR пиковый RPM",
  "results.gateway.llmPeakRpm": "LLM пиковый RPM",
  "results.gateway.llmPeakTpm": "LLM пиковый TPM",
  "results.gateway.cpuPipeline": "CPU-пайплайн",
  "results.gateway.pagesPerMin": "страниц/мин",

  // ── Form (high-level section labels) ─────────────────────────────────
  "form.calculate": "Рассчитать",
  "form.calculating": "Расчёт…",
  "form.autoOptimize": "Автоподбор",
  "form.report": "Скачать Excel-отчёт",
  "form.section.users": "Пользователи и нагрузка",
  "form.section.tokens": "Профиль токенов",
  "form.section.model": "Модель",
  "form.section.kv": "KV-кэш",
  "form.section.hardware": "Оборудование",
  "form.section.compute": "Вычисления",
  "form.section.sla": "SLA",
  "form.section.agentic": "Агентный / RAG",
  "form.preset.select": "Выбрать пресет",
  "form.search.model": "Поиск модели в Hugging Face",
  "form.source.auto": "Авто",
  "form.source.hf": "HuggingFace",
  "form.source.curated": "Файл-каталог",

  // ── VLM / OCR specific ───────────────────────────────────────────────
  "vlm.replicas": "Реплики",
  "vlm.bsRealStar": "BS_real*",
  "vlm.visualTokens": "Визуальных токенов",
  "vlm.prefillLength": "Длина prefill",
  "ocr.ocrPool": "OCR пул",
  "ocr.llmPool": "LLM пул",
  "ocr.bsRealStar": "BS_real*",
  "ocr.replicas": "LLM реплики",
  "ocr.cores": "ядер",
  "ocr.gpus": "GPU",
  "ocr.handoff": "Хэндофф",
  "ocr.budgetSplit": "SLA бюджет",

  // ── MIG advisory ─────────────────────────────────────────────────────
  "mig.title": "Подсказка по MIG",
  "mig.fits": "Помещается в MIG-слайс",
  "mig.notFits": "Требует полный GPU",

  // ── Errors / loading ─────────────────────────────────────────────────
  "error.title": "Ошибка",
  "error.network": "Сетевая ошибка: бэкенд недоступен.",
  "error.retry": "Повторить",
  "loading.calculating": "Идёт расчёт…",
};

export default ru;
