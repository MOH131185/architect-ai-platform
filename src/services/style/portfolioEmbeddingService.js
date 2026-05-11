import logger from "../../utils/logger.js";
import { generateStyleEmbedding as routeStyleEmbedding } from "../models/openSourceModelRouter.js";

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values
        .flat()
        .map((entry) =>
          typeof entry === "string"
            ? compactText(entry)
            : compactText(entry?.name || entry?.material || entry?.label),
        )
        .filter(Boolean),
    ),
  ];
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry != null);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normalizeSourceGaps(reference = {}) {
  return [
    ...toArray(reference.sourceGaps),
    ...toArray(reference.pdf?.sourceGaps),
  ].filter(Boolean);
}

function hasSourceGap(reference, code) {
  return normalizeSourceGaps(reference).some((gap) => gap?.code === code);
}

function normalizeReference(reference, index) {
  if (typeof reference === "string") {
    return {
      id: `portfolio-${index}`,
      url: reference,
      description: "",
      tags: [],
      materials: [],
      buildingType: null,
      style: null,
      colours: [],
      presentationKeywords: [],
      drawingTypes: [],
      sourceGaps: [],
      hasEvidence: true,
    };
  }

  const portfolioStyleEvidence = reference.portfolioStyleEvidence || {};
  const sourceGaps = normalizeSourceGaps(reference);
  const imageOnlyPdf = hasSourceGap(reference, "PDF_TEXT_NOT_SELECTABLE");
  const evidenceAllowed = !imageOnlyPdf;
  const materials = uniqueStrings([
    reference.materials,
    evidenceAllowed ? portfolioStyleEvidence.materials : [],
  ]);
  const colours = uniqueStrings([
    reference.colours,
    reference.colors,
    evidenceAllowed
      ? portfolioStyleEvidence.colours || portfolioStyleEvidence.colors
      : [],
  ]);
  const styleKeywords = uniqueStrings([
    reference.styleKeywords,
    evidenceAllowed ? portfolioStyleEvidence.styleKeywords : [],
  ]);
  const presentationKeywords = uniqueStrings([
    reference.presentationKeywords,
    evidenceAllowed ? portfolioStyleEvidence.presentationKeywords : [],
  ]);
  const drawingTypes = uniqueStrings([
    reference.drawingTypes,
    evidenceAllowed ? portfolioStyleEvidence.drawingTypes : [],
  ]);
  const tags = uniqueStrings([
    reference.tags,
    reference.keywords,
    styleKeywords,
    presentationKeywords,
    drawingTypes,
    colours,
  ]);
  const buildingTypes = uniqueStrings([
    reference.buildingTypes,
    reference.buildingType,
    reference.program,
    evidenceAllowed ? portfolioStyleEvidence.buildingTypes : [],
  ]);
  const style = reference.style || styleKeywords[0] || null;
  const url = reference.url || null;
  const description = reference.description || reference.caption || "";
  const isImageMetadata = String(reference.type || "").startsWith("image/");
  const hasEvidence =
    !imageOnlyPdf &&
    Boolean(
      url ||
      reference.dataUrl ||
      isImageMetadata ||
      compactText(description) ||
      tags.length ||
      materials.length ||
      buildingTypes.length ||
      style ||
      drawingTypes.length,
    );

  return {
    id: reference.id || `portfolio-${index}`,
    url,
    description,
    tags,
    materials,
    buildingType: buildingTypes[0] || null,
    buildingTypes,
    style,
    colours,
    presentationKeywords,
    drawingTypes,
    sourceGaps,
    hasEvidence,
  };
}

function countValues(values = []) {
  return values.reduce((accumulator, value) => {
    const key = String(value).toLowerCase();
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function takeTopKeys(counter = {}, limit = 5) {
  return Object.entries(counter)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export function summarizePortfolioReferences(references = []) {
  const normalized = references.map(normalizeReference);
  const evidenceReferences = normalized.filter(
    (reference) => reference.hasEvidence,
  );
  const tags = evidenceReferences.flatMap((reference) => reference.tags);
  const materials = evidenceReferences.flatMap(
    (reference) => reference.materials,
  );
  const styles = evidenceReferences
    .map((reference) => reference.style)
    .filter(Boolean);
  const buildingTypes = evidenceReferences.flatMap(
    (reference) => reference.buildingTypes || reference.buildingType || [],
  );
  const colours = evidenceReferences.flatMap((reference) => reference.colours);
  const presentationKeywords = evidenceReferences.flatMap(
    (reference) => reference.presentationKeywords,
  );
  const drawingTypes = evidenceReferences.flatMap(
    (reference) => reference.drawingTypes,
  );
  const sourceGaps = normalized.flatMap((reference) => reference.sourceGaps);

  return {
    references: normalized,
    reference_count: evidenceReferences.length,
    dominant_tags: takeTopKeys(countValues(tags)),
    dominant_materials: takeTopKeys(countValues(materials)),
    dominant_styles: takeTopKeys(countValues(styles)),
    dominant_building_types: takeTopKeys(countValues(buildingTypes)),
    dominant_colours: takeTopKeys(countValues(colours)),
    dominant_presentation_keywords: takeTopKeys(
      countValues(presentationKeywords),
    ),
    dominant_drawing_types: takeTopKeys(countValues(drawingTypes)),
    sourceGaps,
  };
}

export async function analyzePortfolioReferences(
  portfolioReferences = [],
  options = {},
) {
  const summary = summarizePortfolioReferences(portfolioReferences);
  const embedding = await routeStyleEmbedding(
    {
      references: summary.references,
      promptContext: [
        summary.dominant_tags.join(" "),
        summary.dominant_materials.join(" "),
        summary.dominant_styles.join(" "),
      ],
    },
    options,
  );

  logger.debug("[Style] Portfolio references analyzed", {
    referenceCount: summary.reference_count,
    adapterId: embedding.adapterId,
  });

  return {
    summary,
    embedding,
  };
}

/**
 * Contract: generateStyleEmbedding()
 *
 * Converts a portfolio image/reference set into a deterministic embedding plus
 * extracted style signals. The adapter behind this can later be swapped to
 * CLIP/SigLIP/IP-Adapter-aware inference without touching the callers.
 */
export async function generateStyleEmbedding(
  portfolioReferences = [],
  options = {},
) {
  const { summary, embedding: routed } = await analyzePortfolioReferences(
    portfolioReferences,
    options,
  );

  return {
    ...routed,
    summary,
  };
}

export default {
  analyzePortfolioReferences,
  generateStyleEmbedding,
  summarizePortfolioReferences,
};
