/**
 * Building Type Selector Component
 *
 * Grid-based selector for building category and sub-type with icons
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { getAllCategories, getCategoryById } from "../../data/buildingTypes.js";
import {
  getCategorySupportSummary,
  getProjectTypeSupport,
} from "../../services/project/projectTypeSupportRegistry.js";
import Card from "../ui/Card.jsx";

export function getBuildingTypeSelectorCategoryState(category) {
  const summary = getCategorySupportSummary(category?.id);
  return {
    supportSummary: summary,
    isEnabled: summary.enabledInUi === true,
  };
}

export function getBuildingTypeSelectorSubTypeState(categoryId, subType) {
  const support = getProjectTypeSupport(categoryId, subType?.id);
  return {
    support,
    isEnabled: support.enabledInUi === true,
  };
}

function confidenceBand(confidence) {
  if (!Number.isFinite(confidence)) return "low";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "med";
  return "low";
}

const BuildingTypeSelector = ({
  selectedCategory,
  selectedSubType,
  onSelectionChange,
  validationErrors = [],
  autoDetectedType = null,
  onApplyAutoDetectedType = null,
}) => {
  const [expandedCategory, setExpandedCategory] = useState(
    selectedCategory || null,
  );

  // Resolve the suggested label only when the suggestion still maps to an
  // enabled subtype in the current registry. The detector already filters
  // by enabledInUi, but we re-check here so a subtype that gets disabled
  // mid-session does not surface a stale chip.
  const suggestedLabel = (() => {
    if (!autoDetectedType?.category || !autoDetectedType?.subType) return null;
    const support = getProjectTypeSupport(
      autoDetectedType.category,
      autoDetectedType.subType,
    );
    if (!support || support.enabledInUi !== true) return null;
    return support.label || autoDetectedType.subType;
  })();

  const showSuggestion = Boolean(
    suggestedLabel && !selectedCategory && !selectedSubType,
  );

  // When the suggestion is shown and the user hasn't expanded any category,
  // expand the suggested one so the user immediately sees the suggested
  // subtype highlighted in the grid below.
  useEffect(() => {
    if (showSuggestion && !expandedCategory && autoDetectedType?.category) {
      setExpandedCategory(autoDetectedType.category);
    }
  }, [showSuggestion, expandedCategory, autoDetectedType?.category]);
  const categories = getAllCategories();

  const isCategoryEnabled = (category) =>
    getBuildingTypeSelectorCategoryState(category).isEnabled;

  const isSubTypeEnabled = (categoryId, subType) =>
    getBuildingTypeSelectorSubTypeState(categoryId, subType).isEnabled;

  const handleCategoryClick = (categoryId) => {
    const category = getCategoryById(categoryId);
    if (!isCategoryEnabled(category)) {
      return;
    }
    if (expandedCategory === categoryId) {
      setExpandedCategory(null);
    } else {
      setExpandedCategory(categoryId);
      // If this category is selected, maintain sub-type
      if (selectedCategory !== categoryId) {
        onSelectionChange({ category: categoryId, subType: null });
      }
    }
  };

  const handleSubTypeClick = (categoryId, subTypeId) => {
    const category = getCategoryById(categoryId);
    const subType = category?.subTypes?.find((entry) => entry.id === subTypeId);
    if (!isSubTypeEnabled(categoryId, subType)) {
      return;
    }
    onSelectionChange({ category: categoryId, subType: subTypeId });
  };

  const getIcon = (iconName) => {
    const Icon = LucideIcons[iconName];
    return Icon ? (
      <Icon className="w-8 h-8" />
    ) : (
      <LucideIcons.Building2 className="w-8 h-8" />
    );
  };

  return (
    <div className="space-y-4">
      {showSuggestion && (
        <motion.button
          type="button"
          onClick={() => {
            if (typeof onApplyAutoDetectedType === "function") {
              onApplyAutoDetectedType({
                category: autoDetectedType.category,
                subType: autoDetectedType.subType,
              });
            } else if (typeof onSelectionChange === "function") {
              onSelectionChange({
                category: autoDetectedType.category,
                subType: autoDetectedType.subType,
              });
            }
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-left transition-colors hover:border-sky-400 hover:bg-sky-500/15"
          data-testid="building-type-auto-detect-chip"
        >
          <div className="flex items-center gap-3">
            <LucideIcons.Sparkles className="h-4 w-4 text-sky-300" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/80">
                Suggested from your brief
              </p>
              <p className="text-sm font-medium text-white">{suggestedLabel}</p>
              {Array.isArray(autoDetectedType.matchedKeywords) &&
                autoDetectedType.matchedKeywords.length > 0 && (
                  <p className="mt-0.5 text-xs text-white/55">
                    Matched:{" "}
                    {autoDetectedType.matchedKeywords.slice(0, 3).join(", ")}
                  </p>
                )}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-sky-200/70">
            {confidenceBand(autoDetectedType.confidence)} confidence · click to
            apply
          </span>
        </motion.button>
      )}

      {/* Category Grid */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => {
          const isSelected = selectedCategory === category.id;
          const isExpanded = expandedCategory === category.id;
          const { supportSummary, isEnabled } =
            getBuildingTypeSelectorCategoryState(category);

          return (
            <motion.button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              disabled={!isEnabled}
              className={`p-4 rounded-2xl border-2 transition-all duration-300 text-left ${
                isSelected
                  ? "border-royal-500 bg-royal-600/20"
                  : "border-navy-700 bg-navy-800/60 hover:border-royal-500/50"
              } focus:ring-2 focus:ring-royal-400 focus:outline-none ${!isEnabled ? "opacity-50 cursor-not-allowed hover:border-navy-700" : ""}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg ${isSelected ? "bg-royal-500/30" : "bg-navy-700/50"}`}
                >
                  {getIcon(category.icon)}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white leading-tight">
                    {category.label}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {category.subTypes.length} types
                  </p>
                  {isEnabled && (
                    <p className="text-xs text-emerald-300 mt-2">
                      {supportSummary.message}
                    </p>
                  )}
                  {!isEnabled && (
                    <p className="text-xs text-amber-300 mt-2">
                      {supportSummary.message}
                    </p>
                  )}
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <LucideIcons.ChevronDown className="w-5 h-5 text-gray-400" />
                </motion.div>
              </div>

              {selectedSubType && isSelected && (
                <div className="mt-2 pt-2 border-t border-royal-500/30">
                  <span className="text-xs px-2 py-1 rounded bg-royal-500/20 text-royal-200">
                    {
                      getCategoryById(category.id)?.subTypes.find(
                        (st) => st.id === selectedSubType,
                      )?.label
                    }
                  </span>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Sub-Type Grid (Expanded) */}
      {expandedCategory && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card variant="glass" padding="md">
            <h4 className="text-sm font-semibold text-white mb-3">
              Select {getCategoryById(expandedCategory)?.label} Type
            </h4>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {getCategoryById(expandedCategory)?.subTypes.map((subType) => {
                const isSelected =
                  selectedSubType === subType.id &&
                  selectedCategory === expandedCategory;
                const { support, isEnabled } =
                  getBuildingTypeSelectorSubTypeState(
                    expandedCategory,
                    subType,
                  );
                const badgeClass =
                  support.supportStatus === "production"
                    ? "text-emerald-300"
                    : support.supportStatus === "beta"
                      ? "text-sky-300"
                      : "text-amber-300";

                return (
                  <motion.button
                    key={subType.id}
                    onClick={() =>
                      handleSubTypeClick(expandedCategory, subType.id)
                    }
                    disabled={!isEnabled}
                    className={`p-3 rounded-xl border transition-all duration-200 text-left ${
                      isSelected
                        ? "border-royal-400 bg-royal-500/20"
                        : "border-navy-600 bg-navy-800/40 hover:border-royal-400/50"
                    } focus:ring-2 focus:ring-royal-300 focus:outline-none ${!isEnabled ? "opacity-50 cursor-not-allowed hover:border-navy-600" : ""}`}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded ${isSelected ? "bg-royal-400/30" : "bg-navy-700/50"}`}
                        >
                          {getIcon(subType.icon)}
                        </div>
                        <span className="text-sm font-medium text-white">
                          {subType.label}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wide ${
                          isEnabled ? badgeClass : "text-amber-300"
                        }`}
                      >
                        {support.badgeLabel ||
                          (isEnabled ? "Supported" : "Experimental/Off")}
                      </span>
                    </div>
                    {!isEnabled && support.message && (
                      <p className="mt-2 text-xs text-amber-200/80">
                        {support.message}
                      </p>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-red-900/20 border border-red-500/50"
        >
          {validationErrors.map((error, index) => (
            <p
              key={index}
              className="text-sm text-red-300 flex items-center gap-2"
            >
              <LucideIcons.AlertCircle className="w-4 h-4" />
              {error}
            </p>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default BuildingTypeSelector;
