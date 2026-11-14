import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  appDetailsRetryQueueStats,
  configureAppDetailsRetry,
  enqueueAppDetailsRetry,
  processAppDetailsRetries,
  resetAppDetailsRetry,
  type AppDetailsRetryOutcome,
} from "../lib/app-details-retry.ts";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

afterEach(() => {
  resetAppDetailsRetry();
});

test("appdetails retry queue rejects invalid and duplicate requests", () => {
  withEnv(
    {
      STEAM_APPDETAILS_RETRY: "true",
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: "10",
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: "10",
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: "2",
      STEAM_APPDETAILS_RETRY_DELAY_MS: "1",
    },
    () => {
      configureAppDetailsRetry({ retry: async () => "succeeded" });

      assert.equal(enqueueAppDetailsRetry({ appid: 0, steamId: "76561197960287930" }), false);
      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "bad" }), false);
      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "76561197960287930" }), true);
      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "76561197960287930" }), false);

      const stats = appDetailsRetryQueueStats();
      assert.equal(stats.queued, 1);
      assert.equal(stats.dropped, 2);
    }
  );
});

test("appdetails retry queue is bounded by queue and unique steam id limits", () => {
  withEnv(
    {
      STEAM_APPDETAILS_RETRY: "true",
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: "2",
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: "1",
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: "2",
      STEAM_APPDETAILS_RETRY_DELAY_MS: "1",
    },
    () => {
      configureAppDetailsRetry({ retry: async () => "succeeded" });

      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "76561197960287930" }), true);
      assert.equal(enqueueAppDetailsRetry({ appid: 730, steamId: "76561197960287931" }), false);
      assert.equal(enqueueAppDetailsRetry({ appid: 730, steamId: "76561197960287930" }), true);
      assert.equal(enqueueAppDetailsRetry({ appid: 100, steamId: "76561197960287930" }), false);

      const stats = appDetailsRetryQueueStats();
      assert.equal(stats.queued, 2);
      assert.equal(stats.uniqueSteamIds, 1);
      assert.equal(stats.dropped, 2);
    }
  );
});

test("appdetails retry queue honors max attempts and stops after exhaustion", async () => {
  await withEnv(
    {
      STEAM_APPDETAILS_RETRY: "true",
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: "10",
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: "10",
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: "2",
      STEAM_APPDETAILS_RETRY_DELAY_MS: "1",
    },
    async () => {
      configureAppDetailsRetry({ retry: async () => "retry" as AppDetailsRetryOutcome });

      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "76561197960287930" }), true);

      const now = Date.now();
      assert.equal(await processAppDetailsRetries(now + 1), 1);
      assert.equal(await processAppDetailsRetries(now + 1000), 1);

      const stats = appDetailsRetryQueueStats();
      assert.equal(stats.queued, 0);
      assert.equal(stats.attempts, 2);
      assert.equal(stats.retried, 1);
      assert.equal(stats.stopped, 1);
    }
  );
});

test("appdetails retry queue calls success handlers after terminal success", async () => {
  await withEnv(
    {
      STEAM_APPDETAILS_RETRY: "true",
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: "10",
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: "10",
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: "2",
      STEAM_APPDETAILS_RETRY_DELAY_MS: "1",
    },
    async () => {
      let successCount = 0;
      configureAppDetailsRetry({
        retry: async () => "succeeded" as AppDetailsRetryOutcome,
        onSucceeded: async () => {
          successCount += 1;
        },
      });

      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "76561197960287930" }), true);
      assert.equal(await processAppDetailsRetries(Date.now() + 1), 1);

      const stats = appDetailsRetryQueueStats();
      assert.equal(successCount, 1);
      assert.equal(stats.queued, 0);
      assert.equal(stats.attempts, 1);
      assert.equal(stats.succeeded, 1);
    }
  );
});

test("appdetails retry queue does not enqueue when retries are disabled", () => {
  withEnv(
    {
      STEAM_APPDETAILS_RETRY: "false",
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: "10",
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: "10",
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: "2",
      STEAM_APPDETAILS_RETRY_DELAY_MS: "1",
    },
    () => {
      configureAppDetailsRetry({ retry: async () => "succeeded" });
      assert.equal(enqueueAppDetailsRetry({ appid: 440, steamId: "76561197960287930" }), false);
      assert.equal(appDetailsRetryQueueStats().queued, 0);
    }
  );
});
