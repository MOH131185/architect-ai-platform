import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = React.forwardRef(
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

jest.mock("../../components/map/useGoogleMap.js", () => ({
  useGoogleMap: () => ({
    map: null,
    google: null,
    isLoaded: true,
    isLoading: false,
    error: null,
    geocodeAddress: jest.fn(),
  }),
}));

import { SiteBoundaryEditorV2 } from "../../components/map/SiteBoundaryEditorV2.jsx";
import { BoundaryNumericEditor } from "../../components/map/BoundaryNumericEditor.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LAT_LNG_BOUNDARY = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.5, lng: -0.099 },
  { lat: 51.501, lng: -0.099 },
  { lat: 51.501, lng: -0.1 },
];

const VERTICES = LAT_LNG_BOUNDARY.map((point) => [point.lng, point.lat]);

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

function click(element) {
  act(() => {
    element.click();
  });
}

function changeInput(input, value) {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value",
    )?.set;
    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(input, value);
    } else if (valueSetter) {
      valueSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function buttonByText(container, text) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent.includes(text),
  );
}

function renderBoundaryEditor(props = {}) {
  return renderComponent(
    <SiteBoundaryEditorV2
      initialBoundaryPolygon={LAT_LNG_BOUNDARY}
      autoDetectEnabled={false}
      autoDetectOnLoad={false}
      onBoundaryChange={jest.fn()}
      {...props}
    />,
  );
}

describe("SiteBoundaryEditorV2 boundary measurements", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("renders BoundaryDiagnostics by default when boundary has at least 3 vertices", () => {
    const { container, unmount } = renderBoundaryEditor();

    expect(container.textContent).toContain("Boundary Measurements");
    expect(container.textContent).toContain("Drag corners, draw a new polygon");
    expect(container.textContent).toContain("Area");
    expect(container.textContent).toContain("Perimeter");
    expect(container.textContent).toContain("Vertices");
    expect(container.textContent).toContain("Status");

    unmount();
  });

  test("shows contextual building footprint measurements without marking it verified", async () => {
    const onBoundaryChange = jest.fn();
    const { container, unmount } = renderBoundaryEditor({
      initialBoundaryPolygon: [],
      contextualBoundaryPolygon: LAT_LNG_BOUNDARY,
      contextualBoundaryRole: "contextual_building_footprint",
      contextualBoundarySource: "google_building_outline",
      onBoundaryChange,
    });

    await act(async () => {});

    expect(container.textContent).toContain("Detected Building Footprint");
    expect(container.textContent).toContain("shown for scale only");
    expect(container.textContent).toContain("Area");
    expect(container.textContent).toContain("Perimeter");
    expect(onBoundaryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        invalid: true,
        manualVerified: false,
        boundarySource: "manual_invalid",
      }),
    );
    expect(onBoundaryChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        boundarySource: "manual_verified",
      }),
    );

    unmount();
  });

  test("diagnostics include segment details and interior angles", () => {
    const { container, unmount } = renderBoundaryEditor();

    expect(container.textContent).toContain("Segment Details");
    expect(container.textContent).toContain("Interior Angles");

    unmount();
  });

  test("Diagnostics toggle hides detailed tables but keeps summary cards", () => {
    const { container, unmount } = renderBoundaryEditor();

    click(buttonByText(container, "Diagnostics"));

    expect(container.textContent).toContain("Area");
    expect(container.textContent).toContain("Perimeter");
    expect(container.textContent).toContain("Vertices");
    expect(container.textContent).toContain("Status");
    expect(container.textContent).not.toContain("Segment Details");
    expect(container.textContent).not.toContain("Interior Angles");

    click(buttonByText(container, "Diagnostics"));
    expect(container.textContent).toContain("Segment Details");
    expect(container.textContent).toContain("Interior Angles");

    unmount();
  });

  test("Edit mode instructions are visible", () => {
    const { container, unmount } = renderBoundaryEditor();

    click(buttonByText(container, "Edit"));

    expect(container.textContent).toContain(
      "Drag blue corner points to adjust the boundary",
    );
    expect(container.textContent).toContain(
      "Click midpoint dots to add a corner",
    );
    expect(container.textContent).toContain(
      "Select a corner and press Delete/Backspace to remove it",
    );

    unmount();
  });

  test("Draw mode instructions are visible", () => {
    const { container, unmount } = renderBoundaryEditor();

    click(buttonByText(container, "Draw"));

    expect(container.textContent).toContain("Click to place corners");
    expect(container.textContent).toContain("Double-click or Enter to finish");
    expect(container.textContent).toContain("Esc/Backspace to undo last point");
    expect(container.textContent).toContain("Shift = 45° snap");

    unmount();
  });

  test("clearing boundary emits invalid manual boundary clear payload", async () => {
    const onBoundaryChange = jest.fn();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const { container, unmount } = renderBoundaryEditor({ onBoundaryChange });

    click(buttonByText(container, "Clear"));
    await act(async () => {});
    expect(window.confirm).toHaveBeenCalled();

    const lastPayload =
      onBoundaryChange.mock.calls[onBoundaryChange.mock.calls.length - 1][0];
    expect(lastPayload).toEqual(
      expect.objectContaining({
        invalid: true,
        manualVerified: false,
        clearManualVerified: true,
        boundarySource: "manual_invalid",
        source: "manual_invalid",
      }),
    );

    unmount();
  });
});

describe("BoundaryNumericEditor dimensions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders segment length and bearing inputs", () => {
    const { container, unmount } = renderComponent(
      <BoundaryNumericEditor
        vertices={VERTICES}
        onVerticesChange={jest.fn()}
      />,
    );

    click(buttonByText(container, "Dimensions"));

    expect(
      container.querySelector('input[aria-label="Segment 1 length metres"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('input[aria-label="Segment 1 bearing degrees"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("Interior angle");

    unmount();
  });

  test("applying a numeric length change calls onVerticesChange with an updated polygon", () => {
    const onVerticesChange = jest.fn();
    const { container, unmount } = renderComponent(
      <BoundaryNumericEditor
        vertices={VERTICES}
        onVerticesChange={onVerticesChange}
      />,
    );

    click(buttonByText(container, "Dimensions"));
    const lengthInput = container.querySelector(
      'input[aria-label="Segment 1 length metres"]',
    );
    changeInput(lengthInput, "25");
    click(
      container.querySelector(
        'button[aria-label="Apply segment 1 dimensions"]',
      ),
    );

    expect(onVerticesChange).toHaveBeenCalledTimes(1);
    const updated = onVerticesChange.mock.calls[0][0];
    expect(updated).toHaveLength(VERTICES.length);
    expect(updated[1]).not.toEqual(VERTICES[1]);

    unmount();
  });
});
