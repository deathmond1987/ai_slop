# Steam Calendar

Next.js 16 приложение для просмотра будущих Steam-релизов, вишлиста и приватного Google Calendar feed через `.ics`.

## Экспорт `.ics`

`/calendar/ics` отдаёт all-day события только для игр с точно известной датой выхода (год, месяц и день). Игры без даты (TBD) и игры с известным только годом (year-only) в `.ics` не добавляются; они остаются только в веб-интерфейсе в секциях TBD и year-only.

## Подготовка локальной разработки

Зависимости не коммитятся в git. Для локальной разработки без Docker установите их скриптом:

```bash
bash scripts/install.sh
# или
npm run install:local
```

Скрипт:

1. Устанавливает зависимости из `package.json` и `package-lock.json` через `npm ci`.
2. Создаёт `.env.local` из `.env.example`, если `.env.local` ещё нет.
3. Создаёт локальную директорию `data/` для SQLite.

После этого можно запускать dev-сервер, проверки или локальный production-режим:

```bash
npm run dev:local
npm run check
npm run start:local
```

Docker-сборка устанавливает зависимости самостоятельно внутри `Dockerfile` через `npm ci`, поэтому локальные `node_modules` для сборки контейнера не нужны.

## Скрипты

### `scripts/install.sh`

Устанавливает зависимости для локальной разработки и создаёт базовые локальные файлы/папки.

```bash
bash scripts/install.sh
# или
npm run install:local
```

### `scripts/dev.sh`

Запускает локальный dev-сервер Next.js.

```bash
bash scripts/dev.sh
# или
npm run dev:local
```

По умолчанию:

```bash
HOSTNAME=0.0.0.0
PORT=3000
```

Пример:

```bash
HOSTNAME=127.0.0.1 PORT=3001 bash scripts/dev.sh
```

### `scripts/check.sh`

Запускает базовые проверки проекта:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Команда:

```bash
bash scripts/check.sh
# или
npm run check
```

### `scripts/start.sh`

Запускает локальную production-версию через standalone Next.js server.

Скрипт:

1. Выполняет `npm run build` при каждом запуске, чтобы локальная production-проверка не использовала устаревший standalone-артефакт.
2. Удаляет старые копии `public/` и `.next/static/` внутри standalone-артефакта и копирует свежие production static assets.
3. Запускает `node .next/standalone/server.js`.

Команда:

```bash
bash scripts/start.sh
# или
npm run start:local
```

По умолчанию:

```bash
HOSTNAME=0.0.0.0
PORT=3000
DB_SQLITE_PATH=$PWD/data/steam-calendar.sqlite
```

Пример:

```bash
PORT=3001 bash scripts/start.sh
```

### `scripts/docker-build.sh`

Собирает Docker-образ релизной версии приложения.

```bash
bash scripts/docker-build.sh
# или
npm run docker:build
```

По умолчанию создаёт image:

```bash
steam-calendar:latest
```

Пример с другим именем:

```bash
IMAGE=ghcr.io/yourname/steam-calendar:latest bash scripts/docker-build.sh
```

### `scripts/docker-run.sh`

Запускает собранный Docker-контейнер с сохранением SQLite-данных в volume.

`SESSION_PASSWORD` теперь опционален. Если его не указать, `ENTRYPOINT` контейнера сгенерирует session secret и derived encryption key на старте и сохранит session secret в SQLite внутри смонтированного volume `/app/data`. Логи контейнера и `server.js` пишутся в stdout. Приложение по умолчанию пишет debug-сообщения в stdout контейнера через `APP_DEBUG=1`.

Простейший запуск:

```bash
bash scripts/docker-run.sh
# или
npm run docker:run
```

Если хочется задать секрет явно:

```bash
SESSION_PASSWORD="replace-with-long-random-string" bash scripts/docker-run.sh
# или
SESSION_PASSWORD="replace-with-long-random-string" npm run docker:run
```

По умолчанию:

```bash
IMAGE=steam-calendar:latest
PORT=3000
VOLUME=steam-calendar-data
AUTH_BASE_URL=http://localhost:3000
DB_SQLITE_PATH=/app/data/steam-calendar.sqlite
```

Пример:

```bash
IMAGE=steam-calendar:latest \
PORT=8080 \
VOLUME=steam-calendar-data \
SESSION_PASSWORD="replace-with-long-random-string" \
AUTH_BASE_URL="http://localhost:8080" \
RAWG_API_KEY="optional" \
bash scripts/docker-run.sh
```

`docker-run.sh` не сохраняет секреты в файл и не прокидывает их автоматически из `.env.local`. Явные переменные, которые вы передаёте, нужно указывать при запуске.

### Docker Compose

В репозитории есть `docker-compose.yml` для релизного standalone-сервера. Он использует `build: .` и монтирует локальную папку `./data` в контейнер как `/app/data`, чтобы SQLite-файл был виден на хосте.

Запуск с локальным портом `5000` (host port задаётся `PORT`, внутри контейнера приложение слушает `3000`):

```bash
docker compose up --build
# или
npm run docker:compose
```

Остановка:

```bash
docker compose down
# или
npm run docker:compose:down
```

Просмотр логов:

```bash
docker compose logs -f app
# или
npm run docker:compose:logs
```

После layout/CSS изменений используйте `docker compose up --build` или `npm run docker:compose`, затем сделайте hard refresh в браузере (`Ctrl+Shift+R` / `Cmd+Shift+R`), чтобы не оставить старый кэшированный CSS.

Общий масштаб интерфейса задаётся переменной `--ui-scale` в `app/globals.css`; по умолчанию `1.25`. Календарь и список релизов при этом не растягиваются на всю ширину окна, а ограничены масштабируемыми лимитами.

Карточки без точной даты релиза (TBD и year-only) масштабируются отдельно через `--tbd-column-width`, `--compact-card-height`, `--compact-image-height` и общий множитель `--compact-grid-scale` (по умолчанию `0.8`) в `app/globals.css`.

Пример с другим портом и необязательными переменными:

```bash
PORT=8080 \
AUTH_BASE_URL="http://localhost:8080" \
SESSION_PASSWORD="replace-with-long-random-string" \
DB_ENCRYPTION_KEY="optional-32-byte-hex" \
RAWG_API_KEY="optional" \
STEAM_API_KEY="optional" \
docker compose up --build --detach
```

Если переменные не заданы, compose прокидывает пустые значения для optional-переменных, а приложение обрабатывает их как отсутствие настройки. `SESSION_PASSWORD` при пустом/отсутствующем значении не нужен: секрет сгенерируется и сохранится в `/app/data/steam-calendar.sqlite`.

Compose использует bind mount `./data:/app/data`. Контейнер запускается под контейнерным пользователем `node` из `Dockerfile`; отдельный root `entrypoint` в compose больше не нужен. Ключи подготавливает `ENTRYPOINT` из образа: `docker/entrypoint.mjs` открывает `DB_SQLITE_PATH`, создаёт SQLite-схему, сохраняет `app_settings.session_secret` и передаёт `server.js` производный `DB_ENCRYPTION_KEY`, если он не задан явно. Для Linux bind mount каталог `./data` должен быть доступен на запись контейнерному пользователю `node`, обычно uid/gid `1000`; если это не так, подготовьте права на хосте заранее или используйте named volume.

Логи приложения пишутся в stdout контейнера: entrypoint сам пишет служебные сообщения в stdout, а stdout/stderr процесса `server.js` перенаправляются в stdout контейнера.

Пример подготовки bind-mounted каталога на Linux:

```bash
mkdir -p data
chown 1000:1000 data
chmod 0755 data
```

## Сборка релизного Docker-контейнера

### Вариант 1: через скрипт

```bash
npm run docker:build
```

или напрямую:

```bash
bash scripts/docker-build.sh
```

или через Docker без обёртки:

```bash
docker build --tag steam-calendar:latest .
```

После сборки запустить контейнер:

```bash
npm run docker:run
```

или с явным секретом:

```bash
SESSION_PASSWORD="replace-with-long-random-string" \
AUTH_BASE_URL="http://localhost:3000" \
npm run docker:run
```

### Вариант 2: без скрипта

Собрать image:

```bash
docker build --tag steam-calendar:latest .
```

Запустить:

```bash
docker run --rm \
  --publish 3000:3000 \
  --env AUTH_BASE_URL="http://localhost:3000" \
  --env DB_SQLITE_PATH=/app/data/steam-calendar.sqlite \
  --volume steam-calendar-data:/app/data \
  steam-calendar:latest
```

### Вариант 3: GitHub Actions и GitHub Container Registry

В репозитории есть workflow `.github/workflows/docker.yml`. Он запускается на push в `main`/`master`, на push тега `v*`, на `workflow_dispatch` и на pull request в `main`/`master`.

Workflow:

```bash
npm ci
npm run check
docker build
```

Для push-событий workflow логинится в GitHub Container Registry через встроенный `GITHUB_TOKEN` и публикует image:

```bash
ghcr.io/<lowercase-owner>/steam-calendar
```

Публикуются tags:
- `latest` только для default branch;
- branch tags для `main`/`master`;
- semver tags для релизных тегов вида `v1.2.3`, например `1.2.3`, `1.2`, `1`;
- `sha-<short-sha>` для конкретного commit.

На pull request image собирается только для проверки Dockerfile и сборки, но никуда не публикуется.

Забрать опубликованный image и запустить его можно так:

```bash
docker pull ghcr.io/your-owner/steam-calendar:latest

docker run --rm \
  --publish 5000:3000 \
  --env AUTH_BASE_URL="http://localhost:5000" \
  --env DB_SQLITE_PATH=/app/data/steam-calendar.sqlite \
  --volume steam-calendar-data:/app/data \
  ghcr.io/your-owner/steam-calendar:latest
```

Для приватного GitHub-репозитория или приватного пакета в `ghcr.io` перед `docker pull` нужен логин в registry. В GitHub Actions достаточно встроенного `GITHUB_TOKEN` с permission `packages: write`. Для ручного pull на своей машине используйте personal access token с правами `read:packages`:

```bash
echo "$GITHUB_PERSONAL_ACCESS_TOKEN" | docker login ghcr.io -U your-github-username --password-stdin
docker pull ghcr.io/your-owner/steam-calendar:latest
```

Ссылка на страницу пакета после первой публикации обычно выглядит так:

```bash
https://github.com/<owner>/steam-calendar/pkgs/container/steam-calendar
```

Если репозиторий приватный, GitHub по умолчанию создаёт приватный пакет в `ghcr.io`. Ссылка на image не будет общедоступной, пока visibility пакета не будет изменена вручную в настройках пакета или пока pull не выполняется авторизованным пользователем с доступом к пакету.

## Логи

Все debug-сообщения приложения пишутся в stdout контейнера. В Docker-образе и Compose по умолчанию включён `APP_DEBUG=1`, поэтому серверные route handlers, server actions, Next.js pages, Steam/RAWG/wishlist/upcoming helpers, SQLite и auth/session ошибки логируются в stdout контейнера через `lib/debug.ts`.

Debug-логи автоматически скрывают типичные секреты и чувствительные параметры: Steam/RAWG API keys, `SESSION_PASSWORD`, `DB_ENCRYPTION_KEY`, cipher-значения, cookies, authorization headers и URL с query secrets. В production-проверках `NODE_ENV=test` debug по умолчанию выключен, если `APP_DEBUG` явно не задан.

Для локального запуска debug можно выключить явно:

```bash
APP_DEBUG=0 npm run start:local
APP_DEBUG=false npm run dev:local
```

Для контейнера с Compose:

```bash
APP_DEBUG=0 docker compose --profile web up --build
APP_DEBUG=false docker compose --profile web up --build
```

## Переменные окружения для Docker

### `SESSION_PASSWORD`

Теперь опционален для Docker-запуска.

Если `SESSION_PASSWORD` не задан, приложение сгенерирует случайный session secret при первом входе и сохранит его в SQLite как `app_settings.session_secret`. Он нужен для подписи legacy session cookies и для вывода encryption key для зашифрованных настроек пользователя.

Чтобы секрет выживал при перезапуске контейнера, нужно сохранять SQLite-файл, то есть монтировать `/app/data` как named volume или host path. Если volume потерян или удалён, приложение сгенерирует новый секрет, а старые session cookies и зашифрованные сохранённые API-ключи станут неработоспособны.

Явный `SESSION_PASSWORD` полезен, если вы хотите один и тот же секрет между несколькими экземплярами приложения или управлять секретом через orchestrator/secret manager.

### `AUTH_BASE_URL`

Базовый URL приложения вида `scheme://host[:port]`, например:

```bash
AUTH_BASE_URL="http://localhost:3000"
AUTH_BASE_URL="https://calendar.example.com"
```

Нужен для Steam OpenID `return_to` / `realm`. Без него приложение пытается определить origin из request headers, поэтому за публичным доменом или reverse proxy лучше указать явно. В `docker-compose.yml` значение по умолчанию — `http://localhost:5000`, оно совпадает с host port `PORT` по умолчанию.

### `COOKIE_SECURE`

Опционально. Управление флагом `Secure` для session cookie.

Если `AUTH_BASE_URL` начинается с `http://` (например `http://192.168.189.126:5000`), приложение теперь автоматически ставит session cookie без `Secure`, чтобы браузер не отбрасывал cookie на HTTP и не возникал loop после Steam-логина. Если приложение доступно через HTTPS, cookie ставится с `Secure`.

Явный override:

```bash
COOKIE_SECURE=0 docker compose --profile web up --build
COOKIE_SECURE=false docker compose --profile web up --build
```

```bash
COOKIE_SECURE=1 docker compose --profile web up --build
COOKIE_SECURE=true docker compose --profile web up --build
```

Если reverse proxy терминирует TLS, но контейнер получает HTTP, можно указать `COOKIE_SECURE=1` и/или передавать корректный `X-Forwarded-Proto: https`.

### `DB_SQLITE_PATH`

Путь к SQLite-базе приложения. В Docker по умолчанию:

```bash
DB_SQLITE_PATH=/app/data/steam-calendar.sqlite
```

Эта база хранит cache, users, sessions, user settings, calendar feeds и app secrets. Поэтому `/app/data` монтируется как Docker volume.

### `VOLUME`

Переменная для `scripts/docker-run.sh`. Имя Docker volume для `/app/data`.

```bash
VOLUME=steam-calendar-data
```

Можно использовать absolute host path вместо named volume:

```bash
docker run --rm \
  --publish 3000:3000 \
  --env DB_SQLITE_PATH=/app/data/steam-calendar.sqlite \
  --volume /absolute/path/steam-calendar-data:/app/data \
  steam-calendar:latest
```

### `IMAGE`

Переменная для `scripts/docker-build.sh` и `scripts/docker-run.sh`. Имя и тег image.

Workflow `.github/workflows/docker.yml` публикует image в GitHub Container Registry как `ghcr.io/<lowercase-owner>/steam-calendar`; локальные скрипты по умолчанию используют `steam-calendar:latest`.

```bash
IMAGE=steam-calendar:latest
IMAGE=ghcr.io/yourname/steam-calendar:latest
```

### `PORT`

Переменная для `scripts/dev.sh`, `scripts/start.sh`, `scripts/docker-run.sh` и `docker-compose.yml`.

В Docker это host port. Container внутри себя слушает `3000`. В `docker-compose.yml` host port по умолчанию `5000` (`"${PORT:-5000}:3000"`).

```bash
PORT=8080 bash scripts/docker-run.sh
```

### `DB_ENCRYPTION_KEY`

Опционально. 64-hex AES-256-GCM key для шифрования сохранённых API-ключей в SQLite.

Если не задан, приложение выводит key из `SESSION_PASSWORD` или session secret.

### `RAWG_API_KEY`

Опционально. RAWG.io API key для резервных дат релизов, которых нет в Steam.

### `STEAM_API_KEY`

Опционально. Глобальный Steam Web API key. Обычно ключ лучше вводить пользователю в `/settings`, чтобы приложение хранило его как user setting, а не в env.

### `APP_DEBUG`

Опционально. В Docker image и Compose по умолчанию `APP_DEBUG=1`.

Значения `0` и `false` выключают debug-логи приложения в stdout. Если `APP_DEBUG` не задан локально и `NODE_ENV` не равен `test`, debug включён.

## Что делает Docker-образ

`Dockerfile` собирает минимальный production runtime:

- устанавливает зависимости в builder-stage;
- выполняет `npm run build`;
- копирует standalone `server.js`, `.next`, `public`, `node_modules` и `package.json`;
- использует `node:24-alpine`;
- запускает приложение как user `node`;
- слушает порт `3000` внутри контейнера.

Docker runtime по умолчанию использует:

```bash
HOSTNAME=0.0.0.0
PORT=3000
NODE_ENV=production
APP_DEBUG=1
DB_SQLITE_PATH=/app/data/steam-calendar.sqlite
```

## Кратко для релиза

```bash
npm run check
npm run docker:build
npm run docker:run
```

Сгенерированный session secret переживёт перезапуск контейнера, пока сохранён volume с `/app/data`.
