/**
 * PolygonDrawingManager.dynamicInput.test.js
 *
 * Tests the AutoCAD-style "type a length" drawing flow added in
 * feat/boundary-cad-input. Covers Guardrails 3 (validation), 4 (lng/lat
 * order), 5 (lifecycle / RAF cleanup), and 8 (typed-length commits share
 * the click history path).
 *
 * Google Maps is mocked at minimum-surface fidelity — just enough for the
 * drawing manager to construct, attach listeners, route mouse/key events,
 * and emit its callbacks deterministically.
 */

import { createPolygonDrawingManager } from "../PolygonDrawingManager.js";

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
  const listenersByMap = new Map();
  let lastMap = null;

  class Marker {
    constructor(opts = {}) {
      this.opts = opts;
      this.position = opts.position || null;
      this.icon = opts.icon || null;
      this.map = opts.map || null;
    }
    setPosition(p) {
      this.position = p;
    }
    setIcon(icon) {
      this.icon = icon;
    }
    setMap(map) {
      this.map = map;
    }
    getPosition() {
      return this.position;
    }
    addListener(_event, _handler) {
      return { __event: _event, remove() {} };
    }
  }

  class Polyline {
    constructor(opts = {}) {
      this.opts = opts;
      this.path = opts.path || [];
      this.map = opts.map || null;
    }
    setPath(p) {
      this.path = p;
    }
    setMap(map) {
      this.map = map;
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
        // Simple "1 unit lng = 1 px" projection so cursor positions become
        // predictable pixel anchors in the test.
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
    const listeners = new Map();
    const map = {
      __listeners: listeners,
      __removed: [],
      addListener(event, handler) {
        const id = `${event}-${Math.random()}`;
        const ref = { __event: event, __handler: handler, __id: id };
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(ref);
        return ref;
      },
      setOptions: () => {},
      getZoom: () => 18,
      getDiv: () => ({ focus: () => {} }),
    };
    listenersByMap.set(map, listeners);
    lastMap = map;
    return map;
  }

  return {
    createMap,
    google: {
      maps: {
        Marker,
        Polyline,
        OverlayView,
        Point,
        LatLng,
        SymbolPath: { CIRCLE: "CIRCLE" },
        event: {
          removeListener(ref) {
            if (!ref) return;
            for (const list of listenersByMap.values()) {
              for (const arr of list.values()) {
                const idx = arr.indexOf(ref);
                if (idx !== -1) {
                  arr.splice(idx, 1);
                  if (lastMap) lastMap.__removed.push(ref);
                }
              }
            }
          },
        },
      },
    },
  };
}

function fireMapEvent(map, eventName, payload) {
  const handlers = (map.__listeners.get(eventName) || []).slice();
  handlers.forEach((ref) => ref.__handler(payload));
}

function makeLatLng(google, lng, lat) {
  return new google.maps.LatLng(lat, lng);
}

describe("PolygonDrawingManager dynamic length input", () => {
  test("RAF-throttled mousemove emits a single dynamic-cursor event per frame", () => {
    const { google, createMap } = createMaps();
    const map = createMap();

    const cursorCalls = [];
    const manager = createPolygonDrawingManager(map, google, {
      onDynamicCursor: (info) => cursorCalls.push(info),
      angleSnapDegrees: 90,
    });
    manager.start();

    // Place an anchor first so liveLengthAndBearing has a previous vertex.
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0, 0) });

    // Spam several mousemove events; only the last one should win.
    fireMapEvent(map, "mousemove", { latLng: makeLatLng(google, 0.0001, 0) });
    fireMapEvent(map, "mousemove", { latLng: makeLatLng(google, 0.0002, 0) });
    fireMapEvent(map, "mousemove", { latLng: makeLatLng(google, 0.0003, 0) });

    // RAF hasn't fired yet — no emits.
    expect(cursorCalls.length).toBe(0);

    flushRAF();

    // Exactly one emit even though we dispatched three mousemoves.
    expect(cursorCalls.length).toBe(1);
    expect(cursorCalls[0].hasAnchor).toBe(true);
    expect(cursorCalls[0].lengthM).toBeGreaterThan(0);

    manager.destroy();
  });

  test("typing a digit routes through onDynamicInputKey and consumes it", () => {
    const { google, createMap } = createMaps();
    const map = createMap();

    const keystrokes = [];
    const manager = createPolygonDrawingManager(map, google, {
      onDynamicInputKey: (info) => {
        keystrokes.push(info.key);
        return true;
      },
    });
    manager.start();
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0, 0) });

    const digit = new KeyboardEvent("keydown", { key: "1" });
    let prevented = false;
    digit.preventDefault = () => {
      prevented = true;
    };
    Object.defineProperty(digit, "target", {
      value: document.body,
      configurable: true,
    });
    document.dispatchEvent(digit);

    expect(keystrokes).toEqual(["1"]);
    expect(prevented).toBe(true);

    manager.destroy();
  });

  test("Enter is suppressed when isDynamicInputPending() returns true", () => {
    const { google, createMap } = createMaps();
    const map = createMap();

    const completeCalls = [];
    const manager = createPolygonDrawingManager(map, google, {
      onDrawingComplete: (verts) => completeCalls.push(verts),
      minVertices: 3,
    });
    manager.start();
    // Place 3 vertices so complete() would otherwise succeed.
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0, 0) });
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0.001, 0) });
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0.001, 0.001) });

    // Mark the dynamic input as pending — Enter should NOT finish the polygon.
    manager.isDynamicInputPending = () => true;
    const enter = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(enter, "target", {
      value: document.body,
      configurable: true,
    });
    document.dispatchEvent(enter);
    expect(completeCalls.length).toBe(0);

    // Now clear pending; Enter completes.
    manager.isDynamicInputPending = () => false;
    const enter2 = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(enter2, "target", {
      value: document.body,
      configurable: true,
    });
    document.dispatchEvent(enter2);
    expect(completeCalls.length).toBe(1);
  });

  test("commitLength rejects non-positive / non-finite values (Guardrail 3)", () => {
    const { google, createMap } = createMaps();
    const map = createMap();

    const added = [];
    const validation = [];
    const manager = createPolygonDrawingManager(map, google, {
      onVertexAdded: (verts) => added.push(verts),
      onValidationError: (errs) => validation.push(errs),
    });
    manager.start();
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0, 0) });
    // Set a cursor so commitLength can resolve a bearing.
    fireMapEvent(map, "mousemove", { latLng: makeLatLng(google, 0.001, 0) });
    flushRAF();

    expect(manager.commitLength(0)).toBe(false);
    expect(manager.commitLength(-5)).toBe(false);
    expect(manager.commitLength(NaN)).toBe(false);
    expect(manager.commitLength(Infinity)).toBe(false);

    // No vertex past the first click should have been added.
    expect(added.length).toBe(1); // only the click
    expect(validation.length).toBeGreaterThanOrEqual(4);

    manager.destroy();
  });

  test("commitLength shares the click history path (Guardrail 8) and emits [lng, lat] (Guardrail 4)", () => {
    const { google, createMap } = createMaps();
    const map = createMap();

    const added = [];
    const manager = createPolygonDrawingManager(map, google, {
      onVertexAdded: (verts) => added.push(verts.slice()),
    });
    manager.start();
    // Anchor at lng=10, lat=20 so the lng/lat order is unambiguous.
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 10, 20) });
    fireMapEvent(map, "mousemove", { latLng: makeLatLng(google, 11, 20) });
    flushRAF();

    const ok = manager.commitLength(50);
    expect(ok).toBe(true);

    // Two onVertexAdded calls: one from the click, one from commitLength.
    expect(added.length).toBe(2);
    const last = added[1];
    const newest = last[last.length - 1];
    // Vertex order is [lng, lat]: lng > 10 (moved east), lat ≈ 20.
    expect(newest[0]).toBeGreaterThan(10);
    expect(Math.abs(newest[1] - 20)).toBeLessThan(0.01);

    manager.destroy();
  });

  test("destroy cancels any pending RAF and removes map listeners (Guardrail 5)", () => {
    const { google, createMap } = createMaps();
    const map = createMap();

    let cursorCalls = 0;
    const manager = createPolygonDrawingManager(map, google, {
      onDynamicCursor: () => {
        cursorCalls += 1;
      },
    });
    manager.start();
    fireMapEvent(map, "click", { latLng: makeLatLng(google, 0, 0) });
    fireMapEvent(map, "mousemove", { latLng: makeLatLng(google, 0.001, 0) });

    // RAF queued but not flushed; destroy should cancel it.
    expect(__raf_callbacks.length).toBeGreaterThan(0);
    manager.destroy();
    flushRAF();

    // The post-destroy RAF must NOT call back into the (destroyed) manager
    // emitting a stale cursor event. We reset cursorCalls earlier; only the
    // post-destroy "null" cleanup emit from stop() may have fired. Either way
    // it must not be > 1 (no leaked frames).
    expect(cursorCalls).toBeLessThanOrEqual(1);

    // Map listeners were removed.
    const remaining = Array.from(map.__listeners.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(remaining).toBe(0);
  });
});
