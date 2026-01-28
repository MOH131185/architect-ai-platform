import React from "react";

const ArchitecturalLogo = ({ size = 48, className = "" }) => {
  // Generate unique IDs
  const uid = React.useId().replace(/:/g, "");
  const gradientId = `logo-gradient-${uid}`;
  const shadowId = `logo-shadow-${uid}`;

  // Scale factor based on 64px viewBox
  const containerStyle = {
    width: typeof size === "number" ? `${size}px` : size,
    height: typeof size === "number" ? `${size}px` : size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={containerStyle} className={className} aria-label="ArchiAI Logo">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="32"
            y1="8"
            x2="32"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1F5F9" />
          </linearGradient>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="3"
              floodColor="#0F172A"
              floodOpacity="0.15"
            />
          </filter>
        </defs>

        {/* Document Shape with Folded Corner */}
        <path
          d="M14 8C11.7909 8 10 9.79086 10 12V52C10 54.2091 11.7909 56 14 56H50C52.2091 56 54 54.2091 54 52V20L42 8H14Z"
          fill={`url(#${gradientId})`}
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${shadowId})`}
        />

        {/* Folded Corner Detail */}
        <path
          d="M42 8V20H54"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="rgba(255,255,255,0.5)"
        />

        {/* Internal House Icon - Centered & Proportional */}
        {/* Roof */}
        <path
          d="M22 32L32 23L42 32"
          stroke="#3B82F6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Body of House */}
        <path
          d="M25 32V44H39V32"
          stroke="#3B82F6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Door */}
        <path
          d="M29 44V38H35V44"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default ArchitecturalLogo;
