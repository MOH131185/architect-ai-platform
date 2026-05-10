import React, { act } from "react";
import { createRoot } from "react-dom/client";

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

jest.mock("framer-motion", () => {
  const ReactInner = require("react");
  const passthrough = ReactInner.forwardRef(
    (
      {
        children,
        initial,
        animate,
        exit,
        transition,
        whileHover,
        whileTap,
        layout,
        ...props
      },
      ref,
    ) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    ),
  );
  passthrough.displayName = "MotionDivMock";
  return {
    motion: { div: passthrough },
    AnimatePresence: ({ children }) => <>{children}</>,
  };
});

jest.mock("../../components/ui/ToastProvider.jsx", () => ({
  __esModule: true,
  useToastContext: () => ({ toast: mockToast }),
  ToastProvider: ({ children }) => <>{children}</>,
}));

jest.mock("../../components/ui/feedback/Tooltip.jsx", () => ({
  __esModule: true,
  Tooltip: ({ children }) => <>{children}</>,
}));

jest.mock("../../services/exportService.js", () => {
  const listDeliverablesPackageHistory = jest.fn();
  const downloadStoredDeliverablesPackage = jest.fn();
  const buildArtifactPackagePayload = jest.fn();
  return {
    __esModule: true,
    default: {
      listDeliverablesPackageHistory,
      downloadStoredDeliverablesPackage,
      buildArtifactPackagePayload,
    },
  };
});

import exportService from "../../services/exportService.js";
import ArtifactHistoryPanel from "../../components/export/ArtifactHistoryPanel.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    rerender(next) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const FIXED_NOW = "2026-05-10T12:00:00.000Z";

const RECORD_STORED = {
  packageId: "pkg-stored-1",
  packageHash: "hash-stored-1234567890abcdef",
  status: "stored",
  createdAt: "2026-05-10T11:00:00.000Z",
  expiresAt: "2026-05-17T11:00:00.000Z",
  signedUrl: "https://signed.example/pkg-stored-1?sig=token",
  signedUrlAvailable: true,
  downloadUrl: "https://signed.example/pkg-stored-1?sig=token",
  artifactCount: 12,
  sourceGapCount: 2,
  qaStatus: "pass",
  jurisdictionId: "uk-eng",
  countryCode: "GB",
  flags: {
    structuralEnabled: true,
    mepEnabled: false,
    detailsEnabled: true,
    dwgEnabled: true,
    ifcEnabled: false,
  },
};

const RECORD_EXPIRED = {
  packageId: "pkg-expired-1",
  packageHash: "hash-expired-1234567890abcdef",
  status: "expired",
  createdAt: "2026-04-01T00:00:00.000Z",
  signedUrl: null,
  signedUrlAvailable: false,
  downloadUrl: "/api/project/export/artifact-package/pkg-expired-1/download",
  artifactCount: 8,
  sourceGapCount: 0,
  qaStatus: "warning",
  jurisdictionId: "fr",
  countryCode: "FR",
  flags: { dwgEnabled: true },
};

const RECORD_DELETED = {
  packageId: "pkg-deleted-1",
  packageHash: "hash-deleted-1234567890abcdef",
  status: "deleted",
  createdAt: "2026-03-01T00:00:00.000Z",
  signedUrl: null,
  signedUrlAvailable: false,
  downloadUrl: null,
  artifactCount: 4,
  sourceGapCount: 1,
  qaStatus: "fail",
  jurisdictionId: "dz",
  countryCode: "DZ",
  flags: {},
};

const RECORD_DIRECT = {
  packageId: "pkg-direct-1",
  packageHash: "hash-direct-1234567890abcdef",
  status: "stored",
  createdAt: "2026-05-10T10:00:00.000Z",
  signedUrl: null,
  signedUrlAvailable: false,
  downloadUrl: "/api/project/export/artifact-package/pkg-direct-1/download",
  downloadRoute: "/api/project/export/artifact-package/pkg-direct-1/download",
  artifactCount: 6,
  sourceGapCount: 0,
  qaStatus: "pass",
  jurisdictionId: "uk-eng",
  countryCode: "GB",
  flags: { mepEnabled: true },
};

beforeEach(() => {
  exportService.listDeliverablesPackageHistory.mockReset();
  exportService.downloadStoredDeliverablesPackage.mockReset();
  exportService.buildArtifactPackagePayload.mockReset();
  exportService.buildArtifactPackagePayload.mockImplementation((sheet) => ({
    projectId: sheet?.projectId || null,
  }));
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe("ArtifactHistoryPanel", () => {
  test("renders empty state when no project context is available", () => {
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{}} now={FIXED_NOW} />,
    );
    expect(
      container.querySelector('[data-testid="artifact-history-empty"]'),
    ).toBeTruthy();
    expect(exportService.listDeliverablesPackageHistory).not.toHaveBeenCalled();
    unmount();
  });

  test("renders all required fields per record", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [RECORD_STORED],
      storageProvider: "filesystem",
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const rows = container.querySelectorAll(
      '[data-testid="artifact-history-row"]',
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // packageHash truncated, with full hash on aria-label
    const hashSpan = row.querySelector('span[aria-label^="Package hash "]');
    expect(hashSpan).toBeTruthy();
    expect(hashSpan.getAttribute("aria-label")).toContain(
      "hash-stored-1234567890abcdef",
    );
    // createdAt + expiresAt + jurisdiction
    expect(
      row.querySelector('[data-testid="artifact-created-at"]')?.textContent,
    ).toMatch(/ago|just now/);
    expect(
      row.querySelector('[data-testid="artifact-expires-at"]')?.textContent,
    ).toMatch(/expires/);
    expect(
      row.querySelector('[data-testid="artifact-jurisdiction"]')?.textContent,
    ).toBe("uk-eng");
    // status + QA chips
    expect(
      row.querySelector('[data-testid="artifact-status-chip"]')?.textContent,
    ).toBe("Stored");
    expect(
      row.querySelector('[data-testid="artifact-qa-chip"]')?.textContent,
    ).toBe("QA Pass");
    // counts + flags
    expect(
      row.querySelector('[data-testid="artifact-counts"]')?.textContent,
    ).toContain("12 artifacts");
    expect(
      row.querySelector('[data-testid="artifact-gaps"]')?.textContent,
    ).toContain("2 gaps");
    const flagText =
      row.querySelector('[data-testid="artifact-flag-chips"]')?.textContent ||
      "";
    expect(flagText).toContain("STR");
    expect(flagText).toContain("DTL");
    expect(flagText).toContain("DWG");
    expect(flagText).not.toContain("MEP");
    expect(flagText).not.toContain("IFC");
    unmount();
  });

  test("expired package shows Expired chip and disables download", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [RECORD_EXPIRED],
      storageProvider: "filesystem",
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const row = container.querySelector('[data-testid="artifact-history-row"]');
    expect(
      row.querySelector('[data-testid="artifact-status-chip"]')?.textContent,
    ).toBe("Expired");
    const button = row.querySelector(
      '[data-testid="artifact-download-button"]',
    );
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Unavailable");
    unmount();
  });

  test("deleted package shows Deleted chip and disables download", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [RECORD_DELETED],
      storageProvider: "filesystem",
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const row = container.querySelector('[data-testid="artifact-history-row"]');
    expect(
      row.querySelector('[data-testid="artifact-status-chip"]')?.textContent,
    ).toBe("Deleted");
    const button = row.querySelector(
      '[data-testid="artifact-download-button"]',
    );
    expect(button.disabled).toBe(true);
    unmount();
  });

  test("downloads with signed URL when signedUrlAvailable === true", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [RECORD_STORED],
      storageProvider: "s3",
    });
    exportService.downloadStoredDeliverablesPackage.mockResolvedValue({
      success: true,
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const row = container.querySelector('[data-testid="artifact-history-row"]');
    expect(
      row.querySelector('[data-testid="artifact-download-mode"]')?.textContent,
    ).toContain("signed");
    const button = row.querySelector(
      '[data-testid="artifact-download-button"]',
    );
    expect(button.disabled).toBe(false);
    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      exportService.downloadStoredDeliverablesPackage,
    ).toHaveBeenCalledTimes(1);
    const call =
      exportService.downloadStoredDeliverablesPackage.mock.calls[0][0];
    expect(call.packageRecord.signedUrl).toBe(RECORD_STORED.signedUrl);
    expect(call.packageRecord.signedUrlAvailable).toBe(true);
    expect(mockToast.success).toHaveBeenCalled();
    unmount();
  });

  test("falls back to direct downloadUrl when no signed URL", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [RECORD_DIRECT],
      storageProvider: "memory",
    });
    exportService.downloadStoredDeliverablesPackage.mockResolvedValue({
      success: true,
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const row = container.querySelector('[data-testid="artifact-history-row"]');
    expect(
      row.querySelector('[data-testid="artifact-download-mode"]')?.textContent,
    ).toContain("direct");
    const button = row.querySelector(
      '[data-testid="artifact-download-button"]',
    );
    expect(button.disabled).toBe(false);
    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const call =
      exportService.downloadStoredDeliverablesPackage.mock.calls[0][0];
    expect(call.packageRecord.signedUrl).toBeNull();
    expect(call.packageRecord.downloadUrl).toBe(RECORD_DIRECT.downloadUrl);
    unmount();
  });

  test("hides gaps chip when sourceGapCount === 0", async () => {
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [RECORD_DIRECT],
      storageProvider: "memory",
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    expect(container.querySelector('[data-testid="artifact-gaps"]')).toBeNull();
    unmount();
  });

  test("never renders forbidden zipBytes/secret/env/token strings", async () => {
    const polluted = {
      ...RECORD_STORED,
      zipBytes: "ZZZ-SHOULD-NOT-RENDER-ZZZ",
      rawBytes: "RAW-SHOULD-NOT-RENDER",
      secret: "SECRET-SHOULD-NOT-RENDER",
      env: { OPENAI_API_KEY: "KEY-SHOULD-NOT-RENDER" },
      token: "TOKEN-SHOULD-NOT-RENDER",
      apiKey: "API-KEY-SHOULD-NOT-RENDER",
      openaiApiKey: "OPENAI-SHOULD-NOT-RENDER",
    };
    exportService.listDeliverablesPackageHistory.mockResolvedValue({
      history: [polluted],
      storageProvider: "filesystem",
    });
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const html = container.innerHTML;
    [
      "ZZZ-SHOULD-NOT-RENDER-ZZZ",
      "RAW-SHOULD-NOT-RENDER",
      "SECRET-SHOULD-NOT-RENDER",
      "KEY-SHOULD-NOT-RENDER",
      "TOKEN-SHOULD-NOT-RENDER",
      "API-KEY-SHOULD-NOT-RENDER",
      "OPENAI-SHOULD-NOT-RENDER",
      "OPENAI_API_KEY",
    ].forEach((needle) => {
      expect(html).not.toContain(needle);
    });
    // Sanity: the download mock must still be reachable and signed
    const call = exportService.downloadStoredDeliverablesPackage.mock.calls[0];
    expect(call).toBeUndefined();
    unmount();
  });

  test("shows error state and recovers via Try again", async () => {
    exportService.listDeliverablesPackageHistory.mockRejectedValueOnce(
      new Error("network down"),
    );
    const { container, unmount } = renderComponent(
      <ArtifactHistoryPanel sheet={{ projectId: "proj-1" }} now={FIXED_NOW} />,
    );
    await flushPromises();
    const errorBox = container.querySelector(
      '[data-testid="artifact-history-error"]',
    );
    expect(errorBox).toBeTruthy();
    expect(errorBox.textContent).toContain("network down");
    exportService.listDeliverablesPackageHistory.mockResolvedValueOnce({
      history: [RECORD_STORED],
      storageProvider: "memory",
    });
    const tryAgain = errorBox.querySelector("button");
    await act(async () => {
      tryAgain.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="artifact-history-error"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="artifact-history-row"]'),
    ).toHaveLength(1);
    unmount();
  });
});
