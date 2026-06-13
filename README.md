# images.xedoc.ru

MVP монорепозиторий сервиса генерации изображений по SDD: веб-панель, API, очередь задач, галерея и отдельный GPU worker для ComfyUI.

## Что уже есть

- `apps/web` — React + Vite + Tailwind интерфейс для генерации, очереди и галереи.
- `apps/server` — Fastify API, локальное хранилище файлов, worker endpoints.
- `apps/worker` — polling worker для домашнего Windows ПК с ComfyUI.
- `packages/db` — Drizzle schema для PostgreSQL.
- `packages/shared` — общие типы и Zod-схемы.
- `packages/comfy` — загрузка и рендер workflow, вызовы ComfyUI API.
- `workflows/` — стартовые JSON-шаблоны workflow.

## Локальный запуск

1. Установить `pnpm`, `Node.js 20+`, Docker Desktop или локальные PostgreSQL/Redis.
2. Поднять инфраструктуру:

```bash
docker compose up -d
```

3. Создать `.env` на базе `.env.example`.
4. Установить зависимости:

```bash
pnpm install
```

5. Применить схему БД:

```bash
pnpm db:push
```

6. Запустить сервер, фронтенд и при необходимости worker:

```bash
pnpm dev:server
pnpm dev:web
pnpm dev:worker
```

## Production flow

- Сервер: `Ubuntu 24.04`, `Nginx`, `PM2` или `Docker Compose`.
- Папка проекта: `/var/www/images.xedoc.ru`.
- Worker живет на домашнем Windows ПК и подключается исходящими запросами к `https://images.xedoc.ru`.
- Для первого запуска задайте одинаковый `WORKER_SECRET` на сервере и worker.

## Структура MVP API

- `POST /api/generate`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/gallery`
- `GET /api/models`
- `POST /api/worker/register`
- `POST /api/worker/heartbeat`
- `GET /api/worker/jobs/next`
- `POST /api/worker/jobs/:id/status`
- `POST /api/worker/jobs/:id/result`
- `POST /api/worker/jobs/:id/error`

## Важные замечания

- Сейчас это именно рабочий MVP-каркас, а не финальная production-сборка.
- Аутентификация пока упрощена: сервер сидирует `admin` пользователя и использует его для создания джобов.
- `workflows/flux-schnell.json` и `workflows/character-sdxl.json` пока заглушки — перед боевым запуском их нужно заменить настоящими графами ComfyUI.
- Генерация завязана на локально доступный `COMFYUI_URL`.

## Привязка к GitHub

Для заливки в репозиторий `WizardJIOCb/images.xedoc.ru`:

```bash
git init
git remote add origin https://github.com/WizardJIOCb/images.xedoc.ru.git
git checkout -b main
git add .
git commit -m "Initial MVP scaffold for images.xedoc.ru"
git push -u origin main
```
