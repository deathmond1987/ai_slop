# Build warnings worklist

Updated: 2026-11-05

## Baseline captured

- Command: `npm run check`
- Log: `.cache/check-warnings.log`
- Build-only command: `npm run build`
- Log: `.cache/build-warnings.log`
- Lint command: `npm run lint`
- Log: `.cache/lint-warnings.log`

Observed:

- `npm run build`: no Next.js build warnings.
- `npm run lint`: no ESLint warnings after removing local debug/cache artifacts.
- `npm test`: 8 Node warnings:
  - `[MODULE_TYPELESS_PACKAGE_JSON]`
  - Files:
    - `tests/aggregate-cache.test.ts`
    - `tests/cache-dedupe.test.ts`
    - `tests/calendar.test.ts`
    - `tests/ical.test.ts`
    - `tests/perf-config.test.ts`
    - `tests/release-dates.test.ts`
    - `tests/upcoming-candidates.test.ts`
    - `tests/wishlist-parser.test.ts`

## Worklist

- [x] Capture current build/check warning baseline.
- [x] Identify warning source: Node loads `.ts` test files as ES modules, but `package.json` does not specify `"type": "module"`.
- [x] Evaluate safe fix options.
- [x] Apply minimal safe fix: added `"type": "module"` to `package.json`.
- [x] Verify `npm test` no longer emits `MODULE_TYPELESS_PACKAGE_JSON` warnings.
- [x] Verify full `npm run check` still passes.
- [x] Mark final status and remaining notes.
- [x] Capture dependency warnings baseline for all installed dependencies.
- [x] Record dependency warnings in a dedicated section below.

## Chosen approach

Use the minimal fix recommended by Node itself:

```json
"type": "module"
```

Reason:

- Project TypeScript sources already use ESM imports.
- Scripts already use `.mjs` where needed.
- Adding package module type removes Node's CommonJS reparsing warning for `.ts` test/script execution.
- This does not change runtime logic, cache behavior, Steam logic, or Next.js app behavior.

## Verification checklist

Run after applying the fix:

```bash
npm test > .cache/test-after-module.log 2>&1
npm run check > .cache/check-after-module.log 2>&1
```

Expected:

- `npm test`: tests pass and no `MODULE_TYPELESS_PACKAGE_JSON` warnings.
- `npm run check`: exit code 0.
- No new lint errors or warnings.
- No Next.js build warnings.
- Tests and docs are not deleted.

## Completed result

Applied change:

```json
"type": "module"
```

Verification logs:

- `.cache/test-after-module.log`
  - tests: 45
  - pass: 45
  - fail: 0
  - no `MODULE_TYPELESS_PACKAGE_JSON` warnings found.

- `.cache/check-after-module.log`
  - exit code: 0
  - tests: 45 pass, 0 fail
  - typegen: success
  - lint: no warnings/errors
  - TypeScript: passed through `next build`
  - build: `Compiled successfully`
  - no `MODULE_TYPELESS_PACKAGE_JSON` warnings found.

Remaining notes:

- No app logic, Steam logic, calendar logic, cache logic, or perf defaults were changed.
- This worklist only removes Node test execution warnings caused by missing package module type.
- Next.js build itself still has no warnings in current baseline.

## Dependency warnings baseline captured

Commands:

```bash
npm install --dry-run > .cache/npm-install-dry.log 2>&1
npm install --package-lock-only --dry-run > .cache/npm-lock-dry.log 2>&1
npm ls --all > .cache/npm-ls-all.log 2>&1
npm outdated > .cache/npm-outdated.log 2>&1
npm outdated --all > .cache/npm-outdated-all.log 2>&1
npm outdated --all --json > .cache/npm-outdated-all.json 2>&1
npm audit --json > .cache/npm-audit-full.json 2>&1
```

Extracted dependency warning records:

- `.cache/dependency-warnings-unmet-optional.txt`
- `.cache/dependency-warnings-outdated-all.txt`
- `.cache/dependency-warnings-outdated-direct.txt`
- `.cache/dependency-warnings-audit.json`
- `.cache/dependency-warnings-deprecated-packages.txt`

Observed:

- `npm install --dry-run`: exit `0`; no install warnings.
- `npm install --package-lock-only --dry-run`: exit `0`; no lock/install warnings.
- `npm ls --all`: exit `0`; no `UNMET PEER`, `UNMET DEPENDENCY`, invalid, engine, or npm deprecated warnings; found 76 unmet optional dependency entries.
- `npm outdated`: exit `1`; 9 direct outdated entries recorded below.
- `npm outdated --all`: exit `1`; 214 unique outdated dependency rows, 84 rows have `current != wanted`; raw logs retained in `.cache/npm-outdated-all.log`, `.cache/npm-outdated-all.json`, and `.cache/dependency-warnings-outdated-all.txt`.
- `npm audit --json`: exit `1`; 8 moderate vulnerabilities recorded below.
- `package-lock.json`: 2 deprecated package entries recorded below.

## Dependency warnings recorded

### Direct outdated dependency warnings

From `npm outdated`:

| Package | Current | Wanted | Latest |
| --- | --- | --- | --- |
| `@tailwindcss/turbopack` | `4.3.3` | `4.3.4` | `4.3.4` |
| `@types/node` | `20.19.43` | `20.19.43` | `26.6.6` |
| `eslint` | `9.39.5` | `9.39.5` | `10.14.0` |
| `eslint-config-next` | `16.4.4` | `16.4.4` | `16.4.5` |
| `next` | `16.4.4` | `16.4.4` | `16.4.5` |
| `react` | `19.3.0` | `19.3.0` | `19.3.1` |
| `react-dom` | `19.3.0` | `19.3.0` | `19.3.1` |
| `tailwindcss` | `4.3.3` | `4.3.4` | `4.3.4` |
| `typescript` | `5.9.3` | `5.9.3` | `7.0.2` |

### Dependency vulnerability warnings

From `npm audit --json`. Total: 8 moderate vulnerabilities.

- `@typescript-eslint/eslint-plugin` (`range: >=6.16.0`, moderate, transitive): `fixAvailable: true`; via `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/utils`.
- `@typescript-eslint/parser` (`range: >=6.16.0`, moderate, transitive): `fixAvailable` is `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`; via `@typescript-eslint/typescript-estree`.
- `@typescript-eslint/type-utils` (`range: >=6.16.0`, moderate, transitive): `fixAvailable: true`; via `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`.
- `@typescript-eslint/typescript-estree` (`range: >=6.16.0`, moderate, transitive): `fixAvailable` is `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`; via `minimatch`.
- `@typescript-eslint/utils` (`range: >=6.16.0`, moderate, transitive): `fixAvailable` is `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`; via `@typescript-eslint/typescript-estree`.
- `eslint-config-next` (`range: >=15.6.0-canary.0`, moderate, direct): `fixAvailable` is `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`; via `typescript-eslint`.
- `minimatch` (`range: 7.0.0 - 11.0.0`, moderate, transitive): `fixAvailable` is `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`; via GHSA-g3hv-75wg-m249, `minimatch has potential denial of service via globparts amplification`.
- `typescript-eslint` (`range: *`, moderate, transitive): `fixAvailable` is `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`; via `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`.

### Deprecated dependency warnings

From `package-lock.json`:

- `node_modules/eslint@9.39.5`: `This version is no longer supported. Please see https://eslint.org/version-support for other options.`
- `node_modules/whatwg-encoding@3.1.1`: `Use @exodus/bytes instead for a more spec-conformant and faster implementation`

### Unmet optional dependency warnings

From `npm ls --all` and `.cache/dependency-warnings-unmet-optional.txt`:

```text
@img/sharp-darwin-arm64@0.35.5
@img/sharp-darwin-x64@0.35.5
@img/sharp-freebsd-wasm32@0.35.5
@img/sharp-libvips-darwin-arm64@1.3.4
@img/sharp-libvips-darwin-x64@1.3.4
@img/sharp-libvips-linux-arm64@1.3.4
@img/sharp-libvips-linux-arm@1.3.4
@img/sharp-libvips-linux-ppc64@1.3.4
@img/sharp-libvips-linux-riscv64@1.3.4
@img/sharp-libvips-linux-s390x@1.3.4
@img/sharp-libvips-linux-x64@1.3.4
@img/sharp-libvips-linuxmusl-arm64@1.3.4
@img/sharp-linux-arm64@0.35.5
@img/sharp-linux-arm@0.35.5
@img/sharp-linux-ppc64@0.35.5
@img/sharp-linux-riscv64@0.35.5
@img/sharp-linux-s390x@0.35.5
@img/sharp-linux-x64@0.35.5
@img/sharp-linuxmusl-arm64@0.35.5
@img/sharp-webcontainers-wasm32@0.35.5
@img/sharp-win32-arm64@0.35.5
@img/sharp-win32-ia32@0.35.5
@img/sharp-win32-x64@0.35.5
@next/swc-darwin-arm64@16.4.4
@next/swc-darwin-x64@16.4.4
@next/swc-linux-arm64-gnu@16.4.4
@next/swc-linux-arm64-musl@16.4.4
@next/swc-linux-x64-gnu@16.4.4
@next/swc-win32-arm64-msvc@16.4.4
@next/swc-win32-x64-msvc@16.4.4
@opentelemetry/api@^1.1.0
@playwright/test@^1.51.1
@tailwindcss/oxide-android-arm64@4.3.3
@tailwindcss/oxide-darwin-arm64@4.3.3
@tailwindcss/oxide-darwin-x64@4.3.3
@tailwindcss/oxide-freebsd-x64@4.3.3
@tailwindcss/oxide-linux-arm-gnueabihf@4.3.3
@tailwindcss/oxide-linux-arm64-gnu@4.3.3
@tailwindcss/oxide-linux-arm64-musl@4.3.3
@tailwindcss/oxide-linux-x64-gnu@4.3.3
@tailwindcss/oxide-wasm32-wasi@4.3.3
@tailwindcss/oxide-win32-arm64-msvc@4.3.3
@tailwindcss/oxide-win32-x64-msvc@4.3.3
@unrs/resolver-binding-android-arm-eabi@1.13.0
@unrs/resolver-binding-android-arm64@1.13.0
@unrs/resolver-binding-darwin-arm64@1.13.0
@unrs/resolver-binding-darwin-x64@1.13.0
@unrs/resolver-binding-freebsd-x64@1.13.0
@unrs/resolver-binding-linux-arm-gnueabihf@1.13.0
@unrs/resolver-binding-linux-arm-musleabihf@1.13.0
@unrs/resolver-binding-linux-arm64-gnu@1.13.0
@unrs/resolver-binding-linux-arm64-musl@1.13.0
@unrs/resolver-binding-linux-loong64-gnu@1.13.0
@unrs/resolver-binding-linux-loong64-musl@1.13.0
@unrs/resolver-binding-linux-ppc64-gnu@1.13.0
@unrs/resolver-binding-linux-riscv64-gnu@1.13.0
@unrs/resolver-binding-linux-riscv64-musl@1.13.0
@unrs/resolver-binding-linux-s390x-gnu@1.13.0
@unrs/resolver-binding-linux-x64-gnu@1.13.0
@unrs/resolver-binding-openharmony-arm64@1.13.0
@unrs/resolver-binding-win32-arm64-msvc@1.13.0
@unrs/resolver-binding-win32-ia32-msvc@1.13.0
@unrs/resolver-binding-win32-x64-msvc@1.13.0
babel-plugin-react-compiler@*
eslint-plugin-import-x@*
lightningcss-android-arm64@1.32.0
lightningcss-darwin-arm64@1.32.0
lightningcss-darwin-x64@1.32.0
lightningcss-freebsd-x64@1.32.0
lightningcss-linux-arm-gnueabihf@1.32.0
lightningcss-linux-arm64-gnu@1.32.0
lightningcss-linux-arm64-musl@1.32.0
lightningcss-linux-x64-gnu@1.32.0
lightningcss-win32-arm64-msvc@1.32.0
lightningcss-win32-x64-msvc@1.32.0
sass@^1.3.0
```

### Transitive outdated dependency warning records

From `npm outdated --all`:

- Exit code: `1`.
- Raw human-readable log: `.cache/npm-outdated-all.log`.
- Raw JSON log: `.cache/npm-outdated-all.json`.
- Extracted warning table: `.cache/dependency-warnings-outdated-all.txt`.
- Unique outdated dependency rows: `214`.
- Rows with `current != wanted`: `84`.
- Rows where `latest` is newer than `current`: `174`.
- Direct outdated dependency rows are expanded above; transitive rows are retained in extracted logs above.

## Dependency warning status

- Required dependency tree resolves successfully with `npm ls --all` exit `0`.
- No `UNMET PEER`, `UNMET DEPENDENCY`, invalid required dependency, engine, or install deprecation warnings were found.
- The recorded optional dependency warnings are mostly platform-specific native binaries that are not installed on the current Linux runtime or optional peer dependencies that are not used by this app.
- The audit fix path `npm audit fix --force` would downgrade `eslint-config-next` from `16.4.4` to `15.5.29`, marked `isSemVerMajor: true`; it was not applied.

## Dependency warnings review note

- Reviewed the recorded dependency warning sections and extracted log files.
- The recorded direct outdated warning table is complete for 9 direct packages.
- `.cache/dependency-warnings-outdated-summary.json` is useful for counts, but some direct rows are incomplete (`eslint`, `react`, `react-dom`, `tailwindcss`, `typescript`); use `.cache/dependency-warnings-outdated-direct.txt` as authoritative direct-outdated source.
- Recorded warning counts are consistent: 9 direct outdated entries, 8 moderate audit vulnerabilities, 2 deprecated package entries, 76 unmet optional entries, and 214 unique outdated dependency rows.
- No package files or installed dependency trees were changed during this review.

## Package warning classification

Classification buckets for recorded dependency warnings:

### Actionable audit warnings

- 8 moderate vulnerabilities form one dependency chain:
  - `eslint-config-next`
  - `typescript-eslint`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `@typescript-eslint/type-utils`
  - `@typescript-eslint/typescript-estree`
  - `@typescript-eslint/utils`
  - `minimatch`
- Current recorded chain versions from `package-lock.json`:
  - `eslint-config-next@16.4.4`
  - `typescript-eslint@8.72.1`
  - `@typescript-eslint/*@8.72.1`
  - nested `minimatch@10.2.6` under `@typescript-eslint/typescript-estree`
- Direct vulnerable package: `eslint-config-next`.
- Default audit fix path is unsafe:
  - `npm audit fix --force` would downgrade `eslint-config-next` from `16.4.4` to `15.5.29`.
  - That downgrade conflicts with the project's Next 16 major line and is marked `isSemVerMajor: true`.
- Classification: actionable audit issue, but not actionable via default `npm audit fix --force`.

### Safe outdated candidates

Direct package candidates from `npm outdated`:

| Package | Current | Target version | Classification |
| --- | --- | --- | --- |
| `tailwindcss` | `4.3.3` | `4.3.4` | Safe patch update candidate. |
| `@tailwindcss/turbopack` | `4.3.3` | `4.3.4` | Safe patch update candidate. |
| `next` | `16.4.4` | `16.4.5` | Likely safe patch update candidate, but must be validated because it is the app framework. |
| `react` | `19.3.0` | `19.3.1` | Likely safe patch update candidate, but must be validated with Next.js/React app checks. |
| `react-dom` | `19.3.0` | `19.3.1` | Likely safe patch update candidate, but must be validated with Next.js/React app checks. |
| `eslint-config-next` | `16.4.4` | `16.4.5` | Patch candidate, but must be evaluated with the audit chain mitigation. |

Direct packages with no recorded outdated warning:

- `cheerio`
- `iron-session`
- `playwright`
- `@types/react`
- `@types/react-dom`

### Major upgrade candidates to defer

Direct major-version outdated warnings:

| Package | Current | Latest | Classification |
| --- | --- | --- | --- |
| `eslint` | `9.39.5` | `10.14.0` | Deferred major upgrade candidate; installed 9.x is marked deprecated/no longer supported, so this needs compatibility review. |
| `typescript` | `5.9.3` | `7.0.2` | Deferred major upgrade candidate; must check Next.js typegen, app type checking, and `typescript-eslint` compatibility. |
| `@types/node` | `20.19.43` | `26.6.6` | Deferred major type/runtime compatibility candidate; must match the installed Node runtime target before changing. |

### Expected no-op unmet optional dependencies

The recorded 76 unmet optional dependency entries are expected no-ops for the current Linux runtime/dev target.

Platform/native optional binaries:

- `@img/sharp-*`
- `@next/swc-*`
- `@tailwindcss/oxide-*`
- `@unrs/resolver-binding-*`
- `lightningcss-*`

Optional peer dependencies not used by this app as installed:

- `@opentelemetry/api`
- `@playwright/test`
- `sass`
- `babel-plugin-react-compiler`
- `eslint-plugin-import-x`

Classification: expected no-op unless deploy target, image processing, Playwright test runner usage, Sass usage, React Compiler usage, or import-plugin configuration changes.

### Deprecated dependency warnings

- `eslint@9.39.5`
  - Recorded as deprecated/no longer supported in `package-lock.json`.
  - Classification: tied to the deferred major upgrade decision for ESLint 9.x → 10.x.
- `whatwg-encoding@3.1.1`
  - Transitive package reachable through `cheerio` → `encoding-sniffer` → `whatwg-encoding`.
  - Classification: monitor/wait for upstream dependency update; no direct `package.json` action unless later adding a transitive override.

### Transitive outdated warnings

- The scan recorded 205 transitive outdated rows.
- Transitive packages should not be edited directly in `package.json`.
- Some transitive versions will only change when top-level packages are updated or when `overrides` are added.
- `.cache/dependency-warnings-outdated-all.txt` has some `undefined` rows from the extractor, so direct-outdated data remains authoritative for package.json decisions.

### Classification result

- No package action should be applied yet.
- Next validation candidates:
  - `tailwindcss` and `@tailwindcss/turbopack` patch updates to `4.3.4`.
  - `next`, `react`, `react-dom`, and `eslint-config-next` patch candidates after separate evaluation.
- Audit mitigation candidates:
  - investigate safe overrides/updates for the `@typescript-eslint` and `minimatch` chain.
- Deferred due major upgrade risk:
  - `eslint`
  - `typescript`
  - `@types/node`
- No dependency-tree action needed for unmet optional platform/peer dependency warnings unless deploy target or feature usage changes.

## Tailwind patch update validation

Commands run in dry-run/validation mode only:

```bash
npm outdated tailwindcss @tailwindcss/turbopack > .cache/dependency-update-tailwind-outdated.log 2>&1
npm install --package-lock-only --dry-run tailwindcss@4.3.4 @tailwindcss/turbopack@4.3.4 > .cache/dependency-update-tailwind-lock-dry.log 2>&1
npm install --dry-run tailwindcss@4.3.4 @tailwindcss/turbopack@4.3.4 > .cache/dependency-update-tailwind-dry.log 2>&1
npm update tailwindcss @tailwindcss/turbopack --dry-run > .cache/dependency-update-tailwind-update-dry.log 2>&1
npm ls tailwindcss @tailwindcss/turbopack > .cache/dependency-update-tailwind-ls.log 2>&1
```

Results:

- `npm outdated tailwindcss @tailwindcss/turbopack`: exit `1` as expected for outdated packages.
- `npm install --package-lock-only --dry-run tailwindcss@4.3.4 @tailwindcss/turbopack@4.3.4`: exit `0`, no warnings.
- `npm install --dry-run tailwindcss@4.3.4 @tailwindcss/turbopack@4.3.4`: exit `0`, no warnings.
- `npm update tailwindcss @tailwindcss/turbopack --dry-run`: exit `0`, no warnings.
- `npm ls tailwindcss @tailwindcss/turbopack`: exit `0`, current installed tree remains `4.3.3` because nothing was applied.

Package constraints:

- `package.json` currently requires:
  - `"tailwindcss": "^4"`
  - `"@tailwindcss/turbopack": "^4"`
- Therefore `4.3.4` satisfies the current package.json constraints.

Target npm metadata:

- `@tailwindcss/turbopack@4.3.4` depends on:
  - `tailwindcss@4.3.4`
  - `@tailwindcss/node@4.3.4`
  - `@tailwindcss/oxide@4.3.4`
  - `@alloc/quick-lru@^5.2.0`

Dry-run resolution changes:

- Direct target changes:
  - `tailwindcss`: `4.3.3` -> `4.3.4`
  - `@tailwindcss/turbopack`: `4.3.3` -> `4.3.4`
- Related transitive changes:
  - `@tailwindcss/node`: `4.3.3` -> `4.3.4`
  - `@tailwindcss/oxide`: `4.3.3` -> `4.3.4`
  - `@tailwindcss/oxide-linux-x64-musl`: `4.3.3` -> `4.3.4`
  - `@tailwindcss/oxide-wasm32-wasi`: added at `4.3.4`
  - `lightningcss`: `1.32.0` -> `1.33.0`
  - `lightningcss-linux-x64-musl`: `1.32.0` -> `1.33.0`
  - `magic-string`: `0.30.21` -> `1.4.5`
  - `enhanced-resolve`: `5.26.0` -> `5.26.1`

No warnings found in these logs:

- No `EBADENGINE`.
- No `UNMET PEER` or `UNMET DEPENDENCY`.
- No invalid dependency tree.
- No install deprecation warnings.
- No package.json/package-lock.json changes were applied during validation.

Recommended action if approved:

```bash
npm update tailwindcss @tailwindcss/turbopack
```

This is the preferred form because existing `^4` constraints already allow `4.3.4`, and dry-run shows the direct/target update resolves cleanly.

## Exact-pinned patch update evaluation

Targets evaluated without applying package changes:

- `next`: `16.4.4` -> `16.4.5`
- `react`: `19.3.0` -> `19.3.1`
- `react-dom`: `19.3.0` -> `19.3.1`
- `eslint-config-next`: `16.4.4` -> `16.4.5`

Initial direct dry-run command in the project tree unexpectedly left `node_modules` at candidate versions while `package.json` and `package-lock.json` stayed at current pinned versions. The installed tree was restored with:

```bash
npm ci
```

After restore:

```bash
npm ls next react react-dom eslint-config-next
```

Result:

```text
+-- eslint-config-next@16.4.4
+-- next@16.4.4
| +-- react-dom@19.3.0 deduped
| +-- react@19.3.0 deduped
| `-- styled-jsx@5.1.6
|   `-- react@19.3.0 deduped
+-- react-dom@19.3.0
| `-- react@19.3.0 deduped
`-- react@19.3.0
```

Isolated dry-run evaluation was then run in `.cache/dependency-eval-core` to avoid mutating the main installed tree:

```bash
mkdir -p .cache/dependency-eval-core
cp package.json package-lock.json .cache/dependency-eval-core/
node -v > .cache/dependency-eval-core/node.version.log 2>&1
cd .cache/dependency-eval-core
npm install --package-lock-only --dry-run --json next@16.4.5 react@19.3.1 react-dom@19.3.1 eslint-config-next@16.4.5 > core-lock-dry-json.log 2>&1
npm install --dry-run --json next@16.4.5 react@19.3.1 react-dom@19.3.1 eslint-config-next@16.4.5 > core-install-dry-json.log 2>&1
```

Exit/status:

- `node -v`: `v24.22.1`.
- `npm install --package-lock-only --dry-run --json`: exit `0`.
- `npm install --dry-run --json`: exit `0`.
- No `EBADENGINE`, `UNMET PEER`, `UNMET DEPENDENCY`, invalid dependency tree, install deprecation, peer-invalid, or warning records were found in the isolated dry-run logs.

Direct npm metadata findings:

- `next@16.4.5`:
  - `engines.node`: `>=20.9.0`.
  - `peerDependencies.react`: `^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0`.
  - `peerDependencies.react-dom`: same range as `react`.
  - Direct dependencies include `@next/env@16.4.5`, `styled-jsx@5.1.6`, `@swc/helpers@0.5.23`, `caniuse-lite@^1.0.30001579`, and `baseline-browser-mapping@^2.9.19`.
- `react@19.3.1`:
  - No direct dependencies listed by `npm view`.
  - `engines.node`: `>=0.10.0`.
- `react-dom@19.3.1`:
  - Depends on `scheduler@^0.28.0`.
  - `peerDependencies.react`: `^19.3.1`.
  - Therefore `react` and `react-dom` must be updated together if this patch update is applied.
- `eslint-config-next@16.4.5`:
  - `peerDependencies.eslint`: `>=9.0.0`.
  - `peerDependencies.typescript`: `>=3.3.1`.
  - Current local `eslint@9.39.5` and `typescript@5.9.3` satisfy these peers.
  - Depends on `@next/eslint-plugin-next@16.4.5`, `typescript-eslint@^8.56.0`, `eslint-plugin-react@^7.37.0`, `eslint-plugin-import@^2.32.0`, `eslint-plugin-jsx-a11y@^6.10.0`, `eslint-plugin-react-hooks@^7.1.0`, `eslint-import-resolver-node@^0.3.6`, `eslint-import-resolver-typescript@^3.5.2`, and `globals@16.4.0`.
  - The audit chain through `typescript-eslint` remains present; this patch update alone is not expected to resolve the `minimatch` advisory chain.

Resolution notes from isolated dry-run:

- Target direct packages resolve cleanly:
  - `next@16.4.5`
  - `react@19.3.1`
  - `react-dom@19.3.1`
  - `eslint-config-next@16.4.5`
- Related target-aligned transitive packages observed:
  - `@next/env@16.4.5`
  - `@next/swc-linux-x64-musl@16.4.5`
  - `@next/eslint-plugin-next@16.4.5`
- Existing non-target package families remained on current versions in the isolated resolution:
  - `tailwindcss@4.3.3`
  - `@tailwindcss/turbopack@4.3.3`
  - `eslint@9.39.5`
  - `typescript@5.9.3`
  - `typescript-eslint@8.72.1`

Recommended action if approved:

```bash
npm install --save-exact next@16.4.5 react@19.3.1 react-dom@19.3.1 eslint-config-next@16.4.5
```

This preserves the project's current exact-pinning style and avoids using `npm audit fix --force`, which would downgrade `eslint-config-next` to `15.5.29`.

## Audit mitigation evaluation

Point: plan audit mitigation for the `minimatch` vulnerability chain without using the unsafe `npm audit fix --force` downgrade.

Unsafe option:

```bash
npm audit fix --force
```

Reason:
- `npm audit --json` reports `fixAvailable` for the vulnerable chain as `{ name: "eslint-config-next", version: "15.5.29", isSemVerMajor: true }`.
- That downgrade conflicts with the current direct constraint `eslint-config-next@16.4.4`.

Non-force candidate:

```json
"overrides": {
  "@typescript-eslint/typescript-estree": {
    "minimatch": "11.0.4"
  }
}
```

Reason:
- The advisory is `GHSA-g3hv-75wg-m249`: `minimatch` `>=7.0.0 <11.0.1` is vulnerable to potential denial of service via globparts amplification.
- The vulnerable nested package is `minimatch@10.2.6` under `@typescript-eslint/typescript-estree`.
- `minimatch@11.0.4` is a fixed version outside the vulnerable range.
- Current Node runtime is `v24.22.1`, satisfying `minimatch@11.0.4` engines (`20 || >=22`).

Isolated override evaluation:

```bash
npm install --package-lock-only --prefix .cache/audit-mitigation-eval
npm install --prefix .cache/audit-mitigation-eval
npm ls --prefix .cache/audit-mitigation-eval next react react-dom eslint-config-next minimatch @typescript-eslint/typescript-estree
npm audit --prefix .cache/audit-mitigation-eval --json
```

Observed:
- `@typescript-eslint/typescript-estree@8.72.1` resolved `minimatch@11.0.4 overridden`.
- Other packages using `minimatch@3.1.5` were not affected.
- `npm audit --json` reported `0` vulnerabilities.
- No `EBADENGINE`, `UNMET PEER`, `UNMET DEPENDENCY`, invalid dependency tree, or install-resolution warnings were found.
- Only pre-existing deprecated warnings appeared:
  - `eslint@9.39.5`
  - `whatwg-encoding@3.1.1`

Combined candidate evaluation:

Exact-pinned candidate plus override evaluated in `.cache/audit-mitigation-combined-eval`:

```json
"dependencies": {
  "next": "16.4.5",
  "react": "19.3.1",
  "react-dom": "19.3.1",
  "eslint-config-next": "16.4.5"
},
"overrides": {
  "@typescript-eslint/typescript-estree": {
    "minimatch": "11.0.4"
  }
}
```

Observed:
- `lock_status=0`, `install_status=0`, `ls_status=0`, `audit_status=0`.
- `next@16.4.5`, `react@19.3.1`, `react-dom@19.3.1`, `eslint-config-next@16.4.5` resolved.
- `@typescript-eslint/typescript-estree@8.72.1` resolved `minimatch@11.0.4 overridden`.
- Other packages using `minimatch@3.1.5` were not affected.
- `npm audit --json` reported `0` vulnerabilities.
- Install warnings were only deprecated warnings:
  - `whatwg-encoding@3.1.1`
  - `eslint@9.39.5`

Caveat:
- `@typescript-eslint/typescript-estree@8.72.1` declares `minimatch: ^10.2.2`.
- Forcing `minimatch@11.0.4` is a deliberate audit mitigation, not a semver-compatible upstream update.
- Runtime/test verification is still required before applying this override to the main project.

Recommended mitigation plan if approved:
1. Apply exact-pinned package updates if approved.
2. Add scoped `minimatch@11.0.4` override under `@typescript-eslint/typescript-estree`.
3. Run `npm install`.
4. Run `npm audit --json` and confirm zero vulnerabilities.
5. Run `npm ls` and confirm only the intended override appears.
6. Run `npm test`, `npm run lint`, `npm run build`, and `npm run check`.

## Non-breaking override/update option review

Point: check non-breaking override/update options for the `@typescript-eslint` chain and `minimatch`.

Current `package-lock.json` evidence:
- Vulnerable nested package:
  - `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch`
  - version: `10.2.6`
  - dependency: `brace-expansion@^5.0.8`
  - engines: `18 || 20 || >=22`
- Other root-level `minimatch`:
  - `node_modules/minimatch`
  - version: `3.1.5`
  - not in the recorded `GHSA-g3hv-75wg-m249` vulnerable range (`>=7.0.0 <11.0.1`).

Available update options:
- `eslint-config-next@16.4.5` still depends on `typescript-eslint@^8.56.0`.
- `typescript-eslint@8.72.1` is the current latest observed stable version and still depends on current `@typescript-eslint/*@8.72.1`.
- `@typescript-eslint/typescript-estree@8.72.1` still declares `minimatch@^10.2.2`.
- Therefore there is no plain non-breaking dependency update path from `@typescript-eslint/typescript-estree@8.72.1` to a fixed `minimatch` version.

Safe override option:
- Use a scoped npm override instead of a global `minimatch` override.
- Candidate:

```json
"overrides": {
  "@typescript-eslint/typescript-estree": {
    "minimatch": "11.0.4"
  }
}
```

Why this is the preferred non-force mitigation:
- It targets only the vulnerable nested dependency path.
- It does not modify `eslint-config-next`, `next`, `react`, or `react-dom` major versions.
- It does not downgrade `eslint-config-next` to `15.5.29`.
- It does not affect unrelated `minimatch@3.1.5` entries used by other ESLint-related packages.
- It produced `npm audit` total `0` in isolated and combined evaluation trees.

Important caveat:
- `11.0.4` is outside the upstream declared range `^10.2.2` for `@typescript-eslint/typescript-estree@8.72.1`.
- This is an intentional audit mitigation override, not a semver-compatible upstream update.
- Main-project application should be followed by tests, lint, build, and `npm ls` review.

Major update options intentionally not treated as current non-breaking mitigations:
- Upgrading `eslint` from `9.x` to `10.x`.
- Upgrading `typescript` from `5.x` to `7.x`.
- Upgrading `@types/node` from `20.x` to `26.x`.
- Downgrading `eslint-config-next` via `npm audit fix --force`.

## Unmet optional dependency warning review

Scope: review the 76 unmet optional dependency entries and identify only relevant cases.

Classification:
- These are optional platform/feature variants declared by installed packages, not failures of the main dependency graph.
- `npm ls --all` exited `0` and did not report `UNMET PEER`, `UNMET DEPENDENCY`, invalid dependency tree, engine, or deprecated install warnings.
- Build/test/lint already pass with the current optional package resolution.

Relevant installed optional packages for the current environment:
- `@next/swc-linux-x64-musl`
- `@tailwindcss/oxide-linux-x64-musl`
- `@unrs/resolver-binding-linux-x64-musl`
- `lightningcss-linux-x64-musl`
- `sharp`
- `@img/sharp-linuxmusl-x64`
- `@img/sharp-libvips-linuxmusl-x64`

Interpretation:
- The current local runtime is Linux x86_64 and is using musl variants, not glibc variants.
- Next.js build succeeds with `@next/swc-linux-x64-musl`.
- Tailwind CSS succeeds with `@tailwindcss/oxide-linux-x64-musl`.
- ESLint/TypeScript resolution succeeds with `@unrs/resolver-binding-linux-x64-musl`.
- Lightning CSS succeeds with `lightningcss-linux-x64-musl`.
- Next.js image functionality has `sharp` and matching musl native dependencies installed.

Not relevant unless usage/deployment target changes:
- macOS, Windows, ARM, riscv64, ppc64, s390x, FreeBSD, wasm, and other platform variants for:
  - `@next/swc-*`
  - `@tailwindcss/oxide-*`
  - `@unrs/resolver-binding-*`
  - `lightningcss-*`
  - `@img/sharp-*`
- Optional peer/feature variants that are not currently required by the app scripts:
  - `@opentelemetry/api`
  - `@playwright/test`
  - `sass`
  - `babel-plugin-react-compiler`
  - `eslint-plugin-import-x`

Decision:
- No action needed for unmet optional dependencies under the current target and current test/build success.
- Revisit only if deployment target changes to glibc Linux, macOS, Windows, ARM, or another architecture, or if OpenTelemetry, Playwright tests, Sass, React Compiler, or alternate import plugins are introduced.

## Deprecated dependency warning review

Recorded deprecated dependency warnings:

1. `node_modules/eslint@9.39.5`
   - Message: `This version is no longer supported. Please see https://eslint.org/version-support for other options.`
   - Direct dependency constraint: `eslint: ^9`.
   - Current installed version is the latest observed `9.x` version.
   - Non-breaking replacement within `^9` is not available.
   - Direct upgrade to `eslint@10.x` is a major dependency change and remains deferred until separately approved and tested.
   - Relevance: relevant as a future major upgrade candidate, but no immediate non-breaking mitigation under current constraints.

2. `node_modules/whatwg-encoding@3.1.1`
   - Message: `Use @exodus/bytes instead for a more spec-conformant and faster implementation`
   - Dependency path:
     - `cheerio@1.2.0`
     - `encoding-sniffer@0.2.1`
     - `whatwg-encoding@3.1.1`
   - `cheerio@1.2.0` is current direct dependency latest observed stable version and still depends on `encoding-sniffer@^0.2.1`.
   - `whatwg-encoding@3.1.1` is still the latest version of `whatwg-encoding` and remains deprecated.
   - Relevance: relevant only as a transitive warning under `cheerio`, which is used for Steam HTML parsing.

Non-force mitigation candidate for `whatwg-encoding`:

```json
"overrides": {
  "cheerio": {
    "encoding-sniffer": "1.0.2"
  }
}
```

Evidence from isolated evaluation:
- Command logs:
  - `.cache/deprecated-encoding-sniffer-eval/lock-with-encoding-sniffer-override.log`
  - `.cache/deprecated-encoding-sniffer-eval/install-with-encoding-sniffer-override.log`
  - `.cache/deprecated-encoding-sniffer-eval/ls-with-encoding-sniffer-override.log`
- Resolved tree:
  - `cheerio@1.2.0`
  - `encoding-sniffer@1.0.2 overridden`
  - `@exodus/bytes@1.16.0`
- Result:
  - `whatwg-encoding` no longer appears in the evaluated dependency path.
  - Install warnings no longer include `whatwg-encoding@3.1.1`.
  - Remaining install warning in that evaluation: deprecated `eslint@9.39.5`.

Decision:
- Do not apply the `cheerio -> encoding-sniffer@1.0.2` override yet.
- It is a candidate transitive override requiring runtime validation of HTML parsing behavior before applying to the main project.
- Keep the `whatwg-encoding` warning visible as a low-risk transitive warning for now unless dependency hygiene cleanup is approved.

## Selected warning handling decisions

Current dependency-state status:
- No dependency versions have been changed in the main `package.json` or `package-lock.json`.
- Main installed tree remains restored from current lockfile:
  - `next@16.4.4`
  - `react@19.3.0`
  - `react-dom@19.3.0`
  - `eslint-config-next@16.4.4`
- The only known dependency-metadata change in main `package.json` remains the previously verified `"type": "module"` fix.

1. Direct outdated dependency decisions:
- `next`, `react`, `react-dom`, `eslint-config-next`:
  - Approved-for-review candidate: exact patch updates.
  - Candidate versions:
    - `next@16.4.5`
    - `react@19.3.1`
    - `react-dom@19.3.1`
    - `eslint-config-next@16.4.5`
  - Candidate command:
    ```bash
    npm install --save-exact next@16.4.5 react@19.3.1 react-dom@19.3.1 eslint-config-next@16.4.5
    ```
  - Status: evaluated, not applied.
- `tailwindcss`, `@tailwindcss/turbopack`:
  - Approved-for-review candidate: normal patch updates within existing caret ranges.
  - Candidate versions:
    - `tailwindcss@4.3.4`
    - `@tailwindcss/turbopack@4.3.4`
  - Candidate command:
    ```bash
    npm update tailwindcss @tailwindcss/turbopack
    ```
  - Status: evaluated, not applied.
- `@types/node`, `eslint`, `typescript`:
  - Current version still satisfies wanted version, but latest versions are major jumps.
  - Status: deferred major upgrades; not non-breaking.

2. Audit vulnerability decision:
- Do not use:
  ```bash
  npm audit fix --force
  ```
- Reason: it would downgrade `eslint-config-next` to `15.5.29`, a major/unsafe action for this project.
- Preferred mitigation:
  - Apply exact-pinned core patch updates only if approved.
  - Add scoped override:
    ```json
    "overrides": {
      "@typescript-eslint/typescript-estree": {
        "minimatch": "11.0.4"
      }
    }
    ```
  - Then reinstall, audit, inspect `npm ls`, and run full checks.
- Status: evaluated, not applied.

3. Unmet optional dependency decision:
- No action needed now.
- Current runtime uses relevant musl optional packages:
  - `@next/swc-linux-x64-musl`
  - `@tailwindcss/oxide-linux-x64-musl`
  - `@unrs/resolver-binding-linux-x64-musl`
  - `lightningcss-linux-x64-musl`
  - `sharp`
  - `@img/sharp-linuxmusl-x64`
  - `@img/sharp-libvips-linuxmusl-x64`
- Revisit only when deployment target changes or optional features are introduced.

4. Deprecated dependency decision:
- `eslint@9.39.5`:
  - Relevant direct warning.
  - No non-breaking fix within `eslint@^9`.
  - Deferred candidate: separately evaluate major upgrade to `eslint@10.x`.
- `whatwg-encoding@3.1.1`:
  - Relevant transitive warning through `cheerio`.
  - Candidate scoped override:
    ```json
    "overrides": {
      "cheerio": {
        "encoding-sniffer": "1.0.2"
      }
    }
    ```
  - This override removes the evaluated `whatwg-encoding` warning but needs HTML parsing runtime validation.
  - Status: evaluated, not applied.

Recommended next approval sequence:
1. Apply approved exact-pinned core updates.
2. Apply approved scoped `minimatch@11.0.4` override.
3. Run:
   ```bash
   npm install
   npm audit --json > .cache/npm-audit-after-mitigation.json
   npm ls next react react-dom eslint-config-next minimatch @typescript-eslint/typescript-estree > .cache/npm-ls-after-mitigation.log
   npm test > .cache/test-after-mitigation.log 2>&1
   npm run lint > .cache/lint-after-mitigation.log 2>&1
   npm run build > .cache/build-after-mitigation.log 2>&1
   npm run check > .cache/check-after-mitigation.log 2>&1
   ```
4. Review logs for new warnings.
5. Consider the separate `cheerio -> encoding-sniffer@1.0.2` override only if warning cleanup is approved.

## Applied step-by-step dependency mitigation

Updated: 2026-11-05

State snapshots:
- `.cache/apply-state-backup/package.step0-approved-start.json`
- `.cache/apply-state-backup/package-lock.step0-approved-start.json`
- `.cache/apply-state-backup/package.after-core-and-minimatch.json`
- `.cache/apply-state-backup/package-lock.after-core-and-minimatch.json`

Applied step 1: Tailwind patch pair
- Command:
  ```bash
  npm update tailwindcss @tailwindcss/turbopack
  ```
- Result:
  - `tailwindcss@4.3.4`
  - `@tailwindcss/turbopack@4.3.4`
- Verification:
  - `.cache/apply-01-tailwind.status`: `update=0`, `ls=0`
  - `.cache/apply-01-tailwind-check.status`: `check=0`
  - `.cache/apply-01-tailwind-check.log`: 45 tests pass, typegen success, lint clean, build success, no Next.js build warnings.

Applied step 2: `react` exact patch
- Command:
  ```bash
  npm install --save-exact react@19.3.1
  ```
- Result:
  - `react@19.3.1`
- Verification:
  - `.cache/apply-02-react.status`: `install=0`, `ls=0`, `check=0`
  - `.cache/apply-02-react-check.log`: 45 tests pass, lint clean, build success.

Applied step 3: `react-dom` exact patch
- Command:
  ```bash
  npm install --save-exact react-dom@19.3.1
  ```
- Result:
  - `react-dom@19.3.1`
- Verification:
  - `.cache/apply-03-react-dom.status`: `install=0`, `ls=0`, `check=0`
  - `.cache/apply-03-react-dom-check.log`: 45 tests pass, lint clean, build success.

Applied step 4: `next` exact patch
- Command:
  ```bash
  npm install --save-exact next@16.4.5
  ```
- Result:
  - `next@16.4.5`
- Verification:
  - `.cache/apply-04-next.status`: `install=0`, `ls=0`, `check=0`
  - `.cache/apply-04-next-check.log`: 45 tests pass, lint clean, build success, Next.js 16.4.5 Turbopack.

Applied step 5: `eslint-config-next` exact patch
- Command:
  ```bash
  npm install --save-exact eslint-config-next@16.4.5
  ```
- Result:
  - `eslint-config-next@16.4.5`
  - `@next/eslint-plugin-next@16.4.5`
- Verification:
  - `.cache/apply-05-eslint-config-next.status`: `install=0`, `ls=0`, `check=0`
  - `.cache/apply-05-eslint-config-next-check.log`: 45 tests pass, lint clean, build success.

Applied step 6: scoped audit mitigation override
- Added to `package.json`:
  ```json
  "overrides": {
    "@typescript-eslint/typescript-estree": {
      "minimatch": "11.0.4"
    }
  }
  ```
- Command:
  ```bash
  npm install
  ```
- Result:
  - vulnerable nested `@typescript-eslint/typescript-estree -> minimatch` changed from `10.2.6` to `11.0.4 overridden`
  - unrelated `minimatch@3.1.5` consumers remained unchanged
  - `npm audit --json`: `total: 0`
- Verification:
  - `.cache/apply-06-minimatch-override.status`: `install=0`, `ls=0`, `audit=0`, `check=0`
  - `.cache/apply-06-minimatch-override-audit.json`: zero vulnerabilities
  - `.cache/apply-06-minimatch-override-check.log`: 45 tests pass, typegen success, lint clean, build success

Applied step 7: `whatwg-encoding` warning cleanup override
- Added to `package.json`:
  ```json
  "overrides": {
    "cheerio": {
      "encoding-sniffer": "1.0.2"
    }
  }
  ```
- Command:
  ```bash
  npm install
  ```
- Result:
  - `cheerio@1.2.0`
  - `encoding-sniffer@1.0.2 overridden`
  - `@exodus/bytes@1.16.0`
  - `whatwg-encoding@3.1.1` no longer present in the evaluated path
  - `npm audit --json`: `total: 0`
- Verification:
  - `.cache/apply-07-encoding-sniffer-override.status`: `install=0`, `ls=0`, `audit=0`, `check=0`
  - `.cache/apply-07-encoding-sniffer-override-check.log`: 45 tests pass, typegen success, lint clean, build success
  - HTML parsing tests passed:
    - `wishlist page parser extracts items, total count, titles, covers and release text`
    - `wishlist page parser distinguishes private no-items pages from public empty pages`
    - `wishlist API parser handles JSON, protobuf count and protobuf items`

Current post-application status:
- `npm audit`: 0 vulnerabilities.
- `npm run check`: passes.
- Direct dependencies now:
  - `next@16.4.5`
  - `react@19.3.1`
  - `react-dom@19.3.1`
- Relevant dev dependencies now:
  - `eslint-config-next@16.4.5`
  - `tailwindcss@4.3.4` via `^4`
  - `@tailwindcss/turbopack@4.3.4` via `^4`
- Remaining known warnings:
  - deprecated direct `eslint@9.39.5`: still relevant, but no non-breaking `9.x` replacement exists; major upgrade remains deferred.
  - unmet optional dependencies: no action needed for current musl Linux x86_64 target.
  - major upgrade candidates remain deferred:
    - `eslint@9` to `10`
    - `typescript@5` to `7`
    - (`@types/node@20` to `26` applied later; see section below)
## ESLint major upgrade experiment (eslint 9 -> 10)

Attempted on request. Backup captured before this experiment:
- `.cache/apply-state-backup/package.before-eslint-v10.json`
- `.cache/apply-state-backup/package-lock.before-eslint-v10.json`

### Change applied
- `eslint` raised to `^10.14.0` (`eslint@10.14.0` installed).
- Install output: `npm warn ERESOLVE overriding peer dependency` (repeated), install exit 0.
- Because `eslint@10` pulls a vulnerable `minimatch` chain, two scoped overrides were added to keep audit clean:
  ```json
  "overrides": {
    "eslint": {
      "minimatch": "11.0.4",
      "@eslint/config-array": {
        "minimatch": "11.0.4"
      }
    }
  }
  ```
  Result: `minimatch@11.0.4 overridden` under both `eslint` and `@eslint/config-array`.

### Full check result (current state)
- `.cache/final-eslint-v10.status`: `check=0`, `audit=0`.
- `.cache/final-eslint-v10-check.log`: 45 tests pass / 0 fail, typegen success, `eslint` step clean, Next build success.
- `npx eslint . --format json`: exit 0, no lint warnings/errors.
- `npm audit`: `found 0 vulnerabilities`.

### Important signal (why the tree is not clean)
- `npm ls eslint eslint-config-next minimatch @eslint/config-array` exits with `ELSPROBLEMS` / `npm error invalid: eslint@10.14.0`.
- The eslint plugins bundled by `eslint-config-next@16.4.5` do not declare eslint 10 support, and newer plugin releases do not yet close this gap:
  - `eslint-plugin-import@2.32.0` (latest): peer tops out at `^9`.
  - `eslint-plugin-jsx-a11y@6.10.2` (latest): peer tops out at `^9`.
  - `eslint-plugin-react@7.37.5` (latest): peer tops out at `^9.7`.
  - `eslint-plugin-react-hooks@7.1.1` (latest): already supports `^10`.
  - `typescript-eslint@8.72.1` (latest): already supports `^10`.
  - `eslint-config-next@16.4.5` (latest): peer `>=9.0.0` (accepts 10 at config level).
- Conclusion: eslint 10 runs correctly in this project (lint/build/tests pass), but the dependency tree is only reachable by forcing peer overrides; it is not a fully upstream-qualified Next.js lint toolchain for eslint 10 yet.

### Current state and decision point
- Tree currently holds eslint 10 with peer conflicts overridden and extra scoped minimatch overrides.
- Functional checks pass, but `npm ls` reports an invalid peer tree.
- Revert path is ready via the `.before-eslint-v10` backups (`eslint@9`), which keeps a fully valid peer tree but re-exposes the `eslint@9` deprecation advisory.
- Decision: revert to `eslint@9`.

### Revert executed (final state)
- Restored `package.json` and `package-lock.json` from `.cache/apply-state-backup/package.before-eslint-v10.*` and reinstalled.
- Final state:
  - `eslint@9.39.5` (range `^9`), `eslint-config-next@16.4.5`.
  - `npm ls eslint minimatch`: exit 0, no `ELSPROBLEMS` — fully valid peer tree.
  - `.cache/revert-eslint-v9.status`: `check=0`, `audit=0`, `ls=0`.
  - `.cache/revert-eslint-v9-check.log`: 45 tests pass / 0 fail, typegen success, lint clean, Next 16.4.5 build success.
  - `npm audit`: `found 0 vulnerabilities`.
- The eslint-10 scoped `minimatch` overrides were removed as part of the revert (no longer needed for eslint 9). Remaining overrides keep the two still-relevant mitigations: `@typescript-eslint/typescript-estree.minimatch@11.0.4` and `cheerio.encoding-sniffer@1.0.2`.
- Consequence: the deprecated `eslint@9` advisory is intentionally deferred until `eslint-config-next` and its bundled plugins (import / jsx-a11y / react) publish eslint-10-compatible releases. Re-test then.

## `@types/node` major upgrade experiment (20 -> 26)

Applied on request. This is a types-only dev dependency; no runtime code affected.

### Pre-check
- Declared range was `^20`; latest `@types/node@26.6.6`.
- `npm ls @types/node`: only the root project depends on it — no transitive/peer consumers.
- No package in the tree declares a peer constraint on `@types/node` (checked `next`, `typescript-eslint`, `@typescript-eslint/parser`, `eslint-config-next`). So there is no peer-conflict / `ELSPROBLEMS` risk. The only possible failure mode was type-level incompatibility with Next 16 / React 19.

### Change applied
- Backup before change: `.cache/apply-state-backup/package.before-types-node-v26.json` and `package-lock.before-types-node-v26.json`.
- Command: `npm install --save-dev '@types/node@^26'` -> `@types/node@26.6.6` installed, `npm ls` clean.

### Full check result (kept)
- `.cache/apply-10-types-node-v26.status`: `check=0`, `audit=0`.
- `.cache/apply-10-types-node-v26-check.log`: 45 tests pass / 0 fail, `next typegen` success, `Running TypeScript ... Finished TypeScript` with no `error TS`, Next 16.4.5 Turbopack build success.
- `npm audit`: `found 0 vulnerabilities`.
- `npm ls @types/node`: exit 0.
- Result: accepted, `@types/node` range is now `^26.6.6`. No overrides were needed.

### Remaining deferred majors
- `eslint@9` to `10`: deferred (blocked on plugin peer qualification; see eslint experiment above).
- `typescript@5` to `6.0.3`: applied. `typescript@6.0.3` is inside the current `typescript-eslint` peer range (`typescript >=4.8.4 <6.1.0`) and passed the full check.
- `typescript@6` or `5` to `7.0.2`: deferred. `7.0.2` is outside the current `typescript-eslint@8.72.1` peer range (`typescript >=4.8.4 <6.1.0`) and outside the `eslint-config-next@16.4.5` bundled dependency path (`typescript-eslint@^8.56.0`). Attempting it would likely reproduce the eslint-10 situation: forced peer overrides plus `npm ls` `ELSPROBLEMS`. Re-test when a released `typescript-eslint` version supports TypeScript 7.

## `typescript` major update (5 -> 6.0.3)

### Pre-check
- Latest TypeScript tag: `7.0.2`.
- Stable compatible line: `6.0.3`, which satisfies `typescript-eslint@8.72.1` peer `typescript >=4.8.4 <6.1.0`.
- Current lint toolchain depends on TypeScript through `eslint-config-next@16.4.5 -> typescript-eslint@^8.56.0`.
- Current resolved `typescript-eslint@8.72.1` peer ceiling is still `typescript <6.1.0`; no 9.x `typescript-eslint` line was found on npm.
- `next@16.4.5` does not hard-depend on or peer-require `typescript`.

### Change applied
- Backup before change: `.cache/apply-state-backup/package.before-typescript-v6.json` and `package-lock.before-typescript-v6.json`.
- Command: `npm install --save-dev typescript@6.0.3`.
- Result: package range `^6.0.3`, installed `typescript@6.0.3`.

### Full check result (kept)
- `.cache/apply-11-typescript-v6.status`: `check=0`, `audit=0`, `ls=0`.
- `.cache/apply-11-typescript-v6-install.log`: `found 0 vulnerabilities`.
- `.cache/apply-11-typescript-v6-audit.log`: `found 0 vulnerabilities`.
- `.cache/apply-11-typescript-v6-check.log`: 45 tests pass / 0 fail, `next typegen` success, `Running TypeScript ... Finished TypeScript` with no `error TS`, Next 16.4.5 Turbopack build success.
- `npm ls typescript typescript-eslint eslint`: exit 0, no `ELSPROBLEMS`.
- Result: accepted, `typescript` range is now `^6.0.3`. No overrides were needed.
