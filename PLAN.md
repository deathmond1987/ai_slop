# Steam Calendar Companion — план работ

## 1. Сделать темную тему

**Статус:** выполнено; проверено `npm run check`, наличием `dark:` вариантов в карточках, календаре, шапке, модалках и формах настроек.

- Добавить полноценную темную тему интерфейса.
- Сделать переключатель темы: светлая / темная / системная.
- Сохранять выбранную тему между сессиями через cookie `ui_theme`.
- Учесть системную тему браузера как значение по умолчанию.
- Проверить читаемость текста, карточек, календаря, модалок, шапки и форм в темной теме.
- Прогнать `npm run check` после изменения темы.

## 2. Перевести сборки desktop app в bash-скрипты при помощи Docker

**Статус:** выполнено для Linux и Windows; добавлены простые wrappers `build/linux.sh`, `build/windows.sh` и `build/all.sh`.

- Вынести логику сборки desktop-приложения в отдельные bash-скрипты.
- Использовать Docker как основной и стабильный путь сборки.
- Сохранить текущую возможность собирать Linux desktop-сборки.
- Сделать скрипты понятными и повторяемыми для разработчика.

## 3. Сделать сборку для RPM и Arch Linux, помимо deb и AppImage

**Статус:** выполнено; `deb`, `rpm`, AppImage и Arch package собираются в `./out/linux`.

- Добавить сборку `.rpm` пакета.
- Добавить сборку пакета для Arch Linux.
- Сохранить существующие форматы `.deb` и AppImage.
- Проверить, что desktop-приложение запускается и стартует встроенный локальный сервер sidecar.

## 4. Готовые бинарники класть в ./out основной директории приложения

**Статус:** выполнено для Linux-артефактов и Windows installer-артефактов.

- Создать основную директорию `./out`.
- Класть туда готовые бинарники и installer-артефакты.
- Ограничить доступные форматы артефактов списком: `.deb`, AppImage, `.rpm`, Arch Linux package.
- Обновить документацию и скрипты сборки под новый путь вывода.

## 5. Организовать в Linux сборку и установщик .exe для Windows

**Статус:** выполнено; Windows NSIS installer собирается через Docker и кладется в `./out/windows`.

- Настроить сборку desktop-приложения под Windows из Linux.
- Использовать Docker или cross-compilation-инструменты.
- Собрать Windows `.exe`.
- Сделать установщик `.exe` для Windows.
- Поместить готовые Windows-артефакты в `./out`.

## 6. Простые build-скрипты для всех уже поддерживаемых ОС

**Статус:** выполнено; добавлены `build/all.sh`, `build/linux.sh`, `build/windows.sh` и npm-алиасы `build:all`, `build:linux`, `build:windows`; полный прогон `bash build/all.sh` успешно собрал Linux и Windows артефакты.

- Собрать все поддерживаемые desktop-платформы одной командой `bash build/all.sh`.
- Сохранить отдельные команды для Linux и Windows.
- Артефакты по-прежнему писать в `out/linux` и `out/windows`.
- Обновить документацию и план под простые команды сборки.

## 7. Исправить проблемы с настройками API key и region

**Статус:** выполнено; settings-страница разбита на независимые формы, добавлены тесты, `npm test`, `npm run lint`, `npx tsc --noEmit` и `npm run build` прошли успешно.

- При вводе API key и сохранении через Enter ключ добавляется корректно.
- После ввода API key нажатие кнопки добавления региона приводило к потере ранее введенного API key из-за единой формы с `remove`-submit кнопками до save-кнопки.
- После добавления региона повторное добавление API key приводило к потере ранее добавленного region по той же причине implicit submit.
- Исправлено: каждый параметр сохраняется своей отдельной `<form action={saveSettings}>`; `remove`-действия вынесены в отдельные submit-формы, поэтому Enter в поле больше не удаляет ранее сохранённые API key или region.
- Проверено тестами:
  - последовательное сохранение `steamApiKey`, `rawgApiKey` и `storeCc` не перезаписывает уже сохранённые значения;
  - удаление одного параметра не должно влиять на другие сохранённые параметры.

## 8. Найти причину неактивности кнопки "до полного счастья осталось"

**Статус:** реализовано по первому варианту; `app/layout.tsx` передаёт полный `wishlistTotal` с `items`/`discounts`, добавлен `tests/header-wishlist-total.test.ts`, проверки пройдены.

- Причина: `app/layout.tsx` отдаёт в `Header` уже готовый summary `wishlistTotal`, но искусственно очищает `items` и `discounts` до `[]`.
- В `components/WishlistPriceCounter.tsx` clickable button с модальным окном создаётся только при `items.length > 0`; если `initialTotal.ready === true`, компонент считает данные готовыми, не делает клиентский fetch и остаётся с пустым `items`, поэтому отображается обычный `<span>` вместо кнопки.
- Примеры решения:
  - передавать в `Header` полный payload с `items`/`discounts` вместо их принудительной очистки;
  - отдельно вернуть `summaryTotal` без больших `items`, но разрешать открыть модалку при `ready && count > 0` и подгружать `items` через `/api/wishlist-total` при открытии;
  - если `ready && items.length === 0 && count > 0`, запускать lazy fetch full wishlist items в `WishlistPriceCounter`;
  - различать header-кнопку "показать все игры вишлиста" и "показать только скидки": кнопка должна быть активна, если есть `count`, даже когда `discountCount === 0`.

## 9. Одна кнопка переключения темы картинкой и настройка темы в настройках

**Статус:** реализовано; `components/Header.tsx` использует одну кнопку-иконку `ThemeToggleButton`, `/settings` получил radio-выбор `light`/`dark`/`system`, добавлены тесты, `npm test`, `npm run lint`, `npx tsc --noEmit` и `npm run build` прошли успешно.

- Раньше в `components/Header.tsx` тема переключалась тремя submit-кнопками (`light`, `dark`, `system`).
- Нужно заменить переключатель в шапке на одну кнопку-картинку/иконку (например, солнце/луна), которая переключает тёмную/светлую тему.
- Добавить опцию переключения темы в `/settings` (например, radio/select: светлая, тёмная, системная) так, чтобы выбор сохранялся через существующий cookie `ui_theme` или существующий `/theme` action.

## 10. Google Calendar в desktop-приложении открывается без возможности выхода

**Статус:** реализовано; `createCalendarFeedLink` больше не делает прямой `redirect(googleCalendarImportUrl(feedUrl))`, а возвращает на `/calendar?...&openGoogle=1`; `/calendar` показывает локальную панель с "Назад в приложение" и явной ссылкой `data-external="true"`; `DesktopExternalLinks` в Next layout перехватывает только помеченные внешние `http(s)`-ссылки в Tauri WebView и открывает их через `window.__TAURI__.shell.open`; `shell:default` добавлен в Tauri capabilities; README и CODE_OVERVIEW обновлены. Добавлен `tests/google-calendar-desktop.test.ts`; `npm test` — 147 tests pass, `npm run lint`, `npx tsc --noEmit` и `npm run build` прошли успешно.

- При клике на подписку Google Calendar приложение переходит на `https://calendar.google.com/calendar/r?cid=...` из WebView (`desktop_version/linux/web/index.html` -> local Next.js sidecar -> `app/calendar/page.tsx` / `app/actions/calendar-feed.ts`), и Tauri-окно показывает внешнюю страницу без browser UI и кнопки "назад".
- Примеры решения:
  - открыть внешнюю ссылку в системном браузере через Tauri `shell.open`/`tauri-plugin-opener` и выдать соответствующие capabilities/permissions;
  - перехватить `target="_blank"` и внешние `http(s)`-ссылки в desktop-обёртке, оставляя внутри WebView только переходы на `127.0.0.1` локального sidecar;
  - вместо прямого `redirect(googleCalendarImportUrl(feedUrl))` в server action показывать локальную страницу с кнопкой "Назад в приложение" и явной кнопкой "Открыть Google Calendar в браузере";
  - добавить в desktop-обёртку минимальную панель навигации/кнопку возврата на локальный sidecar URL.

## 11. Публикация desktop-пакетов и Docker-образа по кнопке, без автоматической сборки

**Статус:** реализовано на уровне workflow и документации; GitHub Actions можно проверить только ручным запуском `Run workflow`.

- Workflow `.github/workflows/docker.yml` переименован в `Publish release by button`.
- Убраны автоматические триггеры `push`, `push tags v*` и `pull_request`.
- Запуск разрешен только через `workflow_dispatch`, то есть через кнопку `Run workflow` в GitHub Actions.
- Workflow сначала выполняет `preflight` и `checks` (`npm ci`, `npm run check`).
- Docker image собирается и публикуется в GitHub Container Registry только при input `publish_docker`.
- Docker image публикуется как `ghcr.io/<owner>/steam-calendar` с тегами version, major.minor, major, SHA и опциональным `latest`.
- При `prerelease=true` или при версии вида `1.2.3-beta.1` GitHub release помечается pre-release и Docker tag `latest` не публикуется.
- Desktop-пакеты собираются через существующие Docker-скрипты:
  - Linux `.deb`, `.rpm`, AppImage;
  - Windows NSIS setup `.exe`.
- При `publish_release=true` workflow собирает desktop-пакеты и публикует их как GitHub release assets с тегом `v<version>`.
