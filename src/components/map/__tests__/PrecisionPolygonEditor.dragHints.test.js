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
    setMap(map) {
      this.map = map;
    }
    addListener(event, handler) {
      const ref = { __event: event, __handler: handler };
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(ref);
      return ref;
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
      addListener(event, handler) {
        const ref = { __event: event, __handler: handler };
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(ref);
        return ref;
      },
      addListenerOnce: () => ({}),
      setOptions: () => {},
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
        SymbolPath: { CIRCLE: "CIRCLE" },
        event: {
          addListenerOnce: () => ({}),
          removeListener: () => {},
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
  test("creates a hit-shadow marker per visible marker (Guardrail 6 pairing)", () => {
    const { google, createMap, allMarkers } = createMaps();
    const map = createMap();
    const editor = createPrecisionPolygonEditor(map, google);
    editor.setVertices(SQUARE);
    editor.enable();

    // 4 vertices × 2 markers each (visible + hit) = 8 markers, plus the
    // 4 midpoint markers between them = 12 total.
    expect(allMarkers.size).toBe(12);

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
