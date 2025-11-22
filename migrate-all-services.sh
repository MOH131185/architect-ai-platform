#!/bin/bash
# Migrate all remaining service files

FILES=(
"src/services/a1Compositor.js"
"src/services/a1SheetOverlay.js"
"src/services/a1SheetValidator.js"
"src/services/aiStylizationService.js"
"src/services/architecturalSheetService.js"
"src/services/bimService.js"
"src/services/buildingFootprintService.js"
"src/services/climateResponsiveDesignService.js"
"src/services/designDNAGenerator.js"
"src/services/designHistoryRepository.js"
"src/services/detailSelectionService.js"
"src/services/dimensioningService.js"
"src/services/dnaNormalization.js"
"src/services/enhancedDesignDNAService.js"
"src/services/enhancedImageGenerationService.js"
"src/services/enhancedSiteMapIntegration.js"
"src/services/enhancedViewConfigurationService.js"
"src/services/facadeFeatureAnalyzer.js"
"src/services/floorPlanReasoningService.js"
"src/services/locationIntelligence.js"
"src/services/materialDetectionService.js"
"src/services/openaiImageService.js"
"src/services/portfolioStyleDetection.js"
"src/services/programSpaceAnalyzer.js"
"src/services/secureApiClient.js"
"src/services/siteValidationService.js"
"src/services/strictConsistencyEngine.js"
"src/services/viewRenderService.js"
)

total=0
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    result=$(node migrate-logger.js "$file" 2>&1 | grep "Migrated")
    if [ -n "$result" ]; then
      count=$(echo "$result" | grep -o "[0-9]*" | head -1)
      total=$((total + count))
      echo "$file: $count calls"
    fi
  fi
done

echo "====================================="
echo "Total migrated: $total calls"
