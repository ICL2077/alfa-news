# THIRD_PARTY_NOTICES

Инвентаризация Corpo News. Это перечень использованных компонентов и источников, а не изменение их лицензий или прав на входные данные. Полные тексты лицензий JavaScript-пакетов находятся в установленных пакетах; Python-пакетов — в `*.dist-info/licenses` и metadata контейнера. Версии транзитивных зависимостей фиксируют lock-файлы; машиночитаемый локальный перечень — `docs/third-party-inventory.json`.

## Программные компоненты

| Компонент | Версия / фиксация | Лицензия | Источник и применение |
| --- | --- | --- | --- |
| Node.js | 22.23.1, digest в Dockerfile | MIT и notices включённых компонентов | https://github.com/nodejs/node — backend и сборка frontend |
| pnpm | backend Docker 10.34.8; frontend 11.5.0 | MIT | https://github.com/pnpm/pnpm — установка по lock |
| NestJS | 11.x, точные версии в corpo-news/pnpm-lock.yaml | MIT | https://github.com/nestjs/nest — HTTP API |
| @nestjs/swagger / Swagger UI | 11.4.7 / версия в lock | MIT / Apache-2.0 | https://github.com/nestjs/swagger ; https://github.com/swagger-api/swagger-ui — OpenAPI/UI |
| Prisma | 7.10.1, lock | Apache-2.0 | https://github.com/prisma/prisma — ORM и migrations |
| React / React DOM | 19.3.1, lock | MIT | https://github.com/facebook/react — интерфейс |
| TanStack Query | lock frontend | MIT | https://github.com/TanStack/query — запросы и cache UI |
| Vite | lock frontend | MIT | https://github.com/vitejs/vite — сборка |
| TypeScript | lock каждого приложения | Apache-2.0 | https://github.com/microsoft/TypeScript — типизация |
| Lucide | lock frontend | ISC | https://github.com/lucide-icons/lucide — иконки |
| PostgreSQL | Docker tag 16-alpine | PostgreSQL License | https://www.postgresql.org/about/licence/ — данные |
| NATS server / JS client | 2.10-alpine / lock backend | Apache-2.0 | https://github.com/nats-io/nats-server ; https://github.com/nats-io/nats.js — JetStream |
| Caddy | 2.10-alpine | Apache-2.0 | https://github.com/caddyserver/caddy — SPA/proxy |
| Python | 3.12-slim | PSF-2.0 и notices компонентов | https://www.python.org/psf/license/ — worker |
| nats-py | 2.16.0 | Apache-2.0 | https://github.com/nats-io/nats.py — JetStream client |
| Pydantic / pydantic-settings | 2.14.1 / 2.16.1 | MIT | https://github.com/pydantic — проверка DTO и env |
| openai Python SDK | 1.109.1 | Apache-2.0 | https://github.com/openai/openai-python — клиент совместимого HTTP API, не поставщик модели |
| pandas | 2.3.3 | BSD-3-Clause | https://github.com/pandas-dev/pandas — CSV/агрегаты |
| NumPy | 2.5.4 | BSD-3-Clause и notices включённых компонентов | https://github.com/numpy/numpy — вычисления |
| rank-bm25 | 0.2.2 | Apache-2.0 | https://github.com/dorianbrown/rank_bm25 — локальный поиск |
| PyMuPDF / MuPDF | PyMuPDF 1.28.2 | GNU AGPL-3.0 либо Artifex Commercial License | https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright — PDF и рендеринг страниц |
| tenacity | 9.2.1 | Apache-2.0 | https://github.com/jd/tenacity — повторные попытки |

PyMuPDF установлен по публичной dual-license модели. Наличие коммерческой лицензии в проекте не подтверждено. При передаче/развёртывании владелец должен определить применимый вариант и выполнить его условия; этот файл не заменяет лицензию. Docker tags PostgreSQL/NATS/Caddy/Python фиксируют ветку версии, но не immutable digest: полная побитовая воспроизводимость базовых образов пока не обеспечена. Node закреплён по digest.

## Модели и внешние сервисы

- Endpoint по умолчанию: `https://changellenge.up.railway.app/v1`, внешний сервис организаторов/провайдера. API-ключ и квоты выдаются отдельно; сервис не входит в Docker-комплект.
- `qwen/qwen3.6-35b-a3b` — конфигурируемая модель enrichment, scoring, chat; `qwen/qwen3-vl-30b-a3b-instruct` — конфигурируемая VLM OCR. Это идентификаторы, запрашиваемые у провайдера. Веса и лицензии моделей не поставляются с репозиторием; фактическую ревизию backend-модели и условия использования следует подтвердить у провайдера. По одному имени API нельзя установить точную ревизию весов.
- Используются prompts и проверки схем; fine-tuning/обучение собственных весов и embedding-сервис не заявлены.
- `LLM_MODE=stub` — локальная программная имитация ответов. Она не вызывает внешнюю модель и не доказывает качество LLM.
- EasyOCR обозначен настройкой как альтернативный backend, но не входит в основной lock-комплект: стандартный поддержанный профиль OCR — `vlm`.

## Источники данных и смоделированные интеграции

- RSS РБК: URL в `corpo-news/src/news-parser/news-parser.service.ts`. Заголовки, ссылки и тексты принадлежат их правообладателям. Код импорта не предоставляет лицензию на переиздание материалов. В jury-профиле RSS выключен.
- CSV кейса: профили клиентов, платёжные агрегаты и связи из трёх файлов хакатона. Исходные файлы не входят в этот комплект. Применяются ограничения организаторов и владельца данных; их права не заменяются лицензией кода.
- Аналитические PDF Альфа-Банка: внешние материалы для RAG/OCR; не включены в синтетический комплект. Использовать только разрешённые организаторами документы и сохранять ссылки/страницы. Список разрешённого полного корпуса пока не подтверждён.
- `demo/data/csv/`, `demo/company.json`, новости из `demo/seed.cjs`: искусственные сведения с ID `DEMO_*`. Нет реальных клиентов, платёжных операций, публикаций СМИ или позиции банка. Адреса `example.org` — маркеры примеров.
- DaData, CRM, банковское ядро и live API платежей **не интегрированы**. Банковский контекст загружается из файлов. Авторизация владельцев компаний не смоделирована как настоящая банковская учётная запись.
- Логотип/название «Альфа Бизнес» в демо не означают одобрение продукта банком или передачу прав на товарный знак.

## Статус передачи

Этот файл и машиночитаемая инвентаризация подготовлены локально. Список не является заявлением о предоставленном GitHub-доступе жюри, лицензии на данные кейса либо доступности внешнего API. Итоговый SHA, GitHub URL и доступ `alfa-hack-2026` фиксирует владелец перед дедлайном.
