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
  "app.docs.download": "Скачать .docx",
  "app.docs.close": "Закрыть (Esc)",
  "app.docs.loading": "Загрузка методологии…",
  "app.docs.error": "Не удалось загрузить методологию",

  // ── Calculator modes ─────────────────────────────────────────────────
  "mode.label": "Режим калькулятора",
  "mode.llm": "LLM",
  "mode.llm.subtitle": "Чат / completion",
  "mode.vlm": "OCR (VLM)",
  "mode.vlm.subtitle": "Картинка → JSON",
  "mode.ocr": "OCR + LLM",
  "mode.ocr.subtitle": "Двухстадийный",

  // ── Results: shared ──────────────────────────────────────────────────
  "results.title": "Результаты расчёта",
  "results.loading": "Расчёт серверной конфигурации…",
  "results.warning": "Предупреждение",
  "results.empty.title": "Пока нет результатов",
  "results.empty.subtitle": "Отправьте конфигурацию, чтобы увидеть требования к серверам",
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
  "results.dismiss": "Закрыть",

  // ── Card 1 (LLM): infrastructure ─────────────────────────────────────
  "results.card1.title": "Инфраструктура",

  // ── Hero metric cards (LLM) ─────────────────────────────────────────
  "results.cost.title": "Оценка стоимости",
  "results.cost.tooltip":
    "Если значение пустое — скачайте справочник по GPU и заполните стоимость самостоятельно.",
  "results.cost.subtitle": "Только аппаратное обеспечение GPU",
  "results.concurrentSessions": "Одновременные сессии",
  "results.sessionContext": "Контекст сессии",
  "results.sessionContext.unit": "токенов",
  "results.infrastructure.title": "Требуемая инфраструктура",
  "results.infrastructure.servers": "серверов",
  "results.infrastructure.gpus": "GPU",
  "results.infrastructure.maxMemComp": "max(память: {mem}, комп.: {comp})",
  "results.sessions.title": "Сессий на сервер",
  "results.sessions.subtitle": "{instances} экз. × {sessions} сесс. каждый",
  "results.throughput.title": "Пропускная способность сервера",
  "results.throughput.tooltip":
    "Запросов в секунду, которые обрабатывает один сервер (req/s)",
  "results.throughput.detail": "prefill {pf} · decode {dec}",

  // ── Secondary metric cards ──────────────────────────────────────────
  "results.gpuPerServer.title": "GPU на сервер",
  "results.gpuPerInstance.title": "GPU на экземпляр",
  "results.gpuPerInstance.tooltip":
    "Один экземпляр — одна работающая копия модели. Это число GPU, выделенных на каждую копию (степень тензорного параллелизма).",
  "results.instancesPerServer.title": "Экземпляров на сервер",
  "results.instancesPerServer.tooltip":
    "Сколько независимых копий модели помещается на одном сервере с учётом тензорного параллелизма.",

  // ── Memory / KV cards ────────────────────────────────────────────────
  "results.memory.title": "Память GPU на экземпляр",
  "results.memory.headerSubtitle": "{n} GPU × {gib} GiB = {total} GiB всего",
  "results.memory.modelWeights": "Веса модели",
  "results.memory.kvAvailable": "Доступно под KV-кэш",
  "results.memory.reserved": "Резерв (1 − Kavail)",
  "results.memory.kvAtPeak": "KV при пике",
  "results.memory.free": "Свободно / overhead",
  "results.memory.total": "Всего на экземпляр",

  // ── Latency / SLA ────────────────────────────────────────────────────
  "results.latency.ttft": "TTFT",
  "results.latency.e2e": "End-to-end задержка",
  "results.latency.target": "цель",
  "results.latency.actual": "факт",
  "results.sla.title": "Проверка SLA",
  "results.sla.notifications.title": "SLA-уведомления",
  "results.sla.notifications.button": "SLA-уведомления",
  "results.sla.passed": "Все SLA-проверки пройдены",
  "results.sla.failed": "SLA не выполнен",
  "results.sla.passed.short": "Пройдено",
  "results.sla.failed.short": "Не пройдено",
  "results.sla.passed.empty": "SLA выполнен. Рекомендаций нет.",
  "results.sla.empty": "Нет уведомлений.",
  "results.sla.ttft.title": "Время до первого токена (TTFT)",
  "results.sla.e2e.title": "Сквозная задержка",
  "results.sla.calculated": "Рассчитано",
  "results.sla.target": "Цель SLA",
  "results.sla.unit": "сек",
  "results.sla.pass": "PASS",
  "results.sla.fail": "FAIL — превышен порог",
  "results.sla.recommendations": "Рекомендации",

  // ── Detailed results (Memory / Compute paths) ───────────────────────
  "results.detailed.title": "Подробные результаты",
  "results.detailed.memoryPath": "Память",
  "results.detailed.computePath": "Вычисления",
  "results.detailed.tokensPerRequest": "Токенов на запрос (T)",
  "results.detailed.sessionContext": "Контекст сессии (TS)",
  "results.detailed.sequenceLength": "Длина последовательности (SL)",
  "results.detailed.modelMem": "Память модели (Mmodel)",
  "results.detailed.kvPerSession": "KV/сессия (MKV)",
  "results.detailed.freeKvInst": "Свободно KV/экз.",
  "results.detailed.sessionsBaseTp": "Сессий/экз. (базовый TP)",
  "results.detailed.sessionsZTp": "Сессий/экз. (Z × TP)",
  "results.detailed.serversByMemory": "Серверов по памяти",
  "results.detailed.gpuTflops": "GPU TFLOPS (на GPU)",
  "results.detailed.fcountModel": "Fcount_model (на экз.)",
  "results.detailed.flopsPerToken": "FLOP/токен (FPS)",
  "results.detailed.decodeTokens": "Decode-токенов (Tdec)",
  "results.detailed.prefillThroughput": "Prefill пропускная (Th_pf)",
  "results.detailed.decodeThroughput": "Decode пропускная (Th_dec)",
  "results.detailed.cmodel": "Запросов/с на экз. (Cmodel)",
  "results.detailed.serverThroughput": "Пропускная сервера (Th_server)",
  "results.detailed.serversByCompute": "Серверов по вычислениям",
  "results.detailed.tokensUnit": "ток",

  // ── Report download ─────────────────────────────────────────────────
  "results.report.download": "Скачать Excel-отчёт",
  "results.report.generating": "Генерация отчёта…",

  // ── Gateway quotas ───────────────────────────────────────────────────
  "results.gateway.title": "Квоты для шлюза",
  "results.gateway.subtitle": "Для LiteLLM / shared vLLM",
  "results.gateway.peakRpmTooltip":
    "Сколько вызовов модели в минуту шлюз получает на пике. Используйте как потолок rate-limit на шлюзе инференса (например, LiteLLM rpm, NGINX limit_req). Строка «устойчивый» ниже — среднее значение без SLA-запаса.",
  "results.gateway.peakTpmTooltip":
    "Суммарный поток токенов в минуту (вход — promt + ответ модели) через шлюз на пике. Это то, что считают биллинг и токеновые квоты на тенанта. Используйте для tpm-лимита на шлюзе.",
  "results.gateway.tpmSplitTooltip":
    "Те же Peak TPM, но раздельно: вход (system + user + RAG/история), который шлюз передаёт модели, и выход — токены, которые модель генерирует. Нужно, когда вход и выход тарифицируются или ограничиваются по отдельности.",
  "results.gateway.maxParallelTooltip":
    "Сколько запросов одновременно может обрабатываться на пике. Настройте как лимит конкурентности на шлюзе (LiteLLM max_parallel_requests, vLLM max_num_seqs), чтобы новые запросы вставали в очередь, а не перегружали движок и не ломали SLA.",
  "results.gateway.ocrPeakRpmTooltip":
    "Сколько страниц в минуту приходит на OCR-этап на пике. Ноль, если OCR работает на CPU (CPU-этап не идёт через шлюз).",
  "results.gateway.llmPeakRpmTooltip":
    "Сколько вызовов в минуту приходит на LLM-этап на пике — один вызов на страницу. Используйте как потолок rate-limit для LLM-пула на шлюзе.",
  "results.gateway.llmPeakTpmTooltip":
    "Суммарный поток токенов в минуту на LLM-пуле на пике (system prompt + распознанный текст + JSON-ответ модели). Используйте для tpm-лимита LLM-пула.",
  "results.gateway.peakRpm": "Пиковый RPM",
  "results.gateway.peakTpm": "Пиковый TPM",
  "results.gateway.tpmSplit": "TPM (вход/выход)",
  "results.gateway.maxParallel": "Макс. одновр.",
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
  "form.title": "Конфигурация",
  "form.calculate": "Рассчитать",
  "form.calculating": "Расчёт…",
  "form.autoOptimize": "Автоподбор",
  "form.autoOn": "Авто",
  "form.autoOff": "Авто",
  "form.autoTooltip": "Автоподбор: найти оптимальную конфигурацию оборудования",
  "form.findBest": "Подобрать конфигурацию",
  "form.searching": "Перебор конфигураций…",
  "form.report": "Скачать Excel-отчёт",
  "form.tab.basic": "Базовые",
  "form.tab.advanced": "Расширенные",
  "form.section.users": "Пользователи и нагрузка",
  "form.section.usersTooltip":
    "Размер базы пользователей. Тонкая настройка проникновения и одновременности — на вкладке «Расширенные».",
  "form.section.tokens": "Профиль токенов",
  "form.section.model": "Модель",
  "form.section.modelTooltip":
    "Найдите модель в Hugging Face для автозаполнения параметров архитектуры — или задайте их вручную во вкладке «Расширенные».",
  "form.section.kv": "KV-кэш",
  "form.section.hardware": "Оборудование",
  "form.section.sla": "SLA",
  "form.preset.select": "Выбрать пресет",
  "form.search.model": "Поиск модели в Hugging Face",
  "form.search.placeholder": "Поиск модели (например, llama, gpt и т. п.)",
  "form.search.tooltip":
    "Поиск в Hugging Face для подбора модели. Параметры (размер, слои, hidden dim) заполнятся автоматически. В режиме «Файл-каталог» поиск идёт по встроенному каталогу.",
  "form.dataSource": "Источник данных",
  "form.source.auto": "Авто",
  "form.source.hf": "HuggingFace",
  "form.source.curated": "Файл-каталог",
  "form.badge.hf": "HuggingFace",
  "form.badge.curated": "Файл-каталог",
  "form.badge.unreachable": "(HF недоступен)",
  "form.input.totalUsers": "Всего пользователей",
  "form.input.totalUsersTooltip":
    "Общее число внутренних пользователей, которые могут обратиться к сервису. Можно ввести значение выше максимума слайдера вручную.",
  "form.input.auto": "авто",

  // ── VLM / OCR specific ───────────────────────────────────────────────
  "vlm.title": "Результаты сайзинга VLM",
  "vlm.empty.title": "Результатов пока нет",
  "vlm.empty.subtitle": "Заполните параметры VLM, чтобы увидеть расчёт",
  "vlm.loading": "Идёт расчёт VLM…",
  "vlm.warning": "Предупреждение",
  "vlm.infraRequired": "Требуемая инфраструктура",
  "vlm.servers": "серверов",
  "vlm.gpus": "GPU",
  "vlm.replicasSubtitle": "{count} реплик · {gpus} GPU/сервер",
  "vlm.slaPerPage": "SLA на страницу",
  "vlm.slaPass": "OK",
  "vlm.slaFail": "СБОЙ",
  "vlm.slaDetail": "{actual}с факт · {target}с цель",
  "vlm.throughput": "Пропускная способность VLM",
  "vlm.throughputUnit": "ток/с prefill",
  "vlm.decode": "decode {value} ток/с",
  "vlm.replicas": "Реплики",
  "vlm.bsRealStar": "BS_real*",
  "vlm.visualTokens": "Визуальных токенов",
  "vlm.prefillLength": "Длина prefill",
  "vlm.gatewayQuotas": "Квоты для шлюза",
  "vlm.gatewaySubtitle": "Для LiteLLM / shared vLLM",
  "vlm.peakRpm": "Пиковый RPM",
  "vlm.peakRpmSub": "устойчиво {value} страниц/мин",
  "vlm.peakTpm": "Пиковый TPM",
  "vlm.peakTpmSub": "устойчиво {value}",
  "vlm.tpmSplit": "TPM (вход/выход)",
  "vlm.maxParallel": "Макс. одновр.",
  "vlm.concurrentPages": "одновр. страниц",
  "vlm.memoryTitle": "Память GPU на экземпляр",
  "vlm.memModel": "Веса модели",
  "vlm.memKv": "KV-кэш (при BS*)",
  "vlm.memReserved": "Резерв",
  "vlm.memTotalLine": "Всего на экземпляр: {total} ГБ · KV при BS*: {kv} ГБ",
  "vlm.diagnostics": "Диагностика",
  "vlm.diag.gpusPerInstance": "GPU / экземпляр",
  "vlm.diag.sTpZ": "S_TP при Z",
  "vlm.diag.instanceMem": "Память экземпляра",
  "vlm.diag.gpuTflops": "GPU TFLOPS",
  "vlm.diag.slPfEff": "SL_pf (эфф.)",
  "vlm.diag.slDec": "SL_dec",
  "vlm.diag.kvPerPage": "KV на страницу",
  "vlm.diag.modelWeights": "Веса модели",
  "vlm.diag.slaTarget": "SLA цель",

  "ocr.title": "Результаты сайзинга OCR + LLM",
  "ocr.empty.title": "Результатов пока нет",
  "ocr.empty.subtitle": "Заполните параметры OCR + LLM, чтобы увидеть расчёт",
  "ocr.loading": "Идёт расчёт OCR + LLM…",
  "ocr.warning": "Предупреждение",
  "ocr.infraRequired": "Требуемая инфраструктура",
  "ocr.servers": "серверов",
  "ocr.gpus": "GPU",
  "ocr.poolSubtitle": "OCR пул: {ocr} · LLM пул: {llm}",
  "ocr.poolSubtitleCpu": "OCR на CPU",
  "ocr.slaPerPage": "SLA на страницу",
  "ocr.slaPass": "OK",
  "ocr.slaFail": "СБОЙ",
  "ocr.slaDetail": "t_OCR {tOcr}с · LLM бюджет {tLlm}с · цель {target}с",
  "ocr.throughput": "Пропускная способность LLM",
  "ocr.throughputUnit": "ток/с prefill",
  "ocr.decode": "decode {value} ток/с",
  "ocr.ocrPool": "OCR пул",
  "ocr.llmPool": "LLM пул",
  "ocr.bsRealStar": "BS_real*",
  "ocr.replicas": "LLM реплики",
  "ocr.cores": "ядер",
  "ocr.gpus.label": "GPU",
  "ocr.cpu": "CPU",
  "ocr.coresLine": "{count} ядер",
  "ocr.handoff": "Хэндофф",
  "ocr.budgetSplit": "SLA бюджет",
  "ocr.gatewayQuotas": "Квоты для шлюза",
  "ocr.gatewaySubtitle": "Лимиты OCR и LLM пулов раздельно",
  "ocr.ocrPeakRpm": "Пиковый RPM OCR",
  "ocr.ocrPeakRpmSub": "страниц/мин",
  "ocr.ocrPeakRpmCpu": "CPU-пайплайн",
  "ocr.llmPeakRpm": "Пиковый RPM LLM",
  "ocr.llmPeakRpmSub": "устойчиво {value}",
  "ocr.llmPeakTpm": "Пиковый TPM LLM",
  "ocr.llmPeakTpmSub": "вход {input} · выход {output}",
  "ocr.maxParallel": "Макс. одновр.",
  "ocr.concurrentPages": "одновр. страниц",
  "ocr.memoryTitle": "Память GPU на LLM-экземпляр",
  "ocr.memModel": "Веса модели",
  "ocr.memKv": "KV-кэш (при BS*)",
  "ocr.memReserved": "Резерв",
  "ocr.memTotalLine": "Всего на экземпляр: {total} ГБ · KV при BS*: {kv} ГБ",
  "ocr.diagnostics": "Диагностика",
  "ocr.diag.pipeline": "Пайплайн",
  "ocr.diag.tOcr": "t_OCR / страница",
  "ocr.diag.llmBudget": "Бюджет LLM",
  "ocr.diag.lText": "L_text",
  "ocr.diag.slPfEff": "SL_pf (эфф.)",
  "ocr.diag.slDec": "SL_dec",
  "ocr.diag.gpusPerInstance": "GPU / экземпляр",
  "ocr.diag.sessionsPerInstance": "Сессий / экземпляр",
  "ocr.diag.kvPerSession": "KV / сессия",
  "ocr.diag.modelWeights": "Веса модели",
  "ocr.diag.gpuTflops": "GPU TFLOPS",
  "ocr.diag.handoff": "Хэндофф",

  // ── MIG advisory ─────────────────────────────────────────────────────
  "mig.title": "Подсказка по MIG",
  "mig.fits": "Помещается в MIG-слайс",
  "mig.notFits": "Требует полный GPU",
  "mig.tipFits": "Подсказка — помещается в MIG-слайс {slice}",
  "mig.body":
    "Конфиг требует ~{mem} ГБ на экземпляр. На этом GPU карту можно разделить на {n}× {slice} слайсов, плотность 1 → {n} экземпляров на физический GPU{tail}",
  "mig.bodyTail": ". Оценочно физических GPU: {est} (против {total} при цельных GPU).",
  "mig.bodyTailEnd": ".",
  "mig.estimateOnly":
    "Только оценка — учёт MIG в расчёте пропускной способности ещё не реализован в бэкенде. Используйте как подсказку при планировании. Максимум {max} слайсов на GPU.",

  // ── VLM / OCR form: shared (workload, model, hardware) ──────────────
  "vmForm.quickPresets": "Быстрые пресеты",
  "vmForm.workloadOnline": "Нагрузка (онлайн)",
  "vmForm.pagesPerSecond": "Страниц в секунду (λ)",
  "vmForm.peakConcurrent": "Пик одновременных страниц",
  "vmForm.slaPerPage": "SLA на страницу (p95)",
  "vmForm.parameters": "Параметры",
  "vmForm.quantization": "Квантизация",
  "vmForm.layers": "Слоёв (L)",
  "vmForm.hiddenSize": "Скрытая размерность (H)",
  "vmForm.kvHeads": "KV-головы (Nkv)",
  "vmForm.attnHeads": "Attention-головы",
  "vmForm.maxContext": "Макс. длина контекста",
  "vmForm.tokensSuffix": "токенов",
  "vmForm.jsonFields": "Полей JSON на ответ",
  "vmForm.tokensPerField": "Токенов на поле",
  "vmForm.tokensPerFieldHint": "обычно 30-100",
  "vmForm.hardware": "Оборудование",
  "vmForm.gpuModel": "Модель GPU",
  "vmForm.gpuPickPrompt": "Нажмите, чтобы выбрать GPU…",
  "vmForm.gpuMemory": "Память GPU",
  "vmForm.gpuTflops": "TFLOPS GPU",
  "vmForm.gpusPerServer": "GPU на сервер",
  "vmForm.tp": "Тензорный параллелизм (Z)",
  "vmForm.tpHint": "1 = один GPU",
  "vmForm.invalidValue": "Отсутствует или некорректное значение: {field}",

  // ── VLM form ────────────────────────────────────────────────────────
  "vlmForm.imageTokenProfile": "Профиль изображения и токенов",
  "vlmForm.imageWidth": "Ширина изображения",
  "vlmForm.imageHeight": "Высота изображения",
  "vlmForm.patchSize": "Эффективный размер патча",
  "vlmForm.patchHint": "Qwen2.5-VL ≈ 28",
  "vlmForm.promptTokens": "Токены промпта (текст)",
  "vlmForm.modelTitle": "VLM-модель",
  "vlmForm.submit": "Рассчитать сайзинг VLM",
  // Подсказки полей
  "vmForm.pagesPerSecond.tooltip":
    "Средняя нагрузка на извлечение (страниц в секунду), которую система должна устойчиво держать на длинном горизонте.",
  "vmForm.peakConcurrent.tooltip":
    "Пик одновременно обрабатываемых страниц — всплеск, который система должна выдержать без выхода за SLA.",
  "vmForm.slaPerPage.tooltip":
    "Целевая латентность на страницу (p95). Весь конвейер должен вернуть JSON одной страницы за это время.",
  "vlmForm.imageWidth.tooltip":
    "Ширина изображения страницы в пикселях в том разрешении, в котором её получает VLM. Больше страница — больше визуальных токенов — медленнее prefill.",
  "vlmForm.imageHeight.tooltip":
    "Высота изображения страницы в пикселях. Вместе с шириной и patch size определяет число визуальных токенов от энкодера.",
  "vlmForm.patchSize.tooltip":
    "Сторона патча (в пикселях), который vision-encoder делает одним токеном. Число визуальных токенов = ⌈W/patch⌉·⌈H/patch⌉. По умолчанию ≈ 28 для Qwen2.5-VL; точное значение — в processor_config модели.",
  "vlmForm.promptTokens.tooltip":
    "Токены текстового промпта, отправляемого вместе с изображением (system-инструкция + схема извлечения). Добавляются к длине prefill.",
  "vmForm.jsonFields.tooltip":
    "Сколько полей модель извлекает на страницу в JSON-ответе. Больше полей — длиннее ответ — больше времени на decode.",
  "vmForm.tokensPerField.tooltip":
    "Среднее число токенов на поле в ответе. Умножается на количество полей для оценки общей длины decode.",

  // ── OCR form ────────────────────────────────────────────────────────
  "ocrForm.pipelineTitle": "OCR-конвейер",
  "ocrForm.pipelineLabel": "OCR-конвейер",
  "ocrForm.pipelineOnGpu": "OCR на GPU",
  "ocrForm.pipelineOnGpuHint": "PaddleOCR-GPU, EasyOCR-GPU",
  "ocrForm.pipelineOnCpu": "OCR на CPU",
  "ocrForm.pipelineOnCpuHint": "Tesseract; CPU-пул, без сайзинга GPU",
  "ocrForm.throughputGpu": "Пропускная способность OCR на GPU",
  "ocrForm.empirical": "эмпирически",
  "ocrForm.poolUtilisation": "Утилизация OCR-пула (η_OCR)",
  "ocrForm.poolUtilHint": "0.7-0.85",
  "ocrForm.throughputCore": "Пропускная способность OCR на ядро",
  "ocrForm.cpuCores": "CPU-ядер на OCR",
  "ocrForm.handoff": "Накладные расходы передачи",
  "ocrForm.handoffHint": "Передача OCR → LLM",
  "ocrForm.textProfile": "Текстовый профиль OCR",
  "ocrForm.charsPerPage": "Символов на страницу",
  "ocrForm.charsPerToken": "Символов на токен",
  "ocrForm.charsPerTokenHint": "3.5 смешанный · 4.0 EN · 2.8 RU",
  "ocrForm.sysPromptTokens": "Токены system prompt",
  "ocrForm.modelTitle": "LLM-модель",
  "ocrForm.submit": "Рассчитать сайзинг OCR + LLM",
  "ocrForm.errOcrGpu":
    "Для конвейера ocr_gpu обязательна пропускная способность OCR-GPU (страниц/с/GPU)",
  "ocrForm.errOcrCore":
    "Для конвейера ocr_cpu обязательна пропускная способность OCR-ядра (страниц/с/ядро)",
  "ocrForm.errOcrCores": "Для конвейера ocr_cpu число CPU-ядер OCR должно быть ≥ 1",
  // Подсказки полей OCR
  "ocrForm.throughputGpu.tooltip":
    "Сколько страниц в секунду способен обрабатывать один OCR-GPU процесс (по эмпирическим замерам PaddleOCR-GPU / EasyOCR-GPU). Определяет размер OCR-пула.",
  "ocrForm.poolUtilisation.tooltip":
    "Целевая средняя загрузка OCR-GPU пула. 0.7–0.85 оставляет запас на пики; ближе к 1.0 — риск очередей и срыва SLA.",
  "ocrForm.throughputCore.tooltip":
    "Сколько страниц в секунду OCRит одно CPU-ядро (например, Tesseract). Определяет число CPU-ядер для конвейера ocr_cpu.",
  "ocrForm.cpuCores.tooltip":
    "Число CPU-ядер, выделенных на OCR-этап. Для режима ocr_cpu должно быть ≥ 1.",
  "ocrForm.handoff.tooltip":
    "Фиксированное время передачи результата OCR на LLM-этап (сетевой round-trip, сериализация JSON, очередь). Вычитается из бюджета SLA на страницу.",
  "ocrForm.charsPerPage.tooltip":
    "Среднее число распознанных символов на страницу. Вместе с символов/токен даёт длину входа на LLM-этап.",
  "ocrForm.charsPerToken.tooltip":
    "Степень компрессии токенизатора (символов на токен). Типично: ≈4 для английского, ≈2.8 для русского, 3.5 для смешанного текста.",
  "ocrForm.sysPromptTokens.tooltip":
    "Статический system-prompt, добавляемый ко входу LLM на каждой странице. Добавляется к длине LLM prefill.",

  // ── LLM, вкладка Advanced: заголовки секций + подсказки ─────────────
  "form.section.modelArch": "Архитектура модели",
  "form.section.modelArchTooltip":
    "Базовые параметры архитектуры, определяющие, сколько памяти модель занимает на GPU.",
  "form.section.userBehavior": "Поведение пользователей",
  "form.section.userBehaviorTooltip":
    "Сколько пользователей одновременно активны и как они формируют нагрузку.",
  "form.section.tokenBudget": "Бюджет токенов",
  "form.section.tokenBudgetTooltip":
    "Размеры токенов, описывающие типичный запрос и диалог. Определяют требования к памяти и вычислениям.",
  "form.section.agentic": "Agentic / RAG / Tool-Use",
  "form.section.agenticTooltip":
    "Многовызовные архитектуры: ReAct, RAG, function calling, мульти-агент. Задаёт K_calls, оверхед инструментов и RAG-контекст. При K_calls=1 и нулевых оверхедах сводится к одношаговому диалогу.",
  "form.section.kvCache": "KV-кеш",
  "form.section.kvCacheTooltip":
    "KV-кеш хранит состояния attention для каждой сессии. Больше контекст и больше сессий — больше памяти GPU.",
  "form.section.compute": "Вычисления и пропускная способность",
  "form.section.computeTooltip":
    "Оценка вычислительной мощности GPU и пропускной способности. Определяет, сколько запросов держит один сервер.",
  "form.section.slaLoad": "SLA и нагрузка",
  "form.section.slaLoadTooltip":
    "Цели по SLA и нагрузка на сессию. Используется при проверке SLA и в коэффициенте запаса при сайзинге.",
  "form.section.hardwareTooltip":
    "Выберите GPU-ускоритель и компоновку сервера. Память и TFLOPS подставляются из каталога GPU.",

  // ── Подсказки: карточки результатов LLM ─────────────────────────────
  "results.concurrentSessions.tooltip":
    "Сколько пользовательских сессий могут идти одновременно на пике нагрузки.",
  "results.sessionContext.tooltip":
    "Сколько токенов истории диалога хранит каждая сессия в памяти (системный промпт + сообщения пользователя + ответы модели). Больше контекст — больше памяти на сессию.",
  "results.infrastructure.tooltip":
    "Сколько физических серверов нужно. Итог — максимум из двух проверок: хватает памяти на KV-кеш и хватает вычислений, чтобы держать SLA. На карточке есть всплывающая разбивка.",
  "results.sessions.tooltip":
    "Сколько одновременных сессий может держать один сервер до того, как закончится KV-кеш или упрётся пропускная способность.",
  "results.gpuPerServer.tooltip":
    "Сколько GPU установлено в одном физическом сервере (1 / 2 / 4 / 6 / 8). Зависит от целевой платформы.",
  "results.sla.ttft.tooltip":
    "Time To First Token — сколько пользователь ждёт между нажатием «Отправить» и появлением первого символа ответа. Меньше — лучше; методология по умолчанию ставит цель 1 секунда.",
  "results.sla.e2e.tooltip":
    "End-to-end latency — полное время от запроса до последнего токена ответа. Включает prefill, decode и накладные расходы. По умолчанию цель — 2 секунды.",

  // ── Подсказки: карточки результатов VLM ─────────────────────────────
  "vlm.infraRequired.tooltip":
    "Сколько серверов и GPU нужно для VLM-нагрузки на пике. Размерены так, чтобы памяти хватило на модель + KV-кеш для пиковой пачки, а вычислений — чтобы латентность на страницу укладывалась в SLA.",
  "vlm.slaPerPage.tooltip":
    "Соблюдается ли целевая латентность на страницу (p95) для выбранных модели, GPU и конкурентности. Если падает — снизьте конкурентность, возьмите более быстрый GPU или ослабьте SLA.",
  "vlm.throughput.tooltip":
    "Prefill-пропускная на один VLM-экземпляр — сколько токенов в секунду модель обрабатывает из изображения и промпта. Чем больше — тем меньше латентность на страницу. Под ним — скорость генерации ответа (decode).",
  "vlm.bsRealStar.tooltip":
    "Эффективный размер пачки внутри движка — сколько страниц идут в одном prefill. Большая пачка повышает пропускную, но увеличивает память и латентность на страницу.",
  "vlm.replicas.tooltip":
    "Сколько параллельных копий VLM запущено в кластере. Больше реплик — больше пропускная, но и больше GPU.",
  "vlm.visualTokens.tooltip":
    "Токены, которые vision-encoder делает из одной страницы. Зависят от размера изображения и patch size модели. Большие страницы — много визуальных токенов — медленнее prefill.",
  "vlm.prefillLength.tooltip":
    "Общая длина prefill на страницу = визуальные токены + текстовый промпт. Длиннее prefill — больше вычислений и больше KV.",
  "vlm.diag.gpusPerInstance.tooltip":
    "Сколько GPU выделено одной запущенной копии VLM (степень тензорного параллелизма).",
  "vlm.diag.sTpZ.tooltip":
    "Сколько одновременных страниц может обрабатывать один экземпляр VLM, не выходя из SLA.",
  "vlm.diag.instanceMem.tooltip":
    "Суммарная память GPU, доступная одному экземпляру VLM, по всем выделенным ему GPU.",
  "vlm.diag.gpuTflops.tooltip":
    "Эффективная вычислительная мощность одного GPU, которой оперирует калькулятор (FP16/BF16 tensor TFLOPS).",
  "vlm.diag.slPfEff.tooltip":
    "Эффективная длина prefill, которой оперирует движок — визуальные + промпт-токены после округления под гранулярность пакетирования.",
  "vlm.diag.slDec.tooltip":
    "Сколько токенов модель генерирует на страницу (длина JSON-ответа).",
  "vlm.diag.kvPerPage.tooltip":
    "Память GPU, занятая KV-кешем под одну страницу в работе. Умножается на число одновременных страниц на экземпляр.",
  "vlm.diag.modelWeights.tooltip":
    "Память GPU под загруженные веса модели — без KV-кеша и runtime-оверхеда.",
  "vlm.diag.slaTarget.tooltip":
    "Заданная пользователем цель по латентности на страницу (p95), относительно которой проверяется конфигурация.",

  // ── Подсказки: карточки результатов OCR + LLM ───────────────────────
  "ocr.infraRequired.tooltip":
    "Суммарное число серверов и GPU на оба этапа (OCR + LLM). Подзаголовок снизу показывает сколько GPU тратит каждый этап; для OCR-на-CPU стоит «—», потому что CPU-этап не сайзится в GPU.",
  "ocr.slaPerPage.tooltip":
    "Укладывается ли сквозная латентность на страницу в целевой SLA. В подписи показано фактическое время OCR + время LLM; остаток бюджета — оверхед и передача между этапами.",
  "ocr.throughput.tooltip":
    "Prefill-пропускная одного экземпляра LLM — сколько токенов в секунду этап LLM обрабатывает из распознанного OCR-текста. Под ним — скорость генерации ответа (decode).",
  "ocr.ocrPool.tooltip":
    "Ресурсы, выделенные на этап OCR. Для ocr_gpu — число GPU; для ocr_cpu — число CPU-ядер (этап OCR полностью на CPU).",
  "ocr.llmPool.tooltip":
    "GPU, выделенные на этап LLM, который обрабатывает распознанный текст и выдаёт JSON-ответ.",
  "ocr.bsRealStar.tooltip":
    "Эффективный размер пачки на этапе LLM — сколько страниц идут в одном prefill на LLM.",
  "ocr.replicas.tooltip":
    "Параллельные копии LLM в LLM-пуле. Больше реплик — больше пропускная.",
  "ocr.diag.pipeline.tooltip":
    "Какой OCR-стек учитывал калькулятор: ocr_gpu (PaddleOCR/EasyOCR на GPU) или ocr_cpu (Tesseract на CPU).",
  "ocr.diag.tOcr.tooltip":
    "Сколько времени на страницу занимает этап OCR. Вычитается из бюджета SLA на страницу; остаток достаётся LLM.",
  "ocr.diag.llmBudget.tooltip":
    "Бюджет времени на этап LLM на страницу — то, что осталось от SLA после OCR и оверхеда передачи.",
  "ocr.diag.lText.tooltip":
    "Сколько токенов попадает в LLM — системный промпт плюс распознанный текст одной страницы.",
  "ocr.diag.slPfEff.tooltip":
    "Эффективная длина prefill на этапе LLM после округления под гранулярность пакетирования.",
  "ocr.diag.slDec.tooltip":
    "Сколько токенов LLM генерирует на страницу (длина JSON-ответа).",
  "ocr.diag.gpusPerInstance.tooltip":
    "Сколько GPU выделено одной запущенной копии LLM (степень тензорного параллелизма в LLM-пуле).",
  "ocr.diag.sessionsPerInstance.tooltip":
    "Сколько одновременных страниц может держать один экземпляр LLM в пределах бюджета времени LLM.",
  "ocr.diag.kvPerSession.tooltip":
    "Память GPU под KV-кеш одной страницы в работе на этапе LLM.",
  "ocr.diag.modelWeights.tooltip":
    "Память GPU под загруженные веса LLM — без KV-кеша и runtime-оверхеда.",
  "ocr.diag.gpuTflops.tooltip":
    "Эффективная вычислительная мощность одного GPU LLM-пула (FP16/BF16 tensor TFLOPS).",
  "ocr.diag.handoff.tooltip":
    "Фиксированный оверхед на передачу от OCR к LLM (сетевой round-trip, сериализация JSON, очередь). Вычитается из бюджета на страницу.",

  // ── Errors / loading ─────────────────────────────────────────────────
  "error.title": "Ошибка",
  "error.network": "Сетевая ошибка: бэкенд недоступен.",
  "error.retry": "Повторить",
  "loading.calculating": "Идёт расчёт…",

  // ── Guided tour: Joyride locale ──────────────────────────────────────
  "tour.locale.back": "Назад",
  "tour.locale.close": "Закрыть",
  "tour.locale.last": "Готово",
  "tour.locale.next": "Далее",
  "tour.locale.nextProgress": "Далее (Шаг {step} из {steps})",
  "tour.locale.skip": "Пропустить тур",

  // ── Guided tour: LLM (desktop) ───────────────────────────────────────
  "tour.llm.github":
    "Заходите к нам на GitHub — поставьте звезду и следите за обновлениями проекта.",
  "tour.llm.docs":
    "Здесь — документация по методологии. Откройте её в боковой панели, не уходя из калькулятора.",
  "tour.llm.presets":
    "Начните быстро: выберите пресет с предзаполненной моделью, GPU и параметрами нагрузки.",
  "tour.llm.basicTab":
    "Базовые настройки покрывают пользователей, выбор модели и оборудование — этого достаточно для быстрой оценки.",
  "tour.llm.advancedTab":
    "Здесь точно настраиваются токены, KV-кеш, тензорный параллелизм, эффективность вычислений и SLA.",
  "tour.llm.modelSearch":
    "Найдите вашу модель в Hugging Face. Параметры архитектуры (размер, число слоёв и т.д.) подставляются автоматически.",
  "tour.llm.gpuSearch":
    "Выберите GPU из встроенного каталога или загрузите свой. Память и TFLOPS подставятся автоматически.",
  "tour.llm.slaTargets":
    "Задайте цели по TTFT и e2e задержке (по умолчанию 1 с и 2 с). Калькулятор проверит конфигурацию против этих SLA.",
  "tour.llm.calculate":
    "Нажмите «Рассчитать», чтобы запустить движок сайзинга, или «Найти лучшие конфиги» в авто-режиме для сравнения вариантов.",
  "tour.llm.costEstimate":
    "Оценка стоимости GPU-оборудования по текущим рыночным ценам для выбранной конфигурации.",
  "tour.llm.sessionCards":
    "Сколько одновременных сессий поддержит инфраструктура и какова длина контекста каждой сессии.",
  "tour.llm.resultCards":
    "Главные результаты: всего серверов и GPU (можно сравнить с имеющейся ёмкостью), сессий на сервер и пропускная способность.",
  "tour.llm.donutChart":
    "Визуальная разбивка памяти GPU на один экземпляр модели — веса модели против доступного места под KV-кеш.",
  "tour.llm.detailToggle":
    "Переключайтесь между путём по памяти и путём по вычислениям, чтобы увидеть детали расчёта.",
  "tour.llm.downloadReport":
    "Скачайте подробный Excel-отчёт со всеми входами, промежуточными значениями и итогом.",
  "tour.llm.autoOptimize":
    "Включите Auto-Optimize, чтобы движок перебрал GPU, уровни квантования и степени TP и нашёл лучшую конфигурацию автоматически.",
  "tour.llm.optimizeMode":
    "Выберите стратегию оптимизации: минимум серверов, минимум стоимости, лучший баланс или максимум пропускной способности.",
  "tour.llm.optimizeResults":
    "Результаты оптимизатора появятся в этой боковой панели. Раскройте её, чтобы сравнить конфигурации.",

  // ── Guided tour: LLM (mobile) ────────────────────────────────────────
  "tour.llmMobile.github": "Заходите к нам на GitHub — поставьте звезду.",
  "tour.llmMobile.docs": "Нажмите, чтобы открыть документацию методологии в новой вкладке.",
  "tour.llmMobile.presets":
    "Выберите пресет, чтобы быстро заполнить модель, GPU и параметры нагрузки.",
  "tour.llmMobile.modelSearch":
    "Найдите вашу AI-модель в Hugging Face — параметры подставятся автоматически.",
  "tour.llmMobile.gpuSearch":
    "Выберите GPU из каталога. Память и TFLOPS подставятся автоматически.",
  "tour.llmMobile.calculate":
    "Нажмите «Рассчитать», чтобы запустить движок и увидеть результаты.",

  // ── Guided tour: VLM (desktop) ───────────────────────────────────────
  "tour.vlm.github":
    "Заходите к нам на GitHub — поставьте звезду и следите за обновлениями проекта.",
  "tour.vlm.docs":
    "Документация методологии. Приложение И описывает однопроходный онлайн-сайзинг VLM.",
  "tour.vlm.modeSwitcher":
    "Сейчас вы в режиме VLM — однопроходный сайзинг «картинка → JSON». Переключайтесь на LLM или OCR+LLM здесь.",
  "tour.vlm.presets":
    "Выберите пресет — нагрузка, профиль изображений, модель и оборудование заполнятся в один клик.",
  "tour.vlm.workload":
    "VLM считается в страницах/с, а не в пользовательских сессиях. Задайте среднее число страниц/с, пиковую конкурентность и SLA на страницу.",
  "tour.vlm.hardware":
    "Выберите GPU и степень тензорного параллелизма. VLM обычно работают при TP=1, кроме очень больших моделей.",
  "tour.vlm.calculate":
    "Нажмите, чтобы запустить движок и получить число серверов и GPU под нагрузку.",
  "tour.vlm.results":
    "Три главных карточки: инфраструктура (сервера и GPU), результат проверки SLA и пропускная способность prefill/decode на экземпляр.",

  // ── Guided tour: VLM (mobile) ────────────────────────────────────────
  "tour.vlmMobile.github": "Поставьте звезду на GitHub.",
  "tour.vlmMobile.modeSwitcher": "Переключайтесь между LLM, VLM и OCR+LLM здесь.",
  "tour.vlmMobile.presets": "Нажмите пресет, чтобы заполнить все поля.",
  "tour.vlmMobile.calculate": "Нажмите «Рассчитать», чтобы запустить движок.",

  // ── Guided tour: OCR + LLM (desktop) ─────────────────────────────────
  "tour.ocr.github":
    "Заходите к нам на GitHub — поставьте звезду и следите за обновлениями проекта.",
  "tour.ocr.docs":
    "Документация методологии. Приложение И.4.2 описывает двухпроходный онлайн-сайзинг OCR+LLM с двумя пулами.",
  "tour.ocr.modeSwitcher":
    "Сейчас вы в режиме OCR + LLM — двухстадийная экстракция. Переключайтесь между LLM, VLM и OCR+LLM здесь.",
  "tour.ocr.presets":
    "Выберите пресет — нагрузка, OCR-конвейер, текстовый профиль, модель и оборудование заполнятся в один клик.",
  "tour.ocr.workload":
    "Семантика нагрузки как у VLM: страниц/с, пиковая конкурентность, SLA на страницу. SLA-бюджет делится между этапами OCR и LLM.",
  "tour.ocr.pipeline":
    "Выберите OCR на GPU (PaddleOCR/EasyOCR) для высокой нагрузки или OCR на CPU (Tesseract), если в GPU-пуле должна быть только LLM. Это меняет деление SLA-бюджета.",
  "tour.ocr.hardware": "Выберите GPU и степень тензорного параллелизма для этапа LLM.",
  "tour.ocr.calculate":
    "Запустите сайзинг — бэкенд вернёт отдельные пулы GPU под этапы OCR и LLM.",
  "tour.ocr.results":
    "Три карточки: общая инфраструктура с разбивкой на пулы OCR+LLM, проверка SLA с разложением t_OCR и пропускная способность этапа LLM.",

  // ── Guided tour: OCR + LLM (mobile) ──────────────────────────────────
  "tour.ocrMobile.github": "Поставьте звезду на GitHub.",
  "tour.ocrMobile.modeSwitcher": "Переключайтесь между LLM, VLM и OCR+LLM здесь.",
  "tour.ocrMobile.presets": "Нажмите пресет, чтобы заполнить все поля.",
  "tour.ocrMobile.pipeline": "Выберите OCR на GPU или CPU.",
  "tour.ocrMobile.calculate": "Нажмите «Рассчитать».",
};

export default ru;
