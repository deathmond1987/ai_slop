# Полный обзор кода проекта

Обзор создан по файлам исходного проекта. В обзор включены root-файлы, скрипты, Docker/CI, API routes, server actions, app pages/components, `lib` modules и tests. Каталог `.tmp-validation` описан отдельно в конце как временные артефакты проверки.

## Root-файлы и конфигурация

### `AGENTS.md`
Файл с предупреждением от Next.js о том, что в проекте используется нестандартная/новая версия Next.js, APIs и conventions могут отличаться от обычных обучающих данных, и агенту нужно читать `node_modules/next/dist/docs/` перед правками кода.

### `Dockerfile`
Многоэтапный production Docker build:
- `deps`: устанавливает зависимости через `npm ci` на `node:24-alpine`.
- `builder`: копирует исходники и зависимости, создаёт `public` и `data`, выполняет `npm run build`.
- `runner`: копирует standalone `server.js`, `.next/static`, `public`, `docker/entrypoint.mjs`, запускает приложение от пользователя `node` на порту `3000`.
- Задаёт runtime env: `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`, `DB_SQLITE_PATH=/app/data/steam-calendar.sqlite`, `APP_DEBUG=1`.

### `README.md`
Основная документация проекта: локальная установка, dev/start/check, Docker build/run/compose, desktop-сборки Linux/Windows и пути артефактов в `./out`, GitHub Actions/GHCR, переменные окружения, описание debug-логов, SQLite volume, session secret, Steam OpenID, RAWG/Steam keys, UI scale и календарных секций.

### `PLAN.md`
План/статус текущих рабочих этапов проекта: dark theme, Docker-скрипты для desktop-сборок, Linux `.deb`/AppImage/`.rpm`/Arch packaging, готовые артефакты в `./out`, Windows NSIS installer, собираемый из Linux через Docker и cross-compilation.

### `package.json`
Манифест npm-пакета:
- Name: `steam-calendar`, private; версия приложения разрешается через `scripts/version.mjs`, а `package.json` служит fallback-источником версии.
- `"type": "module"` для Node ESM, чтобы убрать `MODULE_TYPELESS_PACKAGE_JSON` warnings при Node tests.
- Зависимости: `next`, `react`, `react-dom`, `cheerio`, `iron-session`, `server-only`.
- Dev-зависимости: TypeScript, Tailwind/Turbopack, ESLint, Playwright, типы Node/React.
- Основные скрипты: `dev`, `build`, `start`, `lint`, `typegen`, `test`, `check`, локальные dev/install/start, Docker scripts, desktop Linux/Windows packaging scripts, простые `build:all`, `build:linux`, `build:windows`, `verify:calendar-session`, `measure:sqlite-latency`.
- `overrides` фиксирует проблемные версии транзитивных зависимостей для `typescript-eslint` и `cheerio`.



### `eslint.config.mjs`
ESLint flat config:
- использует `eslint-config-next/core-web-vitals` и `eslint-config-next/typescript`;
- переопределяет default ignores через `globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"])`.

### `next-env.d.ts`
Автогенерируемый Next.js типы bridge: reference directives к Next types и импорты `import("next").Params` / `import("next").RootParams`.

### `next.config.ts`
Next.js config:
- `output: "standalone"` для минимального Docker runtime;
- `allowedDevOrigins: ["192.168.189.126"]` для локальной разработки в LAN;
- `httpAgentOptions: { keepAlive: false }` — отключает keep-alive для внутренних HTTP agent запросов;
- Tailwind CSS rule для Turbopack через `@tailwindcss/turbopack`;
- image sizes/quality `[75]`;
- `remotePatterns` разрешает Steam CDN/avatars hosts.

### `tsconfig.json`
TypeScript config:
- strict mode, `noEmit`, ESM/bundler resolution, `allowImportingTsExtensions`;
- Next.js plugin, Tailwind/Next generated types includes;
- path alias `@/* -> ./*`.

### `types/node-sqlite.d.ts`
Локальные TypeScript declarations для built-in `node:sqlite`, потому что используемые версии TypeScript/Node types могут не иметь полноценных встроенных объявлений `DatabaseSync`/`StatementSync`.

## Docker и entrypoint

### `docker/entrypoint.mjs`
Entrypoint production контейнера:
- открывает SQLite `DB_SQLITE_PATH` с WAL, busy timeout, foreign keys, cache settings;
- создаёт схемы `app_settings`, `cache_entries`, `users`, `user_settings`, `sessions`, `calendar_feeds`;
- миграционно добавляет отсутствующую колонку `user_settings.store_cc`;
- при отсутствии `SESSION_PASSWORD` читает legacy `.session-secret.local` или генерирует 32-byte random secret, сохраняет его в `app_settings.session_secret`;
- если `DB_ENCRYPTION_KEY` не задан, выводит key из session secret через `scryptSync` и salt `steam-calendar:settings:v1`;
- запускает standalone Next `server.js` дочерним процессом и перенаправляет stdout/stderr child-процесса в stdout контейнера;
- корректно обрабатывает SIGINT/SIGTERM и коды выхода 130/143.

### `docker-compose.yml`
Compose service `app`:
- build из `.` и image `steam-calendar:latest`;
- host port `${PORT:-5000}` -> container `3000`;
- прокидывает env `AUTH_BASE_URL`, `APP_DEBUG`, `COOKIE_SECURE`, `DB_SQLITE_PATH`, `SESSION_PASSWORD`, `DB_ENCRYPTION_KEY`, `RAWG_API_KEY`, `STEAM_API_KEY`;
- монтирует named volume `app_data:/app/data`;
- healthcheck делает fetch `http://localhost:3000/api/health`.

## Scripts

### `scripts/check.sh`
Локальная/CI проверка подряд:
`npm test`, `npm run typegen`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### `scripts/dev.sh`
Запускает `next dev` с env defaults `HOSTNAME=0.0.0.0` и `PORT=3000`.

### `scripts/docker-build.sh`
Выполняет `docker build --tag "$IMAGE" .`, по умолчанию image `steam-calendar:latest`.

### `scripts/docker-run.sh`
Запускает собранный Docker image:
-Defaults `IMAGE=steam-calendar:latest`, `PORT=3000`, `VOLUME=steam-calendar-data`;
- монтирует volume в `/app/data`;
- передаёт `AUTH_BASE_URL`, `DB_SQLITE_PATH`, опционально `SESSION_PASSWORD`, `DB_ENCRYPTION_KEY`, `RAWG_API_KEY`, `STEAM_API_KEY`;
- если `SESSION_PASSWORD` пуст, предупреждает, что entrypoint сгенерирует/сохранит session secret в SQLite volume.

### `scripts/install.sh`
Локальная подготовка проекта:
- `npm ci`, если есть `package-lock.json`, иначе `npm install`;
- копирует `.env.example` в `.env.local` с chmod `600`, если `.env.local` нет;
- создаёт директорию `data/`.

### `scripts/keyless_wishlist.py`
Вспомогательный Python-скрипт для экспериментов/проверки keyless Steam wishlist и enrichment flow; детали описаны в `docs/KEYLESS_WISHLIST.md`.

### `scripts/measure-sqlite-latency.ts`
Скрипт бенчмарка задержек SQLite `cache_entries` / cache access; запускается через `npm run measure:sqlite-latency`.

### `scripts/public_wishlist_api.py`
Эталонный Python-скрипт из `docs/KEYLESS_WISHLIST.md`: получает public Steam wishlist через `IWishlistService/GetWishlistItemCount` и `GetWishlist`, затем обогащает appdetails через public Store API.

### `scripts/start.sh`
Запускает локальный production standalone:
- выполняет `npm run build`;
- обновляет копии `public/` и `.next/static` внутри `.next/standalone`;
- запускает `node .next/standalone/server.js`;
- defaults `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`, `DB_SQLITE_PATH=$PWD/data/steam-calendar.sqlite`.

### `scripts/version.mjs`
Единый version resolver:
- `get` печатает разрешенную версию без `v` prefix;
- `sync` записывает версию в `package.json`, `package-lock.json`, desktop Cargo config и Tauri configs;
- версия разрешается из `STEAM_CALENDAR_VERSION`, `APP_VERSION`, `VERSION_INPUT`, `VERSION`, GitHub Actions tag env, exact git tag at `HEAD` и fallback `package.json`.

### `scripts/verify-calendar-session.ts`
Diagnostic/verification script для проверки upcoming/calendar candidates и Steam appdetails flow с сессией/steam id; запускается через `npm run verify:calendar-session`.

### Desktop scripts

- `build-desktop-binary.sh`: repository-root desktop build entry point for `linux`, `windows` and all supported desktop platforms; writes artifacts into `out/linux` and `out/windows`.
- `scripts/desktop/build-desktop-base.sh`: builds the shared desktop builder base image from `desktop/Dockerfile.base`.
- `scripts/desktop/build-linux-docker.sh`: builds the Linux desktop packaging image from `desktop/Dockerfile.linux`.
- `scripts/desktop/export-linux-packages.sh`: exports Linux `.deb`, `.rpm`, AppImage and Arch `.pkg.tar.zst` artifacts into `out/linux`; `EXPORT_KIND=all` runs the full Linux packaging flow in one task.
- `scripts/desktop/build-arch-package.sh`: converts the exported `.deb` into an Arch package and optionally verifies it.
- `scripts/desktop/build-windows-docker.sh`: builds the Windows cross-build image from `desktop/Dockerfile.windows` using `cargo-xwin` and NSIS.
- `scripts/desktop/export-windows-packages.sh`: exports the NSIS installer into `out/windows`.

## GitHub Actions

### `.github/workflows/release.yml`
Workflow "Release desktop packages and container image from main tag":
- triggers: push tag `v*`; manual GitHub tag creation also triggers this `push: tags` event; optional `workflow_dispatch` run with required `tag` input can rebuild an existing tag;
- `preflight` job проверяет семантику тега `v...` и что коммит тега достижим из ветки `main`; для `workflow_dispatch` preflight загружает input tag из `origin` перед проверкой достижимости;
- `preflight` uses tag name as release version, marks pre-release when version contains `-`, и вычисляет `image_path` вида `<repository-owner>/steam-calendar`;
- `checks` job выполняет `npm ci` и `npm run check`;
- `docker` job собирает production container image и публикует его в GHCR через встроенный `secrets.GITHUB_TOKEN` и `github.actor`, без внешних PAT или `GHCR_TOKEN`;
- GitHub может автоматически связать GHCR-пакет с репозиторием и показать его в Packages главной страницы репозитория;
- `docker` job использует `linux/amd64`, `linux/arm64`, GHA cache и добавляет `latest` только для non-pre-release версий;
- `desktop` job использует matrix `linux`/`windows`, вызывает корневой `bash build-desktop-binary.sh <platform>` и загружает artifacts из `out/linux` или `out/windows`; desktop builder images собираются локально внутри этих задач и не публикуются в registry;
- Linux desktop task собирает все Linux-пакеты одной задачей в `desktop-linux-packages`: `.deb` для Debian/Ubuntu, `.rpm` для RHEL/Fedora, universal AppImage и Arch Linux `.pkg.tar.zst` из `out/linux`;
- Windows desktop task собирает `desktop-windows-packages` для Windows NSIS setup `.exe` из `out/windows`;
- `release` job скачивает desktop artifacts, создает или обновляет GitHub release, загружает desktop-пакеты как release assets и пишет GHCR image tags в release notes;
- workflow permissions содержит `contents: write` и `packages: write`; GitHub Packages publishing выполняется через встроенный `GITHUB_TOKEN`;
- summary job пишет release URL и image path.

## Docs

### `docs/BUILD_WARNINGS_WORKLIST.md`
Рабочий лист по build/test warnings:
- baseline `npm run check`, build, lint, tests;
- причина Node warnings `[MODULE_TYPELESS_PACKAGE_JSON]` из-за отсутствия `"type": "module"`;
- применён минимальный fix в `package.json`;
- зафиксировано, что тесты и build проходят после fix;
- далее есть большая секция dependency warnings baseline.

### `docs/KEYLESS_WISHLIST.md`
Документация о keyless public Steam wishlist endpoints:
- `GetWishlistItemCount` и `GetWishlist` дают полный appid-лист без API key;
- `wishlistdata/?p=0` без cookies ненадёжен и может вернуть HTML;
- metadata enrichment через `store.steampowered.com/api/appdetails`;
- описана эталонная Python-реализация в `scripts/public_wishlist_api.py`.

### `desktop/README.md`
Документация desktop-сборок: Linux packaging через Docker для `.deb`, AppImage, `.rpm` и Arch package, артефакты в `out/linux`, headless runtime check, sidecar behavior, Tauri WebView behavior для `DesktopExternalLinks`/`shell:default`, Windows cross-build через Docker/cargo-xwin и NSIS installer в `out/windows`.

## API routes

### `app/api/health/route.ts`
Простой dynamic GET health route `{"ok":true}` для Docker/Compose healthcheck.

### `app/api/wishlist-total/route.ts`
Dynamic wishlist total API:
- получает Steam session через `getSteamSession()`;
- вызывает `getWishlistTotalForSession(session, { refresh: true })`;
- возвращает JSON от `lib/wishlist-total-cache.ts` с итоговой суммой/скидками.

## Auth routes

### `app/auth/callback/route.ts`
Steam OpenID callback route:
- GET-параметры OpenID `id_res`, собирает подписанные параметры;
- проверяет ответ Steam `check_authentication` GET-запросом;
- поддерживает configurable timeout/attempts и retry только для network retryable errors, не для timeout;
- извлекает steam id, опционально подгружает Steam profile для avatar/display name;
- сохраняет session через `saveSteamSession(...)`;
- редиректит на `/calendar` с `Cache-Control: no-store`;
- ошибки редиректит на `/auth/error?reason=...`.

### `app/auth/error/page.tsx`
Страница ошибки авторизации:
- читает `searchParams.reason`;
- показывает локализованные подписи причин `bad_mode`, `openid_timeout`, `invalid_sig`, `no_steam_id`, `unknown`;
- предлагает retry login и переход к календарю.

### `app/auth/lang/route.ts`
POST lang switcher:
- получает `lang` из form data и нормализует в `ru`/`en`;
- сохраняет `LANG_COOKIE` на год;
- если есть Steam session, сохраняет язык через `saveUserLang(...)`;
- редиректит обратно на referer или корень.

### `app/auth/login/route.ts`
Steam OpenID login redirect:
- использует `getExternalOrigin(req)` для `return_to`/`realm`;
- строит OpenID `checkid_setup` params к `https://steamcommunity.com/openid/login`;
- отвечает redirect на Steam с `Cache-Control: no-store`.

### `app/auth/logout/route.ts`
POST logout:
- вызывает `destroySteamSession()`;
- редиректит на корень с внешним origin.

## Calendar API/feed routes

### `app/calendar/ics/route.ts`
Private ICS calendar export:
- поддерживает `?token=...` calendar feed token и обычную session cookie;
- валидирует feed token через `getSteamIdFromCalendarFeedToken` и восстанавливает `IdentifiedSession` из stored user data;
- без token и без session редиректит в `/auth/login`;
- собирает `collectUpcoming(...)` и строит ICS через `buildIcsCalendar(...)`;
- отдаёт `text/calendar` с `no-store` и `Content-Disposition: attachment; filename=steam-calendar.ics`.

## Server actions

### `app/actions/calendar-feed.ts`
Server actions для приватного calendar feed:
- `createCalendarFeedLink(formData)`: требует session, создаёт feed token и редиректит обратно на `/calendar` с `feed=created`; при успешном создании токена добавляет `openGoogle=1`, чтобы `/calendar` показал локальную панель с явной ссылкой на Google Calendar и кнопкой возврата в приложение;
- `revokeCalendarFeedLink(formData)`: требует session и удаляет feed token, затем редирект на `/calendar` с `feed=revoked`.

### `app/actions/calendar-view.ts`
Server action `setCalendarView`:
- нормализует view через `parseView`;
- сохраняет view cookie `VIEW_COOKIE` на год;
- если есть session — сохраняет `calendar_view` через `saveUserCalendarView(...)`;
- редирект на `/calendar?view=...&month=...`.

### `app/actions/settings.ts`
Server action `saveSettings`:
- требует Steam session;
- читает из формы `steamApiKey`, `rawgApiKey`, `storeCc`, `remove`;
- либо удаляет одно из сохранённых значений (`remove=steam|rawg|store`), либо обновляет непустые значения;
- сохраняет через `updateSessionSettings(...)`;
- если есть новый Steam API key и пока нет avatar, пытается загрузить Steam profile и обновить session displayName/avatar.

## App pages

### `app/favicon.ico`
Binary favicon приложения. Файл не описывается как исходный код, потому что это статический ассет Next.js App Router, доступный автоматически как site icon.

### `app/globals.css`
Глобальный Tailwind/global stylesheet, импортируемый в `app/layout.tsx`.
- Импорт `tailwindcss` и `@theme inline` bridge для Tailwind v4-style theme vars.
- CSS variables для background/foreground, Geist font vars, UI scale (`--ui-scale: 1.25`), ширины shell-области календаря, карточек релизов, compact grid, TBD column width, layout header/footer/main heights и bottom offsets.
- Media queries уменьшают `--ui-scale` на узких экранах и меняют размеры release cards.
- Dark mode переключает `--background`/`--foreground` через `prefers-color-scheme: dark`.
- Описывает layout-классы: `.app-shell`, `.calendar-grid-shell`, `.calendar-grid-min`, `.calendar-grid-rows`, `.release-date-list`, `.release-date-scroll`, `.release-scroll-indicator`, `.calendar-feed-with-tbd`, `.calendar-day-cell`, `.calendar-game-card`, `.compact-grid`, `.compact-game-card`, `.release-month-cards`, `.release-game-card`, `.wishlist-modal-cards`.
- contains large `@media (min-width: 1024px)` block for `html.calendar-fit-viewport`, который включает "fit viewport" layout для `/calendar`, чтобы календарь, year-only, TBD и scrollable release list занимали оставшуюся высоту viewport без page scroll.

### `app/layout.tsx`
Root layout App Router.
- Импортирует `globals.css`, настраивает `Geist`/`Geist_Mono` CSS variables.
- `generateMetadata()` читает session/lang и возвращает локализованные `title`/`description` через `getT(session?.steamId)`.
- `RootLayout` получает Steam session, lang, signed-in state, wishlist total для header без refresh (`refresh: false`), theme preference и передаёт их в `Header`.
- Для signed-in user в header передаётся полный `wishlistTotal` с `items`/`discounts`, чтобы header counter мог открывать wishlist modal без дополнительного initial fetch.
- Оборачивает приложение в `<html lang={lang}>`, body shell с dark/light colors, `ViewportMetrics`, `DesktopExternalLinks`, `Header`, `<main class="app-shell">` и footer.

### `app/page.tsx`
Home page `/`.
- Параллельно получает translations и Steam session.
- Логирует debug-событие `home.page.render` с `hasSession`.
- Если session существует, редиректит на `/calendar`.
- Иначе показывает локализированный login CTA на `/auth/login`.

### `app/calendar/page.tsx`
Main calendar page `/calendar`, `dynamic = "force-dynamic"`.
- Требует Steam session через `requireSteamSession()`; при отсутствии редиректит `/auth/login`.
- Парсит `searchParams.month` в `{ year, month1 }`, default — текущий UTC месяц.
- Параллельно получает lang, translations и saved calendar view из cookie/user settings.
- View выбирается как `parseView(searchParams.view) ?? cookieView`.
- Читает request headers и external origin для calendar feed URL.
- Получает `calendarFeet token` через `getCalendarFeedToken(session.steamId)`.
- Если feed token уже есть, показывает subscribe link к Google Calendar import URL (`?cid=feed:...`) или fallback `.ics`; внешние Google links помечаются `data-external="true"` для desktop interceptor; также показывает `details` management panel с readonly feed URL, `.ics` link и revoke form.
- Если feed token нет, показывает form, вызывающий `createCalendarFeedLink`, чтобы создать token и вернуться на локальную calendar страницу с `openGoogle=1`.
- Показывает локальную Google-open панель при `openGoogle=1` и известном feed URL: кнопка возврата на `calendarBackPath` и явная external link `data-external="true"`.
- Показывает flash сообщения `?feed=created` и `?feed=revoked`.
- Всегда показывает `CalendarExportButton` для `/calendar/ics` и `CalendarViewToggle`.
- Оборачивает `CalendarFeed` в `<Suspense fallback={<CalendarFeedSkeleton view={view} />}>`, чтобы тяжелая сборка upcoming games не блокировала rendering shell-страницы.

### `app/calendar/loading.tsx`
Next.js loading boundary для `/calendar`.
- Используется при route-level loading/Suspense transitions.
- Рендерит `CalendarPageSkeleton view="grid"` как placeholder верхней панели календаря и feed skeleton.

### `app/settings/page.tsx`
Settings page `/settings`.
- Требует Steam session; при отсутствии редиректит `/auth/login`.
- Читает `searchParams.saved`, показывает green flash если settings сохранены.
- Рендерит отдельную theme form `action="/theme" method="post"` с radio options `light`, `dark`, `system` и save button.
- Рендерит отдельные независимые forms с server action `saveSettings` для Steam API key, RAWG API key и store country code.
- Показывает status badges для Steam API key, RAWG API key и store country code (`saved`/`notSet`).
- Steam API key и RAWG key inputs всегда пустые (`defaultValue=""`) и type password.
- Store country code input limited to 2 letters и показывает formatted value через `formatSteamStoreCc`.
- Для каждого saved значения показывает отдельный remove form с submit button `name="remove"`, `value="steam"|"rawg"|"store"` для удаления из сохранённых settings.

### `app/theme/route.ts`
Route handler for POST `/theme`.
- Reads `theme` from form data and normalizes it through `parseThemePreference(...)`.
- Saves explicit `light`/`dark` preference in the `ui_theme` cookie; deletes the cookie for `system`.
- Redirects back to the referer origin when safe, otherwise to the external origin root.

## Components

### `components/Header.tsx`
Server component header, рендерится из `app/layout.tsx`.
- Локализует title/nav/lang/auth controls через `tFor(lang)`.
- Показывает links `/calendar` и `/settings`.
- Рендерит `WishlistPriceCounter` с `key={counterKey}`, где key собран из signedIn, storeCc, ready status, total/discount/currency/counts, чтобы сбрасывать client state при смене session/settings/total.
- Показывает lang switcher form POST `/auth/lang` с кнопкой `lang=en|ru`.
- Показывает `ThemeToggleButton` с `label={t("theme.toggle")}` как одну кнопку-иконку переключения `light`/`dark`.
- Если signed in, показывает avatar/display name и logout form POST `/auth/logout`.
- Если not signed in, показывает login link `/auth/login`.

### `components/ThemeToggleButton.tsx`
Client component single theme icon button used in `Header`.
- Renders one `<form action="/theme">` with a hidden `theme` input.
- The button submits explicit `light` or `dark`; for saved `system` preference the client reads `document.documentElement.classList.contains("dark")` and stores the opposite explicit theme in the hidden input on submit.
- Uses Tailwind dark variants on sun/moon SVG icons so one button shows the correct icon for the current dark/light state.

### `components/DesktopExternalLinks.tsx`
Client component with no rendered output, mounted in `app/layout.tsx`.
- Active only inside Tauri when `window.__TAURI__?.shell?.open` exists.
- Intercepts clicks on anchors marked `data-external="true"` and opens those `http(s)` URLs through `window.__TAURI__.shell.open`.
- Does not intercept local sidecar links or ordinary browser behavior outside Tauri.

### `components/CalendarExportButton.tsx`
Client export link used for `/calendar/ics`.
- Outside Tauri it behaves as a normal `<a download>` link.
- Inside Tauri it fetches the local `/calendar/ics` response, checks `text/calendar`/`BEGIN:VCALENDAR`, then invokes `save_calendar_export` so WebView download behavior does not depend on HTML `download` support.

### `components/WishlistPriceCounter.tsx`
Client component header wishlist total counter.
- Показывает label и formatted total из `initialTotal` или fetch `/api/wishlist-total?k=...`.
- `requestKey` включает pathname и `refreshKey` (`storeCc`), чтобы обновлять counter при смене country settings.
- Merge логика сохраняет уже известное ready total, если incoming response не ready.
- Если есть items/discounts, counter рендерится как button и открывает `WishlistDiscountsModal`.
- Если items нет, показывает readonly span `label: value`.

### `components/WishlistDiscountsModal.tsx`
Client modal wishlist games/discounts.
- Рендерится через React portal в `document.body`.
- Имеет accessible dialog behavior: focus trap via `FOCUSABLE_SELECTOR`, Escape close, close on backdrop click, restore previous focus.
- Показывает total savings через `discount.savings` translation.
- Преобразует `WishlistItemEntry` items из wishlist total API во временный `UpcomingGame` shape и рендерит каждый item как `GameCard variant="row"` с `disableNestedModal`, чтобы внутренний card modal не открывался поверх wishlist modal.

### `components/CalendarFeed.tsx`
Server component with `import "server-only"`, core renderer для `/calendar` feed content.
- Вызывает `collectUpcoming(session, session.rawgApiKey ?? process.env.RAWG_API_KEY)`.
- Логирует count games/warnings/wishlistPrivate.
- Делит games на:
  - TBD: без exact `releaseDate` и без `releaseYear`;
  - year-only groups через `buildYearGroups(buildByYearMap(...))`;
  - date groups через `buildDateGroups(buildByDateMap(...))`.
- Для grid view отдельно находит games только выбранного года и рендерит `YearOnlySection`.
- Для list view собирает combined month/year groups через `buildCombinedReleaseGroups(...)` и labelит months/year blocks через `monthName`/`calendar.knownYear.title`.
- Показывает warning panel для `result.warnings` и private wishlist status, включая template `wishlistPartial` с shown/total counts.
- Для grid рендерит `CalendarGrid` с month grid, weekday names, navigation nodes `MonthSideNav` prev/next и `MonthTodayLink`.
- Для list рендерит `ScrollableReleaseList` внутри `ReleaseDateList`.
- Всегда рендерит `TBDSection` в aside column `calendar-feed-with-tbd`.

### `components/CalendarFeedSkeleton.tsx`
Suspense fallback skeleton для `CalendarFeed`.
- Использует локальный `SkeletonBlock` с pulse placeholder.
- Для `view="grid"` показывает mock month nav и grid из weekday header plus 42 skeleton day cells.
- Для `view="list"` показывает 3 mock month sections по 2 date rows по 2 card blocks.
- Всегда показывает aside TBD skeleton через `compact-grid tbd-grid`.
- `aria-hidden="true"`, потому что это декоративный loading state.

### `components/CalendarPageSkeleton.tsx`
Suspense fallback skeleton для всей calendar page.
- Показывает mock title/feed controls через `SkeletonBlock`.
- Под ним рендерит `CalendarFeedSkeleton view={view}`.
- Используется `app/calendar/loading.tsx` и частично как визуальная модель page loading state.

### `components/CalendarViewToggle.tsx`
Server component toggle grid/list.
- Рендерит form с server action `setCalendarView`.
- Передаёт hidden `month` value и submit button `name="view"` value `grid` или `list`.
- Active/inactive styling через локальные class strings.

### `components/MonthNav.tsx`
Server components month navigation для grid calendar.
- `MonthSideNav` рендерит prev/next link через `shiftMonth(year, month1, -1|1)` и `buildQuery({ ...query, month, view: "grid" })`.
- `MonthTodayLink` показывает link на текущий UTC month, если current displayed month не today; иначе `null`.

### `components/CalendarGrid.tsx`
Server component month grid renderer.
- Превращает плоский `CalendarDay[]` в weeks rows по 7.
- Использует `computeCalendarColumnWeights`, `computeCalendarCellLayouts`, `computeCalendarRowWeights` из `lib/calendar-layout.ts` для вычисления column/row grid weights и layout counts.
- Рендерит CSS grid:
  - weekday header row;
  - week rows с `calendar-week-row-cards`/`calendar-week-row-empty`;
  - day cells с today ring и opacity для out-of-month days.
- Внутри day cell рендерит `visibleGames` как `GameCard` и hidden games через `<details class="calendar-day-hidden">` как compact cards.
- Accepts `year`/`month1` props но currently не uses их напрямую внутри component, navigation labels передаются externally через `monthLabel`/nav nodes.

### `components/ReleaseDateList.tsx`
Server component list renderer для combined month/year groups.
- Тип `ReleaseMonthGroup` содержит `key`, `label`, `dates`, optional `yearOnlyGames`.
- Если groups пустые, показывает localized empty box `calendar.empty`.
- Иначе рендерит section per group с `release-month-cards`.
- Внутри flattens `dates[].games` plus `yearOnlyGames` into row cards and renders `GameCard variant="row"`.

### `components/ScrollableReleaseList.tsx`
Client component wrapper for scrollable release list.
- Tracks whether scrollable content can still scroll down.
- Updates on scroll, ResizeObserver, MutationObserver and timeout retries `100`, `400`, `900` ms.
- Shows floating `release-scroll-indicator` down arrow only if there is hidden content below current scroll position.

### `components/TBDSection.tsx`
Server component for games without known release date/year.
- Empty state uses localized `calendar.tbd.empty`.
- Calculates `rows = Math.ceil(games.length / 2)` for 2-column TBD compact grid.
- Wraps cards in `FitBlock` with class `compact-grid tbd-grid fit`.
- Renders compact `GameCard` variant.

### `components/YearOnlySection.tsx`
Server component for selected-year known-year-only games in grid view.
- Empty if no games.
- Calculates `rows = Math.ceil(games.length / 4)` for 4-column compact grid.
- Sets inline CSS variable `--calendar-year-block-min` based on rows and card/title min heights.
- Wraps cards in `FitBlock` with `maxHeightVar="--compact-card-height"`.
- Renders compact `GameCard` variant inside `compact-grid year-grid fit capped`.

### `components/FitBlock.tsx`
Client component that dynamically measures/sets block height to fit viewport.
- Used by TBD and year-only sections.
- `resolveCssPx()` measures CSS variables like `--fit-bottom-offset` or `--compact-card-height` by creating a hidden probe element.
- Only active when `window.innerWidth >= 1024` and `rows > 0`.
- Re-measures on mount, timeout, `ResizeObserver` over body/html/main and window resize.
- If `maxHeightVar` is set, caps height to `maxHeight * rows` and iteratively adjusts up to 4 times based on element top position and viewport bottom offset.
- Renders `div data-fit-block="true"` with measured inline `height` when available.

### `components/ViewportMetrics.tsx`
Client component with no rendered output.
- Measures header height, footer height, main bottom padding and sets CSS variables on `document.documentElement`:
  - `--layout-header-height`
  - `--layout-footer-height`
  - `--main-bottom-padding`
  - `--fit-bottom-offset`
- Toggles class `calendar-fit-viewport` on `<html>` if DOM contains `.calendar-feed-with-tbd`.
- Re-measures on load timeouts, resize, body/main resize, body mutation.
- Needed for calendar "fit viewport" CSS layout.

### `components/GameCard.tsx`
Client component game card/modal renderer.
- Variants:
  - `grid`: default calendar cell card with media area, title, price, badges;
  - `row`: release list card with left header image and info block;
  - `compact`: compact TBD/year-only card.
- `PriceText` displays discounted original price, final price and discount percent, hides price for `library` source games.
- Badges:
  - `library` source shows library badge;
  - `wishlist` source shows wishlist badge;
  - `dateSource === "rawg"` shows non-Steam date badge.
- Clicking card opens local `GameModal` via `createPortal`, except when modifier key is used or `disableNestedModal` is true.
- `GameModal` shows appid, localized date, source/date source link, wishlist/library badges, type, free badge, price with region, full game link, genres, developer, publisher, playtime and Steam open link.
- Modal closes on Escape, backdrop click, close button, and restores body overflow while open.

## Lib modules

### `lib/aggregate-cache.ts`
- Кэш агрегированных upcoming-релизов для конкретного steamId, API-ключей и даты.
- Экспортирует `UPCOMING_CACHE_PREFIX = "upcoming:v5:"`, `UPCOMING_CACHE_TTL_MS = 300_000`, `upcomingCacheTtlMs()`, `shortHash()`, `upcomingStoreCcHash()`, `upcomingCacheKey()`, `loadUpcomingWithCache<T>()`.
- TTL переопределяется через `UPCOMING_CACHE_TTL_SECONDS` или `UPCOMING_CACHE_TTL_MS`; ключ зависит от normalized `storeCc` и может дедуплицировать параллельные загрузки через `pending`.

### `lib/auth-store.ts`
- Серверное SQLite-хранилище профилей, настроек пользователя, сессий и calendar feed токенов.
- Шифрует API-ключи и профильные данные через AES-256-GCM; ключ берётся из `DB_ENCRYPTION_KEY`, session secret или legacy файла.
- Сохраняет настройки `steam_api_key`, `rawg_api_key`, `store_cc`, `calendarView`, `ui_lang`, calendar feed tokens; инвалидирует кэши upcoming/owned/profile/wishlist при изменении настроек.

### `lib/cache-store.ts`
- SQLite KV-кэш `cache_entries` с JSON-значениями и TTL.
- Экспортирует `cacheGet<T>`, `cacheSet`, `deleteCacheByPrefix`, `deleteCacheByExactOrPrefix`.
- Периодически удаляет протухшие записи; повреждённый JSON удаляется; невалидный TTL или не-сериализуемое значение молча не записывается.

### `lib/cached-dedupe.ts`
- Общий паттерн «кэш + дедупликация параллельных factory-вызовов».
- Экспортирует типы `CacheGet`, `CacheSet`, `LoadWithCacheAndDedupeOptions<T>` и функцию `loadWithCacheAndDedupe<T>`.
- Чистый модуль без `server-only`; используется как контракт для `aggregate-cache.ts`, `rawg.ts` и steam cache helpers.

### `lib/calendar.ts`
- Построение месячной сетки календаря и группировка игр по точным датам/годам.
- Экспортирует `CalendarDay`, `buildMonthGrid`, `buildByDateMap`, `buildDateGroups`, `buildByYearMap`, `buildYearGroups`, `buildCombinedReleaseGroups`, `todayISO`, `parseISO`, `shiftMonth`.
- Вся логика в UTC; неделя начинается с понедельника; сетка дополнена соседними месяцами до полных недель.

### `lib/calendar-layout.ts`
- Вычисление весов колонок/строк и видимости карточек в сетке календаря.
- Экспортирует `GRID_DAY_VISIBLE_CAP = 4`, `GRID_WEEK_ROW_WEIGHT_CAP = 2`, `CalendarCellLayout`, `computeCalendarColumnWeights`, `computeCalendarCellLayouts`, `computeCalendarRowWeights`.
- Ожидает выравнивание grid по 7 ячеек; колонка получает вес по максимуму видимых карточек в столбце.

### `lib/calendar-feed-link.ts`
- Генерация ссылок для ICS-подписки и Google Calendar import.
- Экспортирует `calendarFeedPath(token)`, `calendarFeedUrl(origin, token)`, `googleCalendarImportUrl(feedUrl)`.
- Токен и feed URL кодируются через `encodeURIComponent`; вызывающий код должен передать корректный `origin` без завершающего `/`.

### `lib/debug.ts`
- Защищённое debug-логирование в stdout с маскировкой секретов.
- Экспортирует `sanitizeDebugText`, `sanitizeDebugError`, `logDebug`.
- Активен только при `APP_DEBUG`; маскирует query-параметры и поля с ключами `key`, `api_key`, `steam_api_key`, `rawg_api_key`, `session_password`, `db_encryption_key`, cookies, authorization и подобные секреты.

### `lib/dicts.ts`
- Статические ru/en словари переводов из JSON.
- Экспортирует `DICTS: Record<Lang, Record<string,string>>` и `DEFAULT_DICT`.
- `DEFAULT_DICT` указывает на английский словарь, поэтому отсутствующий ru-ключ даёт английский текст.

### `lib/display-mode.ts`
- Определение режима отображения календаря: `grid` или `list`.
- Экспортирует `CalendarView`, `VIEW_COOKIE = "calendar_view"`, `parseView(raw)`, `getCalendarView(steamId?)`.
- Приоритет: cookie `calendar_view` → сохранённая настройка пользователя → fallback `grid`.

### `lib/i18n-core.ts`
- Doменно-независимая переводческая и форматтирующая логика ru/en.
- Экспортирует `DEFAULT_LANG = "ru"`, `LANG_COOKIE = "ui_lang"`, `tFor`, `monthName`, `weekdayNames`, `formatPlaytime`, `formatDate`, `formatDateWithYear`, `formatTemplate`, а также переэкспортирует `formatMoney`.
- Используется на сервере и в тестах; клиентский код должен брать этот core-слой, а не `i18n.ts`.

### `lib/i18n.ts`
- Серверная обёртка определения языка UI поверх `i18n-core.ts`.
- Переэкспортирует core-функции и добавляет `getLang(steamId?)`, `getT(steamId?)`.
- Приоритет языка: cookie `ui_lang` → сохранённые пользовательские предпочтения → `DEFAULT_LANG = "ru"`.

### `lib/ical.ts`
- Генерация RFC 5545 ICS-календаря для предстоящих релизов.
- Экспортирует только `buildIcsCalendar(games, generatedAt = new Date())`.
- Включает только игры с точной ISO-датой; события делаются на весь день через `DTSTART;VALUE=DATE`, строки ICS экранируются и фолдятся.

### `lib/key-hash.ts`
- Короткие хэши для cache keys и логов.
- Экспортирует `shortHash(value?)`, `keyHash(key, cached?)`.
- `shortHash` дублируется в `aggregate-cache.ts`; `keyHash` позволяет повторно использовать уже посчитанный хэш.

### `lib/money.ts`
- Форматирование денег из целых центов с учётом языка и валюты.
- Экспортирует `formatMoney(totalCents, currency, lang)`.
- В русской локали используются неразрывные пробелы и запятая как десятичный разделитель; бездробные валюты форматируются без копеек.

### `lib/pagination.ts`
- Небольшая сборка query-строки из произвольных параметров.
- Экспортирует `GRID_DAY_CAP = 1` и `buildQuery(params)`.
- Пропускает `undefined`, `null` и пустые строки; для массивов добавляет несколько значений одного ключа, для остальных перезаписывает значение.

### `lib/rawg-core.ts`
- Ключи и TTL для кэша RAWG без сетевых вызовов.
- Экспортирует `RAWG_CACHE_PREFIX`, `RAWG_POSITIVE_TTL_MS = 24 * 60 * 60 * 1000`, `RAWG_NEGATIVE_TTL_MS = 15 * 60 * 1000`, `RAWG_FETCH_TIMEOUT_MS = 8000`, `rawgCacheKey`, `rawgCacheTtl`.
- Кэш изолирован по API-ключу через `keyHash(key, cachedKeyHash)`.

### `lib/rawg.ts`
- Серверный поиск игр в RAWG API с кэшем и дедупликацией.
- Экспортирует `searchRawg(name, key, cachedKeyHash?)`, `rawgGameUrl(slug)`.
- Ошибки и HTTP-неуспехи возвращают `null` и кэшируются как негативный ответ на 15 минут; дата берётся только если совпадает формат `YYYY-MM-DD`.

### `lib/release-dates.ts`
- Разбор и нормализация Steam-дат в ISO, плюс правила фильтрации прошедших релизов.
- Экспортирует `parseSteamDateInfo`, `parseSteamDateText`, `hasKnownSteamDate`, `applySteamDateInfo`, `applyKnownWishlistDate`, `applyKnownWishlistDatesAfterDetails`, `shouldRemoveKnownReleasedSteamGame`, `shouldRemovePastYearOnlySteamGame`, `shouldRemoveUnknownLibraryOnly`.
- Поддерживает ISO, `YYYY-MM`, год, текстовые англоязычные/русские даты и отсев несуществующих дат; плейсхолдер `YYYY-12-31` понижается до `steamYear`.

### `lib/requestOrigin.ts`
- Вычисление внешнего origin и флага `secure` для session cookie.
- Экспортирует `getExternalOriginFromHeaders(headers)`, `getExternalOrigin(req)`, `shouldUseSecureSessionCookie(headers)`.
- Приоритет: `AUTH_BASE_URL` → `x-forwarded-host`/`host` + `x-forwarded-proto` → URL из `NextRequest`.

### `lib/session.ts`
- Next.js-обёртка над сессиями Steam-пользователя.
- Основной путь — DB-токен в cookie `steam_calendar_session`; fallback — legacy `iron-session`.
- Cookie имеет `httpOnly`, `sameSite: lax`, `secure` из `requestOrigin.ts`, TTL сессий — 30 дней.

### `lib/sqlite.ts`
- Ленивое открытие SQLite через `node:sqlite`, инициализация схемы и кэш prepared statements.
- Экспортирует `getDb()`, `prepare(sql)`, `runStatement(sql, ...args)`, `getStatementRow<T>(sql, ...args)`.
- Путь БД берётся из `DB_SQLITE_PATH` → `CACHE_SQLITE_PATH` → `data/steam-calendar.sqlite`; включаются WAL, `busy_timeout`, foreign keys.

### `lib/steam-core.ts`
- Чистые константы, TTL, ключи и парсеры Steam, переиспользуемые в тестах и без `server-only`.
- Экспортирует `APP_DETAILS_TRANSIENT_MISS`, `SteamProfile`, `SteamCacheableAppDetails`, `appDetailsCacheKey`, `ownedCacheKey`, `steamProfileCacheKey`, `parseSteamProfileHtml`, `normalizeSteamProfileAvatar`, `normalizeSteamProfileDisplayName`.
- Содержит env-настройки concurrency/min-interval/TTL; volatile-даты и transient misses укорачивают TTL.

### `lib/steam.ts`
- Серверный слой реальных запросов к Steam Web API и Store-страницам.
- Экспортирует `getPlayerSummaries`, `getSteamProfile`, `getOwnedGames`, `getAppDetails`, `extractSteamIdFromOpenId`.
- Использует `steam-core.ts`, SQLite cache и дедупликацию; `getAppDetails` имеет семафор, pacing и три состояния: данные, подтверждённый негатив, transient miss.

### `lib/store-cc.ts`
- Нормализация регионального Steam store code.
- Экспортирует `normalizeSteamStoreCc(value?)`, `formatSteamStoreCc(value?)`.
- Принимаются только два буквы после trim/lowercase, например `"DE" -> "de"`; невалидные коды возвращают `undefined`.

### `lib/types.ts`
- Общие доменные типы приложения.
- Экспортирует `Lang`, `GameSource`, `DateSource`, `SteamFullGameRef`, `SteamPriceOverview`, `UpcomingGame`, `SteamSession`, `RawgHit`, `IdentifiedSession`.
- Чистый файл без runtime-кода; `UpcomingGame` содержит `sources[]`, `releaseDate`, `dateSource`, цену и `priceCc`.

### `lib/upcoming-candidates.ts`
- Чистый конвейер кандидатов upcoming: wishlist + owned games + appdetails + RAWG targets + filters.
- Экспортирует лимиты `MAX_DETAIL_CANDIDATES = 250`, `MAX_RAWG_LOOKUPS = 50`, `RAWG_CONCURRENCY = 4`, функции `initializeCandidatesFromWishlist`, `addOwnedCandidates`, `selectDetailCandidates`, `applyAppDetails`, `applyReleaseFilters`, `selectRawgTargets`, `buildUpcomingList`, `toUpcomingResult`.
- Wishlist-кандидаты доминируют по баллам; DLC/microtransaction и т.п. удаляются; library-only candidates с неизвестной датой удаляются.

### `lib/upcoming.ts`
- Server-side оркестратор агрегации wishlist + owned games + Steam appdetails + RAWG в `UpcomingResult`.
- Экспортирует `UpcomingResult` и `collectUpcoming(session, rawgKey?)`.
- Использует `aggregate-cache.ts`, `cache-store.ts`, `steam.ts`, `wishlist.ts`, `rawg.ts`, `upcoming-candidates.ts`; transient warning TTL равен 30 секундам.

### `lib/wishlist-core.ts`
- Чистые парсеры Steam wishlist: JSON API, protobuf и SSR HTML-страницы.
- Экспортирует типы wishlist items, статусы `complete|empty|private|unknown`, парсеры `parseJsonWishlistResponse`, `parseWishlistPageResult`, `parseWishlistDate`, helpers финализации appids.
- Ручной protobuf-парсер varint; private-страница распознаётся по отсутствующему SSR или `count > 0` при пустом списке items.

### `lib/wishlist-cache-core.ts`
- Общие ключи и TTL кэша вишлиста.
- Экспортирует `WISHLIST_CACHE_TTL_MS = 10 * 60 * 1000`, `WISHLIST_CACHE_PREFIX = "wishlist:v2:"`, `wishlistStoreCcHash`, `wishlistCacheKey`.
- Кэш-ключ — `wishlist:v2:<steamId>`; при валидном `storeCc` добавляется региональный хэш-суффикс.

### `lib/wishlist.ts`
- Серверный слой получения Steam wishlist с HTTP-вызовами, кэшем и in-flight dedup.
- Экспортирует `fetchWishlist(steamId, storeCc?, options?)`.
- Сначала пробует JSON API, затем protobuf; при необходимости может читать HTML-страницу; кэшируются только уверенные результаты, `refresh: true` пропускает чтение кэша.

### `lib/wishlist-total.ts`
- Доменные утилиты формирования карточных полей и расчёта суммы вишлиста.
- Экспортирует `computeWishlistPriceTotal`, `wishlistCandidatesFromCacheResult`, `wishlistItemEntriesFromCandidates`, `mergeWishlistCardFields`, `discountPercentOf`, `filterWishlistPriceCandidatesByCurrentWishlist`.
- Учитывает только `wishlist`-источники и не смешивает валюты; `library + wishlist` считается owned и исключается из итога.

### `lib/wishlist-total-cache.ts`
- Server-side сборщик итога вишлиста из aggregate-upcoming и wishlist-кэшей.
- Экспортирует `getWishlistTotalForSession(session, { refresh? })`.
- Без steamId возвращает `ready:false, reason:"signed_out"`; без кэша и без refresh — `reason:"not_cached"`; при ошибке возвращает `reason:"error"`.

## Tests and helper test files

### `tests/server-only-stub.mjs`
- Заглушка модуля `server-only` для запуска Node-тестов вне Next.js.
- Содержит только `export default undefined;`.
- Нужна, чтобы `server-only` не падал при импорте серверных модулей в тестах.

### `tests/ts-extension-resolver.mjs`
- ESM resolve-hook для TypeScript-тестов.
- Подменяет `server-only` на локальную заглушку и добавляет расширения `.ts/.tsx/.mts/.js/.jsx/.mjs/.json` к относительным импортам без расширения.
- Используется в тестах и в CI-обходе проблемы с `server-only`.

### `tests/aggregate-cache.test.ts`
- Проверяет ключи aggregate-кэша и дедупликацию `loadUpcomingWithCache`.
- Проверяет формат `upcoming:v5:...`, влияние Steam/RAWG API keys, `storeCc`, month/view неизменность и `pending`.

### `tests/cache-dedupe.test.ts`
- Проверяет общий cache/dedupe паттерн и steam/rawg TTL/ключи.
- Проверяет конкурентный miss, негативный кэш, очистку `pending` при ошибке, `APP_DETAILS_TRANSIENT_MISS`, volatile/negative/stable TTL.

### `tests/calendar.test.ts`
- Проверяет месячную сетку и группы релизов.
- Проверяет понедельник как начало недели, соседние месяцы в grid, exact date groups, year-only groups, `shiftMonth` через границы года.

### `tests/calendar-layout.test.ts`
- Проверяет layout календарной сетки.
- Проверяет веса колонок по максимуму карточек, ограничение видимых карточек, скрытые карточки, сжатие пустых строк и расширение строк с карточками.

### `tests/calendar-feed-link.test.ts`
- Проверяет генерацию `/calendar/ics?token=...`, абсолютного feed URL и Google Calendar import URL.
- Проверяет percent-encoding токена и feed URL.

### `tests/google-calendar-desktop.test.ts`
- Проверяет, что `createCalendarFeedLink` не редиректит напрямую в Google Calendar import URL, а возвращает пользователя на локальный `/calendar?feed=created&openGoogle=1`.
- Проверяет локальную панель `/calendar` с `calendarBackPath`, `calendar.google.back`, `calendar.google.open` и `data-external="true"`.
- Проверяет, что layout монтирует `DesktopExternalLinks`, interceptor открывает только `a[data-external="true"]` через `window.__TAURI__.shell.open`, и Tauri capabilities включают `shell:default`.

### `tests/header-wishlist-total.test.ts`
- Проверяет, что `app/layout.tsx` передаёт полный `wishlistTotal` в `Header` без очистки `items`/`discounts`.
- Проверяет, что header counter может открыть wishlist modal из initial items.

### `tests/ical.test.ts`
- Проверяет генерацию ICS.
- В календарь попадают только игры с точной датой; year-only и бездатные исключаются; проверяется завершение файла `END:VCALENDAR\r\n`.

### `tests/i18n-money.test.ts`
- Проверяет форматирование денег без зависимости от ICU-локали рантайма.
- Проверяет ru/en порядок валютного кода, неразрывные пробелы, JPY без копеек и отсутствие валютного кода при `null/undefined`.

### `tests/perf-config.test.ts`
- Проверяет env overrides для aggregate TTL, Steam appdetails timeouts/concurrency/min-interval и wishlist page fallback.
- Проверяет дефолты, невалидные значения, верхние ограничения и восстановление `process.env`.

### `tests/release-dates.test.ts`
- Проверяет разбор Steam-дат и фильтры прошедших релизов.
- Проверяет точные текстовые даты, отсутствие выдумывания точной даты для года/месяца, понижение плейсхолдера `YYYY-12-31`, границу «сегодня включительно».

### `tests/settings-save-flow.test.ts`
- Проверяет независимые save/remove формы на `/settings`.
- Проверяет, что последовательные сохранения Steam/RAWG/store не затирают друг друга.

### `tests/theme-toggle.test.ts`
- Проверяет, что header использует один theme icon button с hidden input и submit handler.
- Проверяет radio theme options на `/settings` и наличие theme translation keys в ru/en dictionaries.

### `tests/steam-profile.test.ts`
- Проверяет парсинг og-метатегов Steam профиля и нормализацию имени/аватара.
- Проверяет доверенные https steamstatic-хосты, отклонение http/чужих доменов и срезание префиксов Steam Community/sign-in.

### `tests/upcoming-candidates.test.ts`
- Проверяет конвейер upcoming-кандидатов: wishlist, owned games, appdetails, filters, RAWG targets.
- Проверяет DLC filters, recent owned scoring, `MAX_DETAIL_CANDIDATES`, regional `storeCc`, `priceCc` normalization и appdetails `null`.

### `tests/wishlist-cache.test.ts`
- Проверяет wishlist cache key и store cc hash.
- Проверяет игнорирование invalid/empty store cc, нормализацию `"DE"`/`" de "` и разные ключи для разных регионов.

### `tests/wishlist-finalize.test.ts`
- Проверяет финализацию wishlist из API items, HTML page items и appdetails.
- Проверяет, что API-список appid является источником истины, а данные страницы перекрывают детали при наличии.

### `tests/wishlist-parser.test.ts`
- Проверяет парсеры wishlist SSR/JSON/protobuf и дат.
- Проверяет private/empty страницы, protobuf varint, `encodeWishlistRequest`, строковые appid и `comingSoon` при нечёткой дате.

### `tests/wishlist-status.test.ts`
- Проверяет статусы и guard-причины вишлиста.
- Проверяет complete/empty/private/unknown, cacheable status, `wishlist_hidden`/`wishlist_failed` и поведение aggregate guard.

### `tests/wishlist-total.test.ts`
- Проверяет расчёт суммы и скидок вишлиста.
- Проверяет валютную изоляцию, owned exclusion, inference скидок, merge candidates и фильтрацию устаревших wishlist candidates.

### `tests/wishlist-total-cache.test.ts`
- Интеграционный тест `getWishlistTotalForSession` с временным SQLite и mocked fetch.
- Проверяет refresh: устаревшая кэшированная wishlist-игра убирается, актуальная остаётся, итог формируется из appdetails.

## .tmp-validation

- Каталог `/workspace/ai_slop/.tmp-validation` содержит временные артефакты ручной/локальной проверки и не является частью приложения.
- Всего примерно 95 временных файлов и одна генерируемая директория `pw-browsers`.
- Типы артефактов: HTML dumps календаря/настроек/home, текстовые headers, stdout/stderr логи, JSON ответы wishlist total, SQLite test DB/SHM/WAL файлы, Playwright smoke logs, временные инспекционные `.mjs`/`.ts` скрипты.
- Некоторые файлы имеют `.ts` расширения и формально могут попадать в TypeScript project include из-за `tsconfig.json` include patterns; они не должны рассматриваться как production source.
- Каталог не описан в main file inventory и используется как рабочий scratch space для отладки calendar, session, wishlist, Steam API и Playwright проверок.
