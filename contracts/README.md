# API

## HTTP-слой (FastAPI)
* POST /v1/size — принимает SizingInput (JSON), возвращает SizingOutput
* POST /v1/whatif — тот же вход + массив сценариев с изменёнными полями; возвращает список SizingOutput по каждому сценарию (удобно для сравнения моделей/серверов)
* GET /v1/healthz — простая проверка
