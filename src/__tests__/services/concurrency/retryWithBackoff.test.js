import {
  retryWithBackoff,
  __RETRY_DEFAULTS,
} from "../../../services/concurrency/retryWithBackoff.js";

function fakeSleep() {
  const calls = [];
  return {
    sleep: (ms) => {
      calls.push(ms);
      return Promise.resolve();
    },
    calls,
  };
}

describe("retryWithBackoff", () => {
  test("returns successful result on first attempt with no retry", async () => {
    const fakeSleeper = fakeSleep();
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls += 1;
        return "ok";
      },
      { sleep: fakeSleeper.sleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(fakeSleeper.calls).toEqual([]);
  });

  test("retries on 429 with exponential backoff", async () => {
    const fakeSleeper = fakeSleep();
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) {
          const err = new Error("rate limited");
          err.status = 429;
          throw err;
        }
        return "succeeded";
      },
      { baseDelayMs: 100, maxDelayMs: 10_000, sleep: fakeSleeper.sleep },
    );
    expect(result).toBe("succeeded");
    expect(calls).toBe(3);
    expect(fakeSleeper.calls).toEqual([100, 200]);
  });

  test("honours retry-after seconds", async () => {
    const fakeSleeper = fakeSleep();
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls === 1) {
          const err = new Error("rate limited");
          err.status = 429;
          err.retryAfter = 5; // seconds
          throw err;
        }
        return "ok";
      },
      { baseDelayMs: 100, sleep: fakeSleeper.sleep },
    );
    // Should sleep at least 5000ms (the retry-after), not just 100ms exp
    expect(fakeSleeper.calls[0]).toBe(5000);
  });

  test("honours retryAfterMs when supplied", async () => {
    const fakeSleeper = fakeSleep();
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls === 1) {
          const err = new Error("rate limited");
          err.status = 503;
          err.retryAfterMs = 7500;
          throw err;
        }
        return "ok";
      },
      { sleep: fakeSleeper.sleep },
    );
    expect(fakeSleeper.calls[0]).toBeGreaterThanOrEqual(7500);
  });

  test("retries on network errors (TypeError) up to maxAttempts", async () => {
    const fakeSleeper = fakeSleep();
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls += 1;
          throw new TypeError("Failed to fetch");
        },
        { maxAttempts: 3, sleep: fakeSleeper.sleep },
      ),
    ).rejects.toThrow(/Failed to fetch/);
    expect(calls).toBe(3);
    expect(fakeSleeper.calls).toHaveLength(2); // sleeps between 3 attempts
  });

  test("does NOT retry on non-retryable status (e.g. 400, 403, strict-image2)", async () => {
    const fakeSleeper = fakeSleep();
    let calls = 0;
    const err400 = new Error("bad request");
    err400.status = 400;
    await expect(
      retryWithBackoff(
        async () => {
          calls += 1;
          throw err400;
        },
        { sleep: fakeSleeper.sleep },
      ),
    ).rejects.toBe(err400);
    expect(calls).toBe(1);
    expect(fakeSleeper.calls).toEqual([]);

    // Specifically: a STRICT_IMAGE2_FAIL_CLOSED-style 400 must propagate
    // immediately without consuming retry budget — the authority gate must
    // fail closed on the first attempt.
    const errStrict = new Error("strict image2 unavailable");
    errStrict.status = 400;
    errStrict.code = "STRICT_IMAGE2_FAIL_CLOSED";
    let strictCalls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          strictCalls += 1;
          throw errStrict;
        },
        { sleep: fakeSleeper.sleep },
      ),
    ).rejects.toMatchObject({ code: "STRICT_IMAGE2_FAIL_CLOSED" });
    expect(strictCalls).toBe(1);
  });

  test("calls onRetry hook with attempt number, delay, and error", async () => {
    const fakeSleeper = fakeSleep();
    const retries = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 2) {
          const err = new Error("503");
          err.status = 503;
          throw err;
        }
        return "ok";
      },
      {
        baseDelayMs: 50,
        sleep: fakeSleeper.sleep,
        onRetry: (n, ms, err) => retries.push({ n, ms, code: err.status }),
      },
    );
    expect(retries).toEqual([{ n: 1, ms: 50, code: 503 }]);
  });

  test("default retryable status set is sane", () => {
    expect(__RETRY_DEFAULTS.DEFAULT_RETRYABLE_STATUS).toEqual(
      expect.arrayContaining([429, 502, 503, 504]),
    );
  });
});
