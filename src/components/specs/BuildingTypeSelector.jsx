/**
 * Building Type Selector Component
 * 
 * Grid-based selector for building category and sub-type with icons
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import { getAllCategories, getCategoryById } from '../../data/buildingTypes.js';
import Card from '../ui/Card.jsx';

const BuildingTypeSelector = ({
  selectedCategory,
  selectedSubType,
  onSelectionChange,
  validationErrors = []
}) => {
  const [expandedCategory, setExpandedCategory] = useState(selectedCategory || null);
  const categories = getAllCategories();

  const handleCategoryClick = (categoryId) => {
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
    onSelectionChange({ category: categoryId, subType: subTypeId });
  };

  const getIcon = (iconName) => {
    const Icon = LucideIcons[iconName];
    return Icon ? <Icon className="w-6 h-6" /> : <LucideIcons.Building2 className="w-6 h-6" />;
  };

  return (
    <div className="space-y-4">
      {/* Category Grid */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => {
          const isSelected = selectedCategory === category.id;
          const isExpanded = expandedCategory === category.id;

          return (
            <motion.button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className={`p-4 rounded-2xl border-2 transition-all duration-300 text-left ${
                isSelected
                  ? 'border-royal-500 bg-royal-600/20'
                  : 'border-navy-700 bg-navy-800/60 hover:border-royal-500/50'
              } focus:ring-2 focus:ring-royal-400 focus:outline-none`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-royal-500/30' : 'bg-navy-700/50'}`}>
                  {getIcon(category.icon)}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white">{category.label}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {category.subTypes.length} types
                  </p>
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
                    {getCategoryById(category.id)?.subTypes.find(st => st.id === selectedSubType)?.label}
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
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card variant="glass" padding="md">
            <h4 className="text-sm font-semibold text-white mb-3">
              Select {getCategoryById(expandedCategory)?.label} Type
            </h4>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {getCategoryById(expandedCategory)?.subTypes.map((subType) => {
                const isSelected = selectedSubType === subType.id && selectedCategory === expandedCategory;

                return (
                  <motion.button
                    key={subType.id}
                    onClick={() => handleSubTypeClick(expandedCategory, subType.id)}
                    className={`p-3 rounded-xl border transition-all duration-200 text-left ${
                      isSelected
                        ? 'border-royal-400 bg-royal-500/20'
                        : 'border-navy-600 bg-navy-800/40 hover:border-royal-400/50'
                    } focus:ring-2 focus:ring-royal-300 focus:outline-none`}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${isSelected ? 'bg-royal-400/30' : 'bg-navy-700/50'}`}>
                        {getIcon(subType.icon)}
                      </div>
                      <span className="text-sm font-medium text-white">{subType.label}</span>
                    </div>
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
            <p key={index} className="text-sm text-red-300 flex items-center gap-2">
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

