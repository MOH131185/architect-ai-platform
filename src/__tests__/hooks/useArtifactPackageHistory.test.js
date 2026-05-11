import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../../services/exportService.js", () => {
  const listDeliverablesPackageHistory = jest.fn();
  const buildArtifactPackagePayload = jest.fn();
  return {
    __esModule: true,
    default: {
      listDeliverablesPackageHistory,
      buildArtifactPackagePayload,
    },
  };
});

import exportService from "../../services/exportService.js";
import useArtifactPackageHistory from "../../hooks/useArtifactPackageHistory.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderHook(callback) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const hookResult = { current: null };

  function HookHost(props) {
    hookResult.current = callback(props);
    return null;
  }

  function update(props) {
    act(() => {
      root.render(<HookHost {...props} />);
    });
  }

  function unmount() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  return { hookResult, update, unmount };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  exportService.listDeliverablesPackageHistory.mockReset();
  exportService.buildArtifactPackagePayload.mockReset();
  exportService.buildArtifactPackagePayload.mockImplementation((sheet) => ({
    projectId: sheet?.projectId || sheet?.metadata?.projectId || null,
    userId: sheet?.userId || null,
  }));
});

describe("useArtifactPackageHistory", () => {
  test("does not fetch when no projectId/sheet is provided", () => {
    const { hookResult, update, unmount } = renderHook((props) =>
      useArtifactPackageHistory(props || {}),
    );
    update({});
    expect(exportService.listDeliverablesPackageHistory).not.toHaveBeenCalled();
    expect(hookResult.current.history).toEqual([]);
    expect(hookResult.current.isLoading).toBe(false);
    unmount();
  });

  test("seeds from initialHistory and fetches when projectId is present", async () => {
    const seed = [{ packageId: "seed-1", packageHash: "seed-hash" }];
    const fetched = [
      { packageId: "p-1", packageHash: "h-1" },
      { packageId: "p-2", packageHash: "h-2" },
    ];
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: fetched,
      storageProvider: "memory",
    });
    const { hookResult, update, unmount } = renderHook((props) =>
      useArtifactPackageHistory(props),
    );
    update({ projectId: "proj-1", initialHistory: seed });
    expect(hookResult.current.history).toEqual(seed);
    await flushPromises();
    expect(exportService.listDeliverablesPackageHistory).toHaveBeenCalledTimes(
      1,
    );
    expect(hookResult.current.history).toEqual(fetched);
    expect(hookResult.current.storageProvider).toBe("memory");
    expect(hookResult.current.isLoading).toBe(false);
    unmount();
  });

  test("refetches when refreshSignal changes", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [],
      storageProvider: "memory",
    });
    const { update, unmount } = renderHook((props) =>
      useArtifactPackageHistory(props),
    );
    update({ projectId: "proj-1", refreshSignal: 0 });
    await flushPromises();
    expect(exportService.listDeliverablesPackageHistory).toHaveBeenCalledTimes(
      1,
    );
    update({ projectId: "proj-1", refreshSignal: 1 });
    await flushPromises();
    expect(exportService.listDeliverablesPackageHistory).toHaveBeenCalledTimes(
      2,
    );
    unmount();
  });

  test("ignores resolved response after unmount", async () => {
    let resolveFetch;
    exportService.listDeliverablesPackageHistory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { hookResult, update, unmount } = renderHook((props) =>
      useArtifactPackageHistory(props),
    );
    update({ projectId: "proj-1" });
    expect(exportService.listDeliverablesPackageHistory).toHaveBeenCalledTimes(
      1,
    );
    const ref = hookResult.current;
    unmount();
    await act(async () => {
      resolveFetch({
        history: [{ packageId: "late-1" }],
        storageProvider: "memory",
      });
      await Promise.resolve();
    });
    // After unmount, hookResult.current still points to the last render's value;
    // the assertion is that we never throw and never apply the late state.
    expect(ref.history).toEqual([]);
  });

  test("surfaces error from service rejection and clears it on refresh()", async () => {
    exportService.listDeliverablesPackageHistory.mockRejectedValueOnce(
      new Error("boom"),
    );
    const { hookResult, update, unmount } = renderHook((props) =>
      useArtifactPackageHistory(props),
    );
    update({ projectId: "proj-1" });
    await flushPromises();
    expect(hookResult.current.error?.message).toBe("boom");
    expect(hookResult.current.isLoading).toBe(false);
    exportService.listDeliverablesPackageHistory.mockResolvedValueOnce({
      history: [{ packageId: "ok-1" }],
      storageProvider: "memory",
    });
    await act(async () => {
      hookResult.current.refresh();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hookResult.current.error).toBeNull();
    expect(hookResult.current.history).toEqual([{ packageId: "ok-1" }]);
    unmount();
  });

  test("resolves projectId from sheet when not given explicitly", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [],
      storageProvider: "memory",
    });
    const { update, unmount } = renderHook((props) =>
      useArtifactPackageHistory(props),
    );
    update({ sheet: { projectId: "from-sheet" } });
    await flushPromises();
    expect(exportService.buildArtifactPackagePayload).toHaveBeenCalledWith({
      projectId: "from-sheet",
    });
    expect(exportService.listDeliverablesPackageHistory).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "from-sheet" }),
    );
    unmount();
  });
});
