/**
 * Program Import/Export Service
 * 
 * Handles import/export of program spaces from/to Excel and CSV formats.
 * Uses xlsx library for Excel operations.
 */

import * as XLSX from 'xlsx';

/**
 * Export program spaces to XLSX format
 * @param {Array<Object>} programSpaces - Program spaces array
 * @param {Object} metadata - Building metadata
 * @returns {Blob} Excel file blob
 */
export function exportToXLSX(programSpaces, metadata = {}) {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Set workbook properties
  wb.Props = {
    Title: 'Building Program Schedule',
    Subject: metadata.buildingType || 'Architectural Program',
    Author: 'ArchiAI Solution Ltd',
    CreatedDate: new Date()
  };

  // Prepare data for sheet
  const data = programSpaces.map((space, index) => ({
    '#': index + 1,
    'Space Name': space.label || space.name || '',
    'Area (m²)': space.area || 0,
    'Count': space.count || 1,
    'Level': space.level || 'Ground',
    'Notes': space.notes || ''
  }));

  // Add summary row
  const totalArea = programSpaces.reduce((sum, space) => sum + (space.area || 0) * (space.count || 1), 0);
  data.push({
    '#': '',
    'Space Name': 'TOTAL',
    'Area (m²)': totalArea,
    'Count': '',
    'Level': '',
    'Notes': ''
  });

  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 30 },  // Space Name
    { wch: 12 },  // Area
    { wch: 8 },   // Count
    { wch: 12 },  // Level
    { wch: 40 }   // Notes
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Program Schedule');

  // Write workbook
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Export program spaces to CSV format
 * @param {Array<Object>} programSpaces - Program spaces array
 * @returns {Blob} CSV file blob
 */
export function exportToCSV(programSpaces) {
  // Prepare data
  const data = programSpaces.map((space, index) => ({
    '#': index + 1,
    'Space Name': space.label || space.name || '',
    'Area (m²)': space.area || 0,
    'Count': space.count || 1,
    'Level': space.level || 'Ground',
    'Notes': space.notes || ''
  }));

  // Convert to CSV
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);

  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Import program spaces from file
 * @param {File|Blob} file - File blob to import
 * @returns {Promise<Object>} Import result with spaces and validation
 */
export async function importProgram(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first worksheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Normalize and validate data
        const { spaces, errors, warnings } = normalizeImportedData(jsonData);

        resolve({
          success: errors.length === 0,
          spaces,
          errors,
          warnings,
          rowCount: jsonData.length
        });
      } catch (error) {
        reject(new Error(`Failed to parse file: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Normalize imported data
 * @private
 * @param {Array<Object>} rawData - Raw imported data
 * @returns {Object} Normalized spaces with validation
 */
function normalizeImportedData(rawData) {
  const spaces = [];
  const errors = [];
  const warnings = [];

  // Define possible header variations
  const headerMappings = {
    spaceName: ['Space Name', 'space name', 'Name', 'name', 'Room', 'room', 'Space', 'space'],
    area: ['Area (m²)', 'area (m²)', 'Area', 'area', 'Size', 'size', 'Area (sqm)', 'area (sqm)'],
    count: ['Count', 'count', 'Quantity', 'quantity', 'Qty', 'qty', '#', 'Number', 'number'],
    level: ['Level', 'level', 'Floor', 'floor', 'Storey', 'storey'],
    notes: ['Notes', 'notes', 'Description', 'description', 'Comments', 'comments', 'Remarks', 'remarks']
  };

  rawData.forEach((row, index) => {
    const rowNum = index + 1;

    // Skip empty rows or total rows
    const nameField = findFieldValue(row, headerMappings.spaceName);
    if (!nameField || nameField.toString().toUpperCase() === 'TOTAL') {
      return;
    }

    // Extract fields
    const area = parseFloat(findFieldValue(row, headerMappings.area) || 0);
    const count = parseInt(findFieldValue(row, headerMappings.count) || 1);
    const level = findFieldValue(row, headerMappings.level) || 'Ground';
    const notes = findFieldValue(row, headerMappings.notes) || '';

    // Validation
    if (!nameField || nameField.trim() === '') {
      errors.push(`Row ${rowNum}: Space name is required`);
      return;
    }

    if (isNaN(area) || area <= 0) {
      errors.push(`Row ${rowNum}: Valid area is required for "${nameField}"`);
      return;
    }

    if (isNaN(count) || count < 1) {
      warnings.push(`Row ${rowNum}: Count defaulted to 1 for "${nameField}"`);
    }

    // Create normalized space object
    spaces.push({
      id: `space_${Date.now()}_${index}`,
      spaceType: normalizeSpaceType(nameField),
      label: nameField.trim(),
      area: area,
      count: Math.max(1, count),
      level: level.trim(),
      notes: notes.trim()
    });
  });

  return { spaces, errors, warnings };
}

/**
 * Find field value from row using multiple possible headers
 * @private
 * @param {Object} row - Data row
 * @param {Array<string>} possibleHeaders - Possible header names
 * @returns {*} Field value or null
 */
function findFieldValue(row, possibleHeaders) {
  for (const header of possibleHeaders) {
    if (row.hasOwnProperty(header)) {
      return row[header];
    }
  }
  return null;
}

/**
 * Normalize space type from label
 * @private
 * @param {string} label - Space label
 * @returns {string} Normalized space type
 */
function normalizeSpaceType(label) {
  const normalized = label.toLowerCase().trim();
  
  // Map common names to standard types
  const typeMap = {
    'living': 'living_room',
    'bedroom': 'bedroom',
    'kitchen': 'kitchen',
    'bathroom': 'bathroom',
    'toilet': 'bathroom',
    'wc': 'bathroom',
    'office': 'office',
    'reception': 'reception',
    'waiting': 'waiting_area',
    'consultation': 'consultation_room',
    'storage': 'storage',
    'utility': 'utility_room',
    'hallway': 'circulation',
    'corridor': 'circulation',
    'staircase': 'circulation',
    'entrance': 'entrance_hall'
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return 'generic';
}

/**
 * Download exported file
 * @param {Blob} blob - File blob
 * @param {string} filename - File name
 */
export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export program with auto-format detection
 * @param {Array<Object>} programSpaces - Program spaces
 * @param {string} format - Format ('xlsx' or 'csv')
 * @param {Object} metadata - Building metadata
 * @returns {Promise<void>}
 */
export async function exportProgram(programSpaces, format = 'xlsx', metadata = {}) {
  const timestamp = new Date().toISOString().split('T')[0];
  const buildingType = metadata.buildingType || 'building';
  
  let blob;
  let filename;

  if (format === 'csv') {
    blob = exportToCSV(programSpaces);
    filename = `${buildingType}_program_${timestamp}.csv`;
  } else {
    blob = exportToXLSX(programSpaces, metadata);
    filename = `${buildingType}_program_${timestamp}.xlsx`;
  }

  downloadFile(blob, filename);
}

export default {
  exportToXLSX,
  exportToCSV,
  importProgram,
  exportProgram,
  downloadFile
};

