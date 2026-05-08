/**
 * BoundaryDynamicInput.jsx
 *
 * AutoCAD-style "dynamic input" overlay for the site-boundary draw and edit
 * surface. Anchored at a pixel position relative to the map container, the
 * overlay shows:
 *   - the current segment length (typed by the user in DRAW mode, or
 *     measured from the previous vertex in DRAG mode);
 *   - the live bearing (informational);
 *   - a small snap badge (ORTHO / ENDPOINT) when a snap is active;
 *   - error feedback when the typed length is non-positive or unparseable.
 *
 * Pure presentational. The host (SiteBoundaryEditorV2) owns the state and
 * the keyboard routing; the host calls `onCommit(lengthM)` when the user
 * presses Enter (DRAW mode only), and `onCancel()` for Escape.
 *
 * Guardrails:
 *  - 3: rejects NaN, Infinity, zero, and negative values; accepts both '.'
 *    and ',' as decimal separators.
 *  - 9: hidden on coarse pointers (touch / mobile).
 *  - Accessibility: aria-live="polite" status node; map keeps focus until
 *    the user actually types into the input (host handles that handoff).
 *
 * @module BoundaryDynamicInput
 */

import React, { useEffect, useMemo, useRef } from "react";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * Parse a length string into a positive finite number. Returns null when the
 * input is empty, contains junk, or fails the > 0 guardrail.
 * Accepts comma or period as decimal separator (locale-friendly).
 *
 * @param {string} raw
 * @returns {number | null}
 */
export function parseLengthMeters(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Reject anything that isn't digits, separator, or sign — this is what
  // protects us from things like "12.5.5" or "12abc".
  if (!/^[+-]?\d*[.,]?\d*$/.test(trimmed)) return null;
  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function isCoarsePointer() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  try {
    return window.matchMedia(COARSE_POINTER_QUERY).matches;
  } catch (e) {
    return false;
  }
}

function formatLength(value, units) {
  if (!Number.isFinite(value)) return "";
  return `${value.toFixed(2)} ${units}`;
}

function formatBearing(value) {
  if (!Number.isFinite(value)) return "";
  return `${value.toFixed(1)}°`;
}

const BADGE_LABELS = {
  ortho: "ORTHO",
  vertex: "ENDPOINT",
};

export function BoundaryDynamicInput({
  visible = false,
  anchorPx = null,
  mode = "draw",
  lengthValue = "",
  liveLengthM = 0,
  liveBearingDeg = 0,
  snapHint = null,
  units = "m",
  onLengthChange,
  onCommit,
  onCancel,
  inputRef = null,
}) {
  const internalRef = useRef(null);
  const ref = inputRef || internalRef;

  // Hide entirely on coarse pointers so touch users don't get a tiny float
  // input. Bigger markers + RAF preview still apply on touch.
  const hideForTouch = useMemo(() => isCoarsePointer(), []);

  // When the host hides the overlay, also clear any browser focus.
  useEffect(() => {
    if (!visible && ref.current === document.activeElement) {
      ref.current.blur();
    }
  }, [visible, ref]);

  if (!visible || hideForTouch || !anchorPx) {
    return null;
  }

  const parsed = parseLengthMeters(lengthValue);
  const isInvalid = lengthValue.trim() !== "" && parsed === null;
  const isReadOnly = mode === "drag";
  const badge =
    snapHint && BADGE_LABELS[snapHint] ? BADGE_LABELS[snapHint] : null;

  const liveDisplay = formatLength(liveLengthM, units);
  const bearingDisplay = formatBearing(liveBearingDeg);

  const ariaStatus = isReadOnly
    ? `Length ${liveDisplay}, bearing ${bearingDisplay}`
    : `Length ${lengthValue || liveDisplay}, bearing ${bearingDisplay}${
        isInvalid ? ", invalid value" : ""
      }`;

  const handleKeyDown = (event) => {
    if (isReadOnly) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (parsed !== null && typeof onCommit === "function") {
        onCommit(parsed);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (typeof onCancel === "function") {
        onCancel();
      }
    }
  };

  const handleChange = (event) => {
    if (isReadOnly) return;
    if (typeof onLengthChange === "function") {
      onLengthChange(event.target.value);
    }
  };

  const wrapperStyle = {
    position: "absolute",
    left: `${Math.round(anchorPx.x + 12)}px`,
    top: `${Math.round(anchorPx.y + 12)}px`,
    pointerEvents: "none",
    zIndex: 50,
    direction: "ltr",
  };

  const cardClassName = [
    "pointer-events-auto",
    "select-none",
    "bg-white/95",
    "backdrop-blur",
    "shadow-md",
    "rounded-md",
    "px-3",
    "py-2",
    "text-xs",
    "font-mono",
    "text-gray-800",
    "border",
    isInvalid ? "border-red-500" : "border-gray-300",
  ].join(" ");

  const inputClassName = [
    "w-24",
    "px-2",
    "py-1",
    "rounded",
    "border",
    "text-sm",
    "font-mono",
    "outline-none",
    "focus:ring-2",
    isInvalid
      ? "border-red-500 focus:ring-red-200"
      : "border-gray-300 focus:ring-blue-200",
  ].join(" ");

  return (
    <div style={wrapperStyle} role="presentation">
      <div className={cardClassName}>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-[10px] text-gray-500">
            Length
          </span>
          {isReadOnly ? (
            <span className="text-sm font-semibold text-gray-900">
              {liveDisplay || "—"}
            </span>
          ) : (
            <input
              ref={ref}
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={lengthValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              aria-label="Length in meters"
              aria-invalid={isInvalid ? "true" : "false"}
              className={inputClassName}
              placeholder={liveDisplay || "0.00"}
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <span className="text-[10px] text-gray-500">{units}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
          <span>Bearing</span>
          <span className="font-semibold text-gray-700">
            {bearingDisplay || "—"}
          </span>
          {badge ? (
            <span
              className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-emerald-600 text-white"
              data-testid="boundary-dynamic-snap-badge"
            >
              {badge}
            </span>
          ) : null}
        </div>
        {isInvalid ? (
          <div className="mt-1 text-[10px] text-red-600" role="alert">
            Length must be a positive number.
          </div>
        ) : null}
      </div>
      <div className="sr-only" aria-live="polite">
        {ariaStatus}
      </div>
    </div>
  );
}

export default BoundaryDynamicInput;
