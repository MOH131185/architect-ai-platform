/**
 * GeometryFirstSettings - Toggle for the Geometry-First pipeline
 *
 * Provides a UI toggle for the geometryFirst feature flag, which enables
 * the precision geometry pipeline (99.5% dimensional accuracy) vs the
 * default DNA-only pipeline (98% accuracy).
 */

import React, { useState, useEffect } from "react";
import { isFeatureEnabled, setFeatureFlag } from "../config/featureFlags.js";

const GeometryFirstSettings = ({ onChange }) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isFeatureEnabled("geometryFirst"));
  }, []);

  const handleToggle = (value) => {
    setFeatureFlag("geometryFirst", value);
    setEnabled(value);
    if (onChange) onChange(value);
  };

  return (
    <div style={containerStyle}>
      <div style={{ flex: 1 }}>
        <div style={labelStyle}>Geometry-First Pipeline</div>
        <div style={descStyle}>
          Enable precision 3D geometry generation for 99.5% dimensional
          accuracy. Uses spatial layout algorithms and Three.js rendering before
          AI stylization.
        </div>
      </div>
      <label style={switchLabelStyle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          style={{ display: "none" }}
          data-testid="geometryFirst-toggle"
        />
        <span
          style={{
            ...trackStyle,
            backgroundColor: enabled ? "#2196F3" : "#ccc",
          }}
        >
          <span
            style={{
              ...thumbStyle,
              transform: enabled ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </span>
      </label>
    </div>
  );
};

const containerStyle = {
  display: "flex",
  alignItems: "center",
  gap: "15px",
  padding: "15px",
  backgroundColor: "#f5f8ff",
  borderRadius: "8px",
  border: "1px solid #d0ddf0",
};

const labelStyle = {
  fontWeight: "600",
  fontSize: "14px",
  color: "#333",
  marginBottom: "4px",
};

const descStyle = {
  fontSize: "12px",
  color: "#666",
  lineHeight: "1.4",
};

const switchLabelStyle = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
};

const trackStyle = {
  position: "relative",
  width: "44px",
  height: "24px",
  borderRadius: "12px",
  transition: "background-color 0.3s",
  display: "flex",
  alignItems: "center",
  padding: "2px",
};

const thumbStyle = {
  width: "20px",
  height: "20px",
  borderRadius: "50%",
  backgroundColor: "white",
  transition: "transform 0.3s",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
};

export default GeometryFirstSettings;
