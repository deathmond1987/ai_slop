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
  - Linux `.deb`, `.rpm`, AppImage и Arch `.pkg.tar.zst` в одной Linux task;
  - Windows NSIS setup `.exe`.
- При `publish_release=true` workflow собирает desktop-пакеты и публикует их как GitHub release assets с тегом `v<version>`.

## Новая фаза: 11 изменений

**Проверка:** `npm run check` пройден: `152` tests pass, typegen/lint/build/auth render fallback passed; Docker workflow parsed and contains `docker`, `desktop` matrix jobs with Linux/Windows tasks and release dependencies.

### 1. Переименовать настройки темы интерфейса

**Статус:** выполнено; `i18n/ru.json` использует `Светлая`, `Тёмная`, `Системная`; `/settings` рендерит radio-выбор через `theme.light`, `theme.dark`, `theme.system`.

- В русском интерфейсе заменить короткие названия тем `Свет`, `Тём`, `Авто` на полные `Светлая`, `Тёмная`, `Системная`.
- Обновить подписки в календарной сетке и все русские метки темы, если они используют те же ключи.

### 2. Перенести настройки языка из /calendar в /settings

**Статус:** выполнено; `/calendar` больше не содержит отдельный language switcher, `/settings` содержит language form `action="/auth/lang"` с radio `ru`/`en`.

- Убрать переключатель языка из области календаря/шапки, где это относится к языку приложения.
- Добавить явный выбор языка в `/settings`.
- Сохранять язык через существующий механизм cookie `LANG_COOKIE` и `saveUserLang`.

### 3. Объединить действия календаря в одно меню подписки

**Статус:** выполнено; `/calendar` использует `CalendarSubscriptionMenu` с подпиской Google Calendar, token URL, `.ics` подпиской, экспортом `.ics`, create/revoke token и тестом `tests/google-calendar-desktop.test.ts`.

- Сделать одну кнопку `Подписка на календарь` или `Subscription Calendar` для всех вариантов подписки.
- Внутри меню разместить:
  - подписку на Google Calendar;
  - настройку подписки/token URL;
  - экспорт `.ics`.
- Убрать лишние отдельные кнопки подписки/экспорта из шапки календаря.

### 4. Разобраться с экспортом .ics и подпиской в Windows-приложении

**Статус:** выполнено на уровне интерфейса и desktop link handling: единое меню использует `download`-ссылки для `.ics`, токенный feed помечен `data-external="true"`, Google Calendar открывается через `DesktopExternalLinks`/Tauri shell с локальным возвращением в приложение; локальная runtime-проверка Windows WebView не выполнялась.

- Проверить поведение `download`-ссылки `/calendar/ics` и токенной подписки в Windows/Tauri WebView.
- Сделать действия `.ics`, Google Calendar и manage subscription понятными в desktop-приложении.
- Избежать ситуации, когда WebView открывает/теряет локальную ссылку без возможности вернуться или скачать файл.

### 5. Удалить подпись `Powered by Steam Web API · OpenID · RAWG fallback`

**Статус:** выполнено; подпись удалена, `app/layout.tsx` не содержит футер `Powered by Steam Web API · OpenID · RAWG fallback`.

- Найти текстовый футер в `app/layout.tsx`.
- Удалить строку целиком, чтобы внизу не отображалась текущая подпись.

### 6. Переписать формулировки про даты выхода

**Статус:** выполнено; `i18n/ru.json` использует `Выходит в {year} ({count})` и `Игры без даты выхода`, английские эквиваленты обновлены.

- Заменить `Дата выхода ещё не объявлена` на `Игры без даты выхода`.
- Заменить `Дата выхода запланирована на ____ год` на вариант `выходит в ____`.
- Обновить русские переводы и при необходимости английские эквиваленты.

### 7. Исправить размер ячеек в календарной сетке при нескольких играх

**Статус:** выполнено; `components/CalendarGrid.tsx` использует фиксированные `minmax(min, max)` row tracks, `app/globals.css` ограничивает card/empty row height и overflow, тест `calendar row tracks are capped to fixed row heights` проходит.

- В сетке календаря ограничить вертикальный размер ячейки с несколькими играми.
- Цель: ячейка с играми декабря по высоте не должна быть больше ячейки ноября, которая сейчас выглядит эталонной.
- Сохранить читаемость и использовать существующие CSS-переменные календарной сетки.

### 8. Привести размеры шрифтов в настройках к размерам календаря

**Статус:** выполнено; `/settings` использует `text-scale-11`/`settings-control`/`settings-save-btn` компактные размеры, `app/globals.css` убирает прокрутку `settings-page`, тест `settings page uses compact calendar-like typography without page scroll` проходит.

- Использовать размеры текста как в календаре: `text-scale-11` для заголовков и `text-scale-10` для описаний.
- Сделать настройки компактнее.
- Убрать необходимость прокрутки страницы настроек.

### 9. Сделать `steamcommunity.com/dev/apikey` кликабельной ссылкой

**Статус:** выполнено; `/settings` рендерит `https://steamcommunity.com/dev/apikey` как `<a>` с `target="_blank"`, `data-external="true"` и существующим desktop external link handling.

- В подсказке настроек Steam API key сделать домен ссылкой.
- Открытие должно работать в web и desktop через существующий механизм внешних ссылок.

### 10. Заменить ручной ввод региона на выпадающий список

**Статус:** выполнено; `/settings` использует `<select id="storeCc" name="storeCc">` со значениями `us`, `ua`, `ru`, `kz` и fallback для ранее сохранённых двухбуквенных кодов.

- В настройках региона Steam Store заменить текстовое поле на `select`.
- Использовать значения/ID `us` для America, `ua` для Ukraine, `ru` для Russia, `kz` для Kazakhstan.
- Передавать выбранный ID в приложение и сохранить совместимость с существующим `storeCc`.

### 11. Оптимизировать пайплайн сборки

**Статус:** пайплайн упрощен: `.github/workflows/docker.yml` выполняет `preflight`, `checks`, отдельную job `docker` для production Docker-контейнера, desktop matrix с задачами `linux` и `windows`, затем `release`. Linux desktop task собирает все Linux-пакеты в одной задаче: `.deb` для Debian/Ubuntu, `.rpm` для RHEL/Fedora, universal AppImage и `.pkg.tar.zst` для Arch Linux. Windows desktop task собирает NSIS installer. Отдельные builder/export jobs и публикация desktop builder-образов в GHCR убраны; проверка реального GitHub Actions runs продолжается после повторного запуска.

- Production Docker-контейнер собирается в отдельной job `docker` при `publish_docker=true`.
- Desktop-артефакты собираются через две matrix-задачи: `linux` и `windows`.
- Linux task в одном job собирает `desktop-linux-packages`: `.deb`, `.rpm`, AppImage и Arch `.pkg.tar.zst`.
- Windows task в одном job собирает `desktop-windows-packages`.
- Не запускать лишние отдельные builder/export jobs и не публиковать desktop builder images в GHCR.
