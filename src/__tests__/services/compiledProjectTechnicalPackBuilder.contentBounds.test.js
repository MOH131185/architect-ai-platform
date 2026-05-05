import { analyseTechnicalSvgContentFrame } from "../../services/canonical/compiledProjectTechnicalPackBuilder.js";

describe("analyseTechnicalSvgContentFrame", () => {
  test("ignores off-canvas guide lines but keeps technical drawing and text bounds tight", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#fff"/>
  <line id="dimension-guide-off-canvas" class="construction guide" x1="-4000" y1="450" x2="5200" y2="450" stroke="#999" stroke-dasharray="8 8"/>
  <line class="dimension-chain" x1="150" y1="780" x2="1040" y2="780" stroke="#111"/>
  <path class="plan-wall" d="M 180 160 L 980 160 L 980 700 L 180 700 Z" fill="none" stroke="#111"/>
  <text x="210" y="220" font-size="28">Living Room</text>
</svg>`;

    const frame = analyseTechnicalSvgContentFrame(svg, 1200, 900);

    expect(frame).toBeTruthy();
    expect(frame.contentBounds.x).toBeGreaterThanOrEqual(140);
    expect(frame.contentBounds.y).toBeGreaterThanOrEqual(130);
    expect(frame.contentBounds.width).toBeLessThan(950);
    expect(frame.contentBounds.height).toBeLessThan(680);
    expect(frame.normalization.ignoredGuideElementCount).toBeGreaterThan(0);
    expect(frame.normalizedViewBox).not.toContain("-4000");
    expect(frame.normalizedViewBox).not.toContain("5200");
  });
});
