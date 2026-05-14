/**
 * Post-UI-smoke fix — listDeliverablesPackageHistory must surface
 * structured access-policy info so the UI can render a neutral
 * sign-in / unavailable message instead of a red error.
 *
 * The Preview UI smoke ran in anonymous mode (Clerk publishable key
 * missing). The history endpoint at api/.../history.js returns 403 with
 * `{ error: "Artifact package is not accessible", code:
 * "ARTIFACT_ACCESS_USER_REQUIRED" }`. Without the code, the panel
 * surfaces the raw error string and reads like a bug. With the code, the
 * panel can branch into a neutral "Sign in to view saved packages."
 *
 * These tests pin the contract between the API response and the thrown
 * Error: `.status` and `.code` must be attached to the Error instance.
 */

import exportService from "../../services/exportService.js";

const HISTORY_URL_PREFIX = "/api/project/export/artifact-package/history";

function jsonResponse({ status, body }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe("exportService.listDeliverablesPackageHistory — error enrichment", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  test("403 ARTIFACT_ACCESS_USER_REQUIRED → Error with .status + .code", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        status: 403,
        body: {
          error: "Artifact package is not accessible",
          code: "ARTIFACT_ACCESS_USER_REQUIRED",
        },
      }),
    );
    let thrown = null;
    try {
      await exportService.listDeliverablesPackageHistory({
        projectId: "proj-1",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.status).toBe(403);
    expect(thrown.code).toBe("ARTIFACT_ACCESS_USER_REQUIRED");
    expect(thrown.message).toBe("Artifact package is not accessible");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain(HISTORY_URL_PREFIX);
    expect(url).toContain("projectId=proj-1");
  });

  test("403 ARTIFACT_ACCESS_DENIED → preserves the code", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        status: 403,
        body: {
          error: "Artifact package is not accessible",
          code: "ARTIFACT_ACCESS_DENIED",
        },
      }),
    );
    await expect(
      exportService.listDeliverablesPackageHistory({ projectId: "proj-2" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "ARTIFACT_ACCESS_DENIED",
    });
  });

  test("500 with no code → .status set, .code null, message preserved", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        status: 500,
        body: { error: { message: "Internal storage failure" } },
      }),
    );
    let thrown = null;
    try {
      await exportService.listDeliverablesPackageHistory({
        projectId: "proj-3",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.status).toBe(500);
    expect(thrown.code).toBeNull();
    expect(thrown.message).toBe("Internal storage failure");
  });

  test("non-JSON 502 → falls back to status-based message + null code", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("invalid json")),
    });
    let thrown = null;
    try {
      await exportService.listDeliverablesPackageHistory({
        projectId: "proj-4",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.status).toBe(502);
    expect(thrown.code).toBeNull();
    expect(thrown.message).toMatch(/Deliverables package history failed: 502/);
  });

  test("happy path 200 returns the JSON body unchanged", async () => {
    const body = {
      history: [{ packageId: "pkg-1", status: "stored" }],
      count: 1,
      storageProvider: "memory",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
    const result = await exportService.listDeliverablesPackageHistory({
      projectId: "proj-5",
    });
    expect(result).toEqual(body);
  });
});
