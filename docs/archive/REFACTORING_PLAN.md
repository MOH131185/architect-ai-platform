# ArchitectAIEnhanced.js Refactoring Plan

## Current State Analysis

**File**: `src/ArchitectAIEnhanced.js`
**Size**: 5,646 lines
**State Variables**: 30+
**Components**: Monolithic single component handling all 7 workflow steps

## Problems Identified

1. **Massive Monolithic Component**: 5,646 lines in a single file
2. **State Management Complexity**: 30+ state variables in one component
3. **Re-render Performance**: All steps re-render when any state changes
4. **Testing Difficulty**: Cannot test individual features in isolation
5. **Maintainability**: High risk for merge conflicts, difficult to navigate
6. **Memory Usage**: Large component tree loaded even when not visible

## Refactoring Strategy

### Phase 1: Infrastructure (Context & Hooks)
Create the foundation for state management before extracting components.

#### 1.1 Create DesignContext
**File**: `src/context/DesignContext.jsx`

**Responsibilities**:
- Global state management using React Context
- Centralized state updates
- State persistence helpers

**State to Manage**:
```javascript
{
  // Navigation
  currentStep: 0,

  // Location Data
  locationData: null,
  address: "",
  sitePolygon: null,
  siteMetrics: null,

  // Portfolio & Style
  portfolioFiles: [],
  materialWeight: 0.5,
  characteristicWeight: 0.5,
  projectStyleSignature: null,

  // Project Specifications
  projectDetails: { area: '', program: '', entranceDirection: '' },
  programSpaces: [],
  floorPlanImage: null,
  floorPlanImageName: '',

  // Generation Results
  generatedDesigns: null,
  currentDesignId: null,
  currentProjectId: null,

  // UI State
  isLoading: false,
  isDetectingLocation: false,
  isUploading: false,
  isGeneratingSpaces: false,
  showModifyDrawer: false,
  showModificationPanel: false,

  // Progress Tracking
  generationProgress: {},
  elapsedTime: 0,
  generationStartTime: null,
  isGenerationComplete: false,
  rateLimitPause: { active: false, remainingSeconds: 0, reason: '' },

  // Modals & UI
  modalImage: null,
  modalImageTitle: '',
  imageZoom: 1,
  imagePan: { x: 0, y: 0 },
  toastMessage: '',
  downloadCount: 0
}
```

#### 1.2 Create Custom Hooks
**Files**:
- `src/hooks/useArchitectWorkflow.js` - Navigation & step management
- `src/hooks/useLocationData.js` - Location analysis & site detection
- `src/hooks/useGeneration.js` - AI generation workflow
- `src/hooks/usePortfolio.js` - Portfolio upload & style detection
- `src/hooks/useProgramSpaces.js` - Program space generation
- `src/hooks/useModification.js` - AI modification workflow
- `src/hooks/useImageModal.js` - Image zoom & pan modal
- `src/hooks/useToast.js` - Toast notifications

### Phase 2: Extract Page Components

Each page component represents one step in the workflow.

#### 2.1 LandingPage Component
**File**: `src/pages/LandingPage.jsx`
**Lines**: ~700 (extracted from renderLandingPage)
**Responsibilities**:
- Hero section with features showcase
- Metrics display (98% consistency, 60s generation)
- Call-to-action to start workflow

**Props**:
```javascript
{
  onNext: () => void  // Navigate to Location Analysis
}
```

#### 2.2 LocationAnalysis Component
**File**: `src/pages/LocationAnalysis.jsx`
**Lines**: ~400
**Responsibilities**:
- Address input field
- Location detection button
- Analyze location button
- Loading states

**Props**:
```javascript
{
  address: string,
  onAddressChange: (string) => void,
  onAnalyze: () => Promise<void>,
  onDetectLocation: () => Promise<void>,
  isLoading: boolean,
  isDetecting: boolean
}
```

**Child Components**:
- `src/components/forms/AddressInput.jsx` - Input field with autocomplete
- `src/components/LoadingIndicator.jsx` - Reusable loading spinner

#### 2.3 IntelligenceReport Component
**File**: `src/pages/IntelligenceReport.jsx`
**Lines**: ~800
**Responsibilities**:
- Display location intelligence data
- Climate analysis card
- Zoning information
- 3D Google Maps view
- Site polygon drawing interface
- Architectural style recommendations

**Props**:
```javascript
{
  locationData: object,
  sitePolygon: array,
  onSitePolygonChange: (array) => void,
  onNext: () => void,
  onBack: () => void
}
```

**Child Components**:
- `src/components/displays/ClimateCard.jsx` - Climate info display
- `src/components/displays/ZoningInfo.jsx` - Zoning regulations
- `src/components/MapView.jsx` - Google Maps 3D view
- `PrecisionSiteDrawer` (already exists) - Site polygon drawing

#### 2.4 PortfolioUpload Component
**File**: `src/pages/PortfolioUpload.jsx`
**Lines**: ~600
**Responsibilities**:
- Portfolio file upload (drag & drop)
- Style blend weight sliders (materials, characteristics)
- Portfolio preview grid
- File management (add/remove)

**Props**:
```javascript
{
  portfolioFiles: array,
  onFilesChange: (array) => void,
  materialWeight: number,
  onMaterialWeightChange: (number) => void,
  characteristicWeight: number,
  onCharacteristicWeightChange: (number) => void,
  onNext: () => void,
  onBack: () => void,
  isUploading: boolean
}
```

**Child Components**:
- `src/components/forms/FileUploadZone.jsx` - Drag & drop upload
- `src/components/displays/PortfolioGrid.jsx` - Image preview grid
- `src/components/forms/WeightSlider.jsx` - Reusable slider component

#### 2.5 ProjectSpecifications Component
**File**: `src/pages/ProjectSpecifications.jsx`
**Lines**: ~700
**Responsibilities**:
- Building program selector (residential/commercial/etc.)
- Total area input
- Entrance direction selector
- Program spaces table (AI-generated)
- Floor plan upload (optional)

**Props**:
```javascript
{
  projectDetails: object,
  onProjectDetailsChange: (object) => void,
  programSpaces: array,
  onProgramSpacesChange: (array) => void,
  isGeneratingSpaces: boolean,
  onGenerateSpaces: () => Promise<void>,
  floorPlanImage: string,
  onFloorPlanUpload: (file) => void,
  onNext: () => void,
  onBack: () => void
}
```

**Child Components**:
- `src/components/forms/BuildingProgramSelector.jsx` - Dropdown with icons
- `src/components/forms/AreaInput.jsx` - Number input with validation
- `src/components/forms/ProgramSpacesTable.jsx` - Editable table
- `FloorPlanUpload` (already exists) - Floor plan uploader

#### 2.6 AIGeneration Component
**File**: `src/pages/AIGeneration.jsx`
**Lines**: ~600
**Responsibilities**:
- Generate button
- Progress tracking with stages
- Elapsed time display
- Rate limit pause notifications
- Generation status messages

**Props**:
```javascript
{
  onGenerate: () => Promise<void>,
  isLoading: boolean,
  generationProgress: object,
  elapsedTime: number,
  rateLimitPause: object,
  onBack: () => void
}
```

**Child Components**:
- `src/components/GenerationProgress.jsx` - Multi-stage progress bar
- `src/components/RateLimitNotification.jsx` - Countdown display
- `src/components/GenerationStatus.jsx` - Status messages with icons

#### 2.7 ResultsAndModify Component
**File**: `src/pages/ResultsAndModify.jsx`
**Lines**: ~1,200
**Responsibilities**:
- Display A1 sheet result
- Show design metadata (seed, DNA, consistency)
- AI Modify panel integration
- Version history sidebar
- Download/export buttons
- Image zoom modal

**Props**:
```javascript
{
  generatedDesigns: object,
  currentDesignId: string,
  showModifyDrawer: boolean,
  onToggleModifyDrawer: () => void,
  onModify: (params) => Promise<void>,
  onDownload: () => void,
  onExport: (format) => void,
  onImageClick: (url, title) => void
}
```

**Child Components**:
- `A1SheetViewer` (already exists) - A1 sheet display
- `AIModifyPanel` (already exists) - Modification interface
- `ModifyDesignDrawer` (already exists) - Drawer wrapper
- `src/components/displays/DesignMetadata.jsx` - DNA, seed, consistency
- `src/components/displays/VersionHistory.jsx` - Version sidebar
- `src/components/ImageZoomModal.jsx` - Full-screen image viewer

### Phase 3: Shared Components

Extract reusable components used across multiple pages.

#### 3.1 Navigation Components
- `src/components/StepIndicator.jsx` - Horizontal step progress
- `src/components/NavigationControls.jsx` - Back/Next buttons
- `src/components/StepHeader.jsx` - Page title with icon

#### 3.2 Form Components
- `src/components/forms/TextInput.jsx` - Styled text input
- `src/components/forms/NumberInput.jsx` - Number input with validation
- `src/components/forms/Select.jsx` - Styled dropdown
- `src/components/forms/Slider.jsx` - Range slider
- `src/components/forms/FileUpload.jsx` - File upload button/zone
- `src/components/forms/Button.jsx` - Reusable button variants

#### 3.3 Display Components
- `src/components/displays/Card.jsx` - Generic card container
- `src/components/displays/Metric.jsx` - Metric display (icon + value)
- `src/components/displays/FeatureList.jsx` - Checklist with icons
- `src/components/displays/Alert.jsx` - Alert/notification banner
- `src/components/LoadingSpinner.jsx` - Loading indicator
- `src/components/EmptyState.jsx` - Empty state placeholder

#### 3.4 Utility Components
- `src/components/ErrorBoundary.jsx` (already exists) - Error catching
- `src/components/Toast.jsx` (already exists) - Toast notifications
- `src/components/SafeText.jsx` - Safe text rendering (extract from current)
- `src/components/Modal.jsx` - Generic modal wrapper

### Phase 4: Update Main App Component

**File**: `src/ArchitectAIEnhanced.jsx` (new, replaces old)

```javascript
import React from 'react';
import { DesignProvider } from './context/DesignContext';
import { useArchitectWorkflow } from './hooks/useArchitectWorkflow';
import LandingPage from './pages/LandingPage';
import LocationAnalysis from './pages/LocationAnalysis';
import IntelligenceReport from './pages/IntelligenceReport';
import PortfolioUpload from './pages/PortfolioUpload';
import ProjectSpecifications from './pages/ProjectSpecifications';
import AIGeneration from './pages/AIGeneration';
import ResultsAndModify from './pages/ResultsAndModify';
import StepIndicator from './components/StepIndicator';
import ErrorBoundary from './components/ErrorBoundary';

const ArchitectAIEnhanced = () => {
  const { currentStep } = useArchitectWorkflow();

  const renderStep = () => {
    switch(currentStep) {
      case 0: return <LandingPage />;
      case 1: return <LocationAnalysis />;
      case 2: return <IntelligenceReport />;
      case 3: return <PortfolioUpload />;
      case 4: return <ProjectSpecifications />;
      case 5: return <AIGeneration />;
      case 6: return <ResultsAndModify />;
      default: return <LandingPage />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {currentStep > 0 && <StepIndicator />}
        <div className={currentStep > 0 ? 'max-w-7xl mx-auto px-4 py-8' : ''}>
          {renderStep()}
        </div>
      </div>
    </ErrorBoundary>
  );
};

// Wrap with provider
const ArchitectAIEnhancedWithProvider = () => (
  <DesignProvider>
    <ArchitectAIEnhanced />
  </DesignProvider>
);

export default ArchitectAIEnhancedWithProvider;
```

**Result**: Main component reduces from 5,646 lines → ~50 lines

## Implementation Order

### Week 1 (Days 1-3)
1. ✅ **Day 1 AM**: Create DesignContext with all state management
2. ✅ **Day 1 PM**: Create useArchitectWorkflow hook
3. ✅ **Day 2 AM**: Create useLocationData and useGeneration hooks
4. ✅ **Day 2 PM**: Create usePortfolio, useProgramSpaces, useModification hooks
5. ✅ **Day 3**: Extract LandingPage and LocationAnalysis components

### Week 1 (Days 4-5)
6. ✅ **Day 4**: Extract IntelligenceReport component with MapView
7. ✅ **Day 5**: Extract PortfolioUpload component

### Week 2 (Days 6-8)
8. ✅ **Day 6**: Extract ProjectSpecifications component
9. ✅ **Day 7**: Extract AIGeneration component with progress tracking
10. ✅ **Day 8**: Extract ResultsAndModify component

### Week 2 (Days 9-10)
11. ✅ **Day 9**: Create shared components (forms, displays, navigation)
12. ✅ **Day 10**: Update main ArchitectAIEnhanced component
13. ✅ **Day 10**: Update all imports across codebase

## Testing Strategy

### Unit Tests (Per Component)
- Test each page component in isolation
- Mock context and hooks
- Verify prop handling and user interactions

### Integration Tests
- Test complete workflow from landing to results
- Test state persistence across steps
- Test error scenarios and boundary conditions

### Performance Tests
- Measure re-render counts (should reduce by 70%+)
- Check bundle size (should be similar with code splitting)
- Test memory usage during long sessions

## Expected Benefits

### Metrics Before → After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Main Component Lines | 5,646 | ~50 | 99% reduction |
| Largest Component | 5,646 lines | ~1,200 lines | 78% reduction |
| Re-renders per State Change | All steps | Current step only | 85% reduction |
| Time to Find Function | 5-10 min | <1 min | 90% faster |
| Test Coverage | <5% | 70%+ | 14x increase |
| Build Time | ~45s | ~30s | 33% faster |
| Hot Reload Time | ~5s | <1s | 80% faster |

### Qualitative Benefits
- **Maintainability**: Easy to find and modify specific features
- **Testability**: Can test each page/component independently
- **Performance**: Only active step re-renders, faster UI
- **Collaboration**: Multiple developers can work on different pages
- **Onboarding**: New developers understand structure faster
- **Reusability**: Shared components reduce duplication

## Migration Path (Backward Compatibility)

### Option A: Keep Old File as Legacy
1. Rename `ArchitectAIEnhanced.js` → `ArchitectAIEnhancedLegacy.js`
2. Create new `ArchitectAIEnhanced.jsx` with refactored version
3. Add feature flag to switch between versions
4. Test new version thoroughly
5. Remove legacy version after confidence

### Option B: Gradual Migration (Recommended)
1. Create new structure alongside old file
2. Move one page at a time to new structure
3. Update main component to use new pages as they're ready
4. Delete old file once all pages migrated
5. Easier to test incrementally and rollback if needed

## Risks & Mitigation

### Risk 1: Breaking Changes
**Mitigation**: Comprehensive testing at each step, keep legacy version until 100% confident

### Risk 2: State Management Complexity
**Mitigation**: Use Context API (simple) rather than Redux (overkill for this app)

### Risk 3: Import Path Updates
**Mitigation**: Use automated search/replace, create migration script

### Risk 4: Bundle Size Increase
**Mitigation**: Implement code splitting with React.lazy for each page

## Success Criteria

- ✅ Main component reduced to <100 lines
- ✅ All pages extracted and tested independently
- ✅ No regression in functionality
- ✅ Re-render performance improved by 70%+
- ✅ Test coverage increased to 70%+
- ✅ All team members understand new structure
- ✅ Documentation updated (README, CLAUDE.md)

## Next Steps After Refactoring

1. **Add React Router** for URL-based navigation
2. **Implement Code Splitting** with React.lazy
3. **Add Storybook** for component documentation
4. **Create Unit Tests** for all components
5. **Add E2E Tests** with Playwright
6. **Performance Monitoring** with React DevTools Profiler

---

**Document Version**: 1.0
**Created**: 2025-11-12
**Author**: Claude Code Enhancement Scan
**Status**: Ready for Implementation
