/**
 * PrecisionPolygonEditor.dragHints.test.js
 *
 * Validates the corner-drag UX upgrades added in feat/boundary-cad-input:
 * - Hit-shadow markers paired with visible markers (Guardrail 6).
 * - onDragLiveDimension and onSnapHint callbacks emitted from _processDrag.
 * - All marker pairs torn down on disable() / destroy() (Guardrail 5/6).
 */

import { createPrecisionPolygonEditor } from "../PrecisionPolygonEditor.js";

let __raf_callbacks = [];

function flushRAF() {
  const queue = __raf_callbacks.slice();
  __raf_callbacks = [];
  queue.forEach((cb) => cb(performance.now()));
}

beforeEach(() => {
  __raf_callbacks = [];
  global.requestAnimationFrame = (cb) => {
    __raf_callbacks.push(cb);
    return __raf_callbacks.length;
  };
  global.cancelAnimationFrame = (handle) => {
    if (handle != null) {
      __raf_callbacks[handle - 1] = () => {};
    }
  };
});

function createMaps() {
  const allMarkers = new Set();

  class Marker {
    constructor(opts = {}) {
      this.opts = opts;
      this.position = opts.position || null;
      this.icon = opts.icon || null;
      this.label = opts.label || null;
      this.map = opts.map || null;
      this._listeners = new Map();
      allMarkers.add(this);
    }
    setPosition(p) {
      this.position = p;
    }
    setIcon(icon) {
      this.icon = icon;
    }
    setLabel(label) {
      this.label = label;
    }
    getLabel() {
      return this.label;
    }
    setMap(map) {
      this.map = map;
      if (map === null) allMarkers.delete(this);
    }
    setVisible() {}
    getPosition() {
      const p = this.position || { lat: 0, lng: 0 };
      return {
        lat: () => (typeof p.lat === "function" ? p.lat() : p.lat),
        lng: () => (typeof p.lng === "function" ? p.lng() : p.lng),
      };
    }
    addListener(event, handler) {
      const ref = { __event: event, __handler: handler };
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(ref);
      return ref;
    }
    fire(event, payload) {
      const arr = this._listeners.get(event) || [];
      arr.slice().forEach((ref) => ref.__handler(payload));
    }
  }

  class Polygon {
    constructor(opts = {}) {
      this.opts = opts;
      this.path = opts.paths || [];
      this.map = opts.map || null;
      this._listeners = new Map();
    }
    setPath(p) {
      this.path = p;
    }
    setOptions(o) {
      this.opts = { ...this.opts, ...o };
    }
    setMap(map) {
      this.map = map;
    }
    addListener(event, handler) {
      const ref = { __event: event, __handler: handler };
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(ref);
      return ref;
    }
    fire(event, payload) {
      const arr = this._listeners.get(event) || [];
      arr.slice().forEach((ref) => ref.__handler(payload));
    }
  }

  class Size {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
  }

  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }

  class LatLng {
    constructor(lat, lng) {
      this._lat = lat;
      this._lng = lng;
    }
    lat() {
      return this._lat;
    }
    lng() {
      return this._lng;
    }
  }

  class OverlayView {
    constructor() {
      this.onAdd = () => {};
      this.draw = () => {};
      this.onRemove = () => {};
    }
    setMap(map) {
      this.map = map;
    }
    getProjection() {
      return {
        fromLatLngToDivPixel(latLng) {
          return new Point(latLng.lng() * 100, -latLng.lat() * 100);
        },
        fromDivPixelToLatLng(pt) {
          return new LatLng(-pt.y / 100, pt.x / 100);
        },
      };
    }
  }

  function createMap() {
    const handlers = new Map();
    return {
      __handlers: handlers,
      __opts: {},
      addListener(event, handler) {
        const ref = { __event: event, __handler: handler };
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(ref);
        return ref;
      },
      addListenerOnce: () => ({}),
      setOptions(o) {
        this.__opts = { ...this.__opts, ...o };
      },
      get(key) {
        return this.__opts[key];
      },
      fire(event, payload) {
        const arr = handlers.get(event) || [];
        arr.slice().forEach((ref) => ref.__handler(payload));
      },
      getZoom: () => 18,
      getDiv: () => ({ focus: () => {} }),
    };
  }

  return {
    createMap,
    allMarkers,
    google: {
      maps: {
        Marker,
        Polygon,
        OverlayView,
        Point,
        LatLng,
        Size,
        SymbolPath: { CIRCLE: "CIRCLE" },
        event: {
          addListenerOnce: () => ({}),
          removeListener: () => {},
          addListener(target, event, handler) {
            return target.addListener(event, handler);
          },
        },
      },
    },
  };
}

const SQUARE = [
  [-122.4, 37.7],
  [-122.4, 37.71],
  [-122.39, 37.71],
  [-122.39, 37.7],
];

describe("PrecisionPolygonEditor drag hints", () => {
  test("creates a hit-shadow marker per visible marker plus edge labels", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google);
    editor.setVertices(SQUARE);
    editor.enable();

    // 4 vertices × 2 markers each (visible + hit) = 8 markers, plus the
    // 4 midpoint markers between them = 12, plus 4 edge-length labels = 16.
    expect(allMarkers.size).toBe(16);

    editor.destroy();

    // After destroy(): every marker setMap(null), set should be empty.
    expect(allMarkers.size).toBe(0);
  });

  test("dragging a hit marker emits live dimension + ortho snap hint", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const dragSamples = [];
    const snapHints = [];

    const editor = createPrecisionPolygonEditor(map, google, {
      onDragLiveDimension: (info) => dragSamples.push(info),
      onSnapHint: (hint) => snapHints.push(hint),
    });
    editor.setVertices(SQUARE);
    editor.enable();

    // Find the hit marker for index 2 (the one whose previous vertex exists).
    // vertexMarkers[2] = { visible, hit } — fire dragstart + drag on the hit.
    const pair = editor.vertexMarkers[2];
    expect(pair?.hit).toBeDefined();
    expect(pair?.visible).toBeDefined();

    // Simulate Shift held so ortho snap engages.
    editor.shiftPressed = true;

    pair.hit.fire("dragstart");
    pair.hit.fire("drag", {
      latLng: new google.maps.LatLng(37.71, -122.388),
    });

    // The drag listener queues a RAF; flush it.
    flushRAF();

    expect(dragSamples.length).toBeGreaterThan(0);
    expect(dragSamples[0]).toMatchObject({
      index: 2,
      lengthM: expect.any(Number),
      bearingDeg: expect.any(Number),
    });
    expect(dragSamples[0].lengthM).toBeGreaterThan(0);

    // 'ortho' was emitted because Shift was held and the new coord differed
    // from the raw cursor (snap engaged).
    expect(snapHints).toContain("ortho");

    editor.destroy();
  });

  test("dragend nulls out the live overlay (Guardrail 5 cleanup)", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const dragSamples = [];
    const snapHints = [];

    const editor = createPrecisionPolygonEditor(map, google, {
      onDragLiveDimension: (info) => dragSamples.push(info),
      onSnapHint: (hint) => snapHints.push(hint),
    });
    editor.setVertices(SQUARE);
    editor.enable();

    // Hold Shift so the drag actually emits an "ortho" snap hint we can then
    // verify gets cleared on dragend (the de-duplication guard inside
    // _emitSnapHint only fires when the hint actually changes value).
    editor.shiftPressed = true;

    const pair = editor.vertexMarkers[1];
    pair.hit.fire("dragstart");
    pair.hit.fire("drag", {
      latLng: new google.maps.LatLng(37.715, -122.388),
    });
    flushRAF();
    expect(snapHints).toContain("ortho");

    pair.hit.fire("dragend");

    // After dragend the editor should emit a `null` to the live-dimension
    // sink so the overlay can hide.
    const nullDimEmits = dragSamples.filter((sample) => sample === null);
    expect(nullDimEmits.length).toBe(1);
    // Snap hint cleared too.
    expect(snapHints[snapHints.length - 1]).toBeNull();

    editor.destroy();
  });

  test("disable() clears every paired marker and emits null overlay state", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const dragSamples = [];
    const snapHints = [];
    const editor = createPrecisionPolygonEditor(map, google, {
      onDragLiveDimension: (info) => dragSamples.push(info),
      onSnapHint: (hint) => snapHints.push(hint),
    });
    editor.setVertices(SQUARE);
    editor.enable();
    expect(allMarkers.size).toBeGreaterThan(0);

    // Establish a non-null hint first so disable() emits a real "null"
    // transition (the de-dup guard would skip null-after-null).
    editor.shiftPressed = true;
    const pair = editor.vertexMarkers[1];
    pair.hit.fire("dragstart");
    pair.hit.fire("drag", {
      latLng: new google.maps.LatLng(37.715, -122.388),
    });
    flushRAF();
    expect(snapHints).toContain("ortho");

    editor.disable();
    expect(allMarkers.size).toBe(0);
    // Final emits ensure the host overlay can hide its tooltip + badge.
    expect(snapHints[snapHints.length - 1]).toBeNull();
    expect(dragSamples[dragSamples.length - 1]).toBeNull();
  });
});

describe("PrecisionPolygonEditor focused state", () => {
  test("focused: false renders polygon clickable but creates no markers", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google, {
      focused: false,
    });
    editor.setVertices(SQUARE);
    editor.enable();

    // Polygon overlay still exists and is clickable; vertex/midpoint/edge
    // labels are all suppressed.
    expect(allMarkers.size).toBe(0);
    expect(editor.polygonOverlay).toBeDefined();
    expect(editor.polygonOverlay.opts.clickable).toBe(true);

    editor.destroy();
  });

  test("clicking the polygon body when latent fires onPolygonBodyClick", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const calls = [];
    const editor = createPrecisionPolygonEditor(map, google, {
      focused: false,
      onPolygonBodyClick: (latLng) => calls.push(latLng),
    });
    editor.setVertices(SQUARE);
    editor.enable();

    editor.polygonOverlay.fire("click", {
      latLng: new google.maps.LatLng(37.705, -122.395),
    });

    expect(calls.length).toBe(1);
    expect(typeof calls[0].lat).toBe("function");
    editor.destroy();
  });

  test("setFocused(true) after construction creates markers via _refresh", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google, {
      focused: false,
    });
    editor.setVertices(SQUARE);
    editor.enable();
    expect(allMarkers.size).toBe(0);

    editor.setFocused(true);
    // 8 paired vertex markers + 4 midpoints + 4 edge labels = 16.
    expect(allMarkers.size).toBe(16);

    editor.destroy();
  });

  test("placeholder: true suppresses vertex/midpoint markers", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google, {
      placeholder: true,
    });
    editor.setVertices(SQUARE);
    editor.enable();
    // Placeholder suppresses all markers (vertex + midpoint + edge labels).
    expect(allMarkers.size).toBe(0);
    editor.destroy();
  });
});

describe("PrecisionPolygonEditor edge labels", () => {
  test("creates one edge label per edge with a length string", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google);
    editor.setVertices(SQUARE);
    editor.enable();

    expect(editor.edgeLabelMarkers.length).toBe(4);
    editor.edgeLabelMarkers.forEach((m) => {
      expect(m).toBeDefined();
      expect(m.label?.text).toEqual(expect.any(String));
      expect(m.label.text.length).toBeGreaterThan(0);
    });

    editor.destroy();
  });

  test("showEdgeLabels: false suppresses edge labels", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google, {
      showEdgeLabels: false,
    });
    editor.setVertices(SQUARE);
    editor.enable();
    // 4 visible + 4 hit + 4 midpoint = 12 (no edge labels).
    expect(allMarkers.size).toBe(12);
    expect(editor.edgeLabelMarkers.length).toBe(0);
    editor.destroy();
  });

  test("dragging a vertex updates the two adjacent edge labels", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google);
    editor.setVertices(SQUARE);
    editor.enable();

    const beforeIncoming = editor.edgeLabelMarkers[0].label.text;
    const beforeOutgoing = editor.edgeLabelMarkers[1].label.text;

    const pair = editor.vertexMarkers[1];
    pair.hit.fire("dragstart");
    pair.hit.fire("drag", {
      latLng: new google.maps.LatLng(37.72, -122.398),
    });
    flushRAF();

    expect(editor.edgeLabelMarkers[0].label.text).not.toBe(beforeIncoming);
    expect(editor.edgeLabelMarkers[1].label.text).not.toBe(beforeOutgoing);

    editor.destroy();
  });
});

describe("PrecisionPolygonEditor body translate", () => {
  test("polygon body mousedown + map mousemove translates every vertex", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const polyChanges = [];
    const editor = createPrecisionPolygonEditor(map, google, {
      onPolygonChange: (verts) => polyChanges.push(verts),
    });
    editor.setVertices(SQUARE);
    editor.enable();
    const original = editor.getVertices();

    editor.polygonOverlay.fire("mousedown", {
      latLng: new google.maps.LatLng(37.705, -122.395),
    });
    map.fire("mousemove", {
      latLng: new google.maps.LatLng(37.715, -122.385),
    });
    flushRAF();

    // Every vertex should have moved by the same delta.
    const after = editor.getVertices();
    const dLng = after[0][0] - original[0][0];
    const dLat = after[0][1] - original[0][1];
    expect(dLng).toBeCloseTo(0.01, 5);
    expect(dLat).toBeCloseTo(0.01, 5);
    after.forEach((v, i) => {
      expect(v[0] - original[i][0]).toBeCloseTo(dLng, 5);
      expect(v[1] - original[i][1]).toBeCloseTo(dLat, 5);
    });

    map.fire("mouseup");
    expect(polyChanges.length).toBe(1);

    editor.destroy();
  });

  test("Shift held during translate constrains delta to one axis", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google);
    editor.setVertices(SQUARE);
    editor.enable();
    const original = editor.getVertices();

    editor.shiftPressed = true;
    editor.polygonOverlay.fire("mousedown", {
      latLng: new google.maps.LatLng(37.705, -122.395),
    });
    // dLat = 0.001, dLng = 0.005 → |dLng| dominates, so dLat should be zeroed.
    map.fire("mousemove", {
      latLng: new google.maps.LatLng(37.706, -122.39),
    });
    flushRAF();

    const after = editor.getVertices();
    expect(after[0][0]).not.toBeCloseTo(original[0][0], 6);
    expect(after[0][1]).toBeCloseTo(original[0][1], 6);

    map.fire("mouseup");
    editor.destroy();
  });

  test("body click after translate does NOT insert a stray vertex", () => {
    const { google, createMap } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google);
    editor.setVertices(SQUARE);
    editor.enable();
    const before = editor.getVertices().length;

    editor.polygonOverlay.fire("mousedown", {
      latLng: new google.maps.LatLng(37.705, -122.395),
    });
    map.fire("mousemove", {
      latLng: new google.maps.LatLng(37.706, -122.394),
    });
    flushRAF();
    map.fire("mouseup");

    // Trailing click that fires immediately after mouseup must be ignored.
    editor.polygonOverlay.fire("click", {
      latLng: new google.maps.LatLng(37.706, -122.394),
    });

    expect(editor.getVertices().length).toBe(before);

    editor.destroy();
  });
});
