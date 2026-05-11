import {
  acquireProviderSlot,
  withProviderSlot,
  getProviderLimiterSnapshot,
  setProviderLimit,
  clearProviderLimiters,
  __PROVIDER_LIMITER_DEFAULTS,
} from "../../../services/concurrency/providerLimiter.js";

beforeEach(() => clearProviderLimiters());
afterEach(() => clearProviderLimiters());

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("providerLimiter", () => {
  test("never exceeds the configured concurrency", async () => {
    setProviderLimit("openai-image", 3);
    let inFlight = 0;
    let peak = 0;
    const work = async () => {
      const release = await acquireProviderSlot("openai-image");
      try {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
      } finally {
        release();
      }
    };
    await Promise.all(Array.from({ length: 12 }, work));
    expect(peak).toBe(3);
    expect(inFlight).toBe(0);
    expect(getProviderLimiterSnapshot()["openai-image"]).toEqual({
      limit: 3,
      inFlight: 0,
      waiting: 0,
    });
  });

  test("withProviderSlot releases on throw", async () => {
    setProviderLimit("openai-reasoning", 2);
    await expect(
      withProviderSlot("openai-reasoning", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);
    expect(getProviderLimiterSnapshot()["openai-reasoning"].inFlight).toBe(0);
  });

  test("acquired callers run in FIFO order when over capacity", async () => {
    setProviderLimit("openai-reasoning", 1);
    const order = [];
    const first = defer();
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      const release = await acquireProviderSlot("openai-reasoning");
      order.push(i);
      if (i === 0) await first.promise;
      release();
    });
    const all = Promise.all(tasks.map((t) => t()));
    // Let task 0 grab the slot
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual([0]);
    first.resolve();
    await all;
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  test("default limits applied when env not set", async () => {
    expect(__PROVIDER_LIMITER_DEFAULTS["openai-image"]).toBeGreaterThan(0);
    delete process.env.OPENAI_IMAGE_CONCURRENCY;
    const release = await acquireProviderSlot("openai-image");
    expect(getProviderLimiterSnapshot()["openai-image"].limit).toBe(
      __PROVIDER_LIMITER_DEFAULTS["openai-image"],
    );
    release();
  });

  test("double-release is idempotent (safety guard)", async () => {
    setProviderLimit("openai-image", 2);
    const release = await acquireProviderSlot("openai-image");
    release();
    release(); // should not under-flow
    expect(getProviderLimiterSnapshot()["openai-image"].inFlight).toBe(0);
  });

  test("acquire requires a providerKey (synchronous throw, fail-fast)", () => {
    expect(() => acquireProviderSlot()).toThrow(/providerKey/);
  });

  test("setProviderLimit lowers cap and queued tasks still drain over time", async () => {
    setProviderLimit("openai-image", 5);
    const blockers = Array.from({ length: 5 }, () => defer());
    const tasks = blockers.map((d) => async () => {
      const release = await acquireProviderSlot("openai-image");
      await d.promise;
      release();
    });
    const all = Promise.all(tasks.map((t) => t()));
    await new Promise((r) => setTimeout(r, 5));
    expect(getProviderLimiterSnapshot()["openai-image"].inFlight).toBe(5);
    blockers.forEach((d) => d.resolve());
    await all;
    expect(getProviderLimiterSnapshot()["openai-image"].inFlight).toBe(0);
  });
});
