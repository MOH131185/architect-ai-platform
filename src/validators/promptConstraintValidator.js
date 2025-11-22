import logger from '../utils/logger.js';

const MOVE_KEYWORDS = /(move|shift|rearrange|swap|slide).*(panel|view|block|box)/i;
const LAYOUT_RESET_KEYWORDS = /(reorder|respace|shuffle).*(panel|view|layout)/i;
const SECTION_PATTERN = /(section|sect[_\s-]?)/i;

function extractPanels(sheetMetadata = {}) {
  const panels = [];

  const appendArray = (list = []) => {
    list.forEach(panel => {
      if (panel) {
        panels.push(panel);
      }
    });
  };

  const appendObject = (obj = {}) => {
    Object.entries(obj).forEach(([key, value]) => {
      panels.push({
        id: key,
        ...(value || {})
      });
    });
  };

  if (Array.isArray(sheetMetadata?.panels)) {
    appendArray(sheetMetadata.panels);
  } else if (sheetMetadata?.panels && typeof sheetMetadata.panels === 'object') {
    appendObject(sheetMetadata.panels);
  }

  if (Array.isArray(sheetMetadata?.panelLayout)) {
    appendArray(sheetMetadata.panelLayout);
  }

  if (sheetMetadata?.panelMap && typeof sheetMetadata.panelMap === 'object') {
    appendObject(sheetMetadata.panelMap);
  }

  if (Array.isArray(sheetMetadata?.panelsArray)) {
    appendArray(sheetMetadata.panelsArray);
  }

  return panels;
}

function hasTitleBlock(sheetMetadata = {}) {
  const panels = extractPanels(sheetMetadata);
  if (!panels.length) {
    return false;
  }
  return panels.some(panel => {
    const id = (panel.id || panel.name || '').toLowerCase();
    return id.includes('title');
  });
}

function analyzeRowFiveCapacity(sheetMetadata = {}) {
  const panels = extractPanels(sheetMetadata);
  if (!panels.length) {
    return {
      inspected: false,
      hasTitleBlock: false,
      sectionSlots: 0,
      openSlots: 0
    };
  }

  const sectionPanels = panels.filter(panel => {
    const id = (panel.id || panel.name || '').toLowerCase();
    return SECTION_PATTERN.test(id);
  });

  const openSlots = sectionPanels.filter(panel => {
    const status = (panel.status || '').toLowerCase();
    if (!status && panel.url) {
      return false;
    }
    return status === '' ||
      status === 'pending' ||
      status === 'missing' ||
      status === 'placeholder';
  }).length;

  return {
    inspected: true,
    hasTitleBlock: hasTitleBlock(sheetMetadata),
    sectionSlots: sectionPanels.length,
    openSlots
  };
}

export function analyzePromptConstraints(ctx = {}) {
  const {
    quickToggles = {},
    deltaPrompt = '',
    userPrompt = '',
    sheetMetadata = {},
    projectContext = {},
    targetPanels = null
  } = ctx;

  const errors = [];
  const warnings = [];
  const directives = [];
  let lockRecommendation = null;
  let lockStrengthHint = null;

  const combinedPrompt = `${deltaPrompt} ${userPrompt}`.trim();
  if (MOVE_KEYWORDS.test(combinedPrompt) || LAYOUT_RESET_KEYWORDS.test(combinedPrompt)) {
    errors.push('Panel repositioning requests are not supported. Please describe content edits instead of moving panels.');
  }

  const rowFiveStatus = analyzeRowFiveCapacity(sheetMetadata);
  const sheetDiscipline = (projectContext.sheetType || projectContext.discipline || '').toString().toUpperCase();
  const isMEPSheet = sheetDiscipline === 'MEP';

  if (quickToggles.addSections && !isMEPSheet) {
    if (!rowFiveStatus.inspected) {
      warnings.push('Unable to verify Row 5 section capacity. Metadata missing from stored sheet.');
    } else if (!rowFiveStatus.hasTitleBlock) {
      errors.push('Cannot add sections because the Row 5 title block row is missing. Regenerate the base sheet to restore the UK RIBA layout.');
    } else if (rowFiveStatus.sectionSlots < 2) {
      errors.push('Row 5 no longer reserves dual section panels. Regenerate the base sheet before adding sections.');
    } else if (rowFiveStatus.openSlots === 0) {
      errors.push('Row 5 section slots are already occupied. Remove conflicting panels or regenerate the base sheet before adding sections.');
    } else {
      lockRecommendation = 'tighten';
      lockStrengthHint = lockStrengthHint || 0.14;
      directives.push('LOCK DIRECTIVE: Preserve Row 5 layout while inserting sections into reserved slots.');
    }
  }

  if (Array.isArray(targetPanels) && targetPanels.length > 3) {
    warnings.push('Large panel batches may increase drift risk. Consider smaller modification batches.');
  }

  if (isMEPSheet) {
    lockRecommendation = 'relax';
    lockStrengthHint = lockStrengthHint || 0.2;
    directives.push('LOCK DIRECTIVE: Relax architectural layout locks for MEP sheet adjustments.');
  }

  if (quickToggles.addFloorPlans && targetPanels && targetPanels.includes('title-block')) {
    errors.push('Floor plan additions cannot reuse the title block region. Free space before requesting this change.');
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('Prompt constraint validation failed', {
      errors,
      quickToggles,
      sheetDiscipline,
      hasRow5TitleBlock: rowFiveStatus.hasTitleBlock
    });
  }

  return {
    valid,
    errors,
    warnings,
    lockRecommendation,
    lockStrengthHint,
    directiveText: directives.join('\n').trim()
  };
}

export default {
  analyzePromptConstraints
};
