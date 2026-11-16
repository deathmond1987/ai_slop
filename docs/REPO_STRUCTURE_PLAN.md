# План структуризации репозитория

Этот документ составлен как план работ. Физический перенос файлов по этому плану выполнен.

## 1. Исходное наблюдение

### Desktop-сборка

На момент составления плана desktop-сборка была разделена между несколькими местами:

- `desktop/` содержит основной код desktop-приложения:
  - `desktop/src-tauri/`
  - `desktop/assets/`
  - `desktop/nsis/`
  - `desktop/web/`
  - `desktop/Dockerfile.base`
  - `desktop/Dockerfile.linux`
  - `desktop/Dockerfile.windows`
  - `desktop/scripts/build-sidecar.mjs`
  - `desktop/scripts/gen-icons.mjs`
  - `desktop/scripts/fetch-windows-node.mjs`

- Корень репозитория содержал пользовательский entry point:
  - `build-desktop-binary.sh`

- `scripts/desktop/` содержал wrappers для сборки:
  - `scripts/desktop/build-desktop-base.sh`
  - `scripts/desktop/build-linux-docker.sh`
  - `scripts/desktop/build-windows-docker.sh`
  - `scripts/desktop/export-linux-packages.sh`
  - `scripts/desktop/export-windows-packages.sh`
  - `scripts/desktop/build-arch-package.sh`

После разрешения merge получилось дублирование ответственности: desktop-компоненты находятся в `desktop/`, а часть сборки desktop находится в `scripts/desktop/`.

### Arch и RPM

Отдельной проблемы с Arch нет. Arch уже встроен в Linux export-процесс.

В исходном Linux export-скрипте уже был `EXPORT_KIND=all`, и по умолчанию исходный desktop entry point устанавливал:

```bash
EXPORT_KIND=all
VERIFY_ARCH=1
```

То есть полная Linux-сборка уже включает:

- `.deb`
- `.rpm`
- `.AppImage`
- `.pkg.tar.zst`

RPM не собирается отдельным wrapper-скриптом, потому что Tauri уже собирает его командой:

```bash
npm run desktop:tauri:build:linux
```

которая вызывает:

```bash
tauri build --config desktop/src-tauri/tauri.conf.json --bundles deb rpm appimage --ci
```

Arch helper нужен не как отдельная пользовательская сборка, а как helper, который конвертирует уже собранный `.deb` в Arch package через `archlinux:latest`.

Вывод: Arch не нужно выносить в отдельный верхний build path. Его лучше оставить как внутренний helper Linux export-процесса.

### `scripts/`

На момент составления плана `scripts/` содержал разные по назначению файлы:

- операционные shell-скрипты:
  - `scripts/check.sh`
  - `scripts/dev.sh`
  - `scripts/install.sh`
  - `scripts/start.sh`
  - `scripts/docker-build.sh`
  - `scripts/docker-run.sh`

- release helper:
  - `scripts/version.mjs`

- desktop build wrappers:
  - весь `scripts/desktop/`

- ad-hoc проверки и измерения:
  - `scripts/auth-render-test.mjs`
  - `scripts/calendar-bench.mjs`
  - `scripts/measure-timeout.mjs`
  - `scripts/measure-sqlite-latency.ts`
  - `scripts/verify-calendar-session.ts`

- docs/example-скрипты:
  - `scripts/keyless_wishlist.py`
  - `scripts/public_wishlist_api.py`

Эту директорию нужно разделить.

### `public/`

`public/` нужен Next.js как static directory. Его нельзя переносить без явной переделки Next.js, desktop sidecar packaging и Docker runtime.

Сейчас `public/` используется косвенно:

- `desktop/scripts/build-sidecar.mjs` копирует `public/` в `desktop/.build/app/public/`
- `Dockerfile` копирует `public/` в final image
- `scripts/start.sh` обновляет `public/` внутри `.next/standalone`

Даже если сами файлы выглядят неиспользуемыми, переносить или удалять `public/` без проверки сборки рискованно.

### `docker/`

В `docker/` сейчас один файл:

- `docker/entrypoint.mjs`

Этот файл нужен runtime `Dockerfile`:

```dockerfile
COPY --chown=node:node docker/entrypoint.mjs ./docker/entrypoint.mjs
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
```

Переносить его без одновременного изменения `Dockerfile` нельзя.

### Корневые npm/config-файлы

Корневые файлы нужны:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `next.config.ts`
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.gitignore`
- `AGENTS.md`
- `README.md`

Некоторые файлы являются сгенерированными:

- `next-env.d.ts`
- `tsconfig.tsbuildinfo`

Они уже игнорируются в `.gitignore`, но должны оставаться в корне, если их использует Next/TypeScript.

## 2. Целевая структура

Предлагаемая целевая структура:

```text
/
  package.json
  package-lock.json
  tsconfig.json
  next.config.ts
  eslint.config.mjs
  Dockerfile
  docker-compose.yml
  .dockerignore
  .gitignore
  AGENTS.md
  README.md

  app/
  components/
  lib/
  i18n/
  types/

  desktop/
    README.md
    build.sh
    Dockerfile.base
    Dockerfile.linux
    Dockerfile.windows
    src-tauri/
    assets/
    nsis/
    web/
    scripts/
      build-base.sh
      build-linux.sh
      build-windows.sh
      export-linux.sh
      export-windows.sh
      package-arch.sh
      build-sidecar.mjs
      gen-icons.mjs
      fetch-windows-node.mjs

  scripts/
    install.sh
    dev.sh
    start.sh
    check.sh
    docker-build.sh
    docker-run.sh
    release/
      version.mjs

  tests/
    *.test.ts
    auth-render.test.mjs
    helpers/
      server-only-stub.mjs
      ts-extension-resolver.mjs

  tools/
    bench/
      calendar-bench.mjs
    measure/
      measure-timeout.mjs
      measure-sqlite-latency.ts
    verify/
      verify-calendar-session.ts

  docs/
    CODE_OVERVIEW.md
    BUILD_WARNINGS_WORKLIST.md
    KEYLESS_WISHLIST.md
    REPO_STRUCTURE_PLAN.md
    examples/
      keyless_wishlist.py
      public_wishlist_api.py

  public/
```

## 3. Пошаговый план работ

### Шаг 1. Зафиксировать текущее состояние

Перед любыми переносами:

```bash
git status --short --branch
git diff --stat
git ls-files scripts build-desktop-binary.sh desktop docker docs tests package.json
```

Сохранить текущие пути и все ссылки:

```bash
git grep -n "build-desktop-binary.sh"
git grep -n "scripts/desktop"
git grep -n "scripts/version.mjs"
git grep -n "scripts/auth-render-test.mjs"
git grep -n "scripts/calendar-bench.mjs"
git grep -n "scripts/measure-timeout.mjs"
git grep -n "scripts/measure-sqlite-latency.ts"
git grep -n "scripts/verify-calendar-session.ts"
git grep -n "scripts/keyless_wishlist.py"
git grep -n "scripts/public_wishlist_api.py"
git grep -n "docker/entrypoint.mjs"
```

Ожидаемые файлы, где нужно будет менять ссылки:

- `package.json`
- `README.md`
- `desktop/README.md`
- `PLAN.md`
- `docs/CODE_OVERVIEW.md`
- `docs/KEYLESS_WISHLIST.md`
- `.github/workflows/release.yml`

### Шаг 2. Перенести корневой desktop entry point в `desktop/`

Перенести:

```text
build-desktop-binary.sh -> desktop/build.sh
```

Содержимое `desktop/build.sh` должно остаться таким же по логике, но вызывать уже новые desktop wrappers:

```bash
bash desktop/scripts/build-linux.sh
bash desktop/scripts/export-linux.sh
bash desktop/scripts/build-windows.sh
bash desktop/scripts/export-windows.sh
```

Обновить `package.json`:

```json
"build:all": "bash desktop/build.sh all",
"build:linux": "bash desktop/build.sh linux",
"build:windows": "bash desktop/build.sh windows",
"desktop:package:linux": "bash desktop/build.sh linux",
"desktop:package:windows": "bash desktop/build.sh windows"
```

Обновить CI:

```yaml
run: bash desktop/build.sh "${{ matrix.platform }}"
```

в `.github/workflows/release.yml`.

После проверки можно оставить временный корневой wrapper:

```text
build-desktop-binary.sh -> desktop/build.sh
```

для обратной совместимости, но целевой путь должен быть `desktop/build.sh`.

### Шаг 3. Перенести desktop shell wrappers в `desktop/scripts/`

Перенести файлы:

```text
scripts/desktop/build-desktop-base.sh -> desktop/scripts/build-base.sh
scripts/desktop/build-linux-docker.sh -> desktop/scripts/build-linux.sh
scripts/desktop/build-windows-docker.sh -> desktop/scripts/build-windows.sh
scripts/desktop/export-linux-packages.sh -> desktop/scripts/export-linux.sh
scripts/desktop/export-windows-packages.sh -> desktop/scripts/export-windows.sh
scripts/desktop/build-arch-package.sh -> desktop/scripts/package-arch.sh
```

Удалить директорию:

```text
scripts/desktop/
```

когда все ссылки будут обновлены.

После переноса в каждом shell-скрипте нужно исправить `repo_root`.

Было:

```bash
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
```

Стало:

```bash
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
```

Потому что скрипты переезжают из:

```text
scripts/desktop/
```

в:

```text
desktop/scripts/
```

### Шаг 4. Обновить вызовы внутри desktop wrappers

Внутри новых wrappers обновить:

- вызовы `scripts/version.mjs` на новый путь release helper;
- вызовы `scripts/desktop/build-arch-package.sh` на `desktop/scripts/package-arch.sh`;
- сообщения об ошибках с текстом `Run scripts/desktop/...` на новый путь.

Например, в `desktop/scripts/export-linux.sh`:

```bash
node scripts/release/version.mjs sync
VERSION="${VERSION:-$(node scripts/release/version.mjs get)}"
```

и:

```bash
bash desktop/scripts/package-arch.sh
```

### Шаг 5. Решить судьбу `scripts/version.mjs`

`scripts/version.mjs` нужен как release helper, а не как часть desktop directory.

Рекомендуемый перенос:

```text
scripts/version.mjs -> scripts/release/version.mjs
```

Обновить:

- `package.json`
- `desktop/scripts/*.sh`
- `docs/CODE_OVERVIEW.md`
- `PLAN.md`
- `README.md`, если там есть явные команды

После переноса `package.json` должен использовать:

```json
"version:print": "node scripts/release/version.mjs get",
"version:sync": "node scripts/release/version.mjs sync"
```

### Шаг 6. Перенести тестовый auth harness в `tests/`

Перенести:

```text
scripts/auth-render-test.mjs -> tests/auth-render.test.mjs
```

или, если нужен менее test-like name:

```text
scripts/auth-render-test.mjs -> tests/auth-render-harness.mjs
```

Рекомендуемый вариант:

```text
tests/auth-render.test.mjs
```

Внутри файла нужно изменить project root.

Сейчас:

```js
const projectRoot = path.resolve(import.meta.dirname, "..");
```

После переноса в `tests/` это выражение может остаться корректным, но нужно явно проверить:

```text
tests/auth-render.test.mjs -> .. = repo root
```

Внутри `auth-render.test.mjs` уже есть ссылки:

```js
import("../lib/auth-store.ts")
import("../lib/calendar.ts")
import("../lib/cache-store.ts")
import("../lib/aggregate-cache.ts")
```

и:

```js
const resolverPath = path.join(projectRoot, "tests", "ts-extension-resolver.mjs");
```

Эти пути должны остаться рабочими после переноса.

Обновить `package.json`:

```json
"test:auth:render": "node --experimental-strip-types tests/auth-render.test.mjs"
```

Обновить `scripts/check.sh`:

```bash
npm run test:auth:render
```

сам command менять не нужно, если обновлен только `package.json`.

### Шаг 7. Разнести helpers в `tests/`

Сейчас helpers находятся прямо в `tests/`:

```text
tests/server-only-stub.mjs
tests/ts-extension-resolver.mjs
```

Можно оставить как есть или вынести в:

```text
tests/helpers/server-only-stub.mjs
tests/helpers/ts-extension-resolver.mjs
```

Рекомендуется вынести, но это потребует обновить:

- импорт в `tests/ts-extension-resolver.mjs` для `server-only-stub.mjs`
- импорт в `tests/auth-render.test.mjs`
- возможные импорты внутри `tests/*.test.ts`

Минимально безопасный вариант:

```text
tests/helpers/ts-extension-resolver.mjs
tests/helpers/server-only-stub.mjs
```

и обновить все `../node_modules/...` и `./server-only-stub.mjs` пути.

### Шаг 8. Вынести measurements и ad-hoc verification в `tools/`

Перенести:

```text
scripts/calendar-bench.mjs -> tools/bench/calendar-bench.mjs
scripts/measure-timeout.mjs -> tools/measure/measure-timeout.mjs
scripts/measure-sqlite-latency.ts -> tools/measure/measure-sqlite-latency.ts
scripts/verify-calendar-session.ts -> tools/verify/verify-calendar-session.ts
```

Обновить `package.json`:

```json
"verify:calendar-session": "node --experimental-strip-types tools/verify/verify-calendar-session.ts",
"measure:sqlite-latency": "node --experimental-strip-types tools/measure/measure-sqlite-latency.ts"
```

Обновить:

- `timeouts.md`
- `docs/CODE_OVERVIEW.md`
- `PLAN.md`, если есть упоминания

### Шаг 9. Вынести Python docs examples в `docs/examples/`

Перенести:

```text
scripts/keyless_wishlist.py -> docs/examples/keyless_wishlist.py
scripts/public_wishlist_api.py -> docs/examples/public_wishlist_api.py
```

Обновить:

- `docs/KEYLESS_WISHLIST.md`
- `docs/CODE_OVERVIEW.md`
- `PLAN.md`, если есть упоминания

Например, заменить:

```text
scripts/public_wishlist_api.py
```

на:

```text
docs/examples/public_wishlist_api.py
```

### Шаг 10. Оставить `public/` на месте, но почистить только после проверки

Сейчас `public/` содержит:

```text
public/file.svg
public/globe.svg
public/next.svg
public/vercel.svg
public/window.svg
```

Рекомендация:

1. Не переносить `public/` в `desktop/public`, `app/public` или `static/`.
2. Сначала проверить, используются ли эти SVG где-то в приложении:

```bash
git grep -n "file.svg\|globe.svg\|next.svg\|vercel.svg\|window.svg" app components lib desktop public
```

3. Если они не используются, можно удалить сами файлы, но каталог `public/` оставить.

Минимально безопасный итог:

```text
public/
  app-icon.svg
  favicon.svg
```

или даже пустой каталог `public/`, если Next.js допускает это в текущей версии проекта.

Перенос `public/` делать только если одновременно обновить:

- `next.config.ts`
- `Dockerfile`
- `scripts/start.sh`
- `desktop/scripts/build-sidecar.mjs`
- `docs/CODE_OVERVIEW.md`
- `README.md`

### Шаг 11. Оставить `docker/entrypoint.mjs` на месте

Сейчас:

```text
docker/entrypoint.mjs
```

используется root `Dockerfile`.

Рекомендация:

1. Оставить `docker/entrypoint.mjs` в `docker/`.
2. Оставить root `Dockerfile` в корне.
3. Если хочется более аккуратную структуру, можно позже перенести:

```text
docker-compose.yml -> docker/compose.yml
```

но тогда нужно обновить:

- `package.json`
- `README.md`
- `docker-build.sh`
- `docker-run.sh`
- GitHub Actions, если они используют compose
- `.dockerignore`

На первом этапе это делать не обязательно.

Целевой безопасный итог:

```text
Dockerfile
docker-compose.yml
docker/entrypoint.mjs
```

### Шаг 12. Обновить `.dockerignore`

Текущий `.dockerignore` уже игнорирует:

```text
/scripts
docs
tests
PLAN.md
AGENTS.md
```

После переносов проверить:

1. Desktop images должны включать `desktop/` и не должны исключать `desktop/scripts/`.
2. Runtime web image не должен включать тесты и docs.
3. `docker/entrypoint.mjs` не должен попадать в ignore.
4. `scripts/` можно продолжать игнорировать, но только если runtime Dockerfile не использует scripts напрямую.
5. Если появится `scripts/release/version.mjs`, его тоже можно игнорировать для runtime image.

После переноса desktop scripts из `scripts/desktop/` в `desktop/scripts/` нужно убедиться, что desktop Docker build context включает нужные desktop helper scripts.

### Шаг 13. Обновить `package.json`

Итоговый набор команд после переносов должен выглядеть примерно так:

```json
"scripts": {
  "dev": "next dev",
  "install:local": "bash scripts/install.sh",
  "dev:local": "bash scripts/dev.sh",
  "build": "next build",
  "start": "next start",
  "start:local": "bash scripts/start.sh",
  "check": "bash scripts/check.sh",
  "typegen": "next typegen",
  "lint": "eslint",
  "test": "node --test --experimental-strip-types tests/*.test.ts",
  "test:auth": "node --test --experimental-strip-types tests/auth-flow.test.ts",
  "test:auth:render": "node --experimental-strip-types tests/auth-render.test.mjs",
  "test:auth:all": "npm run test:auth && npm run test:auth:render",

  "version:print": "node scripts/release/version.mjs get",
  "version:sync": "node scripts/release/version.mjs sync",

  "docker:build": "bash scripts/docker-build.sh",
  "docker:run": "bash scripts/docker-run.sh",
  "docker:compose": "docker compose up --build --detach",
  "docker:compose:down": "docker compose down",
  "docker:compose:logs": "docker compose logs -f app",

  "build:all": "bash desktop/build.sh all",
  "build:linux": "bash desktop/build.sh linux",
  "build:windows": "bash desktop/build.sh windows",

  "desktop:gen-icons": "node desktop/scripts/gen-icons.mjs",
  "desktop:sidecar": "node desktop/scripts/build-sidecar.mjs",

  "desktop:tauri:dev": "tauri dev --config desktop/src-tauri/tauri.conf.json",
  "desktop:tauri:build:linux": "tauri build --config desktop/src-tauri/tauri.conf.json --bundles deb rpm appimage --ci",
  "desktop:tauri:build:linux:deb": "tauri build --config desktop/src-tauri/tauri.conf.json --bundles deb --ci",
  "desktop:tauri:build:linux:rpm": "tauri build --config desktop/src-tauri/tauri.conf.json --bundles rpm --ci",
  "desktop:tauri:build:linux:appimage": "tauri build --config desktop/src-tauri/tauri.conf.json --bundles appimage --ci",

  "desktop:build:linux": "npm run build && npm run desktop:sidecar && npm run desktop:tauri:build:linux",
  "desktop:build:linux:deb": "npm run build && npm run desktop:sidecar && npm run desktop:tauri:build:linux:deb",
  "desktop:build:linux:rpm": "npm run build && npm run desktop:sidecar && npm run desktop:tauri:build:linux:rpm",
  "desktop:build:linux:appimage": "npm run build && npm run desktop:sidecar && npm run desktop:tauri:build:linux:appimage",

  "docker:build:desktop-linux": "bash desktop/scripts/build-linux.sh",
  "desktop:export:linux": "bash desktop/scripts/export-linux.sh",
  "desktop:export:linux:arch": "EXPORT_KIND=arch bash desktop/scripts/export-linux.sh",

  "desktop:fetch:windows:node": "node desktop/scripts/fetch-windows-node.mjs",
  "docker:build:desktop-windows": "bash desktop/scripts/build-windows.sh",
  "desktop:export:windows": "bash desktop/scripts/export-windows.sh",

  "verify:calendar-session": "node --experimental-strip-types tools/verify/verify-calendar-session.ts",
  "measure:sqlite-latency": "node --experimental-strip-types tools/measure/measure-sqlite-latency.ts"
}
```

Отдельный `desktop:package:arch:linux` лучше либо удалить, либо сделать алиасом:

```json
"desktop:export:linux:arch": "EXPORT_KIND=arch bash desktop/scripts/export-linux.sh"
```

Это сохранит Arch как часть Linux export-процесса.

### Шаг 14. Обновить документацию

Нужно обновить пути в:

- `README.md`
- `desktop/README.md`
- `PLAN.md`
- `docs/CODE_OVERVIEW.md`
- `docs/KEYLESS_WISHLIST.md`
- `docs/BUILD_WARNINGS_WORKLIST.md`
- `timeouts.md`

Основные замены:

```text
bash build-desktop-binary.sh -> bash desktop/build.sh
scripts/desktop/build-desktop-base.sh -> desktop/scripts/build-base.sh
scripts/desktop/build-linux-docker.sh -> desktop/scripts/build-linux.sh
scripts/desktop/build-windows-docker.sh -> desktop/scripts/build-windows.sh
scripts/desktop/export-linux-packages.sh -> desktop/scripts/export-linux.sh
scripts/desktop/export-windows-packages.sh -> desktop/scripts/export-windows.sh
scripts/desktop/build-arch-package.sh -> desktop/scripts/package-arch.sh
scripts/version.mjs -> scripts/release/version.mjs
scripts/auth-render-test.mjs -> tests/auth-render.test.mjs
scripts/calendar-bench.mjs -> tools/bench/calendar-bench.mjs
scripts/measure-timeout.mjs -> tools/measure/measure-timeout.mjs
scripts/measure-sqlite-latency.ts -> tools/measure/measure-sqlite-latency.ts
scripts/verify-calendar-session.ts -> tools/verify/verify-calendar-session.ts
scripts/public_wishlist_api.py -> docs/examples/public_wishlist_api.py
scripts/keyless_wishlist.py -> docs/examples/keyless_wishlist.py
```

### Шаг 15. Обновить описание Arch packaging

В документации нужно зафиксировать:

```text
Linux export собирает deb, rpm, AppImage и Arch package в одном потоке.
Arch package получается из уже собранного deb и не является отдельной desktop-сборкой верхнего уровня.
RPM входит в обычный Linux bundle через Tauri.
```

Желаемое описание Linux export:

```text
desktop/build.sh linux
  -> desktop/scripts/build-linux.sh
  -> desktop/Dockerfile.linux
  -> desktop/scripts/export-linux.sh
  -> desktop/scripts/package-arch.sh
  -> out/linux/*.deb
  -> out/linux/*.rpm
  -> out/linux/*.AppImage
  -> out/linux/*.pkg.tar.zst
```

## 4. Порядок безопасного выполнения переносов

Рекомендуется делать не один большой коммит, а несколько последовательных.

### Этап A: только пути без изменения логики

1. Создать новые файлы:
   - `desktop/build.sh`
   - `desktop/scripts/build-base.sh`
   - `desktop/scripts/build-linux.sh`
   - `desktop/scripts/build-windows.sh`
   - `desktop/scripts/export-linux.sh`
   - `desktop/scripts/export-windows.sh`
   - `desktop/scripts/package-arch.sh`
   - `scripts/release/version.mjs`
2. Обновить все внутренние вызовы.
3. Обновить `package.json` и CI.
4. Проверить, что новые команды работают.
5. Удалить старые файлы и директорию `scripts/desktop/`.

### Этап B: перенос тестов

1. Перенести `scripts/auth-render-test.mjs` в `tests/`.
2. Обновить `package.json`.
3. Проверить `npm run test:auth:render`.
4. Проверить `npm run check`.

### Этап C: перенос tools

1. Перенести bench/measure/verify скрипты в `tools/`.
2. Обновить `package.json`.
3. Обновить `timeouts.md` и docs.
4. Проверить синтаксис Node/TS файлов.

### Этап D: перенос Python docs examples

1. Перенести Python файлы в `docs/examples/`.
2. Обновить `docs/KEYLESS_WISHLIST.md` и `docs/CODE_OVERVIEW.md`.
3. Проверить, что docs больше не ссылаются на `scripts/*.py`.

### Этап E: проверка public и docker

1. Оставить `public/` на месте.
2. Проверить использование SVG из `public/`.
3. Оставить `docker/entrypoint.mjs` на месте.
4. Проверить Docker build.
5. Только после этого решать, удалять ли неиспользуемые `public/*.svg`.

## 5. Проверки после реорганизации

Обязательные проверки:

```bash
npm run check
npm run test
npm run test:auth:render
npm run typegen
npm run lint
npx tsc --noEmit
npm run build
```

Проверки desktop syntax:

```bash
bash -n desktop/build.sh
bash -n desktop/scripts/build-base.sh
bash -n desktop/scripts/build-linux.sh
bash -n desktop/scripts/build-windows.sh
bash -n desktop/scripts/export-linux.sh
bash -n desktop/scripts/export-windows.sh
bash -n desktop/scripts/package-arch.sh
bash -n scripts/docker-build.sh
bash -n scripts/docker-run.sh
bash -n scripts/start.sh
bash -n scripts/check.sh
```

Проверка ссылок:

```bash
git grep -n "scripts/desktop"
git grep -n "scripts/version.mjs"
git grep -n "scripts/auth-render-test.mjs"
git grep -n "scripts/calendar-bench.mjs"
git grep -n "scripts/measure-timeout.mjs"
git grep -n "scripts/measure-sqlite-latency.ts"
git grep -n "scripts/verify-calendar-session.ts"
git grep -n "scripts/public_wishlist_api.py"
git grep -n "scripts/keyless_wishlist.py"
git grep -n "build-desktop-binary.sh"
```

После завершения реорганизации эти greps не должны находить старые пути, кроме, возможно, упоминаний истории в changelog.

## 6. Что делать с root `build-desktop-binary.sh`

Лучший вариант:

1. Создать `desktop/build.sh`.
2. Обновить все вызовы.
3. Оставить root `build-desktop-binary.sh` на переходный период как тонкий wrapper:

```bash
#!/usr/bin/env bash
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/desktop/build.sh" "$@"
```

4. После проверки документации и CI удалить root wrapper.

Если wrapper не нужен, можно сразу переносить скрипт в `desktop/build.sh`.

## 7. Итоговая рекомендация

Сделать так:

1. Все desktop build scripts переносятся в `desktop/`.
2. `scripts/desktop/` удаляется полностью.
3. `scripts/` оставляет только operational scripts.
4. `scripts/release/version.mjs` становится release helper.
5. `scripts/auth-render-test.mjs` переносится в `tests/`.
6. Bench/measure/verify переносятся в `tools/`.
7. Python wishlist examples переносятся в `docs/examples/`.
8. `public/` оставляем на месте, удаляем только неиспользуемые файлы после проверки.
9. `docker/entrypoint.mjs` оставляем в `docker/`, пока не переделываем Dockerfile.
10. Arch package остается внутренним helper Linux export-процесса, а не отдельной сборкой верхнего уровня.
11. RPM уже входит в Linux export; отдельный RPM script не нужен.