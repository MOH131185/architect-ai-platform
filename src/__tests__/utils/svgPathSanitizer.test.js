import {
  isInvalidSvgPathData,
  sanitizeInvalidSvgPaths,
  sanitizeSvgDataUrl,
} from "../../utils/svgPathSanitizer.js";

function decodedSvgPayload(dataUrl) {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

describe("svgPathSanitizer", () => {
  test("removes invalid path data from inline SVG strings", () => {
    const sanitized = sanitizeInvalidSvgPaths(`
      <svg>
        <path d="undefined" stroke="red" />
        <path d="L 0 0 L 10 10" stroke="orange" />
        <path d="M 0 0 L 10 10" stroke="black" />
      </svg>
    `);

    expect(sanitized).not.toContain('d="undefined"');
    expect(sanitized).not.toContain('d="L 0 0 L 10 10"');
    expect(sanitized).toContain('d="M 0 0 L 10 10"');
  });

  test("sanitizes URL-encoded SVG data URLs before viewer use", () => {
    const svg = '<svg><path d="undefined" /><path d="M 0 0 L 10 10" /></svg>';
    const sanitized = sanitizeSvgDataUrl(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
    const decoded = decodedSvgPayload(sanitized);

    expect(decoded).not.toContain('d="undefined"');
    expect(decoded).toContain('d="M 0 0 L 10 10"');
  });

  test("sanitizes base64 SVG data URLs before viewer use", () => {
    const svg = '<svg><path d="undefined" /><path d="M 0 0 L 10 10" /></svg>';
    const sanitized = sanitizeSvgDataUrl(
      `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString(
        "base64",
      )}`,
    );
    const decoded = decodedSvgPayload(sanitized);

    expect(decoded).not.toContain('d="undefined"');
    expect(decoded).toContain('d="M 0 0 L 10 10"');
  });

  test("flags missing and non-moveto path data as invalid", () => {
    expect(isInvalidSvgPathData(undefined)).toBe(true);
    expect(isInvalidSvgPathData("undefined")).toBe(true);
    expect(isInvalidSvgPathData("L 0 0")).toBe(true);
    expect(isInvalidSvgPathData("M 0 0")).toBe(false);
  });

  test("leaves malformed SVG data URLs unchanged instead of throwing", () => {
    const malformed = "data:image/svg+xml;base64,%%%";

    expect(sanitizeSvgDataUrl(malformed)).toBe(malformed);
  });
});
