import React, { useState } from "react";
import PropTypes from "prop-types";
import ArchitecturalLogo from "./ArchitecturalLogo.jsx";

const defaultLogoSrc = `${process.env.PUBLIC_URL || ""}/logo/company_logo.png`;

const CompanyLogo = ({
  size,
  className = "",
  alt = "ArchiAI Solution logo",
  src = defaultLogoSrc,
  fallback = false,
  style,
  onError,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);

  const hasSizeInStyle =
    !!style && (style.width != null || style.height != null);
  const hasSizeInClass =
    typeof className === "string" &&
    /(?:^|\s)(?:[a-zA-Z0-9_-]+:)?(?:w|h|size)-/.test(className);

  const resolvedSize =
    size ?? (!hasSizeInStyle && !hasSizeInClass ? 48 : undefined);
  const dimension =
    resolvedSize == null
      ? undefined
      : typeof resolvedSize === "number"
        ? `${resolvedSize}px`
        : resolvedSize;

  if (hasError) {
    if (fallback) {
      return (
        <ArchitecturalLogo size={resolvedSize ?? 48} className={className} />
      );
    }
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        ...(dimension ? { width: dimension, height: dimension } : {}),
        objectFit: "contain",
        ...style,
      }}
      draggable={false}
      onError={(event) => {
        onError?.(event);
        setHasError(true);
      }}
      {...props}
    />
  );
};

CompanyLogo.propTypes = {
  alt: PropTypes.string,
  className: PropTypes.string,
  fallback: PropTypes.bool,
  onError: PropTypes.func,
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  src: PropTypes.string,
  style: PropTypes.object,
};

export default CompanyLogo;
