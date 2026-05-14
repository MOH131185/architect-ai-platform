/* global require */
const {
  runProductionStrictChecks,
  __internals,
} = require("../../../scripts/productionStrictChecks.cjs");

const {
  checkProductionFrontendKey,
  checkStorageProviderConsistency,
  checkRetentionEnv,
  checkQueueAndConcurrencyEnv,
  checkSoftWarnings,
  isPositiveInt,
} = __internals;

describe("productionStrictChecks", () => {
  describe("checkProductionFrontendKey", () => {
    test("non-production: REACT_APP_OPENAI_API_KEY is allowed", () => {
      expect(
        checkProductionFrontendKey({
          NODE_ENV: "development",
          REACT_APP_OPENAI_API_KEY: "sk-anything",
        }),
      ).toEqual([]);
    });

    test("production + REACT_APP_OPENAI_API_KEY → fatal error", () => {
      const errors = checkProductionFrontendKey({
        NODE_ENV: "production",
        REACT_APP_OPENAI_API_KEY: "sk-leaks-to-bundle",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/REACT_APP_OPENAI_API_KEY/);
      expect(errors[0]).toMatch(/server-only/i);
    });

    test("production without the key → no error", () => {
      expect(
        checkProductionFrontendKey({
          NODE_ENV: "production",
          OPENAI_API_KEY: "sk-server-only",
        }),
      ).toEqual([]);
    });

    test("production with empty REACT_APP_OPENAI_API_KEY → no error (treated as unset)", () => {
      expect(
        checkProductionFrontendKey({
          NODE_ENV: "production",
          REACT_APP_OPENAI_API_KEY: "",
        }),
      ).toEqual([]);
    });
  });

  describe("checkStorageProviderConsistency", () => {
    test("provider unset → no errors", () => {
      expect(checkStorageProviderConsistency({})).toEqual([]);
    });

    test("memory provider → no errors", () => {
      expect(
        checkStorageProviderConsistency({
          ARTIFACT_STORAGE_PROVIDER: "memory",
        }),
      ).toEqual([]);
    });

    test("filesystem provider without ARTIFACT_STORAGE_DIR → error", () => {
      const errors = checkStorageProviderConsistency({
        ARTIFACT_STORAGE_PROVIDER: "filesystem",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/ARTIFACT_STORAGE_DIR/);
    });

    test("filesystem with dir → no error", () => {
      expect(
        checkStorageProviderConsistency({
          ARTIFACT_STORAGE_PROVIDER: "filesystem",
          ARTIFACT_STORAGE_DIR: "/var/lib/artifacts",
        }),
      ).toEqual([]);
    });

    test("s3 missing all credentials → single combined error listing all missing keys", () => {
      const errors = checkStorageProviderConsistency({
        ARTIFACT_STORAGE_PROVIDER: "s3",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/ARTIFACT_STORAGE_BUCKET/);
      expect(errors[0]).toMatch(/ARTIFACT_STORAGE_REGION/);
      expect(errors[0]).toMatch(/AWS_ACCESS_KEY_ID/);
      expect(errors[0]).toMatch(/AWS_SECRET_ACCESS_KEY/);
    });

    test("s3 with all four credentials → no error", () => {
      expect(
        checkStorageProviderConsistency({
          ARTIFACT_STORAGE_PROVIDER: "s3",
          ARTIFACT_STORAGE_BUCKET: "bucket",
          ARTIFACT_STORAGE_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: "AKIA...",
          AWS_SECRET_ACCESS_KEY: "secret",
        }),
      ).toEqual([]);
    });

    test("s3 with only legacy *_S3_* names → reports the new names as missing", () => {
      // Pre-Phase-5 deployments set ARTIFACT_STORAGE_S3_BUCKET / *_S3_REGION,
      // but the runtime adapter reads ARTIFACT_STORAGE_BUCKET / REGION. The
      // strict check must surface the active names so the operator knows what
      // to rename in Vercel.
      const errors = checkStorageProviderConsistency({
        ARTIFACT_STORAGE_PROVIDER: "s3",
        ARTIFACT_STORAGE_S3_BUCKET: "legacy-bucket",
        ARTIFACT_STORAGE_S3_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIA...",
        AWS_SECRET_ACCESS_KEY: "secret",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/ARTIFACT_STORAGE_BUCKET/);
      expect(errors[0]).toMatch(/ARTIFACT_STORAGE_REGION/);
      expect(errors[0]).not.toMatch(/ARTIFACT_STORAGE_S3_BUCKET/);
    });

    test("unknown provider → error suggesting the valid set", () => {
      const errors = checkStorageProviderConsistency({
        ARTIFACT_STORAGE_PROVIDER: "azure-blob",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/azure-blob/);
      expect(errors[0]).toMatch(/memory, filesystem, or s3/);
    });
  });

  describe("checkRetentionEnv", () => {
    test("unset → no errors", () => {
      expect(checkRetentionEnv({})).toEqual([]);
    });

    test("positive integers → no errors", () => {
      expect(
        checkRetentionEnv({
          ARTIFACT_PACKAGE_RETENTION_DAYS: "30",
          ARTIFACT_SIGNED_URL_TTL_SECONDS: "900",
        }),
      ).toEqual([]);
    });

    test("non-integer → error", () => {
      const errors = checkRetentionEnv({
        ARTIFACT_PACKAGE_RETENTION_DAYS: "thirty",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/positive integer/);
    });

    test("zero or negative → error", () => {
      expect(
        checkRetentionEnv({ ARTIFACT_PACKAGE_RETENTION_DAYS: "0" }),
      ).toHaveLength(1);
      expect(
        checkRetentionEnv({ ARTIFACT_PACKAGE_RETENTION_DAYS: "-5" }),
      ).toHaveLength(1);
    });

    test("decimal → error (must be integer)", () => {
      expect(
        checkRetentionEnv({ ARTIFACT_PACKAGE_RETENTION_DAYS: "1.5" }),
      ).toHaveLength(1);
    });
  });

  describe("checkQueueAndConcurrencyEnv", () => {
    test("unset → no errors", () => {
      expect(checkQueueAndConcurrencyEnv({})).toEqual([]);
    });

    test("all valid → no errors", () => {
      expect(
        checkQueueAndConcurrencyEnv({
          GENERATION_WORKER_CONCURRENCY: "8",
          OPENAI_IMAGE_CONCURRENCY: "4",
          OPENAI_REASONING_CONCURRENCY: "12",
          MAX_ACTIVE_JOBS_PER_USER: "5",
          MAX_GLOBAL_ACTIVE_JOBS: "100",
        }),
      ).toEqual([]);
    });

    test("non-integer concurrency → error per offending var", () => {
      const errors = checkQueueAndConcurrencyEnv({
        GENERATION_WORKER_CONCURRENCY: "abc",
        MAX_ACTIVE_JOBS_PER_USER: "0",
      });
      expect(errors).toHaveLength(2);
      expect(
        errors.find((e) => e.includes("GENERATION_WORKER_CONCURRENCY")),
      ).toBeDefined();
      expect(
        errors.find((e) => e.includes("MAX_ACTIVE_JOBS_PER_USER")),
      ).toBeDefined();
    });
  });

  describe("checkSoftWarnings", () => {
    test("missing signing secret → warning", () => {
      const warnings = checkSoftWarnings({});
      expect(
        warnings.find((w) => w.includes("ARTIFACT_PACKAGE_SIGNING_SECRET")),
      ).toBeDefined();
    });

    test("production without ADMIN_HEALTH_TOKEN → warning", () => {
      const warnings = checkSoftWarnings({ NODE_ENV: "production" });
      expect(
        warnings.find((w) => w.includes("ADMIN_HEALTH_TOKEN")),
      ).toBeDefined();
    });

    test("dev without ADMIN_HEALTH_TOKEN → no admin warning", () => {
      const warnings = checkSoftWarnings({ NODE_ENV: "development" });
      expect(
        warnings.find((w) => w.includes("ADMIN_HEALTH_TOKEN")),
      ).toBeUndefined();
    });
  });

  describe("isPositiveInt", () => {
    test("positives: 1, 100, 1000", () => {
      expect(isPositiveInt(1)).toBe(true);
      expect(isPositiveInt("100")).toBe(true);
      expect(isPositiveInt(1000)).toBe(true);
    });
    test("negatives: 0, -1, 1.5, NaN, '', null, 'abc'", () => {
      [0, -1, 1.5, "1.5", "abc", null, undefined, ""].forEach((v) => {
        expect(isPositiveInt(v)).toBe(false);
      });
    });
  });

  describe("runProductionStrictChecks composition", () => {
    test("clean production env → no errors, possibly admin warning", () => {
      const { errors, warnings } = runProductionStrictChecks({
        NODE_ENV: "production",
        OPENAI_API_KEY: "sk-server-side",
        ARTIFACT_STORAGE_PROVIDER: "filesystem",
        ARTIFACT_STORAGE_DIR: "/var/artifacts",
        ARTIFACT_PACKAGE_SIGNING_SECRET: "secret",
        ADMIN_HEALTH_TOKEN: "admin-token",
      });
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });

    test("messy production env → all errors surfaced together", () => {
      const { errors } = runProductionStrictChecks({
        NODE_ENV: "production",
        REACT_APP_OPENAI_API_KEY: "sk-leak-this",
        ARTIFACT_STORAGE_PROVIDER: "s3", // missing all 4 creds
        ARTIFACT_PACKAGE_RETENTION_DAYS: "thirty",
        MAX_GLOBAL_ACTIVE_JOBS: "0",
      });
      expect(errors.length).toBeGreaterThanOrEqual(4);
      expect(
        errors.find((e) => e.includes("REACT_APP_OPENAI_API_KEY")),
      ).toBeDefined();
      expect(
        errors.find((e) => e.includes("ARTIFACT_STORAGE_BUCKET")),
      ).toBeDefined();
      expect(
        errors.find((e) => e.includes("ARTIFACT_PACKAGE_RETENTION_DAYS")),
      ).toBeDefined();
      expect(
        errors.find((e) => e.includes("MAX_GLOBAL_ACTIVE_JOBS")),
      ).toBeDefined();
    });
  });
});
