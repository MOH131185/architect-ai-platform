import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ExportPanel from "../../components/ExportPanel.jsx";
import exportService from "../../services/exportService.js";

jest.mock("../../components/ui/feedback/Tooltip.jsx", () => ({
  Tooltip: ({ children }) => <>{children}</>,
}));

jest.mock("../../components/ui/feedback/Tooltip", () => ({
  Tooltip: ({ children }) => <>{children}</>,
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};

jest.mock("../../components/ui/ToastProvider.jsx", () => ({
  useToastContext: () => ({ toast: mockToast }),
}));

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
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function buttonByText(container, text) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent.includes(text),
  );
}

function createHeaders(headers = {}) {
  return {
    get(name) {
      const key = Object.keys(headers).find(
        (headerName) => headerName.toLowerCase() === name.toLowerCase(),
      );
      return key ? headers[key] : null;
    },
  };
}

describe("ExportPanel deliverables ZIP entry point", () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockToast.warning.mockClear();
    URL.createObjectURL = jest.fn(() => "blob:deliverables-zip");
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("disables deliverables ZIP download when no completed artifacts exist", () => {
    const { container, unmount } = renderComponent(
      <ExportPanel designData={{}} onExport={jest.fn()} />,
    );

    const zipButton = buttonByText(container, "Download Deliverables ZIP");

    expect(zipButton).toBeTruthy();
    expect(zipButton.disabled).toBe(true);
    expect(zipButton.textContent).toContain("Generate first");

    unmount();
  });

  test("triggers artifact package download when generated artifacts exist", async () => {
    const responseBlob = new Blob(["zip-bytes"], { type: "application/zip" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: createHeaders({
        "Content-Disposition": 'attachment; filename="test-deliverables.zip"',
      }),
      blob: jest.fn().mockResolvedValue(responseBlob),
    });

    const designData = {
      projectName: "Test Project",
      projectId: "project-ui-001",
      projectGraphId: "graph-ui-001",
      geometryHash: "geometry-ui-001",
      visualManifestHash: "visual-ui-001",
      styleBlendManifestHash: "style-ui-001",
      jurisdictionId: "uk-england",
      countryCode: "GB",
      artifacts: {
        a1Sheet: {
          svgString:
            '<svg xmlns="http://www.w3.org/2000/svg"><text>A1</text></svg>',
        },
        a1Pdf: {
          dataUrl: "data:application/pdf;base64,JVBERi0xLjcgYTFwZGY=",
        },
        qaReport: {
          status: "pass",
        },
      },
      compiledProject: {
        geometryHash: "geometry-ui-001",
      },
    };

    const { container, unmount } = renderComponent(
      <ExportPanel
        designData={designData}
        onExport={(format, sheet) =>
          exportService.exportSheet({ sheet, format })
        }
      />,
    );

    await act(async () => {
      buttonByText(container, "Download Deliverables ZIP").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/project/export/artifact-package",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [, requestOptions] = global.fetch.mock.calls[0];
    const payload = JSON.parse(requestOptions.body);

    expect(payload).toEqual(
      expect.objectContaining({
        projectName: "Test Project",
        projectId: "project-ui-001",
        geometryHash: "geometry-ui-001",
        visualManifestHash: "visual-ui-001",
        styleBlendManifestHash: "style-ui-001",
        jurisdictionId: "uk-england",
      }),
    );
    expect(payload).not.toHaveProperty("env");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith(
      "Export complete",
      "Deliverables ZIP downloaded.",
    );

    unmount();
  });
});
