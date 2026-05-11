import {
  reserveJobQuota,
  getQuotaLimits,
  getActiveJobCounts,
  clearQuotaCounters,
  QUOTA_ERROR_CODES,
  __QUOTA_DEFAULTS,
} from "../../../services/concurrency/quotaService.js";

const ENV_KEYS = ["MAX_ACTIVE_JOBS_PER_USER", "MAX_GLOBAL_ACTIVE_JOBS"];
const SAVED_ENV = {};

beforeEach(() => {
  ENV_KEYS.forEach((k) => {
    SAVED_ENV[k] = process.env[k];
    delete process.env[k];
  });
  clearQuotaCounters();
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  });
  clearQuotaCounters();
});

describe("quotaService", () => {
  test("default limits expose perUser + global", () => {
    expect(getQuotaLimits()).toEqual({
      perUser: __QUOTA_DEFAULTS.perUser,
      global: __QUOTA_DEFAULTS.global,
    });
  });

  test("env vars override defaults", () => {
    process.env.MAX_ACTIVE_JOBS_PER_USER = "10";
    process.env.MAX_GLOBAL_ACTIVE_JOBS = "200";
    expect(getQuotaLimits()).toEqual({ perUser: 10, global: 200 });
  });

  test("reserveJobQuota increments and decrements counts", () => {
    const release = reserveJobQuota({ userId: "u-1" });
    expect(getActiveJobCounts()).toEqual({ global: 1, byUser: { "u-1": 1 } });
    release();
    expect(getActiveJobCounts()).toEqual({ global: 0, byUser: {} });
  });

  test("user quota blocks the (N+1)th concurrent job", () => {
    process.env.MAX_ACTIVE_JOBS_PER_USER = "3";
    const releases = [
      reserveJobQuota({ userId: "u-1" }),
      reserveJobQuota({ userId: "u-1" }),
      reserveJobQuota({ userId: "u-1" }),
    ];
    let captured;
    try {
      reserveJobQuota({ userId: "u-1" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeDefined();
    expect(captured.code).toBe(QUOTA_ERROR_CODES.USER_QUOTA_EXCEEDED);
    expect(captured.limits).toEqual({
      perUser: 3,
      global: __QUOTA_DEFAULTS.global,
    });
    expect(captured.active).toEqual(expect.objectContaining({ user: 3 }));

    // Release one slot — next reserve succeeds
    releases[0]();
    const ok = reserveJobQuota({ userId: "u-1" });
    expect(getActiveJobCounts().byUser["u-1"]).toBe(3);
    ok();
    releases.slice(1).forEach((r) => r());
  });

  test("global capacity blocks excess jobs across all users", () => {
    process.env.MAX_GLOBAL_ACTIVE_JOBS = "2";
    const r1 = reserveJobQuota({ userId: "u-1" });
    const r2 = reserveJobQuota({ userId: "u-2" });
    let captured;
    try {
      reserveJobQuota({ userId: "u-3" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeDefined();
    expect(captured.code).toBe(QUOTA_ERROR_CODES.GLOBAL_CAPACITY_FULL);
    expect(captured.limits.global).toBe(2);
    r1();
    r2();
  });

  test("anonymous callers (no userId) bypass per-user check but count toward global", () => {
    process.env.MAX_GLOBAL_ACTIVE_JOBS = "3";
    process.env.MAX_ACTIVE_JOBS_PER_USER = "1";
    const releases = [
      reserveJobQuota({}),
      reserveJobQuota({}),
      reserveJobQuota({}),
    ];
    expect(() => reserveJobQuota({})).toThrow(/Global capacity full/i);
    releases.forEach((r) => r());
  });

  test("release is idempotent", () => {
    const release = reserveJobQuota({ userId: "u-1" });
    release();
    release(); // no-op, no underflow
    expect(getActiveJobCounts()).toEqual({ global: 0, byUser: {} });
  });

  test("global cap takes priority over per-user (checked first)", () => {
    process.env.MAX_GLOBAL_ACTIVE_JOBS = "1";
    process.env.MAX_ACTIVE_JOBS_PER_USER = "10";
    const r = reserveJobQuota({ userId: "u-1" });
    let captured;
    try {
      reserveJobQuota({ userId: "u-2" });
    } catch (err) {
      captured = err;
    }
    expect(captured.code).toBe(QUOTA_ERROR_CODES.GLOBAL_CAPACITY_FULL);
    r();
  });
});
