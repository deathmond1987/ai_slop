# Linux Desktop Build

This folder contains the Tauri 2 Linux desktop wrapper for Steam Calendar.

The desktop app does not run Next.js inside the WebView. It starts a local Node.js sidecar and redirects the Tauri window to the Next.js standalone server.

## Components

- `src-tauri/`: Rust Tauri app.
- `src-tauri/src/sidecar.rs`: sidecar manager, readiness probe, logging, restart/status commands.
- `src-tauri/tauri.conf.json`: Tauri config, external sidecar binary, staged app resources, Linux bundle settings.
- `src-tauri/binaries/`: generated target-specific sidecar binary source. This folder is generated and ignored.
- `.build/app/`: staged Next.js standalone app copied into the Tauri bundle as `app`.
- `scripts/build-sidecar.mjs`: stages `.build/app`, copies the current Node executable to target-specific sidecar binary names, and copies a dev sidecar into `src-tauri/target/debug`.
- `scripts/gen-icons.mjs`: generates PNG icons without external image tools.
- `web/index.html`: Tauri shell page that polls sidecar status and redirects to the local app.
- `Dockerfile.build`: validates the Linux build with Tauri webkit/GTK dependencies.

## Local Sidecar Validation

Build the Next.js standalone output:

```bash
npm ci
npm run build
node desktop_version/linux/scripts/gen-icons.mjs
node desktop_version/linux/scripts/build-sidecar.mjs
```

Start the staged sidecar manually:

```bash
HOSTNAME=127.0.0.1 \
PORT=3721 \
NODE_ENV=production \
DB_SQLITE_PATH=/tmp/steam-calendar-desktop.sqlite \
AUTH_BASE_URL=http://127.0.0.1:3721 \
COOKIE_SECURE=false \
node desktop_version/linux/.build/app/server.js
```

Probe health:

```bash
curl -fsS http://127.0.0.1:3721/api/health
```

The Rust sidecar uses a different SQLite path than this manual command. Tauri stores the desktop app data under the platform app data directory, for example:

```text
~/.local/share/com.steamcalendar.desktop/steam-calendar.sqlite
```

The Rust sidecar log is stored next to the desktop SQLite database:

```text
~/.local/share/com.steamcalendar.desktop/sidecar.log
```

## Tauri Dev

Install the Tauri CLI locally if it is not already available:

```bash
npm install -D @tauri-apps/cli
```

Run the desktop app:

```bash
npm run tauri --prefix desktop_version/linux dev
```

If a global or npx Tauri CLI is preferred:

```bash
npx --yes @tauri-apps/cli dev
```

Run that from `desktop_version/linux/src-tauri`.

## All Supported Desktop Builds

Build Linux and Windows desktop artifacts with one script:

```bash
bash build/all.sh
```

or:

```bash
npm run build:all
```

## Linux Package Build

Use Docker for reproducible Linux packaging because Tauri on Linux needs webkit/GTK system libraries.

The top-level wrapper script is:

```bash
bash build/linux.sh
```

or:

```bash
npm run build:linux
```

This wrapper runs:

1. `scripts/desktop/build-linux-docker.sh`: builds `steam-calendar-linux-build:latest` from `desktop_version/linux/Dockerfile.build`.
2. `scripts/desktop/export-linux-packages.sh`: copies normalized `.deb`, `.rpm` and AppImage artifacts from the build image into `out/linux`, then converts the exported `.deb` into an Arch Linux package using `archlinux:latest`.

The expected artifacts are:

```text
out/linux/steam-calendar_<version>_amd64.deb
out/linux/steam-calendar-<version>-1.x86_64.rpm
out/linux/steam-calendar_<version>_amd64.AppImage
out/linux/steam-calendar-<version>-1-x86_64.pkg.tar.zst
```

The Arch step verifies the package with:

```bash
pacman -U --noconfirm --nodeps <arch-package>
/usr/bin/steam-calendar-node --version
```

Run the Arch step manually with:

```bash
VERIFY_ARCH=1 npm run desktop:package:arch:linux
```

Use `VERIFY_ARCH=0` to skip the Arch install check.

Individual build stages are also available:

```bash
npm run docker:build:desktop-linux
npm run desktop:export:linux
npm run desktop:package:arch:linux
```

The Docker image build runs:

```bash
npm run desktop:build:linux
```

which stages the Next.js standalone sidecar and runs:

```bash
tauri build --config desktop_version/linux/src-tauri/tauri.conf.json --bundles deb rpm appimage --ci
```

Build a single Linux bundle directly when the host already has Tauri/GTK/webkit dependencies:

```bash
npm run desktop:build:linux:deb
npm run desktop:build:linux:rpm
npm run desktop:build:linux:appimage
```

## Headless Runtime Check

The current Linux image can be exercised under Xvfb after installing the desktop runtime dependencies:

```bash
docker run --rm steam-calendar-linux-build bash -lc '
  apt-get update
  apt-get install -y --no-install-recommends xauth xvfb libgtk-3-0 libwebkit2gtk-4.1-0 libsoup-3.0-0 libayatana-appindicator3-1 libnotify4 libssl3
  Xvfb :99 -screen 0 1024x768x24 >/tmp/xvfb.log 2>&1 &
  export DISPLAY=:99
  export WEBKIT_DISABLE_COMPOSITING_MODE=1
  export WEBKIT_DISABLE_DMABUF_RENDERER=1
  export LIBGL_ALWAYS_SOFTWARE=1
  export NO_AT_BRIDGE=1
  export DB_SQLITE_PATH=/tmp/steam-calendar-desktop-validation.sqlite
  ./desktop_version/linux/src-tauri/target/release/steam-calendar-desktop >/tmp/desktop.log 2>&1 &
  until curl -fsS http://127.0.0.1:3721/api/health >/tmp/health.json 2>/dev/null; do
    if ! pgrep -f steam-calendar-desktop >/dev/null; then
      echo "desktop process exited before sidecar became ready" >&2
      exit 1
    fi
    sleep 1
  done
  cat /tmp/health.json
  tail -60 /root/.local/share/com.steamcalendar.desktop/sidecar.log
'
```

Expected health response:

```json
{"ok":true}
```

Expected sidecar log line:

```text
sidecar ready on port 3721
```

## Sidecar Behavior

- Default port: `3721`.
- If `3721` is busy, the Rust sidecar scans nearby local ports.
- Status command: `sidecar_status`.
- Restart command: `restart_sidecar`.
- Status values: `idle`, `starting`, `ready`, `exited`, `failed`.
- Sidecar binary name: `steam-calendar-node`.
- Tauri bundle external binary pattern: `binaries/steam-calendar-node-<target-triple>`.

## Windows Cross-Build From Linux

Windows installer packaging is also Docker-based and writes artifacts to `out/windows`.

Top-level wrapper script:

```bash
bash build/windows.sh
```

or:

```bash
npm run build:windows
```

This wrapper runs:

1. `scripts/desktop/build-windows-docker.sh`: builds `steam-calendar-windows-build:latest` from `desktop_version/linux/Dockerfile.build.windows`.
2. `scripts/desktop/export-windows-packages.sh`: copies the NSIS installer from the build image into `out/windows`.

The expected artifact is:

```text
out/windows/steam-calendar_<version>_x64-setup.exe
```

The Windows image installs `cargo-xwin`, adds `x86_64-pc-windows-msvc`, fetches a Windows `node.exe` for the sidecar, and runs:

```bash
tauri build --config desktop_version/linux/src-tauri/tauri.windows.conf.json --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis --ci
```

The installer is an unsigned NSIS executable and contains `steam-calendar-desktop.exe`, `steam-calendar-node.exe`, and the uninstaller.

Custom NSIS includes live under `nsis/Win/`. The Windows Dockerfile installs `nsis-common` and copies `nsis/Win/RestartManager.nsh` into `/usr/share/nsis/Include/Win/RestartManager.nsh` so Tauri can compile its NSIS installer on Debian.

## Notes

- `bundle.externalBin` is configured as `binaries/steam-calendar-node`.
- `build-sidecar.mjs` copies the current Node executable to both the plain sidecar name and the target-specific name, for example `steam-calendar-node-x86_64-unknown-linux-gnu`.
- In `tauri dev`, `build.rs` can expose the staged `.build/app` directory to the sidecar manager. In release bundles, the sidecar uses the bundled `app` resource directory instead.
- The shell page uses Tauri IPC only before redirect. Once redirected, the Next.js app runs as a normal local HTTP app in the WebView.
- The Next.js app mounts `DesktopExternalLinks` in the root layout. Inside Tauri, only links explicitly marked `data-external="true"` are opened through `window.__TAURI__.shell.open`; local sidecar links stay inside the WebView.
- `src-tauri/capabilities/default.json` includes `shell:default` so the Tauri shell plugin permission needed by that interceptor is granted.
