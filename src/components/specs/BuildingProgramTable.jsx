/**
 * Building Program Table Component
 * 
 * Editable table for program spaces with inline editing, reordering, and validation
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button.jsx';
import logger from '../../utils/logger.js';


const BuildingProgramTable = ({
  programSpaces = [],
  onChange,
  onAdd,
  onRemove,
  onReorder,
  onImport,
  validationWarnings = [],
  isReadOnly = false
}) => {
  const handleFieldChange = (index, field, value) => {
    if (isReadOnly) return;
    onChange(index, field, value);
  };

  const handleMoveUp = (index) => {
    if (index > 0 && onReorder) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (index) => {
    if (index < programSpaces.length - 1 && onReorder) {
      onReorder(index, index + 1);
    }
  };

  const totalArea = programSpaces.reduce((sum, space) => {
    return sum + ((space.area || 0) * (space.count || 1));
  }, 0);

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-navy-700">
        <table className="table-auto w-full">
          <thead className="bg-navy-900 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Space Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Area (m²)
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Count
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Notes
              </th>
              {!isReadOnly && (
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-navy-800/40 divide-y divide-navy-700">
            <AnimatePresence>
              {programSpaces.map((space, index) => (
                <motion.tr
                  key={space.id || index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="hover:bg-navy-700/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={space.label || ''}
                      onChange={(e) => handleFieldChange(index, 'label', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="e.g., Living Room"
                      className="w-full bg-transparent border-b border-navy-600 focus:border-royal-400 text-white text-sm px-2 py-1 outline-none transition-colors disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={space.area || ''}
                      onChange={(e) => handleFieldChange(index, 'area', parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                      placeholder="0"
                      min="0"
                      step="0.1"
                      className="w-20 bg-transparent border-b border-navy-600 focus:border-royal-400 text-white text-sm px-2 py-1 outline-none transition-colors disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={space.count || 1}
                      onChange={(e) => handleFieldChange(index, 'count', parseInt(e.target.value) || 1)}
                      disabled={isReadOnly}
                      min="1"
                      className="w-16 bg-transparent border-b border-navy-600 focus:border-royal-400 text-white text-sm px-2 py-1 outline-none transition-colors disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={space.level || 'Ground'}
                      onChange={(e) => handleFieldChange(index, 'level', e.target.value)}
                      disabled={isReadOnly}
                      className="bg-navy-700 border border-navy-600 focus:border-royal-400 text-white text-sm px-3 py-2 rounded outline-none transition-colors disabled:opacity-50"
                      style={{ color: '#FFFFFF', backgroundColor: '#1E293B' }}
                    >
                      <option value="Ground" style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>Ground</option>
                      <option value="First" style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>First</option>
                      <option value="Second" style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>Second</option>
                      <option value="Third" style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>Third</option>
                      <option value="Basement" style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>Basement</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={space.notes || ''}
                      onChange={(e) => handleFieldChange(index, 'notes', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Optional notes"
                      className="w-full bg-transparent border-b border-navy-600 focus:border-royal-400 text-white text-sm px-2 py-1 outline-none transition-colors disabled:opacity-50"
                    />
                  </td>
                  {!isReadOnly && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {onReorder && (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleMoveUp(index)}
                              disabled={index === 0}
                              className="text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMoveDown(index)}
                              disabled={index === programSpaces.length - 1}
                              className="text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => onRemove(index)}
                          className="text-red-400 hover:text-red-300 transition-colors ml-2"
                          title="Remove space"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>

            {/* Total Row */}
            {programSpaces.length > 0 && (
              <tr className="bg-navy-900/50 font-semibold">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-sm text-white">TOTAL</td>
                <td className="px-4 py-3 text-sm text-royal-300">{totalArea.toFixed(1)} m²</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
                {!isReadOnly && <td className="px-4 py-3"></td>}
              </tr>
            )}
          </tbody>
        </table>

        {/* Empty state */}
        {programSpaces.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <p className="text-sm">No program spaces defined yet.</p>
            <p className="text-xs mt-1">Use "Generate Program" or add spaces manually.</p>
          </div>
        )}
      </div>

      {/* Add button and Import/Export */}
      {!isReadOnly && (
        <div className="flex justify-between items-center">
          {onAdd && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
              icon={<Plus className="w-4 h-4" />}
            >
              Add Space
            </Button>
          )}

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const csvContent = "data:text/csv;charset=utf-8,"
                  + "Space Name,Area,Count,Level,Notes\n"
                  + programSpaces.map(s => `${s.label},${s.area},${s.count},${s.level},${s.notes || ''}`).join("\n");
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "building_program.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="text-gray-400 hover:text-white"
            >
              Export CSV
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const text = evt.target.result;
                    const lines = text.split('\n').slice(1); // Skip header
                    const newSpaces = lines.map(line => {
                      const [label, area, count, level, notes] = line.split(',');
                      if (!label) return null;
                      return {
                        label: label.trim(),
                        area: parseFloat(area) || 0,
                        count: parseInt(count) || 1,
                        level: level?.trim() || 'Ground',
                        notes: notes?.trim() || ''
                      };
                    }).filter(Boolean);
                    if (onImport) {
                      onImport(newSpaces);
                    } else {
                      logger.warn("onImport prop not provided to BuildingProgramTable");
                    }
                  };
                  reader.readAsText(file);
                }}
              />
              <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition-colors rounded-md hover:bg-white/10">
                Import CSV
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Validation warnings */}
      {validationWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/50"
        >
          {validationWarnings.map((warning, index) => (
            <p key={index} className="text-sm text-amber-300 flex items-center gap-2 mb-1 last:mb-0">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {warning}
            </p>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default BuildingProgramTable;
