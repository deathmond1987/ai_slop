import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";

const SELECT_SQL = "SELECT value FROM cache_entries WHERE key = ? AND expires_at > ?";
const UPSERT_SQL = `INSERT INTO cache_entries (key, value, expires_at, updated_at)
 VALUES (?, ?, ?, ?)
 ON CONFLICT(key) DO UPDATE SET
   value = excluded.value,
   expires_at = excluded.expires_at,
   updated_at = excluded.updated_at`;
const SCHEMA = `
CREATE TABLE cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX cache_entries_expires_at_idx ON cache_entries (expires_at);
`;

interface LatencyStats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function batchSizesFromEnv(): number[] {
  const raw = getEnv("SQLITE_LATENCY_BATCH_SIZES");
  if (!raw) return [1, 10, 50, 100];
  const sizes = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
  return sizes.length > 0 ? sizes : [1, 10, 50, 100];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? Number.NaN;
}

function summarize(samples: number[]): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    count: sorted.length,
    meanMs: mean,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

function ms(value: number): string {
  return value.toFixed(4);
}

function printStats(name: string, samples: number[]): void {
  const stats = summarize(samples);
  console.log(
    `${name}: n=${stats.count} mean=${ms(stats.meanMs)}ms p50=${ms(stats.p50Ms)}ms p95=${ms(
      stats.p95Ms
    )}ms p99=${ms(stats.p99Ms)}ms max=${ms(stats.maxMs)}ms`
  );
}

function openTempDb(): { db: DatabaseSync; dbPath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "steam-calendar-sqlite-latency-"));
  const dbPath = path.join(tempDir, "latency.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("PRAGMA cache_size = -20000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  return {
    db,
    dbPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

async function prepareWrapper(
  db: DatabaseSync,
  cache: Map<string, StatementSync>,
  sql: string
): Promise<StatementSync | undefined> {
  const cached = cache.get(sql);
  if (cached) return cached;

  try {
    const statement = db.prepare(sql);
    cache.set(sql, statement);
    return statement;
  } catch {
    return undefined;
  }
}

async function measureWrapperWrite(
  db: DatabaseSync,
  cache: Map<string, StatementSync>,
  samples: number[],
  nowMs: number,
  key: string
): Promise<boolean> {
  const started = performance.now();
  const statement = await prepareWrapper(db, cache, UPSERT_SQL);
  if (!statement) return false;

  statement.run(key, `{"sample":"${key}"}`, nowMs + 60_000, nowMs);
  samples.push(performance.now() - started);
  return true;
}

function measureDirectWrite(
  statement: StatementSync,
  samples: number[],
  nowMs: number,
  key: string
): void {
  const started = performance.now();
  statement.run(key, `{"sample":"${key}"}`, nowMs + 60_000, nowMs);
  samples.push(performance.now() - started);
}

async function measureWrapperRead(
  db: DatabaseSync,
  cache: Map<string, StatementSync>,
  samples: number[],
  nowMs: number,
  key: string
): Promise<boolean> {
  const started = performance.now();
  const statement = await prepareWrapper(db, cache, SELECT_SQL);
  if (!statement) return false;

  statement.get(key, nowMs);
  samples.push(performance.now() - started);
  return true;
}

function measureDirectRead(
  statement: StatementSync,
  samples: number[],
  nowMs: number,
  key: string
): void {
  const started = performance.now();
  statement.get(key, nowMs);
  samples.push(performance.now() - started);
}

function measureBatchWrites(
  db: DatabaseSync,
  statement: StatementSync,
  samples: number[],
  nowMs: number,
  batchIndex: number,
  size: number
): void {
  const started = performance.now();
  if (size === 1) {
    for (let i = 0; i < size; i += 1) {
      const key = `batch:${batchIndex}:${i}`;
      statement.run(key, `{"batch":${i}}`, nowMs + 60_000, nowMs);
    }
  } else {
    db.exec("BEGIN");
    for (let i = 0; i < size; i += 1) {
      const key = `batch:${batchIndex}:${i}`;
      statement.run(key, `{"batch":${i}}`, nowMs + 60_000, nowMs);
    }
    db.exec("COMMIT");
  }
  samples.push((performance.now() - started) / size);
}

async function main(): Promise<boolean> {
  const reads = numberFromEnv("SQLITE_LATENCY_READS", 1000);
  const writes = numberFromEnv("SQLITE_LATENCY_WRITES", 1000);
  const batches = batchSizesFromEnv();
  const { db, dbPath, cleanup } = openTempDb();

  try {
    const nowMs = Date.now();
    const statementCache = new Map<string, StatementSync>();
    const directSelect = db.prepare(SELECT_SQL);
    const directUpsert = db.prepare(UPSERT_SQL);
    await prepareWrapper(db, statementCache, SELECT_SQL);
    await prepareWrapper(db, statementCache, UPSERT_SQL);

    const wrapperWriteSamples: number[] = [];
    const directWriteSamples: number[] = [];
    const wrapperReadSamples: number[] = [];
    const directReadSamples: number[] = [];
    const batchSamples = new Map<number, number[]>();
    for (const size of batches) batchSamples.set(size, []);

    for (let i = 0; i < writes; i += 1) {
      const key = `wrapper-write:${i}`;
      if (!(await measureWrapperWrite(db, statementCache, wrapperWriteSamples, nowMs, key))) {
        console.error(`Failed to measure wrapper write for ${key}`);
        return false;
      }
    }

    for (let i = 0; i < writes; i += 1) {
      measureDirectWrite(directUpsert, directWriteSamples, nowMs, `direct-write:${i}`);
    }

    for (const size of batches) {
      const samples = batchSamples.get(size);
      if (!samples) continue;
      const batchCount = Math.max(1, Math.floor(writes / size));
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
        measureBatchWrites(db, directUpsert, samples, nowMs, batchIndex, size);
      }
    }

    for (let i = 0; i < reads; i += 1) {
      const key = `wrapper-write:${i % writes}`;
      if (!(await measureWrapperRead(db, statementCache, wrapperReadSamples, nowMs, key))) {
        console.error(`Failed to measure wrapper read for ${key}`);
        return false;
      }
    }

    for (let i = 0; i < reads; i += 1) {
      measureDirectRead(directSelect, directReadSamples, nowMs, `wrapper-write:${i % writes}`);
    }

    console.log(
      `SQLite latency measurement: node=${process.version} reads=${reads} writes=${writes} batches=${batches.join(
        ","
      )}`
    );
    console.log(`temp_db=${dbPath}`);
    printStats("async_wrapper_read", wrapperReadSamples);
    printStats("sync_direct_read", directReadSamples);
    printStats("async_wrapper_write", wrapperWriteSamples);
    printStats("sync_direct_write", directWriteSamples);
    for (const size of batches) {
      printStats(`batch_transaction_write_size_${size}`, batchSamples.get(size) ?? []);
    }

    const wrapperRead = summarize(wrapperReadSamples);
    const wrapperWrite = summarize(wrapperWriteSamples);
    const directRead = summarize(directReadSamples);
    const directWrite = summarize(directWriteSamples);
    const maxWrapperMs = Math.max(wrapperRead.p99Ms, wrapperWrite.p99Ms);
    const wrapperOverheadReadMs = wrapperRead.meanMs - directRead.meanMs;
    const wrapperOverheadWriteMs = wrapperWrite.meanMs - directWrite.meanMs;

    console.log(
      `summary: max_wrapper_p99=${ms(maxWrapperMs)}ms wrapper_overhead_read_mean=${ms(
        wrapperOverheadReadMs
      )}ms wrapper_overhead_write_mean=${ms(wrapperOverheadWriteMs)}ms`
    );
    return maxWrapperMs < 1;
  } finally {
    try {
      db.close();
    } catch {
      process.exitCode = 1;
    }
    cleanup();
  }
}

main()
  .then((passed) => {
    if (!passed) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
