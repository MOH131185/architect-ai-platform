/**
 * Regulation rule engine — orchestrates per-Approved-Document checks against
 * the compiled ProjectGraph. Plan §6.4 / §4.5.
 *
 * Returns RegulationCheckResult[]. Manual-review entries are produced for
 * Approved Documents that don't yet have rule modules so the audit trail is
 * complete and source citations are preserved.
 */

import { findSourceByPart } from "./sourceRegistry.js";
import {
  resolveJurisdiction,
  jurisdictionLimitations,
} from "./jurisdictionRouter.js";
import { checkPartM } from "./rules/partM.js";
import { checkPartK } from "./rules/partK.js";
import { checkPartO } from "./rules/partO.js";

const RULE_DISPATCHERS = Object.freeze({
  M: checkPartM,
  K: checkPartK,
  O: checkPartO,
});

function manualReviewCheck(part) {
  const source = findSourceByPart(part);
  return {
    check_id: `ad-${String(part)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-manual`,
    title: source?.title || `Approved Document ${part}`,
    source_document_id: source?.document_id || null,
    source_url: source?.source_url || "",
    severity: "needs_consultant",
    status: "manual_review",
    applies_to_element_ids: [],
    summary: `Approved Document ${part} requires consultant review at this stage; no automated rule evaluation is configured.`,
    recommended_action: source?.title
      ? `Engage a qualified consultant to evaluate against ${source.title}.`
      : `Engage a qualified consultant to evaluate Approved Document ${part}.`,
  };
}

/**
 * Run regulation rules for a project context. Pure function — does not mutate
 * inputs.
 *
 * @param {object} ctx
 * @param {object} ctx.brief - Normalised brief (must have building_type, target_storeys).
 * @param {object} ctx.climate - Climate pack (optional but recommended).
 * @param {object} ctx.programme - Programme with spaces array.
 * @param {object} ctx.projectGeometry - Compiled geometry with rooms/walls/doors/windows/stairs.
 * @param {string[]} ctx.applicableParts - Parts to evaluate.
 * @returns {{ jurisdiction: string, results: object[], rule_coverage: object[] }}
 */
export function runRegulationRules({
  brief,
  climate,
  programme,
  projectGeometry,
  applicableParts = [],
} = {}) {
  const jurisdiction = resolveJurisdiction(brief);
  const limitations = jurisdictionLimitations(jurisdiction);

  // For non-England jurisdictions every part returns manual_review with a
  // jurisdiction-routed limitation note.
  if (jurisdiction !== "england") {
    const results = applicableParts.map((part) => {
      const base = manualReviewCheck(part);
      return {
        ...base,
        summary: `Jurisdiction "${jurisdiction}" routes AD ${part} to nation-specific guidance; rule engine does not evaluate.`,
      };
    });
    return {
      jurisdiction,
      limitations,
      results,
      rule_coverage: applicableParts.map((part) => ({
        part,
        evaluated: false,
        reason: "non-england-jurisdiction",
      })),
    };
  }

  const ctx = { brief, climate, programme, projectGeometry };
  const results = [];
  const ruleCoverage = [];
  for (const part of applicableParts) {
    const dispatcher = RULE_DISPATCHERS[part];
    if (typeof dispatcher === "function") {
      try {
        const partResults = dispatcher(ctx) || [];
        results.push(...partResults);
        ruleCoverage.push({
          part,
          evaluated: true,
          rule_count: partResults.length,
        });
      } catch (error) {
        results.push({
          ...manualReviewCheck(part),
          summary: `Rule evaluation for AD ${part} threw: ${error?.message || "unknown"}`,
          severity: "warning",
          status: "manual_review",
        });
        ruleCoverage.push({
          part,
          evaluated: false,
          reason: "rule-threw",
          error: error?.message || "unknown",
        });
      }
    } else {
      results.push(manualReviewCheck(part));
      ruleCoverage.push({
        part,
        evaluated: false,
        reason: "no-rule-module",
      });
    }
  }

  return {
    jurisdiction,
    limitations,
    results,
    rule_coverage: ruleCoverage,
  };
}

/**
 * Aggregate severity for the regulation category. Used by the QA scorecard.
 */
export function summarizeRuleResults(results = []) {
  const summary = {
    total: results.length,
    pass: 0,
    fail: 0,
    not_applicable: 0,
    manual_review: 0,
    needs_consultant_count: 0,
    hard_blocker_count: 0,
    warning_count: 0,
  };
  for (const result of results) {
    if (result.status === "pass") summary.pass += 1;
    else if (result.status === "fail") summary.fail += 1;
    else if (result.status === "not_applicable") summary.not_applicable += 1;
    else if (result.status === "manual_review") summary.manual_review += 1;
    if (result.severity === "needs_consultant")
      summary.needs_consultant_count += 1;
    if (result.severity === "hard_blocker") summary.hard_blocker_count += 1;
    if (result.severity === "warning") summary.warning_count += 1;
  }
  return summary;
}

export default { runRegulationRules, summarizeRuleResults };
