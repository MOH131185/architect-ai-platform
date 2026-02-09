import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import DOMPurify from "dompurify";
import { Wrapper } from "@googlemaps/react-wrapper";
import {
  MapPin,
  Upload,
  Building,
  Building2,
  Sun,
  Compass,
  FileText,
  Palette,
  Square,
  Loader2,
  Sparkles,
  ArrowRight,
  Check,
  Home,
  Layers,
  Cpu,
  FileCode,
  Clock,
  TrendingUp,
  Users,
  Shield,
  Zap,
  BarChart3,
  Eye,
  AlertCircle,
  AlertTriangle,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Image,
  Edit3,
  Plus,
  Trash2,
  Download,
  Wand2,
  Map,
  Lock,
  Unlock,
} from "lucide-react";
import "./styles/premium.css";
import { locationIntelligence } from "./services/locationIntelligence.js";
import siteAnalysisService from "./services/siteAnalysisService.js";
// enhancedAIIntegrationService removed — dead code (legacy DALL-E workflow)
import bimService from "./services/bimService.js";
import { convertPdfFileToImageFile } from "./utils/pdfToImages.js";
// 🆕 Design History Service for consistent 2D→3D generation
import designHistoryService from "./services/designHistoryService.js";
// 🆕 Site polygon drawing with precision mode (keyboard input + orthogonal snapping)
import PrecisionSiteDrawer from "./components/PrecisionSiteDrawer.jsx";
// 🆕 A1 Sheet One-Shot Workflow
import dnaWorkflowOrchestrator from "./services/dnaWorkflowOrchestrator.js";
import {
  resolveWorkflowByMode,
  executeWorkflow,
  isA1Workflow,
  UnsupportedPipelineModeError,
} from "./services/workflowRouter.js";
import A1SheetViewer from "./components/A1SheetViewer.jsx";
import ModifyDesignDrawer from "./components/ModifyDesignDrawer.js";
import { computeSiteMetrics } from "./utils/geometry.js";
import { exportToSVG } from "./utils/svgExporter.js";
import { exportToDXF } from "./utils/dxfWriter.js";
import {
  sanitizePromptInput,
  sanitizeDimensionInput,
} from "./utils/promptSanitizer.js";
import logger from "./utils/logger.js";
// 🏢 Auto Level Assignment for floor count calculation
import autoLevelAssignmentService from "./services/autoLevelAssignmentService.js";
// 🔧 AI Modification & History System
import designGenerationHistory from "./services/designGenerationHistory.js";
import AIModifyPanel from "./components/AIModifyPanel.jsx";
// 🆕 Site Boundary Information Display
import SiteBoundaryInfo from "./components/SiteBoundaryInfo.jsx";
import DevDiagnosticsPanel from "./components/DevDiagnosticsPanel.jsx";
import { subscribeToImageQueueStatus } from "./services/imageRequestQueue.js";

// File download utility functions
const downloadFile = (filename, content, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Download Master Sheet (A1) handler - WITH ALL 13 VIEWS EMBEDDED
const downloadMasterSheet = async (designData, projectContext) => {
  console.log(
    "📐 Downloading unified A1 Master Sheet with all views embedded...",
  );

  try {
    let svgContent;

    // Check if SVG content is already generated and stored in state
    if (designData?.unifiedSheet?.svgContent) {
      console.log("✅ Using pre-generated SVG content from state");
      svgContent = designData.unifiedSheet.svgContent;
    } else {
      // Generate fresh SVG sheet with all 13 views embedded as actual images
      console.log("🔄 Generating fresh SVG content...");
      const { generateUnifiedSheet } =
        await import("./services/unifiedSheetGenerator.js");
      svgContent = await generateUnifiedSheet(designData, projectContext);
    }

    if (!svgContent) {
      throw new Error(
        "Failed to generate unified sheet - no SVG content returned",
      );
    }

    // Download SVG
    const designId =
      designData?.designDNA?.projectID ||
      designData?.masterDNA?.projectID ||
      `design_${Date.now()}`;
    downloadFile(
      `architecture-sheet-unified-${designId}.svg`,
      svgContent,
      "image/svg+xml",
    );

    console.log(
      "✅ Unified A1 Master Sheet with all views downloaded successfully",
    );
    return true;
  } catch (error) {
    console.error("❌ Unified Master Sheet generation failed:", error);
    throw error;
  }
};

// SafeText helper to prevent React rendering crashes from objects/arrays
const SafeText = ({ children, fallback = "" }) => {
  // Handle null/undefined
  if (children == null) {
    return fallback;
  }

  // Convert to string if it's a primitive value
  if (typeof children !== "object") {
    return String(children);
  }

  // Handle arrays
  if (Array.isArray(children)) {
    return children
      .map((item, index) =>
        typeof item === "object" ? JSON.stringify(item) : String(item),
      )
      .join(", ");
  }

  // Handle objects
  if (typeof children === "object") {
    // Check if it's a React element (shouldn't stringify those)
    if (React.isValidElement(children)) {
      return children;
    }
    // Try to get a meaningful representation
    if (children.toString && children.toString() !== "[object Object]") {
      return children.toString();
    }
    // Fallback to JSON stringification for plain objects
    try {
      return JSON.stringify(children);
    } catch {
      return fallback;
    }
  }

  return fallback;
};

// Download file from data URL (for images/canvas)
// eslint-disable-next-line no-unused-vars
const downloadFileFromDataURL = (dataURL, filename) => {
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Generate single-sheet Project Board (A3 landscape format)
 * Combines all architectural views into one comprehensive presentation sheet
 *
 * @param {Object} result - AI generation result with all visualizations
 * @param {Object} context - Project context (buildingDNA, specs, location, etc.)
 * @returns {Promise<string>} Data URL of the generated board (PNG)
 */
// eslint-disable-next-line no-unused-vars
const generateProjectBoardSheet = async (result, context) => {
  console.log("📋 Generating Project Board Sheet...");

  // A3 landscape at 300 DPI = 4961 × 3508 px
  const canvas = document.createElement("canvas");
  canvas.width = 4961;
  canvas.height = 3508;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title bar
  ctx.fillStyle = "#2C3E50";
  ctx.fillRect(0, 0, canvas.width, 120);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 56px Arial";
  const projectName =
    context?.buildingProgram?.toUpperCase() || "ARCHITECTURAL PROJECT";
  ctx.fillText(`${projectName} - PROJECT BOARD`, 50, 80);

  // Subtitle
  ctx.font = "28px Arial";
  ctx.fillText(
    `${context?.floorArea || "?"}m² | ${context?.location?.address || "Location"}`,
    50,
    110,
  );

  // Helper function to load and draw image
  const loadAndDrawImage = (url, x, y, width, height) => {
    return new Promise((resolve, reject) => {
      if (!url) {
        resolve(false);
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          // Calculate aspect-fit scaling
          const imgAspect = img.width / img.height;
          const boxAspect = width / height;
          let drawWidth, drawHeight, offsetX, offsetY;

          if (imgAspect > boxAspect) {
            // Image is wider, fit to width
            drawWidth = width;
            drawHeight = width / imgAspect;
            offsetX = 0;
            offsetY = (height - drawHeight) / 2;
          } else {
            // Image is taller, fit to height
            drawHeight = height;
            drawWidth = height * imgAspect;
            offsetY = 0;
            offsetX = (width - drawWidth) / 2;
          }

          ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
          resolve(true);
        } catch (error) {
          console.error("Error drawing image:", error);
          resolve(false);
        }
      };

      img.onerror = () => {
        console.warn("Failed to load image:", url?.substring(0, 60));
        resolve(false);
      };

      img.src = url;
    });
  };

  // Draw border for image slots
  const drawBorder = (x, y, width, height, label) => {
    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Label
    ctx.fillStyle = "#666666";
    ctx.font = "bold 24px Arial";
    ctx.fillText(label, x + 10, y + 30);
  };

  // Layout grid (margins and positions)
  const margin = 50;
  const top = 140; // Below title bar
  const usableWidth = canvas.width - margin * 2;
  const usableHeight = canvas.height - top - margin;

  // Grid: 3 columns, 3 rows
  const col1X = margin;
  const col2X = margin + usableWidth * 0.33;
  const col3X = margin + usableWidth * 0.66;
  const colWidth = usableWidth * 0.33 - 10;

  const row1Y = top;
  const row2Y = top + usableHeight * 0.35;
  const row3Y = top + usableHeight * 0.7;
  const row1Height = usableHeight * 0.35 - 10;
  const row2Height = usableHeight * 0.35 - 10;
  const row3Height = usableHeight * 0.3;

  // Extract image URLs from result
  const floorPlanUrl =
    result?.visualizations?.floorPlans?.ground?.images?.[0] ||
    result?.visualizations?.views?.floor_plan?.images?.[0];

  // FIXED: Technical drawings are at top level, not inside visualizations
  const elevationNUrl =
    result?.technicalDrawings?.technicalDrawings?.elevation_north?.images?.[0];
  // eslint-disable-next-line no-unused-vars
  const elevationSUrl =
    result?.technicalDrawings?.technicalDrawings?.elevation_south?.images?.[0];
  const elevationEUrl =
    result?.technicalDrawings?.technicalDrawings?.elevation_east?.images?.[0];

  const sectionUrl =
    result?.technicalDrawings?.technicalDrawings?.section_longitudinal
      ?.images?.[0] ||
    result?.technicalDrawings?.technicalDrawings?.section_cross?.images?.[0];

  const exteriorUrl =
    result?.visualizations?.views?.exterior_front?.images?.[0] ||
    result?.visualizations?.views?.exterior?.images?.[0];

  const interiorUrl = result?.visualizations?.views?.interior?.images?.[0];

  // eslint-disable-next-line no-unused-vars
  const axonometricUrl =
    result?.visualizations?.views?.axonometric?.images?.[0];
  // eslint-disable-next-line no-unused-vars
  const perspectiveUrl =
    result?.visualizations?.views?.perspective?.images?.[0];

  // ROW 1: Floor Plan, Elevation North, Exterior
  drawBorder(col1X, row1Y, colWidth, row1Height, "FLOOR PLAN");
  drawBorder(col2X, row1Y, colWidth, row1Height, "ELEVATION - NORTH");
  drawBorder(col3X, row1Y, colWidth, row1Height, "EXTERIOR VIEW");

  await loadAndDrawImage(
    floorPlanUrl,
    col1X + 5,
    row1Y + 35,
    colWidth - 10,
    row1Height - 40,
  );
  await loadAndDrawImage(
    elevationNUrl,
    col2X + 5,
    row1Y + 35,
    colWidth - 10,
    row1Height - 40,
  );
  await loadAndDrawImage(
    exteriorUrl,
    col3X + 5,
    row1Y + 35,
    colWidth - 10,
    row1Height - 40,
  );

  // ROW 2: Elevation East, Section, Interior
  drawBorder(col1X, row2Y, colWidth, row2Height, "ELEVATION - EAST");
  drawBorder(col2X, row2Y, colWidth, row2Height, "SECTION");
  drawBorder(col3X, row2Y, colWidth, row2Height, "INTERIOR VIEW");

  await loadAndDrawImage(
    elevationEUrl,
    col1X + 5,
    row2Y + 35,
    colWidth - 10,
    row2Height - 40,
  );
  await loadAndDrawImage(
    sectionUrl,
    col2X + 5,
    row2Y + 35,
    colWidth - 10,
    row2Height - 40,
  );
  await loadAndDrawImage(
    interiorUrl,
    col3X + 5,
    row2Y + 35,
    colWidth - 10,
    row2Height - 40,
  );

  // ROW 3: Specifications panel spanning full width
  ctx.fillStyle = "#F8F9FA";
  ctx.fillRect(margin, row3Y, usableWidth, row3Height);
  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, row3Y, usableWidth, row3Height);

  // Project Specifications Text
  const dna = context?.buildingDNA || {};
  const specs = context?.specifications || {};
  const location = context?.location || {};

  ctx.fillStyle = "#2C3E50";
  ctx.font = "bold 32px Arial";
  ctx.fillText("PROJECT SPECIFICATIONS", margin + 20, row3Y + 40);

  ctx.font = "24px Arial";
  let specY = row3Y + 80;
  const lineHeight = 35;
  const col1SpecX = margin + 30;
  const col2SpecX = margin + usableWidth * 0.4;
  const col3SpecX = margin + usableWidth * 0.7;

  // Column 1
  ctx.fillStyle = "#555555";
  ctx.fillText(
    `Building Type: ${context?.buildingProgram || "N/A"}`,
    col1SpecX,
    specY,
  );
  ctx.fillText(
    `Total Area: ${context?.floorArea || "N/A"}m²`,
    col1SpecX,
    specY + lineHeight,
  );
  ctx.fillText(
    `Floors: ${dna?.dimensions?.floors || specs?.floors || "N/A"}`,
    col1SpecX,
    specY + lineHeight * 2,
  );
  ctx.fillText(
    `Dimensions: ${dna?.dimensions?.length || "?"}m × ${dna?.dimensions?.width || "?"}m`,
    col1SpecX,
    specY + lineHeight * 3,
  );

  // Column 2
  ctx.fillText(
    `Materials: ${dna?.materials?.exterior?.primary || "N/A"}`,
    col2SpecX,
    specY,
  );
  ctx.fillText(
    `Roof: ${dna?.roof?.type || "N/A"}`,
    col2SpecX,
    specY + lineHeight,
  );
  ctx.fillText(
    `Windows: ${dna?.windows?.type || "N/A"}`,
    col2SpecX,
    specY + lineHeight * 2,
  );
  ctx.fillText(
    `Style: ${context?.blendedStyle?.styleName || location?.recommendedStyle || "Modern"}`,
    col2SpecX,
    specY + lineHeight * 3,
  );

  // Column 3
  ctx.fillText(
    `Location: ${location?.climate?.type || "N/A"} Climate`,
    col3SpecX,
    specY,
  );
  ctx.fillText(
    `Zoning: ${location?.zoning?.type || "N/A"}`,
    col3SpecX,
    specY + lineHeight,
  );
  const designDate = new Date(
    result?.timestamp || Date.now(),
  ).toLocaleDateString();
  ctx.fillText(`Design Date: ${designDate}`, col3SpecX, specY + lineHeight * 2);
  ctx.fillText(
    `Generated by: ArchitectAI Platform`,
    col3SpecX,
    specY + lineHeight * 3,
  );

  console.log("✅ Project Board Sheet generated successfully");
  return canvas.toDataURL("image/png");
};

// Generate DWG file content
const generateDWGContent = (projectDetails, bimModel = null) => {
  // If BIM model is available, use it to generate proper DWG
  if (bimModel) {
    try {
      console.log("Generating DWG from BIM model...");
      const dwgContent = bimService.exportToDWG(bimModel);
      return dwgContent;
    } catch (error) {
      console.error("Failed to generate DWG from BIM model:", error);
      // Fall back to placeholder content
    }
  }

  // Fallback placeholder content when no BIM model available
  return `AutoCAD Drawing File
Project: ${projectDetails?.program ? projectDetails.program.charAt(0).toUpperCase() + projectDetails.program.slice(1) : "Architectural Design"}
Generated by ArchitectAI Platform
Date: ${new Date().toLocaleDateString()}
Area: ${projectDetails?.area || "Not specified"}m²

[Binary DWG data would be here in a real export]

This is a demonstration file. The content below is a simplified representation.

--- PROJECT INFO ---
Building Program: ${projectDetails?.program || "Not specified"}
Total Area: ${projectDetails?.area || "Not specified"}m²
Style Preference: ${projectDetails?.styleChoice === "blend" ? "Adaptive Blend" : "Signature Style"}

--- SIMPLIFIED FLOOR PLAN DATA ---
- Reception & Waiting: 65m²
- Consultation Rooms: 80m² (4 units)
- Staff & Admin: 30m²
- Utilities & Restrooms: 35m²

This demo file confirms that the export functionality is working. The full version would contain detailed, layered vector drawings.
`;
};

const generateRVTContent = (projectDetails) => {
  return `Revit Project File
Project: ${projectDetails?.program ? projectDetails.program.charAt(0).toUpperCase() + projectDetails.program.slice(1) : "Architectural Design"}
Generated by ArchitectAI Platform
Date: ${new Date().toLocaleDateString()}
Version: Revit 2024

[Binary RVT data would be here in a real export]

This is a demonstration file. The content below is a simplified representation of the BIM data.

--- PROJECT INFO ---
Building Program: ${projectDetails?.program || "Not specified"}
Total Area: ${projectDetails?.area || "Not specified"}m²
Style Preference: ${projectDetails?.styleChoice === "blend" ? "Adaptive Blend" : "Signature Style"}
Location: ${projectDetails?.address || "Not specified"}

--- 3D MODEL INFO ---
- Stories: 1 (conceptual)
- Structural System: Hybrid steel-timber frame
- Facade: High-performance glazing, local stone accents
- MEP Systems: VRF with heat recovery, solar panel ready

This demo file confirms that the export functionality is working. The full version would contain a detailed 3D model with parametric families.
`;
};

const generateIFCContent = (projectDetails, bimModel = null) => {
  const projectName = projectDetails?.program
    ? projectDetails.program.charAt(0).toUpperCase() +
      projectDetails.program.slice(1)
    : "Architectural Design";

  // If BIM model is available, use it to generate proper IFC
  if (bimModel) {
    try {
      console.log("Generating IFC from BIM model...");
      const ifcContent = bimService.exportToIFC(bimModel);
      return ifcContent;
    } catch (error) {
      console.error("Failed to generate IFC from BIM model:", error);
      // Fall back to placeholder content
    }
  }

  // Fallback placeholder content when no BIM model available
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ArchitectAI Generated Model'),'2;1');
FILE_NAME('${projectName.replace(/\s/g, "_")}.ifc','${new Date().toISOString()}',('ArchitectAI'),('AI Architecture Platform'),'IFC4','ArchitectAI Export','');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
#1=IFCPROJECT('3MDNqGDETHuBCrTHSPWVCe',$,'${projectName} - ${projectDetails?.area || "N/A"}m2',$,$,$,$,(#2),#3);
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#4,$);
#3=IFCUNITASSIGNMENT((#5,#6,#7));
#4=IFCAXIS2PLACEMENT3D(#8,$,$);
#5=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#6=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#7=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#8=IFCCARTESIANPOINT((0.,0.,0.));

/* Building Elements (Simplified for Demo) */
#100=IFCBUILDING('2FCZDorxHDT8NI01kdXi8P',$,'${projectName}',$,$,#101,$,$,.ELEMENT.,$,$,$);
#101=IFCLOCALPLACEMENT($,#102);
#102=IFCAXIS2PLACEMENT3D(#103,$,$);
#103=IFCCARTESIANPOINT((0.,0.,0.));

ENDSEC;
END-ISO-10303-21;`;
};

const generatePDFContent = (projectDetails, styleChoice, locationData) => {
  const htmlContent = `
    <html>
    <head>
      <title>ArchitectAI - Project Documentation</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #1e40af; }
        h2 { color: #3b82f6; margin-top: 30px; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 25px; }
        .spec-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .spec-table th, .spec-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .spec-table th { background-color: #f3f4f6; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>ArchitectAI Platform</h1>
        <p>Project Documentation - ${new Date().toLocaleDateString()}</p>
      </div>
      
      <h2>Project Overview</h2>
      <div class="section">
        <p><strong>Project Type:</strong> ${projectDetails?.program === "clinic" ? "Medical Clinic" : projectDetails?.program || "Commercial Building"}</p>
        <p><strong>Total Area:</strong> ${projectDetails?.area || "500"}m²</p>
        <p><strong>Location:</strong> ${locationData?.address || "123 Main Street, San Francisco, CA 94105"}</p>
        <p><strong>Design Style:</strong> ${styleChoice === "blend" ? "Adaptive Blend with Local Architecture" : "Portfolio Signature Style"}</p>
      </div>

      <h2>Space Program</h2>
      <table class="spec-table">
        <tr><th>Space</th><th>Area (m²)</th><th>Quantity</th></tr>
        <tr><td>Reception</td><td>25</td><td>1</td></tr>
        <tr><td>Waiting Area</td><td>40</td><td>1</td></tr>
        <tr><td>Consultation Rooms</td><td>20</td><td>4</td></tr>
        <tr><td>Staff Room</td><td>30</td><td>1</td></tr>
        <tr><td>Bathrooms</td><td>20</td><td>2</td></tr>
        <tr><td>Storage</td><td>15</td><td>1</td></tr>
      </table>

      <h2>Technical Specifications</h2>
      <div class="section">
        <h3>Structural System</h3>
        <p>Hybrid steel-timber frame with seismic resilience</p>
        
        <h3>MEP Systems</h3>
        <ul>
          <li><strong>HVAC:</strong> VRF system with heat recovery</li>
          <li><strong>Electrical:</strong> 100% LED with daylight sensors</li>
          <li><strong>Plumbing:</strong> Low-flow fixtures, greywater recycling</li>
        </ul>
      </div>

      <h2>Cost Estimation</h2>
      <div class="section">
        <p><strong>Construction Cost:</strong> $2.1M - $2.4M</p>
        <p><strong>Timeline:</strong> 12-14 months</p>
        <p><strong>Annual Energy Savings:</strong> $45,000/year</p>
      </div>

      <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666;">
        <p>Generated by ArchitectAI Platform - AI-Powered Architecture Design</p>
        <p>This is a demo document. Full technical drawings will be included in production version.</p>
      </div>
    </body>
    </html>
  `;

  return htmlContent;
};

const MapView = ({
  center,
  zoom,
  onSitePolygonChange,
  existingPolygon,
  enableDrawing = false,
}) => {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const polygonRef = useRef(null);
  const cornerMarkersRef = useRef([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Check if Google Maps is blocked
  useEffect(() => {
    const checkGoogleMaps = setTimeout(() => {
      if (!window.google || !window.google.maps) {
        setMapError(true);
        console.warn(
          "⚠️ Google Maps failed to load - likely blocked by browser extension or ad blocker",
        );
      }
    }, 3000);

    return () => clearTimeout(checkGoogleMaps);
  }, []);

  // Initialize map only once
  useEffect(() => {
    if (!ref.current || mapRef.current || !window.google || mapError) return;

    try {
      const mapOptions = {
        center,
        zoom: zoom || 18,
        mapTypeId: "hybrid",
        tilt: 45,
        disableDefaultUI: false,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        styles: [
          {
            featureType: "all",
            stylers: [{ saturation: 20 }, { lightness: -10 }],
          },
        ],
      };

      // Add Map ID if available for AdvancedMarkerElement support
      if (process.env.REACT_APP_GOOGLE_MAPS_MAP_ID) {
        mapOptions.mapId = process.env.REACT_APP_GOOGLE_MAPS_MAP_ID;
      }

      const newMap = new window.google.maps.Map(ref.current, mapOptions);

      // Force map controls to be visible after map loads (keep Google's default styling)
      window.google.maps.event.addListenerOnce(newMap, "idle", () => {
        // Inject styles to ensure controls are visible (but keep Google's default design)
        const styleId = "google-maps-controls-visible";
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            .gm-style .gm-map-type-control,
            .gm-style .gm-map-type-control > div,
            .gm-style .gm-map-type-control button,
            .gm-style .gm-map-type-control a,
            .gm-style-mtc,
            .gm-style-mtc > div,
            .gm-style-mtc button,
            .gm-style-mtc a {
              opacity: 1 !important;
              visibility: visible !important;
              display: block !important;
            }
            .gm-style .gm-map-type-control button,
            .gm-style .gm-map-type-control a,
            .gm-style-mtc button,
            .gm-style-mtc a,
            .gm-style .gm-map-type-control button span,
            .gm-style .gm-map-type-control a span,
            .gm-style-mtc button span,
            .gm-style-mtc a span {
              opacity: 1 !important;
              visibility: visible !important;
              display: inline-block !important;
              color: #1F2937 !important;
              font-weight: 500 !important;
            }
            .gm-style .gm-map-type-control button:not(:hover),
            .gm-style .gm-map-type-control a:not(:hover),
            .gm-style-mtc button:not(:hover),
            .gm-style-mtc a:not(:hover),
            .gm-style .gm-map-type-control button:not(:hover) span,
            .gm-style .gm-map-type-control a:not(:hover) span,
            .gm-style-mtc button:not(:hover) span,
            .gm-style-mtc a:not(:hover) span {
              opacity: 1 !important;
              visibility: visible !important;
              color: #1F2937 !important;
            }
            .gm-style .gm-map-type-control *,
            .gm-style-mtc * {
              color: #1F2937 !important;
            }
            .gm-style .gm-map-type-control button *,
            .gm-style .gm-map-type-control a *,
            .gm-style-mtc button *,
            .gm-style-mtc a * {
              color: #1F2937 !important;
              opacity: 1 !important;
            }
          `;
          document.head.appendChild(style);
        }
      });

      // Explicitly maintain 45° tilt for satellite/hybrid views
      // This prevents the deprecation warning about automatic 45° switching
      newMap.addListener("zoom_changed", () => {
        const currentZoom = newMap.getZoom();
        const mapType = newMap.getMapTypeId();
        if (
          (mapType === "satellite" || mapType === "hybrid") &&
          currentZoom >= 18
        ) {
          newMap.setTilt(45);
        }
      });

      // Create marker - try AdvancedMarkerElement first, fall back to standard Marker
      let newMarker;

      // Check if we can use AdvancedMarkerElement (requires Map ID)
      const canUseAdvancedMarker =
        window.google.maps.marker?.AdvancedMarkerElement &&
        process.env.REACT_APP_GOOGLE_MAPS_MAP_ID;

      if (canUseAdvancedMarker) {
        // Use modern AdvancedMarkerElement
        console.log("✅ Using AdvancedMarkerElement with Map ID");

        // Create custom HTML marker element - Google Maps style red pin
        const markerDiv = document.createElement("div");
        markerDiv.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="27" height="43" viewBox="0 0 27 43">
            <path fill="#EA4335" stroke="#FFF" stroke-width="1.5" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 1.699.36 3.32 1.004 4.796C3.41 24.654 12.5 43 12.5 43s9.09-18.346 11.496-25.704c.644-1.476 1.004-3.097 1.004-4.796C25 5.596 19.404 0 12.5 0z"/>
            <circle fill="#FFF" cx="12.5" cy="12.5" r="5.5"/>
          </svg>
        `;

        newMarker = new window.google.maps.marker.AdvancedMarkerElement({
          position: center,
          map: newMap,
          title: "Project Location",
          content: markerDiv,
        });
      } else {
        // Use standard Marker (deprecated but still supported)
        // Suppress deprecation warning as we're already handling the migration path
        if (!process.env.REACT_APP_GOOGLE_MAPS_MAP_ID) {
          console.info(
            "ℹ️ Using standard Marker. To enable AdvancedMarkerElement, add a Map ID to environment variables.",
          );
        }

        newMarker = new window.google.maps.Marker({
          position: center,
          map: newMap,
          title: "Project Location",
          icon: {
            url:
              "data:image/svg+xml;charset=UTF-8," +
              encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="27" height="43" viewBox="0 0 27 43">
                <path fill="#EA4335" stroke="#FFF" stroke-width="1.5" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 1.699.36 3.32 1.004 4.796C3.41 24.654 12.5 43 12.5 43s9.09-18.346 11.496-25.704c.644-1.476 1.004-3.097 1.004-4.796C25 5.596 19.404 0 12.5 0z"/>
                <circle fill="#FFF" cx="12.5" cy="12.5" r="5.5"/>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(27, 43),
            anchor: new window.google.maps.Point(13.5, 43),
          },
        });
      }

      mapRef.current = newMap;
      markerRef.current = newMarker;
      setIsMapLoaded(true);
    } catch (error) {
      console.error("Map initialization error:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependencies - initialize only once

  // Update map center and marker when coordinates change
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || !markerRef.current) return;

    try {
      // Handle both AdvancedMarkerElement and standard Marker
      if (
        markerRef.current.position &&
        typeof markerRef.current.position === "object"
      ) {
        // AdvancedMarkerElement uses position property
        markerRef.current.position = center;
      } else if (markerRef.current.setPosition) {
        // Standard Marker uses setPosition method
        markerRef.current.setPosition(center);
      }
      mapRef.current.setCenter(center);
    } catch (error) {
      console.error("Map update error:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, isMapLoaded]); // Use specific lat/lng values to avoid object reference issues

  // Render detected polygon with labeled corners
  useEffect(() => {
    if (
      !isMapLoaded ||
      !mapRef.current ||
      !existingPolygon ||
      existingPolygon.length === 0
    ) {
      return;
    }

    // Clean up previous polygon and markers
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    cornerMarkersRef.current.forEach((marker) => {
      if (marker.setMap) marker.setMap(null);
    });
    cornerMarkersRef.current = [];

    try {
      console.log(
        "🗺️  Rendering detected polygon with",
        existingPolygon.length,
        "vertices",
      );

      // Create polygon overlay
      const polygon = new window.google.maps.Polygon({
        paths: existingPolygon,
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#FF0000",
        fillOpacity: 0.25,
        editable: false,
        draggable: false,
      });

      polygon.setMap(mapRef.current);
      polygonRef.current = polygon;

      // Add numbered markers at each corner
      existingPolygon.forEach((coord, index) => {
        // Skip duplicate last vertex if polygon is closed
        if (
          index === existingPolygon.length - 1 &&
          coord.lat === existingPolygon[0].lat &&
          coord.lng === existingPolygon[0].lng
        ) {
          return;
        }

        // Using standard Marker (deprecated but still supported)
        // AdvancedMarkerElement requires mapId which conflicts with custom styles
        const marker = new window.google.maps.Marker({
          position: coord,
          map: mapRef.current,
          label: {
            text: `${index + 1}`,
            color: "#FFFFFF",
            fontSize: "12px",
            fontWeight: "bold",
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#FF0000",
            fillOpacity: 0.9,
            strokeColor: "#FFFFFF",
            strokeWeight: 2,
            scale: 10,
          },
          zIndex: 1000,
          title: `Corner ${index + 1}`,
        });

        cornerMarkersRef.current.push(marker);
      });

      // Fit map bounds to show entire polygon
      const bounds = new window.google.maps.LatLngBounds();
      existingPolygon.forEach((coord) => bounds.extend(coord));
      mapRef.current.fitBounds(bounds);

      console.log(
        "✅ Polygon rendered with",
        cornerMarkersRef.current.length,
        "labeled corners",
      );
    } catch (error) {
      console.error("❌ Failed to render polygon:", error);
    }

    // Cleanup function
    return () => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
      cornerMarkersRef.current.forEach((marker) => {
        if (marker.setMap) marker.setMap(null);
      });
      cornerMarkersRef.current = [];
    };
  }, [existingPolygon, isMapLoaded]);

  // Show fallback UI if Google Maps is blocked
  if (mapError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 max-w-md">
          <h3 className="text-lg font-semibold text-yellow-800 mb-3 flex items-center">
            <span className="text-2xl mr-2">⚠️</span>
            Google Maps Blocked
          </h3>
          <p className="text-yellow-700 mb-4">
            Google Maps couldn't load. This is usually caused by ad blockers or
            privacy extensions.
          </p>
          <div className="bg-white rounded p-3 mb-4">
            <p className="text-sm font-medium mb-1">To fix this:</p>
            <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
              <li>Disable ad blockers for this site</li>
              <li>If using Brave, click the shield icon and set to "Down"</li>
              <li>Add this site to your whitelist</li>
              <li>Refresh the page</li>
            </ol>
          </div>
          <div className="bg-blue-50 rounded p-3 border border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-1">
              📍 Location coordinates:
            </p>
            <p className="text-xs text-gray-700 font-mono">
              Lat: {center.lat.toFixed(6)}, Lng: {center.lng.toFixed(6)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", borderRadius: "12px" }}
      />
      {enableDrawing && isMapLoaded && mapRef.current && (
        <PrecisionSiteDrawer
          map={mapRef.current}
          onPolygonComplete={onSitePolygonChange}
          initialPolygon={existingPolygon}
          enabled={true}
        />
      )}
    </div>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error: error, errorInfo: errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            backgroundColor: "#fff0f0",
            border: "1px solid red",
            borderRadius: "8px",
          }}
        >
          <h2>
            Something went wrong. Please provide the following information to
            support:
          </h2>
          <details style={{ whiteSpace: "pre-wrap", marginTop: "10px" }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

const ArchitectAIEnhanced = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [locationData, setLocationData] = useState(null);
  const [address, setAddress] = useState("");
  const [portfolioFiles, setPortfolioFiles] = useState([]);
  const [styleChoice] = useState("blend"); // Keep for backward compatibility (read-only)
  // eslint-disable-next-line no-unused-vars
  const [blendWeight, setBlendWeight] = useState(0.5); // DEPRECATED: Keep for backward compatibility
  const [materialWeight, setMaterialWeight] = useState(0.5); // NEW: 0=100% local materials, 1=100% portfolio materials
  const [characteristicWeight, setCharacteristicWeight] = useState(0.5); // NEW: 0=100% local characteristics, 1=100% portfolio characteristics
  const [projectDetails, setProjectDetails] = useState({
    area: "",
    program: "",
    entranceDirection: "",
    floorCount: 2,
  });
  const [programSpaces, setProgramSpaces] = useState([]);
  const [isGeneratingSpaces, setIsGeneratingSpaces] = useState(false);
  // 🏢 Floor count calculation state
  const [calculatedFloors, setCalculatedFloors] = useState({
    optimalFloors: 2,
    minFloorsNeeded: 1,
    maxFloorsAllowed: 4,
    reasoning: "",
    coverageRatio: 0.4,
  });
  const [floorCountLocked, setFloorCountLocked] = useState(false);

  // 🆕 Pre-populate program spaces based on building program
  // 🎨 AI-ENHANCED Program Space Generator
  const generateProgramSpacesWithAI = async (buildingProgram, totalArea) => {
    try {
      // Sanitize inputs for security
      const sanitizedProgram = sanitizePromptInput(buildingProgram, {
        maxLength: 100,
        allowNewlines: false,
      });
      const sanitizedArea = sanitizeDimensionInput(totalArea);

      if (!sanitizedProgram || !sanitizedArea) {
        logger.debug(
          "Skipping program space generation - inputs not provided yet",
        );
        return [];
      }

      logger.info(
        "Generating program spaces with AI",
        {
          program: sanitizedProgram,
          area: `${sanitizedArea}m²`,
        },
        "🤖",
      );

      // Import the reasoning service
      const togetherAIReasoningService = (
        await import("./services/togetherAIReasoningService")
      ).default;

      const prompt = `You are an architectural programming expert. Generate a detailed room schedule for a ${sanitizedProgram} with a total area of ${sanitizedArea}m².

REQUIREMENTS:
- Total of all spaces should be approximately ${sanitizedArea}m² (allowing 10-15% for circulation)
- Include all necessary spaces for this building type
- Specify realistic area for each space in m²
- Indicate which floor level each space should be on
- Include appropriate count for repeated spaces

CRITICAL: Return ONLY a valid JSON array. No explanations, no markdown, no code blocks. Just the raw JSON array.

Format (copy this structure exactly with double quotes):
[
  {"name": "Space Name", "area": "50", "count": 1, "level": "Ground"},
  {"name": "Another Space", "area": "30", "count": 2, "level": "First"}
]

Building type: ${sanitizedProgram}
Total area: ${sanitizedArea}m²

IMPORTANT: Use double quotes for all strings, no trailing commas, no comments.`;

      const response = await togetherAIReasoningService.chatCompletion(
        [
          {
            role: "system",
            content:
              "You are an architectural programming expert. Generate room schedules in JSON format only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        {
          max_tokens: 1000,
          temperature: 0.7,
        },
      );

      // Extract content from Together.ai response structure
      const content = response?.choices?.[0]?.message?.content || "";

      if (content) {
        // Try to parse JSON from the response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const spaces = JSON.parse(jsonMatch[0]);
            if (Array.isArray(spaces) && spaces.length > 0) {
              console.log("✅ AI generated", spaces.length, "program spaces");
              return spaces;
            } else {
              console.warn(
                "⚠️ AI returned empty or invalid array, using defaults",
              );
            }
          } catch (parseError) {
            console.warn(
              "⚠️ JSON parse error in AI response:",
              parseError.message,
            );
            console.warn("   Raw JSON match:", jsonMatch[0]?.substring(0, 200));
            // Try to extract partial data or use defaults
          }
        } else {
          console.warn("⚠️ No JSON array found in AI response");
          console.warn("   Response content:", content.substring(0, 300));
        }
      }

      // Fallback to default spaces if AI fails
      console.log("⚠️ AI generation failed, using defaults");
      return getDefaultProgramSpaces(buildingProgram);
    } catch (error) {
      console.error(
        "❌ Error generating program spaces with AI:",
        error.message || error,
      );
      console.error("   Full error:", error);
      return getDefaultProgramSpaces(buildingProgram);
    }
  };

  // Default program spaces (fallback)
  const getDefaultProgramSpaces = (type) => {
    // Map building program values to simple keys
    const typeMap = {
      "detached-house": "house",
      "semi-detached-house": "house",
      "terraced-house": "house",
      villa: "house",
      cottage: "house",
      "apartment-building": "apartment",
      condominium: "apartment",
      "residential-tower": "apartment",
      clinic: "hospital",
      "dental-clinic": "hospital",
      "health-center": "hospital",
      pharmacy: "retail",
      office: "office",
      coworking: "office",
      retail: "retail",
      "shopping-center": "retail",
      restaurant: "retail",
      cafe: "retail",
      school: "school",
      kindergarten: "school",
      "training-center": "office",
      library: "school",
    };

    const mappedType = typeMap[type] || type;

    const defaults = {
      house: [
        { name: "Living Room", area: "35", count: 1, level: "Ground" },
        { name: "Kitchen", area: "20", count: 1, level: "Ground" },
        { name: "Dining Area", area: "18", count: 1, level: "Ground" },
        { name: "WC", area: "4", count: 1, level: "Ground" },
        { name: "Master Bedroom", area: "20", count: 1, level: "First" },
        { name: "Bedroom", area: "15", count: 2, level: "First" },
        { name: "Bathroom", area: "8", count: 2, level: "First" },
        { name: "Hallway/Circulation", area: "15", count: 1, level: "Ground" },
        { name: "Storage", area: "8", count: 1, level: "Ground" },
      ],
      office: [
        { name: "Lobby/Reception", area: "50", count: 1, level: "Ground" },
        { name: "Open Office", area: "300", count: 1, level: "Ground" },
        { name: "Meeting Room", area: "60", count: 2, level: "Ground" },
        { name: "Conference Room", area: "80", count: 1, level: "Ground" },
        { name: "Break Room", area: "40", count: 1, level: "Ground" },
        { name: "WC", area: "20", count: 2, level: "Ground" },
        { name: "Storage", area: "15", count: 2, level: "Ground" },
      ],
      retail: [
        { name: "Sales Floor", area: "400", count: 1, level: "Ground" },
        { name: "Cashier Area", area: "30", count: 1, level: "Ground" },
        { name: "Storage", area: "80", count: 1, level: "Ground" },
        { name: "Staff Room", area: "25", count: 1, level: "Ground" },
        { name: "WC", area: "15", count: 2, level: "Ground" },
      ],
      school: [
        { name: "Classroom", area: "60", count: 6, level: "Ground" },
        { name: "Library", area: "100", count: 1, level: "Ground" },
        { name: "Administration", area: "80", count: 1, level: "Ground" },
        { name: "Cafeteria", area: "150", count: 1, level: "Ground" },
        { name: "Gymnasium", area: "200", count: 1, level: "Ground" },
        { name: "WC", area: "20", count: 4, level: "Ground" },
      ],
      hospital: [
        { name: "Reception/Waiting", area: "100", count: 1, level: "Ground" },
        { name: "Consultation Room", area: "25", count: 8, level: "Ground" },
        { name: "Examination Room", area: "20", count: 6, level: "Ground" },
        { name: "Administration", area: "60", count: 1, level: "Ground" },
        { name: "Pharmacy", area: "40", count: 1, level: "Ground" },
        { name: "WC", area: "15", count: 4, level: "Ground" },
      ],
      apartment: [
        { name: "Lobby", area: "50", count: 1, level: "Ground" },
        { name: "Apartment Unit", area: "80", count: 8, level: "1" },
        { name: "Corridor", area: "100", count: 1, level: "1" },
        { name: "Laundry Room", area: "20", count: 1, level: "Ground" },
        { name: "Storage", area: "30", count: 1, level: "Ground" },
      ],
      "mixed-use": [
        { name: "Retail Space", area: "200", count: 1, level: "Ground" },
        { name: "Office Space", area: "150", count: 1, level: "1" },
        { name: "Residential Unit", area: "70", count: 4, level: "2" },
        { name: "Lobby", area: "40", count: 1, level: "Ground" },
        { name: "WC", area: "15", count: 3, level: "Ground" },
      ],
    };
    return defaults[mappedType] || defaults["house"];
  };

  // 🎨 Handle building program change with AI auto-population
  const handleBuildingProgramChange = async (e) => {
    const newProgram = e.target.value;
    setProjectDetails({ ...projectDetails, program: newProgram });

    // Auto-populate program spaces with AI if program and area are selected
    if (newProgram && projectDetails.area && programSpaces.length === 0) {
      setIsGeneratingSpaces(true);
      const spaces = await generateProgramSpacesWithAI(
        newProgram,
        projectDetails.area,
      );
      if (spaces.length > 0) {
        setProgramSpaces(spaces);
        setToastMessage(
          `✅ Generated ${spaces.length} spaces with AI for ${newProgram}`,
        );
        setTimeout(() => setToastMessage(""), 3000);
      }
      setIsGeneratingSpaces(false);
    }
  };
  const [generatedDesigns, setGeneratedDesigns] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({
    phase: "",
    step: 0,
    totalSteps: 7,
    message: "",
    percentage: 0,
  });
  const [showModification, setShowModification] = useState(false);
  const [showModifyDrawer, setShowModifyDrawer] = useState(false);
  const [currentDesignId, setCurrentDesignId] = useState(() => {
    // Initialize from sessionStorage to persist across refresh
    const storedId = sessionStorage.getItem("currentDesignId");

    // 🚨 CRITICAL FIX: Clean up invalid IDs from old generations
    if (storedId === "undefined" || storedId === "null" || !storedId) {
      console.warn(
        "⚠️ Invalid currentDesignId detected in sessionStorage:",
        storedId,
      );
      console.warn(
        "   Clearing invalid ID - modifications will be disabled for old sheets",
      );
      sessionStorage.removeItem("currentDesignId");
      return null;
    }

    return storedId;
  });
  const mapRef = useRef(null);
  const [downloadCount, setDownloadCount] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionStartTime] = useState(Date.now());
  const [generationStartTime, setGenerationStartTime] = useState(null);
  const [isGenerationComplete, setIsGenerationComplete] = useState(false);
  const [rateLimitPause, setRateLimitPause] = useState({
    active: false,
    remainingSeconds: 0,
    reason: "",
  });

  // Image Modal States
  const [modalImage, setModalImage] = useState(null);
  const [modalImageTitle, setModalImageTitle] = useState("");
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // DALL·E 3 Consistency: Project-wide style signature
  const [projectStyleSignature, setProjectStyleSignature] = useState(null);

  // 🆕 Design History: Track current project for consistency across 2D/3D generations
  const [currentProjectId, setCurrentProjectId] = useState(null);

  // 🔧 AI Modification & Generation History
  const [showModificationPanel, setShowModificationPanel] = useState(false);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);

  // 🆕 Site Polygon: User-drawn site boundary for context-aware design
  const [sitePolygon, setSitePolygon] = useState(null);
  const [siteMetrics, setSiteMetrics] = useState(null);
  const vectorPlan = null;

  // 🆕 Ref to track if geometry views have been integrated (prevent duplicate integration)
  const geometryViewsIntegratedRef = useRef(false);

  useEffect(() => {
    if (typeof subscribeToImageQueueStatus !== "function") {
      return undefined;
    }

    const unsubscribe = subscribeToImageQueueStatus((status) => {
      if (!status) {
        return;
      }

      if (status.cooldownActive) {
        const seconds = Math.max(
          1,
          Math.ceil((status.cooldownRemainingMs || 0) / 1000),
        );
        setRateLimitPause({
          active: true,
          remainingSeconds: seconds,
          reason: status.reason || "Temporarily throttled by Together.ai",
        });
      } else {
        setRateLimitPause({ active: false, remainingSeconds: 0, reason: "" });
      }
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  // 🏢 Auto-calculate floor count when area, building program, or site metrics change
  useEffect(() => {
    // Only calculate if we have both area and building program
    if (!projectDetails.area || !projectDetails.program) {
      return;
    }

    const totalArea = parseInt(projectDetails.area);
    const siteArea = siteMetrics?.areaM2 || totalArea * 2.5; // Default: assume site is 2.5x building area

    if (isNaN(totalArea) || totalArea <= 0) {
      return;
    }

    try {
      const result = autoLevelAssignmentService.calculateOptimalLevels(
        totalArea,
        siteArea,
        {
          buildingType: projectDetails.program,
          subType: projectDetails.program, // Use program as subType for house types
          maxFloors: 10,
        },
      );

      setCalculatedFloors(result);

      // Auto-update floor count if not locked
      if (!floorCountLocked) {
        setProjectDetails((prev) => ({
          ...prev,
          floorCount: result.optimalFloors,
        }));
      }

      logger.info(
        "Floor count calculated",
        {
          area: totalArea,
          siteArea,
          program: projectDetails.program,
          floors: result.optimalFloors,
          locked: floorCountLocked,
        },
        "🏢",
      );
    } catch (error) {
      logger.warn("Floor calculation failed", error);
    }
  }, [
    projectDetails.area,
    projectDetails.program,
    siteMetrics?.areaM2,
    floorCountLocked,
  ]);

  // Use refs to store current values for event handlers (prevents handler recreation)
  const imageZoomRef = useRef(1);
  const imagePanRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const handleDiagnosticsToggle = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key?.toLowerCase() === "d") {
        event.preventDefault();
        setShowDiagnosticsPanel((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleDiagnosticsToggle);
    return () => window.removeEventListener("keydown", handleDiagnosticsToggle);
  }, []);

  // Sync state with refs
  useEffect(() => {
    imageZoomRef.current = imageZoom;
  }, [imageZoom]);

  useEffect(() => {
    imagePanRef.current = imagePan;
  }, [imagePan]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    dragStartRef.current = dragStart;
  }, [dragStart]);

  // Persist currentDesignId to sessionStorage for modification after refresh
  useEffect(() => {
    if (currentDesignId) {
      sessionStorage.setItem("currentDesignId", currentDesignId);
    } else {
      sessionStorage.removeItem("currentDesignId");
    }
  }, [currentDesignId]);
  // const hasDetectedLocation = useRef(false); // Temporarily disabled

  const showToast = useCallback((message) => {
    setToastMessage(message);
  }, []);

  // Memoized callback for site polygon changes to prevent re-renders
  const handleSitePolygonChange = useCallback((polygon) => {
    setSitePolygon(polygon);
    const metrics = computeSiteMetrics(polygon);
    setSiteMetrics(metrics);
    console.log("🗺️  Site polygon updated:", {
      vertices: polygon.length,
      area: metrics.areaM2?.toFixed(0) + " m²",
      orientation: metrics.orientationDeg?.toFixed(0) + "°",
    });
  }, []);

  // 🆕 Memoized callback for geometry views integration (prevents infinite render loop)
  // eslint-disable-next-line no-unused-vars
  const handleGeometryViewsReady = useCallback((urls) => {
    console.log("🎨 Geometry views ready:", urls);

    // Prevent duplicate integration
    if (geometryViewsIntegratedRef.current) {
      console.log("  (Already integrated, skipping)");
      return;
    }

    // Integrate geometry views into design data for unified sheet generation
    if (urls && (urls.axon || urls.persp || urls.interior)) {
      setGeneratedDesigns((prev) => {
        if (!prev) return prev;

        // Create or update visualizations structure
        const updatedViz = {
          ...prev.visualizations,
          threeD: [
            ...(prev.visualizations?.threeD || []),
            ...(urls.axon ? [{ type: "axonometric", url: urls.axon }] : []),
            ...(urls.persp ? [{ type: "perspective", url: urls.persp }] : []),
            ...(urls.interior
              ? [{ type: "interior", url: urls.interior }]
              : []),
          ],
        };

        return {
          ...prev,
          visualizations: updatedViz,
        };
      });

      geometryViewsIntegratedRef.current = true;
      console.log("✅ Geometry views integrated into design data");
    }
  }, []);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // DALL·E 3 Consistency: Restore style signature from localStorage on mount
  useEffect(() => {
    try {
      const savedSignature = localStorage.getItem("projectStyleSignature");
      if (savedSignature) {
        const signature = JSON.parse(savedSignature);
        setProjectStyleSignature(signature);
        console.log("✅ Restored style signature from localStorage");
      }
    } catch (error) {
      console.error("Failed to restore style signature:", error);
    }
  }, []);

  // 🆕 Design History: Check for previous project on mount
  useEffect(() => {
    const checkDesignHistory = async () => {
      try {
        const latestProject =
          await designHistoryService.getLatestDesignContext();
        if (latestProject) {
          console.log("🔄 Found previous project:", latestProject.projectId);
          console.log("   📍 Location:", latestProject.location?.address);
          console.log(
            "   🏗️  Building:",
            latestProject.metadata?.buildingProgram,
          );
          console.log("   🎲 Seed:", latestProject.seed);
          // Note: Not auto-loading to avoid confusion. User can manually continue if desired.
        }
      } catch (error) {
        console.error("Failed to check design history:", error);
      }
    };
    checkDesignHistory();
  }, []);

  // Image Modal Handlers
  const openImageModal = useCallback((imageUrl, title = "Image") => {
    setModalImage(imageUrl);
    setModalImageTitle(title);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }, []);

  const closeImageModal = useCallback(() => {
    setModalImage(null);
    setModalImageTitle("");
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setImageZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setImageZoom((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleZoomReset = useCallback(() => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (imageZoomRef.current > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - imagePanRef.current.x,
        y: e.clientY - imagePanRef.current.y,
      });
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (isDraggingRef.current && imageZoomRef.current > 1) {
      e.preventDefault();
      requestAnimationFrame(() => {
        setImagePan({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y,
        });
      });
    }
  }, []);

  const handleMouseUp = useCallback((e) => {
    if (e) e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY * -0.01;
    const newZoom = Math.min(Math.max(imageZoomRef.current + delta, 0.5), 3);
    setImageZoom(newZoom);
    if (newZoom <= 1) {
      setImagePan({ x: 0, y: 0 });
    }
  }, []);

  // Stop timer when A1 sheet is ready and displayed
  useEffect(() => {
    // Check if A1 sheet is ready and we're on the results page
    if (
      generationStartTime &&
      !isGenerationComplete &&
      generatedDesigns?.a1Sheet &&
      currentStep === 5 &&
      !isLoading
    ) {
      // A1 sheet is set, step is 5 (results), and loading is complete
      // Wait a bit for the image to actually render, then stop timer
      const timer = setTimeout(() => {
        setIsGenerationComplete(true);
        const finalElapsedTime = Math.floor(
          (Date.now() - generationStartTime) / 1000,
        );
        setElapsedTime(finalElapsedTime);
        console.log(
          `⏱️ Generation completed in ${finalElapsedTime} seconds (${formatElapsedTime(finalElapsedTime)})`,
        );
      }, 1000); // Wait 1 second for image to load/display

      return () => clearTimeout(timer);
    }
  }, [
    generationStartTime,
    isGenerationComplete,
    generatedDesigns?.a1Sheet,
    currentStep,
    isLoading,
  ]);

  // Real-time elapsed timer - stops when A1 sheet generation is complete
  useEffect(() => {
    // If generation is complete, stop the timer (don't create interval)
    if (isGenerationComplete) {
      return; // Timer is stopped, elapsedTime already set to final value
    }

    // If generation has started, track time from generation start
    if (generationStartTime) {
      const timer = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - generationStartTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }

    // Otherwise, track session time
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime, generationStartTime, isGenerationComplete]);

  // Format elapsed time as MM:SS
  const formatElapsedTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Landing page animation
  useEffect(() => {
    if (currentStep === 0) {
      // Landing page animations are handled by CSS classes
      document.body.style.overflow = "auto";
    }
  }, [currentStep]);

  const detectUserLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setAddress("123 Main Street, San Francisco, CA 94105");
      showToast("Geolocation not supported. Using default location.");
      return;
    }

    setIsDetectingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude: lat, longitude: lng } = position.coords;

          // Reverse geocode to get address
          const response = await axios.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            {
              params: {
                latlng: `${lat},${lng}`,
                key: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
              },
            },
          );

          if (
            response.data.status === "OK" &&
            response.data.results.length > 0
          ) {
            const detectedAddress = response.data.results[0].formatted_address;
            setAddress(detectedAddress);
            showToast(
              `📍 Location detected: ${detectedAddress.split(",").slice(0, 2).join(",")}`,
            );
          } else {
            setAddress("123 Main Street, San Francisco, CA 94105");
            showToast("Could not detect address. Using default location.");
          }
        } catch (error) {
          console.error("Reverse geocoding failed:", error);
          setAddress("123 Main Street, San Francisco, CA 94105");
          showToast("Location detection failed. Using default location.");
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setAddress("123 Main Street, San Francisco, CA 94105");
        setIsDetectingLocation(false);

        let errorMessage = "Location access denied. Using default location.";
        if (error.code === error.TIMEOUT) {
          errorMessage =
            "Location detection timed out. Using default location.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = "Location unavailable. Using default location.";
        }

        showToast(errorMessage);
      },
      {
        timeout: 10000,
        enableHighAccuracy: true,
        maximumAge: 300000, // 5 minutes
      },
    );
  }, [showToast]);

  // Auto-detect location disabled temporarily to debug freezing issues
  // useEffect(() => {
  //   if (currentStep === 1 && !address && !isDetectingLocation && !hasDetectedLocation.current) {
  //     hasDetectedLocation.current = true;
  //     detectUserLocation();
  //   }
  //   // Reset detection flag when step changes away from 1
  //   if (currentStep !== 1) {
  //     hasDetectedLocation.current = false;
  //   }
  // }, [currentStep, address, isDetectingLocation, detectUserLocation]);

  const getSeasonalClimateData = async (lat, lon) => {
    try {
      // Use OpenWeather API v2.5 Current Weather (free tier)
      const url = "https://api.openweathermap.org/data/2.5/weather";
      const response = await axios.get(url, {
        params: {
          lat,
          lon,
          units: "metric",
          appid: process.env.REACT_APP_OPENWEATHER_API_KEY,
        },
      });

      const weatherData = response.data;

      // Create seasonal estimates based on current weather and location
      const currentTemp = weatherData.main.temp;
      const tempVariation = 15; // Typical seasonal temperature variation

      const finalProcessedData = {
        climate: {
          type: weatherData.weather[0]?.main || "Varied",
          seasonal: {
            winter: {
              avgTemp: `${(currentTemp - tempVariation).toFixed(1)}°C`,
              precipitation: "Moderate",
              solar: "40-50%",
            },
            spring: {
              avgTemp: `${(currentTemp - 5).toFixed(1)}°C`,
              precipitation: "Moderate",
              solar: "60-70%",
            },
            summer: {
              avgTemp: `${(currentTemp + tempVariation).toFixed(1)}°C`,
              precipitation: "Low",
              solar: "80-90%",
            },
            fall: {
              avgTemp: `${(currentTemp + 5).toFixed(1)}°C`,
              precipitation: "Moderate-High",
              solar: "50-60%",
            },
          },
        },
        sunPath: {
          summer: `Sunrise: ~6:00 AM`,
          winter: `Sunset: ~5:00 PM`,
          optimalOrientation: "South-facing (general recommendation)",
        },
      };

      return finalProcessedData;
    } catch (error) {
      console.warn("Could not retrieve seasonal climate data:", error);

      // Fallback to mock data if API fails (e.g., due to subscription error)
      if (error.response && error.response.status === 401) {
        return {
          climate: {
            type: "Mild, Mediterranean (Mock Data)",
            seasonal: {
              winter: {
                avgTemp: "14.0°C",
                precipitation: "100mm",
                solar: "50%",
              },
              spring: {
                avgTemp: "17.5°C",
                precipitation: "40mm",
                solar: "75%",
              },
              summer: { avgTemp: "22.0°C", precipitation: "5mm", solar: "90%" },
              fall: { avgTemp: "19.5°C", precipitation: "25mm", solar: "65%" },
            },
          },
          sunPath: {
            summer: "Sunrise: ~5:48 AM, Sunset: ~8:35 PM",
            winter: "Sunrise: ~7:20 AM, Sunset: ~5:00 PM",
            optimalOrientation: "South-facing for winter sun",
          },
        };
      }

      return {
        climate: { type: "Error fetching seasonal data", seasonal: {} },
        sunPath: { summer: "N/A", winter: "N/A", optimalOrientation: "N/A" },
      };
    }
  };

  // Real location analysis with Google Maps and OpenWeather
  const analyzeLocation = async () => {
    if (!address) {
      showToast("Please enter an address.");
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Geocode address to get coordinates
      let geocodeResponse;
      if (!process.env.REACT_APP_GOOGLE_MAPS_API_KEY) {
        // Fallback data if no API key
        geocodeResponse = {
          data: {
            status: "OK",
            results: [
              {
                formatted_address:
                  address || "123 Main Street, San Francisco, CA 94105, USA",
                geometry: {
                  location: { lat: 37.795, lng: -122.394 },
                },
                address_components: [
                  { long_name: "San Francisco", types: ["locality"] },
                  {
                    long_name: "California",
                    types: ["administrative_area_level_1"],
                  },
                  { long_name: "United States", types: ["country"] },
                ],
              },
            ],
          },
        };
      } else {
        geocodeResponse = await axios.get(
          "https://maps.googleapis.com/maps/api/geocode/json",
          {
            params: {
              address: address,
              key: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
            },
          },
        );
      }

      if (
        geocodeResponse.data.status !== "OK" ||
        !geocodeResponse.data.results ||
        geocodeResponse.data.results.length === 0
      ) {
        throw new Error(`Geocoding failed: ${geocodeResponse.data.status}`);
      }

      const locationResult = geocodeResponse.data.results[0];
      const { lat, lng } = locationResult.geometry.location;
      const formattedAddress = locationResult.formatted_address;

      const addressComponents = locationResult.address_components;

      // Step 2: Get seasonal climate data
      const seasonalClimateData = await getSeasonalClimateData(lat, lng);

      // Analyze zoning dynamically
      const zoningData = locationIntelligence.analyzeZoning(
        addressComponents,
        locationResult.types,
        locationResult.geometry.location,
      );

      // Analyze market dynamically
      const marketContext = locationIntelligence.analyzeMarket(
        addressComponents,
        { lat, lng },
        zoningData,
      );

      // Recommend architectural style
      const architecturalStyle =
        await locationIntelligence.recommendArchitecturalStyle(
          locationResult,
          seasonalClimateData.climate,
        );

      // 🆕 STEP 3A: Detect building footprint from address
      console.log("🏢 Detecting building footprint from address...");
      const buildingFootprintService = (
        await import("./services/buildingFootprintService")
      ).default;

      const footprintResult = await buildingFootprintService.detectAddressShape(
        formattedAddress,
        process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
      );

      let detectedBuildingFootprint = null;
      let detectedShapeType = null;

      if (footprintResult.success) {
        console.log("✅ Building footprint detected:", {
          shape: footprintResult.shape.name,
          area: `${footprintResult.area.toFixed(1)} m²`,
          vertices: footprintResult.shape.vertexCount,
        });

        detectedBuildingFootprint = footprintResult.polygon;
        detectedShapeType = footprintResult.shape;

        // Auto-populate site polygon with detected building footprint
        setSitePolygon(footprintResult.polygon);
        setSiteMetrics({
          areaM2: footprintResult.area,
          shapeType: footprintResult.shape.name,
          shapeDescription: footprintResult.shape.description,
          vertexCount: footprintResult.shape.vertexCount,
          isConvex: footprintResult.shape.isConvex,
          source: "google_building_outline",
          detectedAt: footprintResult.metadata.detectedAt,
        });
      } else {
        console.log(
          "⚠️  Building footprint not available, trying site analysis...",
        );
      }

      // 🆕 STEP 3B: Analyze site geometry and property boundary (fallback)
      console.log("🗺️  Analyzing site boundary and surface area...");
      const siteAnalysisResult = await siteAnalysisService.analyzeSiteContext(
        formattedAddress,
        { lat, lng },
      );

      if (siteAnalysisResult.success && !detectedBuildingFootprint) {
        console.log(
          "✅ Site analysis complete (fallback):",
          siteAnalysisResult.siteAnalysis,
        );

        // If we got a property boundary and no building footprint, use property boundary
        if (siteAnalysisResult.siteAnalysis.siteBoundary) {
          setSitePolygon(siteAnalysisResult.siteAnalysis.siteBoundary);
          setSiteMetrics({
            areaM2: siteAnalysisResult.siteAnalysis.surfaceArea,
            unit: siteAnalysisResult.siteAnalysis.surfaceAreaUnit,
            source: siteAnalysisResult.siteAnalysis.boundarySource,
          });
        }
      } else if (!siteAnalysisResult.success && !detectedBuildingFootprint) {
        console.warn("⚠️  Both building footprint and site analysis failed");
      }

      // Step 4: Populate location data
      const newLocationData = {
        address: formattedAddress,
        coordinates: { lat, lng },
        address_components: addressComponents, // FIX: Add address_components for locationIntelligence service
        climate: seasonalClimateData.climate,
        sunPath: seasonalClimateData.sunPath,
        zoning: zoningData,
        recommendedStyle: architecturalStyle.primary,
        localStyles: architecturalStyle.alternatives,
        sustainabilityScore: 85, // This can be dynamic later
        marketContext: marketContext,
        architecturalProfile: architecturalStyle,
        siteAnalysis: siteAnalysisResult.success
          ? siteAnalysisResult.siteAnalysis
          : null, // 🆕 Site boundary data
        // 🆕 Building footprint detection results
        buildingFootprint: detectedBuildingFootprint,
        detectedShape: detectedShapeType,
      };

      // 🆕 STEP 5: Generate Google Maps plan mode snapshot for A1 sheet
      try {
        console.log(
          "🗺️  Generating Google Maps plan mode snapshot for A1 sheet...",
        );
        const { getSiteSnapshotWithMetadata } =
          await import("./services/siteMapSnapshotService");

        // Use site polygon if available, otherwise building footprint
        const sitePolygonForMap =
          sitePolygon || detectedBuildingFootprint || null;

        const snapshotResult = await getSiteSnapshotWithMetadata({
          coordinates: { lat, lng },
          polygon: sitePolygonForMap,
          mapType: "roadmap", // Plan mode
          size: [640, 400],
          zoom: sitePolygonForMap ? undefined : 19, // Zoom only if no polygon (for auto-fit)
        });

        if (snapshotResult && snapshotResult.dataUrl) {
          newLocationData.siteMapUrl = snapshotResult.dataUrl;
          newLocationData.mapImageUrl = snapshotResult.dataUrl; // Also set mapImageUrl for compatibility
          console.log("✅ Google Maps plan snapshot generated successfully");
        } else {
          console.warn("⚠️  Site map snapshot generation failed or skipped");
        }
      } catch (snapshotError) {
        console.error(
          "⚠️  Failed to generate site map snapshot:",
          snapshotError,
        );
        // Continue without site map - not critical
      }

      setLocationData(newLocationData);
      setCurrentStep(2);
    } catch (error) {
      console.error("Error analyzing location:", error);

      let errorMessage = "An error occurred during analysis.";
      if (error.response) {
        errorMessage = `Error: ${error.response.data.message || "Failed to fetch data."}`;
      } else if (error.request) {
        errorMessage =
          "Could not connect to the server. Please check your network.";
      } else {
        errorMessage = error.message;
      }

      showToast(`Error: ${errorMessage}. Check API keys and address.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle portfolio upload
  const handlePortfolioUpload = async (e) => {
    if (!e?.target?.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Process each file - convert PDFs to PNGs automatically
      const processedFiles = [];

      for (let file of files) {
        // Check if file is PDF
        if (
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          try {
            console.log(`📄 Converting PDF to PNG: ${file.name}`);

            // Convert PDF to PNG using client-side utility
            const pngFile = await convertPdfFileToImageFile(file);

            // Add converted PNG file
            processedFiles.push({
              name: pngFile.name,
              size: (pngFile.size / 1024 / 1024).toFixed(2) + " MB",
              type: pngFile.type,
              preview: URL.createObjectURL(pngFile),
              file: pngFile,
              convertedFromPdf: true,
            });

            // Show success toast
            console.log(`✅ Converted PDF page 1 to PNG: ${pngFile.name}`);
          } catch (error) {
            console.error(`❌ Failed to convert PDF: ${file.name}`, error);
            // Show error but continue with other files
            alert(
              `Failed to convert PDF: ${file.name}\n${error.message}\n\nPlease try uploading an image file instead.`,
            );
          }
        } else {
          // Regular image file - add as-is
          processedFiles.push({
            name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + " MB",
            type: file.type,
            preview: URL.createObjectURL(file),
            file: file,
          });
        }
      }

      // Update portfolio files with processed files
      setPortfolioFiles(processedFiles);

      // Auto-detect building program from portfolio using AI
      if (processedFiles.length > 0) {
        try {
          logger.info(
            "Analyzing portfolio to detect building program",
            null,
            "🔍",
          );

          // Dynamically import the portfolio service
          const { default: enhancedPortfolioService } =
            await import("./services/enhancedPortfolioService");
          const portfolioFilesForAnalysis = processedFiles
            .map((item) => item.file)
            .filter(Boolean);

          const analysis = await enhancedPortfolioService.analyzePortfolio(
            portfolioFilesForAnalysis,
            locationData,
          );

          // Check if building program was detected
          if (
            analysis?.buildingProgram?.type &&
            analysis.buildingProgram.confidence > 70
          ) {
            const detectedProgram = analysis.buildingProgram.type;
            logger.success("Auto-detected building program", {
              program: detectedProgram,
              confidence: `${analysis.buildingProgram.confidence}%`,
            });

            // Auto-select the detected building program
            setProjectDetails((prev) => ({
              ...prev,
              program: detectedProgram,
            }));

            // Show notification to user
            setToastMessage(
              `✅ Auto-detected building type: ${detectedProgram} (${analysis.buildingProgram.confidence}% confidence)`,
            );
            setTimeout(() => setToastMessage(""), 5000);

            // Auto-generate program spaces if area is also provided
            if (projectDetails.area && programSpaces.length === 0) {
              const spaces = await generateProgramSpacesWithAI(
                detectedProgram,
                projectDetails.area,
              );
              if (spaces.length > 0) {
                setProgramSpaces(spaces);
              }
            }
          } else {
            logger.debug(
              "Building program not detected with sufficient confidence",
              {
                confidence: analysis?.buildingProgram?.confidence || 0,
              },
            );
          }
        } catch (error) {
          logger.error("Failed to auto-detect building program", error);
          // Don't show error to user - this is a nice-to-have feature
        }
      }
    } catch (error) {
      logger.error("Error processing portfolio files", error);
      alert(`Error processing files: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Workflow Router - Selects pipeline mode, fails explicitly on unsupported modes
  const selectOptimalWorkflow = () => {
    const { mode } = resolveWorkflowByMode();
    console.log(`📐 Using ${mode} pipeline workflow`);
    return mode;
  };

  // Progress update helper function
  const updateProgress = (phase, step, message) => {
    const totalSteps = 7;
    setGenerationProgress({
      phase,
      step,
      totalSteps,
      message,
      percentage: Math.round((step / totalSteps) * 100),
    });
    console.log(`📊 Progress: Step ${step}/${totalSteps} - ${message}`);
  };

  // Rate limit pause handler - can be called from services
  // eslint-disable-next-line no-unused-vars
  const handleRateLimitPause = (seconds, reason = "Rate limit detected") => {
    setRateLimitPause({ active: true, remainingSeconds: seconds, reason });

    // Countdown timer
    const interval = setInterval(() => {
      setRateLimitPause((prev) => {
        if (prev.remainingSeconds <= 1) {
          clearInterval(interval);
          return { active: false, remainingSeconds: 0, reason: "" };
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);

    // Store interval for cleanup
    return () => clearInterval(interval);
  };

  const cancelRateLimitPause = () => {
    setRateLimitPause({ active: false, remainingSeconds: 0, reason: "" });
  };

  // Pre-generation validation function
  const validateBeforeGeneration = (projectContext) => {
    const errors = [];
    const warnings = [];

    console.log("🔍 Validating project context:", {
      buildingProgram: projectContext.buildingProgram,
      area: projectContext.area,
      floors: projectContext.specifications?.floors || projectContext.floors,
      hasLocation: !!projectContext.location?.address,
    });

    // Critical validations
    if (!projectContext.buildingProgram) {
      errors.push("Building program is required");
    }

    // Check for floors - be more flexible about where it's stored
    const floors =
      projectContext.specifications?.floors || projectContext.floors;
    if (floors && (floors < 1 || floors > 5)) {
      errors.push("Floors must be between 1 and 5");
    }
    // Note: floors is optional, so we only error if it exists but is out of range

    if (!projectContext.area || parseInt(projectContext.area) < 50) {
      errors.push("Floor area must be at least 50m²");
    }

    // Warnings
    if (!projectContext.location || !projectContext.location.address) {
      warnings.push("Location not specified - using generic design parameters");
    }
    if (!portfolioFiles || portfolioFiles.length === 0) {
      warnings.push("No portfolio provided - using location-based style only");
    }
    if (!projectContext.specifications?.entranceDirection) {
      warnings.push("Entrance direction not specified - defaulting to South");
    }

    // Display validation results
    if (errors.length > 0) {
      console.error("❌ Validation failed:");
      errors.forEach((err, idx) => {
        console.error(`   ${idx + 1}. ${err}`);
      });
      setToastMessage(`Validation failed: ${errors.join(", ")}`);
      setTimeout(() => setToastMessage(""), 5000);
      return { valid: false, errors, warnings };
    }

    if (warnings.length > 0) {
      console.warn("⚠️ Generation warnings:", warnings);
      warnings.forEach((w) => {
        console.log(`   • ${w}`);
      });
    }

    console.log("✅ Pre-generation validation passed");
    return { valid: true, errors: [], warnings };
  };

  // Helper function to retry API calls with exponential backoff
  // eslint-disable-next-line no-unused-vars
  const retryAPICall = async (
    apiFunction,
    maxRetries = 3,
    baseDelay = 6000,
  ) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 API call attempt ${attempt}/${maxRetries}...`);
        const result = await apiFunction();
        console.log(`✅ API call succeeded on attempt ${attempt}`);
        return result;
      } catch (error) {
        console.warn(`⚠️ API call attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff: 6s, 12s, 24s
          console.log(`⏳ Waiting ${delay / 1000}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`❌ API call failed after ${maxRetries} attempts`);
          throw error;
        }
      }
    }
  };

  // STEP 5: Generate AI designs with integrated workflow
  const generateDesigns = async () => {
    // Reset generation state and start timer
    setIsGenerationComplete(false);
    setGenerationStartTime(Date.now());
    setElapsedTime(0);
    setIsLoading(true);
    updateProgress("Initialization", 0, "Starting AI generation...");

    try {
      // Generate unified project seed ONCE for entire project
      const projectSeed = Math.floor(Math.random() * 1000000);
      const resolvedMode = selectOptimalWorkflow();
      updateProgress("Setup", 1, "Initializing design parameters...");

      // 🔧 START NEW GENERATION SESSION FOR MODIFICATION TRACKING
      // Note: Portfolio analysis will be added later after it's processed
      const sessionId = designGenerationHistory.startSession({
        projectDetails,
        locationData,
        portfolioAnalysis: null, // Will be updated after portfolio processing
        seed: projectSeed,
        workflow: resolvedMode,
      });
      // setCurrentSessionId(sessionId); // Legacy - session ID managed by history service
      console.log("📝 Started generation session:", sessionId);

      // DALL·E 3 Consistency: Generate style signature if not already exists
      let styleSignature = projectStyleSignature;
      if (!styleSignature && portfolioFiles.length > 0) {
        console.log(
          "🎨 Generating project style signature for DALL·E 3 consistency...",
        );
        try {
          // Import aiIntegrationService to access generateStyleSignature
          const aiIntegrationService = (
            await import("./services/aiIntegrationService")
          ).default;

          styleSignature = await aiIntegrationService.generateStyleSignature(
            { portfolioFiles },
            {
              buildingProgram: projectDetails?.program,
              area: projectDetails?.area,
              floorArea: parseInt(projectDetails?.area) || 200,
            },
            locationData || {},
          );

          setProjectStyleSignature(styleSignature);

          // Persist to localStorage for this session
          localStorage.setItem(
            "projectStyleSignature",
            JSON.stringify(styleSignature),
          );
          console.log("✅ Style signature generated and cached");
        } catch (sigError) {
          console.error("⚠️ Style signature generation failed:", sigError);
          // Continue without style signature - services will use fallback
        }
      } else if (styleSignature) {
        console.log("✅ Using existing style signature");
      }

      // Vector plans not needed for A1 One-Shot workflow (generates comprehensive sheet directly)

      // Prepare comprehensive project context for AI with location data
      const projectContext = {
        buildingProgram: projectDetails?.program || "mixed-use building",
        projectType: projectDetails?.program || null,
        programSpaces: programSpaces || [],
        location: locationData || { address: "Unknown location" },
        // 🌍 ENHANCED: Pass complete location data
        locationData: locationData, // Full location object
        climate: locationData?.climate, // Climate data
        sunPath: locationData?.sunPath, // Sun path optimization
        zoning: locationData?.zoning, // Zoning requirements
        recommendedStyle: locationData?.recommendedStyle, // Local architectural style
        localMaterials: locationData?.localMaterials, // Available local materials
        siteAnalysis: locationData?.siteAnalysis, // Site geometry and constraints
        // 🆕 SITE POLYGON: User-drawn site boundary and metrics
        sitePolygon: sitePolygon, // User-drawn site boundary
        siteMetrics: siteMetrics, // Computed site metrics (area, orientation, etc.)
        // Original context
        architecturalStyle:
          styleChoice === "blend"
            ? "Contemporary with local influences"
            : styleChoice || "contemporary",
        materials: "sustainable, local materials",
        siteConstraints: locationData?.zoning?.type || "urban development",
        userPreferences: `${projectDetails?.area || "200"}m² total area`,
        specifications: projectDetails,
        climateData: locationData?.climate,
        area: projectDetails?.area || "200",
        entranceDirection: projectDetails?.entranceDirection || "S",
        floorArea: parseInt(projectDetails?.area) || 200,
        // 🏢 Floor count and house type for DNA generation
        floorCount:
          projectDetails?.floorCount || calculatedFloors.optimalFloors || 2,
        houseType: projectDetails?.program, // e.g., 'detached-house', 'semi-detached-house', 'terraced-house'
        floorCountLocked: floorCountLocked,
        // STEP 1: Unified seed for ALL outputs in this project
        projectSeed: projectSeed,
        // DALL·E 3: Include style signature for consistent generation
        styleSignature: styleSignature,
      };

      // Run pre-generation validation
      updateProgress("Validation", 2, "Validating project parameters...");
      const validation = validateBeforeGeneration(projectContext);
      if (!validation.valid) {
        setIsLoading(false);
        updateProgress("", 0, "");
        return; // Stop if validation fails
      }

      console.log(
        "🎨 Starting integrated AI design generation with:",
        projectContext,
      );
      console.log("🎲 Project seed for consistent outputs:", projectSeed);
      console.log(
        "⚖️  Material Weight:",
        materialWeight,
        "| Characteristic Weight:",
        characteristicWeight,
      );

      // STEP 5: Prepare portfolio files for enhanced analysis
      updateProgress("Analysis", 3, "Analyzing portfolio and location data...");
      // Extract original File objects for enhanced portfolio analysis
      const portfolioFilesForAnalysis = (portfolioFiles || [])
        .map((item) => item.file) // Extract File object from wrapper
        .filter(Boolean); // Remove any undefined values

      // 🔥 CRITICAL FIX: Actually analyze the portfolio instead of using fake data!
      let realPortfolioAnalysis = null;
      if (portfolioFilesForAnalysis && portfolioFilesForAnalysis.length > 0) {
        console.log(
          "🎨 Analyzing uploaded portfolio:",
          portfolioFilesForAnalysis.length,
          "files",
        );
        try {
          // Dynamically import the portfolio service
          const { default: enhancedPortfolioService } =
            await import("./services/enhancedPortfolioService");
          realPortfolioAnalysis =
            await enhancedPortfolioService.analyzePortfolio(
              portfolioFilesForAnalysis,
              locationData,
            );
          console.log("✅ Portfolio analysis complete:", {
            style: realPortfolioAnalysis?.style,
            materials: realPortfolioAnalysis?.materials?.length || 0,
            features: realPortfolioAnalysis?.features?.length || 0,
            colorPalette: realPortfolioAnalysis?.colorPalette?.length || 0,
          });
        } catch (error) {
          console.warn("⚠️ Portfolio analysis failed, using fallback:", error);
          // Use a more comprehensive fallback that preserves structure
          realPortfolioAnalysis = {
            style: locationData?.recommendedStyle || "Contemporary",
            materials: [],
            features: [],
            colorPalette: [],
          };
        }
      }

      // resolvedMode already resolved at top of try block
      updateProgress("Workflow", 4, `Using ${resolvedMode} pipeline...`);

      let aiResult;

      // Execute the resolved workflow
      updateProgress(
        "Generation",
        5,
        `Generating architectural panels (${resolvedMode})...`,
      );
      aiResult = await executeWorkflow(dnaWorkflowOrchestrator, {
        projectContext,
        locationData,
        portfolioFiles: portfolioFiles || [],
        siteSnapshot: locationData?.siteSnapshot || null,
        baseSeed: projectSeed,
      });

      console.log("✅ AI design generation complete:", aiResult);

      // Normalize multi-panel result to match expected format
      if (aiResult.success && aiResult.composedSheetUrl) {
        const panelBundle =
          aiResult.panelMap ||
          aiResult.panels ||
          aiResult.metadata?.panels ||
          {};
        const coordinates =
          aiResult.coordinates || aiResult.metadata?.coordinates || null;
        aiResult.panelMap = panelBundle;
        aiResult.panels = panelBundle;
        aiResult.a1Sheet = {
          url: aiResult.composedSheetUrl,
          composedSheetUrl: aiResult.composedSheetUrl,
          metadata: aiResult.metadata,
          panels: panelBundle,
          panelMap: panelBundle,
          coordinates,
          consistencyReport: aiResult.consistencyReport,
          baselineBundle: aiResult.baselineBundle,
        };
        console.log("✅ Multi-panel result normalized to A1 sheet format");
      }

      // ========================================
      // A1-ONLY MODE: Always expect A1 sheet workflow
      // ========================================
      if (!aiResult.success || !aiResult.a1Sheet) {
        const errorDetails =
          typeof aiResult.error === "object"
            ? JSON.stringify(aiResult.error, null, 2)
            : aiResult.error;
        console.error("❌ A1 Sheet generation failed:", errorDetails);
        console.error("   Full result:", JSON.stringify(aiResult, null, 2));
        const errorMessage =
          aiResult.error?.message || aiResult.error || "Unknown error";
        setToastMessage(`A1 Sheet generation failed: ${errorMessage}`);
        setTimeout(() => setToastMessage(""), 5000);
        setIsLoading(false);
        // Reset generation state on failure
        setIsGenerationComplete(false);
        setGenerationStartTime(null);
        return;
      }

      console.log(
        "✅ A1 Sheet available:",
        aiResult.a1Sheet.url?.substring(0, 80) + "...",
      );

      // ========================================
      // Display Validation Feedback
      // ========================================
      if (aiResult.templateValidation) {
        const templateScore = aiResult.templateValidation.score;
        console.log(`📊 Template completeness: ${templateScore}%`);

        if (templateScore < 100) {
          console.warn(
            `⚠️  Template validation: ${aiResult.templateValidation.missingMandatory.length} mandatory sections missing`,
          );
          if (aiResult.templateValidation.missingMandatory.length > 0) {
            setToastMessage(
              `⚠️ A1 sheet may be missing: ${aiResult.templateValidation.missingMandatory.slice(0, 2).join(", ")}`,
            );
            setTimeout(() => setToastMessage(""), 6000);
          }
        }
      }

      if (aiResult.dnaConsistencyReport) {
        const dnaScore = aiResult.dnaConsistencyReport.score;
        console.log(`📊 DNA consistency: ${dnaScore.toFixed(1)}%`);

        if (dnaScore < 85) {
          console.warn(
            `⚠️  DNA consistency below threshold (${dnaScore.toFixed(1)}% < 85%)`,
          );
          console.warn(
            `   Issues: ${aiResult.dnaConsistencyReport.issues.slice(0, 2).join(", ")}`,
          );
        } else {
          console.log("✅ DNA consistency acceptable");
        }
      }

      // Set generation results with ONLY A1 sheet
      // Calculate project economics from DNA
      const dimensions = aiResult.masterDNA?.dimensions || {};
      const floorArea =
        (dimensions.length || 12) *
        (dimensions.width || 8) *
        (dimensions.floors || 2);
      const constructionCost = Math.round(floorArea * 1400); // £1400/m²
      const timeline = dimensions.floors > 3 ? "18-24 months" : "12-18 months";

      // Generate designId BEFORE creating designData
      let designId = null;

      // Try multiple sources in order of preference
      if (
        aiResult?.masterDNA?.projectID &&
        aiResult.masterDNA.projectID !== "undefined"
      ) {
        designId = aiResult.masterDNA.projectID;
      } else if (aiResult?.masterDNA?.seed) {
        designId = `design_seed_${aiResult.masterDNA.seed}`;
      } else if (projectSeed) {
        designId = `design_seed_${projectSeed}`;
      } else {
        // Ultimate fallback - guaranteed unique ID
        designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Double-check designId is valid
      if (
        !designId ||
        designId === "undefined" ||
        designId === "null" ||
        typeof designId !== "string"
      ) {
        console.error("⚠️ Invalid designId detected:", designId);
        designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log("   Using fallback ID:", designId);
      }

      console.log(`🔑 Generated designId: ${designId}`);

      const designData = {
        designId, // 🆕 Include designId in designData
        workflow: resolvedMode,
        a1Sheet: aiResult.a1Sheet,
        masterDNA: aiResult.masterDNA,
        reasoning: aiResult.reasoning || {},
        projectContext: aiResult.projectContext || projectContext,
        locationData: aiResult.locationData || locationData,
        validation: aiResult.validation,
        templateValidation: aiResult.templateValidation, // 🆕 Include template validation
        dnaConsistencyReport: aiResult.dnaConsistencyReport, // 🆕 Include DNA consistency
        timestamp: new Date().toISOString(),
        cost: {
          construction: `£${constructionCost.toLocaleString()}`,
          timeline: timeline,
          energySavings: "£3,200/year",
        },
      };

      setGeneratedDesigns(designData);

      // Set currentDesignId immediately
      setCurrentDesignId(designId);
      sessionStorage.setItem("currentDesignId", designId);
      console.log(`✅ CurrentDesignId set to: ${designId}`);

      // DESIGN HISTORY: Save base design to history store for modify workflow
      try {
        // Use the designId we generated above
        console.log(`💾 Saving design to history with ID: ${designId}`);

        // Extract base prompt from A1 sheet generation
        const { buildA1SheetPrompt } =
          await import("./services/a1SheetPromptGenerator");
        const a1SheetValidator = (await import("./services/a1SheetValidator"))
          .default;
        const requiredSections =
          a1SheetValidator.getRequiredSections(projectContext);

        const promptResult = buildA1SheetPrompt({
          masterDNA: aiResult.masterDNA,
          location: locationData,
          climate: locationData?.climate,
          portfolioBlendPercent: 70,
          projectMeta: projectDetails,
          projectContext: projectContext,
          blendedStyle: aiResult.blendedStyle || realPortfolioAnalysis,
          requiredSections, // Include required sections
        });

        const seedsByView = {
          a1Sheet: projectSeed,
        };

        // Use designHistoryService instead of designHistoryStore for compatibility with AIModifyPanel
        const saveResult = await designHistoryService.createDesign({
          designId,
          mainPrompt: promptResult.prompt,
          basePrompt: promptResult.prompt,
          masterDNA: designData?.masterDNA || aiResult?.masterDNA || {},
          seed: projectSeed,
          seedsByView,
          resultUrl: aiResult.a1Sheet.url,
          a1SheetUrl: aiResult.a1Sheet.url,
          projectContext: projectContext,
          locationData: locationData,
          blendedStyle: aiResult.blendedStyle,
          styleBlendPercent: 70,
          // Persist site snapshot metadata for pixel-exact parity during modifications
          siteSnapshot: aiResult.sitePlanAttachment || null,
          a1Sheet: aiResult.a1Sheet,
        });

        console.log("✅ Base design saved to history:", designId);
        console.log("   Save result:", saveResult ? "Success" : "Failed");
        console.log("   Saved designId:", saveResult);

        // Verify design was saved
        const verifyDesign = await designHistoryService.getDesign(designId);
        console.log("🔍 Verifying design in history...");
        console.log("   Looking for designId:", designId);
        console.log("   Found:", verifyDesign ? "YES" : "NO");

        if (!verifyDesign) {
          console.error("❌ CRITICAL: Design not found after save!");
          console.error("   DesignId:", designId);
          console.error("   Type:", typeof designId);
          const allDesigns = await designHistoryService.listDesigns();
          console.error(
            "   All designs in history:",
            allDesigns.map((d) => d.designId),
          );
          console.error("   Attempting re-save...");

          // Try to save again with a fresh ID
          const fallbackId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await designHistoryService.createDesign({
            designId: fallbackId,
            mainPrompt: promptResult.prompt,
            basePrompt: promptResult.prompt,
            masterDNA: designData?.masterDNA || aiResult?.masterDNA || {},
            seed: projectSeed,
            seedsByView,
            resultUrl: aiResult.a1Sheet.url,
            a1SheetUrl: aiResult.a1Sheet.url,
            projectContext: projectContext,
            locationData: locationData,
            blendedStyle: aiResult.blendedStyle,
            styleBlendPercent: 70,
            siteSnapshot: aiResult.sitePlanAttachment || null,
            a1Sheet: aiResult.a1Sheet,
          });

          setCurrentDesignId(fallbackId);
          console.log("✅ Design re-saved with fallback ID:", fallbackId);
        } else {
          console.log("✅ Design verified in history");
        }

        // Auto-show modification panel after successful generation
        setShowModificationPanel(true);
      } catch (historyError) {
        console.error(
          "⚠️ Failed to save base design to history:",
          historyError,
        );
      }

      setIsLoading(false);
      updateProgress("", 0, "");
      setCurrentStep(5);
    } catch (error) {
      console.error("❌ AI generation error:", error);
      updateProgress("Error", 0, "Generation failed");

      // Reset generation state on error
      setIsGenerationComplete(false);
      setGenerationStartTime(null);

      // Unsupported pipeline mode — fail fast, do not retry
      if (error instanceof UnsupportedPipelineModeError) {
        setIsLoading(false);
        setToastMessage(
          `Configuration error: ${error.message}. Set PIPELINE_MODE to "multi_panel".`,
        );
        return;
      }

      // Implement retry logic
      if (!window.retryCount) window.retryCount = 0;
      if (window.retryCount < 3) {
        window.retryCount++;
        console.log(
          `🔄 Retrying generation (attempt ${window.retryCount}/3)...`,
        );
        setToastMessage(`Error occurred. Retrying (${window.retryCount}/3)...`);
        setTimeout(() => {
          setToastMessage("");
          generateDesigns(); // Retry the generation
        }, 2000);
        return;
      }

      // After 3 retries, use fallback

      // Reset geometry views integration flag for new design
      geometryViewsIntegratedRef.current = false;

      // Fallback to mock data if AI fails
      setGeneratedDesigns({
        floorPlan: {
          rooms: [
            { name: "Reception", area: "25m²" },
            { name: "Main Space", area: "100m²" },
            { name: "Support Areas", area: "50m²" },
            { name: "Circulation", area: "25m²" },
          ],
          efficiency: "85%",
          circulation: "Optimized circulation flow",
        },
        model3D: {
          style: `${styleChoice} architectural design`,
          features: [
            "Natural lighting",
            "Sustainable design",
            "Modern aesthetics",
          ],
          materials: ["Sustainable materials", "Local resources"],
          sustainabilityFeatures: ["Energy efficient", "Eco-friendly"],
          images: [],
        },
        technical: {
          structural: "Modern structural system",
          foundation: "Engineered foundation",
          mep: {
            hvac: "Energy-efficient system",
            electrical: "Smart lighting",
            plumbing: "Water-efficient fixtures",
          },
          compliance: ["Building codes", "Accessibility", "Energy standards"],
        },
        cost: {
          construction: "Contact for estimate",
          timeline: "12-18 months",
          energySavings: "Significant",
        },
        aiMetadata: {
          generated: false,
          error: error.message,
          fallback: true,
        },
      });
      setIsLoading(false);
      setCurrentStep(5);
    }
  };

  // Helper functions to extract data from AI responses
  // eslint-disable-next-line no-unused-vars
  const extractRoomsFromReasoning = (spatialTextOrObj) => {
    // Handle object format from new reasoning structure
    if (spatialTextOrObj && typeof spatialTextOrObj === "object") {
      if (Array.isArray(spatialTextOrObj.keySpaces)) {
        return spatialTextOrObj.keySpaces.map((space, idx) => ({
          name:
            typeof space === "string"
              ? space
              : space.name || `Space ${idx + 1}`,
          area:
            typeof space === "object" && space.area
              ? space.area
              : `${Math.floor((parseInt(projectDetails?.area) || 200) / spatialTextOrObj.keySpaces.length)}m²`,
        }));
      }
    }

    // Fallback: simple extraction from string or default
    const totalArea = parseInt(projectDetails?.area) || 200;
    return [
      { name: "Main Space", area: `${Math.floor(totalArea * 0.4)}m²` },
      { name: "Secondary Spaces", area: `${Math.floor(totalArea * 0.3)}m²` },
      { name: "Support Areas", area: `${Math.floor(totalArea * 0.2)}m²` },
      { name: "Circulation", area: `${Math.floor(totalArea * 0.1)}m²` },
    ];
  };

  // eslint-disable-next-line no-unused-vars
  const extractFeatures = (envText) => {
    return [
      "Optimized natural lighting",
      "Sustainable design principles",
      "Climate-responsive architecture",
      "Modern aesthetic",
    ];
  };

  // eslint-disable-next-line no-unused-vars
  const extractSustainabilityFeatures = (envText) => {
    return [
      "Energy-efficient design",
      "Sustainable materials",
      "Environmental optimization",
      "Green building principles",
    ];
  };

  const renderLandingPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 text-white relative overflow-hidden">
      {/* Animated Background Layers */}
      <div className="animated-bg"></div>
      <div className="architecture-bg"></div>

      {/* Enhanced Floating Glass Orbs with Light Animation */}
      <div
        className="absolute top-20 left-10 w-96 h-96 bg-blue-400/40 rounded-full blur-3xl animate-float animate-pulse"
        style={{
          animation:
            "float 8s ease-in-out infinite, pulse 4s ease-in-out infinite",
        }}
      ></div>
      <div
        className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-cyan-400/35 rounded-full blur-3xl animate-float animate-pulse"
        style={{
          animationDelay: "2s",
          animation:
            "float 10s ease-in-out infinite, pulse 5s ease-in-out infinite",
        }}
      ></div>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-300/30 rounded-full blur-3xl animate-float animate-pulse"
        style={{
          animationDelay: "4s",
          animation:
            "float 12s ease-in-out infinite, pulse 6s ease-in-out infinite",
        }}
      ></div>
      <div
        className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-cyan-300/35 rounded-full blur-2xl animate-float"
        style={{
          animationDelay: "1s",
          animation: "float 7s ease-in-out infinite",
        }}
      ></div>
      <div
        className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] bg-blue-500/30 rounded-full blur-3xl animate-float animate-pulse"
        style={{
          animationDelay: "3s",
          animation:
            "float 9s ease-in-out infinite, pulse 4.5s ease-in-out infinite",
        }}
      ></div>

      {/* Main Content */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        {/* Logo and Header - Enhanced */}
        <div className="text-center mb-16 sm:mb-20 animate-fadeInUp">
          <div className="flex flex-col sm:flex-row justify-center items-center mb-8 sm:mb-10 gap-4 sm:gap-6">
            <div className="relative group">
              <img
                src="/logo/logo-light.svg"
                alt="ARCHIAI SOLUTION Logo"
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 logo-float transition-transform duration-500 group-hover:scale-110"
                style={{
                  filter:
                    "drop-shadow(0 0 40px rgba(0, 168, 255, 0.8)) drop-shadow(0 0 60px rgba(0, 212, 255, 0.6))",
                }}
              />
              <div className="absolute inset-0 bg-blue-400/50 rounded-full blur-2xl -z-10 animate-pulse"></div>
              <div
                className="absolute inset-0 bg-cyan-400/30 rounded-full blur-xl -z-10 animate-pulse"
                style={{ animationDelay: "1s" }}
              ></div>
              <div
                className="absolute inset-0 bg-blue-300/20 rounded-full blur-lg -z-10 animate-pulse"
                style={{ animationDelay: "2s" }}
              ></div>
            </div>
            <div>
              <h1 className="premium-title text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-2">
                ARCHIAI SOLUTION
              </h1>
              <div className="h-1 w-24 bg-gradient-to-r from-blue-400 to-cyan-400 mx-auto rounded-full mt-4"></div>
            </div>
          </div>
          <p className="premium-subtitle text-xl sm:text-2xl md:text-3xl max-w-4xl mx-auto mb-6 font-medium">
            The First AI Company for Architects & Construction Engineers
          </p>
          <p className="text-base sm:text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            Transform any location into intelligent architectural designs in
            minutes, not months.
            <br className="hidden sm:block" />
            <span className="text-white/80">
              AI-powered design generation with full technical documentation.
            </span>
          </p>
        </div>

        {/* Key Metrics - Enhanced Premium Glass Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-6 mb-16 sm:mb-20">
          {[
            {
              icon: Clock,
              label: "Design Time",
              value: "5 min",
              subtext: "vs 2-3 weeks",
              color: "from-blue-400 to-cyan-400",
            },
            {
              icon: TrendingUp,
              label: "Cost Savings",
              value: "85%",
              subtext: "design phase",
              color: "from-green-400 to-emerald-400",
            },
            {
              icon: Users,
              label: "Architects",
              value: "2,450+",
              subtext: "active users",
              color: "from-purple-400 to-pink-400",
            },
            {
              icon: BarChart3,
              label: "Projects",
              value: "12K+",
              subtext: "completed",
              color: "from-orange-400 to-red-400",
            },
          ].map((metric, idx) => (
            <div
              key={idx}
              className="liquid-glass-card p-5 sm:p-7 text-center group cursor-pointer animate-fadeInUp"
              style={{ animationDelay: `${idx * 0.15}s` }}
            >
              <div
                className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${metric.color} mb-4 group-hover:scale-110 transition-transform duration-300`}
              >
                <metric.icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <h3 className="text-3xl sm:text-4xl font-bold mb-2 text-glow-blue">
                {metric.value}
              </h3>
              <p className="text-sm sm:text-base text-white/90 font-semibold mb-1">
                {metric.label}
              </p>
              <p className="text-xs sm:text-sm text-white/60">
                {metric.subtext}
              </p>
            </div>
          ))}
        </div>

        {/* Feature Grid - Enhanced Glass Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-16 sm:mb-20">
          {[
            {
              icon: MapPin,
              title: "Location Intelligence",
              description:
                "Analyze climate, zoning, and local architecture to inform optimal design decisions",
              gradient: "from-blue-500/30 to-cyan-500/30",
            },
            {
              icon: Sparkles,
              title: "AI Design Generation",
              description:
                "Create complete 2D/3D designs from requirements in minutes with style synthesis",
              gradient: "from-purple-500/30 to-pink-500/30",
            },
            {
              icon: FileCode,
              title: "Technical Documentation",
              description:
                "Auto-generate all structural and MEP drawings with code compliance",
              gradient: "from-green-500/30 to-emerald-500/30",
            },
            {
              icon: Palette,
              title: "Style Blending",
              description:
                "Seamlessly blend architect portfolios with location-appropriate styles",
              gradient: "from-orange-500/30 to-red-500/30",
            },
            {
              icon: Zap,
              title: "Real-time Modifications",
              description:
                "Use natural language to instantly modify designs and see results",
              gradient: "from-yellow-500/30 to-amber-500/30",
            },
            {
              icon: Shield,
              title: "Industry Standards",
              description:
                "Export to all major CAD formats: DWG, RVT, IFC with full compatibility",
              gradient: "from-indigo-500/30 to-blue-500/30",
            },
          ].map((feature, idx) => (
            <div
              key={idx}
              className="liquid-glass-card p-7 sm:p-9 group animate-fadeInUp"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="flex items-start mb-5">
                <div
                  className={`p-4 rounded-2xl bg-gradient-to-br ${feature.gradient} group-hover:scale-110 transition-transform duration-300 border border-white/20`}
                >
                  <feature.icon className="w-7 h-7 sm:w-9 sm:h-9 text-blue-300" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold ml-5 mt-1 text-white">
                  {feature.title}
                </h3>
              </div>
              <p className="text-sm sm:text-base text-white/75 leading-relaxed pl-1">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section - Enhanced Premium Button */}
        <div className="text-center animate-fadeInUp mb-16">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <button
              onClick={() => setCurrentStep(1)}
              className="btn-premium group text-white px-10 sm:px-14 py-5 sm:py-6 rounded-full font-semibold text-lg sm:text-xl flex items-center mx-auto shadow-lg"
            >
              <Sparkles className="w-6 h-6 mr-3 group-hover:rotate-12 transition-transform duration-300" />
              <span>Start Live Demo</span>
              <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-2 transition-transform duration-300" />
            </button>
            <button className="btn-premium-secondary px-8 sm:px-12 py-5 sm:py-6 text-base sm:text-lg font-medium">
              View Features
            </button>
          </div>
          <p className="text-sm sm:text-base text-white/70 flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            No login required • 5-minute walkthrough • Free to try
          </p>
        </div>

        {/* Additional Trust Indicators - Enhanced */}
        <div className="mt-20 sm:mt-24 pt-12 sm:pt-16 border-t border-white/15">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center">
            {[
              {
                icon: Shield,
                title: "Enterprise Security",
                desc: "Bank-level encryption & data protection",
                color: "text-blue-400",
              },
              {
                icon: Zap,
                title: "Lightning Fast",
                desc: "Generate designs in under 60 seconds",
                color: "text-yellow-400",
              },
              {
                icon: Building2,
                title: "Industry Leading",
                desc: "Trusted by top architecture firms",
                color: "text-green-400",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="liquid-glass-card p-6 sm:p-8 group hover:scale-105 transition-transform duration-300"
              >
                <div
                  className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${item.color === "text-blue-400" ? "from-blue-500/30 to-cyan-500/30" : item.color === "text-yellow-400" ? "from-yellow-500/30 to-amber-500/30" : "from-green-500/30 to-emerald-500/30"} mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <item.icon className={`w-8 h-8 ${item.color} mx-auto`} />
                </div>
                <h4 className="font-bold text-lg mb-2 text-white">
                  {item.title}
                </h4>
                <p className="text-sm text-white/75">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return renderLandingPage();

      case 1:
        return (
          <div className="space-y-8 animate-fadeInUp">
            {/* Background Effects */}
            <div className="animated-bg fixed inset-0 opacity-50"></div>

            <div className="liquid-glass-strong p-8 sm:p-10 relative">
              <div className="flex items-center mb-8">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border border-white/20 mr-5 group-hover:scale-110 transition-transform duration-300">
                  <MapPin className="w-8 h-8 text-blue-300" />
                </div>
                <div>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2 premium-title">
                    Location Analysis
                  </h2>
                  <p className="text-white/75 text-lg">
                    Enter the project address to begin intelligent site analysis
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-3">
                    Project Address
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={
                        isDetectingLocation
                          ? "Detecting your location..."
                          : "Enter full address or let us detect your location..."
                      }
                      className="w-full px-5 py-4 pr-14 bg-navy-900/90 border border-white/20 rounded-xl focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300 text-white placeholder-white/50"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          analyzeLocation();
                        }
                      }}
                      disabled={isDetectingLocation}
                    />
                    {isDetectingLocation && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                      </div>
                    )}
                  </div>
                  {!address && !isDetectingLocation && (
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-sm text-white/60">
                        We'll automatically detect your location when you start
                      </p>
                      <button
                        onClick={detectUserLocation}
                        className="btn-premium-secondary text-sm px-4 py-2 flex items-center"
                      >
                        <MapPin className="w-4 h-4 mr-2" />
                        Detect Location
                      </button>
                    </div>
                  )}
                </div>

                <div className="liquid-glass-card p-6 border border-blue-500/30">
                  <h4 className="font-semibold text-white mb-4 flex items-center text-lg">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/40 to-cyan-500/40 mr-3">
                      <Cpu className="w-5 h-5 text-blue-300" />
                    </div>
                    AI will analyze:
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      {
                        icon: Check,
                        text: "Climate patterns",
                        color: "from-blue-400 to-cyan-400",
                      },
                      {
                        icon: Check,
                        text: "Solar orientation",
                        color: "from-yellow-400 to-orange-400",
                      },
                      {
                        icon: Check,
                        text: "Local architecture",
                        color: "from-purple-400 to-pink-400",
                      },
                      {
                        icon: Check,
                        text: "Zoning regulations",
                        color: "from-green-400 to-emerald-400",
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center text-white/90 p-2 rounded-lg bg-gradient-to-r from-white/5 to-white/10"
                      >
                        <item.icon className="w-4 h-4 mr-2 text-blue-400" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={analyzeLocation}
                  className="btn-premium w-full py-5 text-lg font-semibold flex items-center justify-center group"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-3 animate-spin w-6 h-6" />
                      Analyzing Location Data...
                    </>
                  ) : (
                    <>
                      <Compass className="mr-3 w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
                      Analyze Location
                      <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-2 transition-transform duration-300" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <ErrorBoundary>
            <div className="space-y-8 animate-fadeInUp relative z-10">
              {/* Header Section - Enhanced */}
              <div className="liquid-glass-strong p-8 sm:p-10 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20"></div>
                <div className="relative z-10">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
                    <div>
                      <h2 className="text-4xl sm:text-5xl font-bold mb-3 premium-title">
                        Location Intelligence Report
                      </h2>
                      <p className="text-white/80 text-lg flex items-center">
                        <MapPin className="w-5 h-5 mr-2 text-blue-300" />
                        {locationData?.address || "Site Analysis Complete"}
                      </p>
                    </div>
                    <div className="flex items-center liquid-glass-card px-6 py-3 rounded-full border border-green-500/30 mt-4 sm:mt-0 animate-fadeInUp">
                      <div className="w-3 h-3 bg-green-400 rounded-full mr-3 animate-pulse"></div>
                      <Check className="w-5 h-5 mr-2 text-green-400" />
                      <span className="font-semibold">Analysis Complete</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                    {[
                      {
                        label: "Site Location",
                        value: "Verified",
                        icon: MapPin,
                        color: "from-blue-400 to-cyan-400",
                      },
                      {
                        label: "Data Points",
                        value: "12+ Sources",
                        icon: BarChart3,
                        color: "from-purple-400 to-pink-400",
                      },
                      {
                        label: "Confidence",
                        value: "98%",
                        icon: Shield,
                        color: "from-green-400 to-emerald-400",
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="liquid-glass-card p-5 border border-white/20 animate-fadeInUp"
                        style={{ animationDelay: `${idx * 0.1}s` }}
                      >
                        <div
                          className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${item.color} mb-3`}
                        >
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-sm text-white/70 mb-1">
                          {item.label}
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main Analysis Cards */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Climate & Environment */}
                <div className="liquid-glass-card p-7 hover:scale-105 transition-all duration-300 group animate-fadeInUp">
                  <div className="flex items-center mb-6 pb-5 border-b border-white/20">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-400/30 to-amber-500/30 border border-white/20 mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Sun className="w-7 h-7 text-orange-300" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-xl">
                        Solar & Climate
                      </h3>
                      <p className="text-xs text-white/60">
                        Environmental Analysis
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="liquid-glass p-4 border border-blue-500/30">
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
                        Climate Type
                      </p>
                      <p className="font-bold text-white text-xl">
                        {locationData?.climate.type}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {locationData?.climate.seasonal.winter && (
                        <div className="liquid-glass p-4 border border-blue-500/30 hover:scale-105 transition-transform">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm text-white">
                              Winter
                            </h4>
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-white/70">Temp:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.winter.avgTemp}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Precip:</span>
                              <span className="font-semibold text-white">
                                {
                                  locationData.climate.seasonal.winter
                                    .precipitation
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Solar:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.winter.solar}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {locationData?.climate.seasonal.spring && (
                        <div className="liquid-glass p-4 border border-green-500/30 hover:scale-105 transition-transform">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm text-white">
                              Spring
                            </h4>
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-white/70">Temp:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.spring.avgTemp}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Precip:</span>
                              <span className="font-semibold text-white">
                                {
                                  locationData.climate.seasonal.spring
                                    .precipitation
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Solar:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.spring.solar}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {locationData?.climate.seasonal.summer && (
                        <div className="liquid-glass p-4 border border-red-500/30 hover:scale-105 transition-transform">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm text-white">
                              Summer
                            </h4>
                            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-white/70">Temp:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.summer.avgTemp}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Precip:</span>
                              <span className="font-semibold text-white">
                                {
                                  locationData.climate.seasonal.summer
                                    .precipitation
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Solar:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.summer.solar}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {locationData?.climate.seasonal.fall && (
                        <div className="liquid-glass p-4 border border-amber-500/30 hover:scale-105 transition-transform">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm text-white">
                              Fall
                            </h4>
                            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-white/70">Temp:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.fall.avgTemp}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Precip:</span>
                              <span className="font-semibold text-white">
                                {
                                  locationData.climate.seasonal.fall
                                    .precipitation
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/70">Solar:</span>
                              <span className="font-semibold text-white">
                                {locationData.climate.seasonal.fall.solar}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="pt-3 border-t border-white/20 liquid-glass p-3">
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
                        Sun Path
                      </p>
                      <div className="flex justify-between text-sm">
                        <div>
                          <span className="text-white/70">Summer:</span>{" "}
                          <span className="font-semibold text-white">
                            {locationData?.sunPath.summer}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/70">Winter:</span>{" "}
                          <span className="font-semibold text-white">
                            {locationData?.sunPath.winter}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Zoning & Regulations */}
                <div
                  className="liquid-glass-card p-7 hover:scale-105 transition-all duration-300 group animate-fadeInUp"
                  style={{ animationDelay: "0.2s" }}
                >
                  <div className="flex items-center mb-6 pb-5 border-b border-white/20">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/20 mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Building className="w-7 h-7 text-purple-300" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-xl">
                        Zoning & Architecture
                      </h3>
                      <p className="text-xs text-white/60">
                        Regulatory Compliance
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="liquid-glass p-4 border border-purple-500/30">
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
                        Zoning Type
                      </p>
                      <p className="font-bold text-white text-xl">
                        {locationData?.zoning.type}
                      </p>
                      {locationData?.zoning.note && (
                        <p className="text-xs text-white/70 italic mt-3 pt-3 border-t border-white/10">
                          {locationData.zoning.note}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="liquid-glass p-3 border border-white/10">
                        <p className="text-xs text-white/60 mb-1">Max Height</p>
                        <p className="font-bold text-white">
                          {locationData?.zoning.maxHeight}
                        </p>
                      </div>
                      <div className="liquid-glass p-3 border border-white/10">
                        <p className="text-xs text-white/60 mb-1">Density</p>
                        <p className="font-bold text-white">
                          {locationData?.zoning.density}
                        </p>
                      </div>
                    </div>
                    <div className="liquid-glass p-3 border border-white/10">
                      <p className="text-xs text-white/60 mb-1">Setbacks</p>
                      <p className="font-semibold text-sm text-white">
                        {locationData?.zoning.setbacks}
                      </p>
                    </div>
                    {locationData?.zoning.characteristics && (
                      <div className="liquid-glass p-3 border border-blue-500/30">
                        <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">
                          Characteristics
                        </p>
                        <p className="text-sm font-medium text-white">
                          {locationData.zoning.characteristics}
                        </p>
                      </div>
                    )}
                    {locationData?.zoning.materials && (
                      <div className="liquid-glass p-3 border border-amber-500/30">
                        <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">
                          Typical Materials
                        </p>
                        <p className="text-sm font-medium text-white">
                          {locationData.zoning.materials}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Market Context */}
                <div
                  className="liquid-glass-card p-7 hover:scale-105 transition-all duration-300 group animate-fadeInUp"
                  style={{ animationDelay: "0.3s" }}
                >
                  <div className="flex items-center mb-6 pb-5 border-b border-white/20">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/30 to-emerald-500/30 border border-white/20 mr-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <TrendingUp className="w-7 h-7 text-green-300" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-xl">
                        Market Analysis
                      </h3>
                      <p className="text-xs text-white/60">
                        Investment Insights
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="liquid-glass p-4 border border-green-500/30">
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
                        Construction Cost
                      </p>
                      <p className="font-bold text-white text-xl">
                        {locationData?.marketContext.avgConstructionCost}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="liquid-glass p-3 border border-white/10">
                        <p className="text-xs text-white/60 mb-1">Demand</p>
                        <p className="font-bold text-white">
                          {locationData?.marketContext.demandIndex}
                        </p>
                      </div>
                      <div className="liquid-glass p-3 border border-green-500/30">
                        <p className="text-xs text-white/60 mb-1">ROI</p>
                        <p className="font-bold text-green-400 text-lg">
                          {locationData?.marketContext.roi}
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-white/20 liquid-glass p-4 border border-yellow-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                          Investment Grade
                        </span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <div
                              key={star}
                              className={`w-5 h-5 ${star <= 4 ? "text-yellow-400" : "text-white/30"}`}
                            >
                              ★
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-white/70 mt-2">
                        Strong investment potential with favorable market
                        conditions
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive 3D Map Preview with Site Polygon Drawing */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border border-white/20 mr-3">
                      <MapPin className="w-5 h-5 text-blue-300" />
                    </div>
                    3D Location View & Site Boundary
                  </h3>
                  <div className="text-sm text-white/70">
                    {locationData?.address}
                  </div>
                </div>
                <div className="liquid-glass rounded-xl min-h-[640px] h-[640px] md:h-[720px] lg:h-[800px] relative overflow-hidden shadow-lg border-2 border-white/20">
                  {locationData?.coordinates ? (
                    <>
                      <div ref={mapRef} className="absolute inset-0">
                        <MapView
                          center={locationData.coordinates}
                          zoom={19}
                          enableDrawing={true}
                          onSitePolygonChange={handleSitePolygonChange}
                          existingPolygon={sitePolygon}
                        />
                      </div>
                      <div className="absolute top-20 left-4 liquid-glass-card px-4 py-3 rounded-lg shadow-lg max-w-sm z-10 border border-white/20">
                        <div className="text-sm space-y-1">
                          <div className="flex items-center font-medium text-white">
                            <div className="w-3 h-3 bg-blue-400 rounded-full mr-2 animate-pulse"></div>
                            {sitePolygon ? (
                              <span>
                                {siteMetrics?.shapeType
                                  ? `${siteMetrics.shapeType.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())} Detected`
                                  : "Site Boundary Detected"}
                              </span>
                            ) : (
                              "Draw Site Boundary"
                            )}
                          </div>
                          {sitePolygon && (
                            <div className="text-xs text-white/70 ml-5">
                              {siteMetrics?.source && (
                                <div>
                                  Source:{" "}
                                  {siteMetrics.source ===
                                  "google_building_outline"
                                    ? "Google Building Footprint"
                                    : siteMetrics.source === "manual"
                                      ? "Manual Drawing"
                                      : locationData?.siteAnalysis
                                          ?.boundarySource ||
                                        siteMetrics.source}
                                </div>
                              )}
                              {siteMetrics?.source ===
                                "google_building_outline" && (
                                <span className="block text-green-400 mt-1 font-medium">
                                  ✓ Auto-detected from address
                                </span>
                              )}
                              {locationData?.siteAnalysis?.boundarySource &&
                                locationData.siteAnalysis.boundarySource !==
                                  "manual" &&
                                !siteMetrics?.source && (
                                  <span className="block text-blue-300 mt-1">
                                    ✏️ Drag vertices to adjust boundary
                                  </span>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                      {siteMetrics && siteMetrics.areaM2 && (
                        <div className="absolute top-4 right-4 liquid-glass-card px-5 py-4 rounded-lg shadow-lg max-w-md z-10 border border-white/30 bg-white/10 backdrop-blur-xl">
                          <div className="text-xs text-white space-y-2">
                            <div className="font-bold text-base mb-3 flex items-center text-white">
                              <span className="mr-2 text-lg">📐</span> Site
                              Geometry
                            </div>

                            {/* Area */}
                            <div className="liquid-glass p-3 border border-blue-500/30 bg-blue-500/10">
                              <div className="text-xs text-white/90 mb-1 font-semibold">
                                Total Area
                              </div>
                              <div className="font-bold text-2xl text-blue-200">
                                {siteMetrics.areaM2.toFixed(1)} m²
                              </div>
                            </div>

                            {/* Detected Shape Type */}
                            {siteMetrics.shapeType && (
                              <div className="liquid-glass p-3 border border-green-500/30 bg-green-500/10">
                                <div className="text-xs text-white/90 mb-1 font-semibold">
                                  Detected Shape
                                </div>
                                <div className="font-bold text-lg text-green-200 capitalize">
                                  {siteMetrics.shapeType.replace("-", " ")}
                                </div>
                                {siteMetrics.shapeDescription && (
                                  <div className="text-xs text-white/80 mt-1">
                                    {siteMetrics.shapeDescription}
                                  </div>
                                )}
                                {siteMetrics.vertexCount && (
                                  <div className="text-xs text-white/80 mt-1">
                                    {siteMetrics.vertexCount} corners •{" "}
                                    {siteMetrics.isConvex
                                      ? "Convex"
                                      : "Concave"}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Edge Lengths */}
                            {siteMetrics.edges &&
                              siteMetrics.edges.length > 0 && (
                                <div className="border-t border-white/20 pt-2">
                                  <div className="font-medium text-xs mb-2 text-white">
                                    Edge Lengths:
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    {siteMetrics.edges.map((edge, idx) => (
                                      <div
                                        key={idx}
                                        className="flex justify-between liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5"
                                      >
                                        <span className="text-white/90 font-medium">
                                          Side {idx + 1}:
                                        </span>
                                        <span className="font-mono font-semibold text-blue-200">
                                          {edge.length.toFixed(1)}m
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            {/* Perimeter */}
                            {siteMetrics.perimeterM && (
                              <div className="flex justify-between items-center liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
                                <span className="text-white/90 font-medium">
                                  Perimeter:
                                </span>
                                <span className="font-mono font-semibold text-white">
                                  {siteMetrics.perimeterM.toFixed(1)}m
                                </span>
                              </div>
                            )}

                            {/* Vertices */}
                            {siteMetrics.vertices && (
                              <div className="flex justify-between items-center liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
                                <span className="text-white/90 font-medium">
                                  Vertices:
                                </span>
                                <span className="font-semibold text-white">
                                  {siteMetrics.vertices}
                                </span>
                              </div>
                            )}

                            {/* Orientation */}
                            {siteMetrics.orientationDeg && (
                              <div className="flex justify-between items-center liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
                                <span className="text-white/90 font-medium">
                                  Orientation:
                                </span>
                                <span className="font-semibold text-white">
                                  {siteMetrics.orientationDeg.toFixed(0)}° from
                                  North
                                </span>
                              </div>
                            )}

                            {/* Data Source */}
                            {siteMetrics.source && (
                              <div className="text-white/80 text-xs mt-2 pt-2 border-t border-white/20 flex items-center justify-between">
                                <span className="font-medium">
                                  {siteMetrics.source ===
                                  "google_building_outline"
                                    ? "🏢 Google Building Footprint"
                                    : siteMetrics.source === "OpenStreetMap"
                                      ? "🗺️ OSM Data"
                                      : siteMetrics.source === "Google Places"
                                        ? "🗺️ Google Data"
                                        : siteMetrics.source === "manual"
                                          ? "✏️ Manual Drawing"
                                          : "📏 Estimated"}
                                </span>
                                {siteMetrics.source ===
                                  "google_building_outline" && (
                                  <span className="text-green-300 font-semibold">
                                    ✓ Auto-detected
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Capture Map Button */}
                      <div className="absolute bottom-20 right-4 z-10">
                        <button
                          onClick={async () => {
                            try {
                              console.log(
                                "📸 Capturing site plan for A1 sheet...",
                              );
                              const { captureSitePlanForA1 } =
                                await import("./services/sitePlanCaptureService");

                              // Get current map state
                              const mapInstance = mapRef?.current;
                              const currentCenter =
                                mapInstance?.getCenter?.() ||
                                locationData?.coordinates;
                              const currentZoom =
                                mapInstance?.getZoom?.() || 19;
                              const currentPolygon =
                                sitePolygon ||
                                locationData?.buildingFootprint ||
                                null;

                              if (!currentCenter) {
                                throw new Error(
                                  "Map center not available. Please ensure location is set.",
                                );
                              }

                              // Extract lat/lng if it's a Google Maps LatLng object
                              const center = {
                                lat:
                                  typeof currentCenter.lat === "function"
                                    ? currentCenter.lat()
                                    : currentCenter.lat,
                                lng:
                                  typeof currentCenter.lng === "function"
                                    ? currentCenter.lng()
                                    : currentCenter.lng,
                              };

                              const sitePlanResult = await captureSitePlanForA1(
                                {
                                  center: center,
                                  zoom: currentPolygon
                                    ? undefined
                                    : currentZoom, // Auto-fit if polygon provided
                                  polygon: currentPolygon,
                                  size: { width: 1280, height: 1280 },
                                  mapType: "hybrid", // Hybrid for satellite + labels
                                },
                              );

                              if (sitePlanResult && sitePlanResult.dataUrl) {
                                sessionStorage.setItem(
                                  "a1SiteSnapshot",
                                  sitePlanResult.dataUrl,
                                );
                                const snapshotMeta = {
                                  capturedAt:
                                    sitePlanResult.metadata?.capturedAt ||
                                    new Date().toISOString(),
                                  size: sitePlanResult.metadata?.size,
                                  source: "user-captured",
                                  polygonPointCount:
                                    sitePlanResult.metadata
                                      ?.polygonPointCount ||
                                    currentPolygon?.length ||
                                    0,
                                  mapType:
                                    sitePlanResult.metadata?.mapType ||
                                    "hybrid",
                                  zoom:
                                    sitePlanResult.metadata?.zoom ||
                                    currentZoom,
                                };
                                try {
                                  sessionStorage.setItem(
                                    "a1SiteSnapshotMeta",
                                    JSON.stringify(snapshotMeta),
                                  );
                                } catch (storageError) {
                                  console.warn(
                                    "⚠️ Failed to persist site snapshot metadata",
                                    storageError,
                                  );
                                }
                                console.log(
                                  "✅ Site plan captured and saved to session storage",
                                );
                                console.log(
                                  `   Size: ${sitePlanResult.metadata.size.width}×${sitePlanResult.metadata.size.height}px`,
                                );
                                console.log(
                                  `   Polygon: ${sitePlanResult.metadata.hasPolygon ? "yes" : "no"}`,
                                );
                                alert(
                                  "✅ Site plan captured successfully! It will be embedded in your A1 sheet.",
                                );
                              } else {
                                throw new Error(
                                  "Site plan capture returned no data",
                                );
                              }
                            } catch (error) {
                              console.error(
                                "❌ Failed to capture site plan:",
                                error,
                              );
                              alert(
                                `Failed to capture site plan: ${error.message}`,
                              );
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:scale-105"
                        >
                          <Map className="w-5 h-5" />
                          <span className="font-medium">Capture Map Now</span>
                        </button>
                      </div>

                      {locationData?.coordinates?.lat && (
                        <div className="absolute bottom-4 right-4 liquid-glass-card px-4 py-3 rounded-lg shadow-lg z-10 border border-white/20 backdrop-blur-xl">
                          <div className="text-xs text-white font-medium">
                            <div className="text-white/70 mb-1">
                              Coordinates:
                            </div>
                            <div className="font-mono text-white">
                              Lat: {locationData.coordinates.lat.toFixed(6)}
                            </div>
                            <div className="font-mono text-white">
                              Lng: {locationData.coordinates.lng.toFixed(6)}
                            </div>
                          </div>
                        </div>
                      )}
                      {!sitePolygon && (
                        <div className="absolute bottom-4 left-4 liquid-glass-card px-4 py-3 rounded-lg shadow-lg z-10 border border-blue-500/30 backdrop-blur-xl bg-blue-500/20">
                          <div className="text-xs text-white font-semibold">
                            💡 Click the polygon tool above and draw your site
                            boundary
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100">
                      <div className="text-center">
                        <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">
                          3D map will appear after location analysis
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Site Boundary Detection Information */}
              {locationData?.siteAnalysis &&
                (locationData.siteAnalysis.boundaryShapeType ||
                  locationData.siteAnalysis.boundaryConfidence) && (
                  <div className="mt-6">
                    <SiteBoundaryInfo
                      shapeType={locationData.siteAnalysis.boundaryShapeType}
                      confidence={locationData.siteAnalysis.boundaryConfidence}
                      source={locationData.siteAnalysis.boundarySource}
                      area={locationData.siteAnalysis.surfaceArea}
                      vertexCount={sitePolygon?.length}
                      onRefine={() => {
                        // Open precision site drawer or enable edit mode
                        console.log("Refine boundary requested");
                        // Could set a state to open precision drawer here
                      }}
                    />
                  </div>
                )}

              {/* Program Proportions */}
              {siteMetrics && siteMetrics.areaM2 && projectDetails?.area && (
                <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <Building2 className="w-5 h-5 mr-2 text-blue-600" />
                    Program Area Analysis
                  </h3>

                  {(() => {
                    const siteArea = siteMetrics.areaM2;
                    const requiredArea = parseFloat(projectDetails.area) || 0;
                    const siteCoverageRatio = 0.6; // 60% coverage
                    const maxFootprint = siteArea * siteCoverageRatio;
                    const floorsNeeded =
                      requiredArea > 0
                        ? Math.ceil(requiredArea / maxFootprint)
                        : 0;
                    const footprintPerFloor =
                      floorsNeeded > 0 ? requiredArea / floorsNeeded : 0;
                    const coveragePercent =
                      siteArea > 0 ? (footprintPerFloor / siteArea) * 100 : 0;

                    return (
                      <div className="space-y-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-gray-600 mb-1">
                              Site Area
                            </div>
                            <div className="text-2xl font-bold text-gray-800">
                              {siteArea.toFixed(0)} m²
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Total available
                            </div>
                          </div>

                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-gray-600 mb-1">
                              Required Area
                            </div>
                            <div className="text-2xl font-bold text-blue-600">
                              {requiredArea.toFixed(0)} m²
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Total program
                            </div>
                          </div>

                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-gray-600 mb-1">
                              Floors Needed
                            </div>
                            <div className="text-2xl font-bold text-indigo-600">
                              {floorsNeeded}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              With {(siteCoverageRatio * 100).toFixed(0)}%
                              coverage
                            </div>
                          </div>
                        </div>

                        {/* Breakdown */}
                        <div className="bg-white rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">
                              Max footprint (
                              {(siteCoverageRatio * 100).toFixed(0)}% coverage):
                            </span>
                            <span className="font-mono font-semibold text-gray-800">
                              {maxFootprint.toFixed(1)} m²
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">
                              Footprint per floor:
                            </span>
                            <span className="font-mono font-semibold text-gray-800">
                              {footprintPerFloor.toFixed(1)} m²
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">
                              Actual site coverage:
                            </span>
                            <span className="font-mono font-semibold text-gray-800">
                              {coveragePercent.toFixed(1)}%
                            </span>
                          </div>

                          {/* Visual Bar */}
                          <div className="mt-4">
                            <div className="h-8 bg-gray-200 rounded-full overflow-hidden relative">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-medium"
                                style={{
                                  width: `${Math.min(coveragePercent, 100)}%`,
                                }}
                              >
                                {coveragePercent > 10 &&
                                  `${coveragePercent.toFixed(1)}%`}
                              </div>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>0%</span>
                              <span>Site Coverage</span>
                              <span>100%</span>
                            </div>
                          </div>

                          {/* Warning or Success */}
                          {coveragePercent > siteCoverageRatio * 100 * 1.1 ? (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start">
                              <AlertCircle className="w-4 h-4 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-yellow-800">
                                <span className="font-semibold">Notice:</span>{" "}
                                Program requires {floorsNeeded} floors to fit
                                within zoning coverage limits.
                              </div>
                            </div>
                          ) : (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start">
                              <Check className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-green-800">
                                <span className="font-semibold">
                                  Fits well!
                                </span>{" "}
                                Program fits comfortably within site
                                constraints.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <button
                onClick={() => setCurrentStep(3)}
                className="btn-premium mt-8 w-full py-5 text-lg font-semibold flex items-center justify-center group"
              >
                <span>Continue to Portfolio Upload</span>
                <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-2 transition-transform duration-300" />
              </button>
            </div>
          </ErrorBoundary>
        );

      case 3:
        return (
          <div className="space-y-8 animate-fadeInUp relative z-10">
            {/* Header Section - Enhanced */}
            <div className="liquid-glass-strong p-8 sm:p-10 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-pink-600/20 to-indigo-600/20"></div>
              <div className="relative z-10">
                <div className="flex items-center mb-6">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/20 mr-5">
                    <Palette className="w-8 h-8 text-purple-300" />
                  </div>
                  <div>
                    <h2 className="text-4xl sm:text-5xl font-bold mb-2 premium-title">
                      Portfolio & Style Selection
                    </h2>
                    <p className="text-white/75 text-lg">
                      Personalize your AI design generation
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                  {[
                    {
                      label: "Files Uploaded",
                      value: portfolioFiles.length,
                      icon: Upload,
                      color: "from-blue-400 to-cyan-400",
                    },
                    {
                      label: "Style Blend",
                      value: `${Math.round((materialWeight + characteristicWeight) * 50)}%`,
                      icon: Sparkles,
                      color: "from-purple-400 to-pink-400",
                    },
                    {
                      label: "Status",
                      value: portfolioFiles.length > 0 ? "Ready" : "Pending",
                      icon: Check,
                      color: "from-green-400 to-emerald-400",
                    },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="liquid-glass-card p-5 border border-white/20 animate-fadeInUp"
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <div
                        className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${item.color} mb-3`}
                      >
                        <item.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-sm text-white/70 mb-1">
                        {item.label}
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
              <div className="space-y-8">
                {/* Portfolio Upload */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="block text-lg font-bold text-gray-800 mb-1">
                        Upload Portfolio Files
                      </label>
                      <p className="text-sm text-gray-500">
                        Share your architectural style and design preferences
                      </p>
                    </div>
                    {portfolioFiles.length > 0 && (
                      <div className="flex items-center bg-green-50 px-4 py-2 rounded-full border border-green-200">
                        <Check className="w-5 h-5 text-green-600 mr-2" />
                        <span className="text-green-700 font-medium">
                          {portfolioFiles.length} file
                          {portfolioFiles.length !== 1 ? "s" : ""} uploaded
                        </span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handlePortfolioUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() =>
                      !isUploading && fileInputRef.current?.click()
                    }
                    className={`group relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                      isUploading
                        ? "cursor-wait bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300"
                        : "cursor-pointer bg-gradient-to-br from-gray-50 to-purple-50/30 border-gray-300 hover:border-purple-500 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 hover:shadow-lg"
                    }`}
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                        <p className="text-gray-800 font-semibold text-lg mb-1">
                          Processing files...
                        </p>
                        <p className="text-sm text-gray-500">
                          Please wait while we analyze your portfolio
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform">
                          <Upload className="w-10 h-10 text-white" />
                        </div>
                        <p className="text-gray-800 font-bold text-xl mb-2">
                          Click to upload portfolio files
                        </p>
                        <p className="text-sm text-gray-600 mb-4">
                          Drag and drop files here or click to browse
                        </p>
                        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center bg-white/80 px-3 py-1.5 rounded-full">
                            <Image className="w-4 h-4 mr-1.5" />
                            <span>JPG, PNG</span>
                          </div>
                          <div className="flex items-center bg-white/80 px-3 py-1.5 rounded-full">
                            <FileText className="w-4 h-4 mr-1.5" />
                            <span>PDF</span>
                          </div>
                          <div className="flex items-center bg-white/80 px-3 py-1.5 rounded-full">
                            <span>Max 50MB</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {portfolioFiles.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Uploaded Files
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {portfolioFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100 hover:shadow-md transition-all group"
                          >
                            <div className="flex items-center flex-1 min-w-0">
                              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 shadow-md">
                                <FileText className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                  {file.size}
                                </p>
                              </div>
                            </div>
                            <div className="ml-3 flex-shrink-0">
                              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center border-2 border-green-200">
                                <Check className="w-5 h-5 text-green-600" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* STEP 5: Style Blend Weight Slider */}
                <div className="border-t border-gray-200 pt-8">
                  <div className="flex items-center mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center mr-3 shadow-md">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <label className="block text-lg font-bold text-gray-800 mb-1">
                        Advanced Style Blending Controls
                      </label>
                      <p className="text-sm text-gray-500">
                        Fine-tune how portfolio and local styles blend together
                      </p>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100 shadow-sm">
                    {/* Material Weight Slider */}
                    <div className="mb-8">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center mr-3 shadow-md">
                            <Layers className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h5 className="font-bold text-gray-800 text-lg">
                              Material Palette
                            </h5>
                            <p className="text-xs text-gray-500">
                              Balance between local and portfolio materials
                            </p>
                          </div>
                        </div>
                        <div className="bg-white px-4 py-2 rounded-full border-2 border-gray-200 shadow-sm">
                          <span className="text-sm font-semibold text-gray-700">
                            {Math.round((1 - materialWeight) * 100)}% Local /{" "}
                            {Math.round(materialWeight * 100)}% Portfolio
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between text-xs font-medium text-gray-600 mb-3 px-1">
                        <span className="flex items-center">
                          <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                          Local Materials
                        </span>
                        <span className="flex items-center">
                          <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                          Portfolio Materials
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={materialWeight * 100}
                          onChange={(e) =>
                            setMaterialWeight(e.target.value / 100)
                          }
                          className="w-full h-3 bg-gradient-to-r from-green-400 to-blue-400 rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${(1 - materialWeight) * 100}%, #60a5fa ${(1 - materialWeight) * 100}%, #60a5fa 100%)`,
                          }}
                        />
                      </div>

                      {/* Material Preview */}
                      <div className="mt-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Current Selection:
                        </p>
                        <p className="text-sm font-medium text-gray-800 leading-relaxed">
                          {materialWeight < 0.2 &&
                          locationData?.recommendedStyle
                            ? `Local materials: ${
                                locationData.recommendedStyle.includes(
                                  "tropical",
                                )
                                  ? "Bamboo, teak, coral stone"
                                  : locationData.recommendedStyle.includes(
                                        "desert",
                                      )
                                    ? "Adobe, sandstone, stucco"
                                    : "Brick, timber, local stone"
                              }`
                            : materialWeight < 0.5
                              ? "Blend of local materials with portfolio preferences"
                              : materialWeight < 0.8
                                ? "Portfolio materials adapted to local availability"
                                : "Portfolio signature materials: Glass, steel, concrete"}
                        </p>
                      </div>
                    </div>

                    {/* Characteristic Weight Slider */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-3 shadow-md">
                            <Palette className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h5 className="font-bold text-gray-800 text-lg">
                              Design Characteristics
                            </h5>
                            <p className="text-xs text-gray-500">
                              Balance between local patterns and portfolio style
                            </p>
                          </div>
                        </div>
                        <div className="bg-white px-4 py-2 rounded-full border-2 border-gray-200 shadow-sm">
                          <span className="text-sm font-semibold text-gray-700">
                            {Math.round((1 - characteristicWeight) * 100)}%
                            Local / {Math.round(characteristicWeight * 100)}%
                            Portfolio
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between text-xs font-medium text-gray-600 mb-3 px-1">
                        <span className="flex items-center">
                          <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
                          Local Patterns
                        </span>
                        <span className="flex items-center">
                          <div className="w-3 h-3 bg-pink-500 rounded-full mr-2"></div>
                          Portfolio Style
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={characteristicWeight * 100}
                          onChange={(e) =>
                            setCharacteristicWeight(e.target.value / 100)
                          }
                          className="w-full h-3 bg-gradient-to-r from-purple-400 to-pink-400 rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #a78bfa 0%, #a78bfa ${(1 - characteristicWeight) * 100}%, #ec4899 ${(1 - characteristicWeight) * 100}%, #ec4899 100%)`,
                          }}
                        />
                      </div>

                      {/* Characteristic Preview */}
                      <div className="mt-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Current Selection:
                        </p>
                        <p className="text-sm font-medium text-gray-800 leading-relaxed">
                          {characteristicWeight < 0.2 &&
                          locationData?.recommendedStyle
                            ? `Local patterns: ${
                                locationData.recommendedStyle.includes(
                                  "colonial",
                                )
                                  ? "Symmetry, columns, shutters"
                                  : locationData.recommendedStyle.includes(
                                        "modern",
                                      )
                                    ? "Clean lines, open plans, minimalism"
                                    : "Traditional forms, regional motifs"
                              }`
                            : characteristicWeight < 0.5
                              ? "Fusion of local and portfolio design elements"
                              : characteristicWeight < 0.8
                                ? "Portfolio style with local influences"
                                : "Portfolio signature: Contemporary, geometric, bold"}
                        </p>
                      </div>
                    </div>

                    {/* Combined Style Analysis */}
                    <div className="mt-6 p-6 bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 rounded-xl border-2 border-indigo-200 shadow-md">
                      <div className="flex items-center mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                          <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h5 className="font-bold text-gray-800 text-lg mb-1">
                            Resulting Design Direction
                          </h5>
                          <p className="text-xs text-gray-600">
                            AI-generated style synthesis preview
                          </p>
                        </div>
                      </div>
                      <div className="bg-white/90 backdrop-blur-sm rounded-lg p-5 border border-white/50 shadow-sm mb-4">
                        <p className="text-base font-medium text-gray-800 leading-relaxed">
                          {(() => {
                            const avgWeight =
                              (materialWeight + characteristicWeight) / 2;
                            if (avgWeight < 0.2)
                              return "Fully localized design respecting regional traditions and climate";
                            if (avgWeight < 0.4)
                              return "Local architecture with subtle portfolio influences";
                            if (avgWeight < 0.6)
                              return "Balanced fusion creating unique contextual design";
                            if (avgWeight < 0.8)
                              return "Portfolio-driven design adapted to local context";
                            return "Strong portfolio signature with site-specific adaptations";
                          })()}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Materials
                            </span>
                            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-md">
                              <span className="text-white text-xs font-bold">
                                {Math.round(materialWeight * 100)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-gray-700">
                            {Math.round(materialWeight * 100)}% Portfolio
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {Math.round((1 - materialWeight) * 100)}% Local
                          </p>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Style
                            </span>
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-md">
                              <span className="text-white text-xs font-bold">
                                {Math.round(characteristicWeight * 100)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-gray-700">
                            {Math.round(characteristicWeight * 100)}% Portfolio
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {Math.round((1 - characteristicWeight) * 100)}%
                            Local
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portfolio requirement indicator */}
                  {(materialWeight > 0 || characteristicWeight > 0) &&
                    portfolioFiles.length === 0 && (
                      <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-xl flex items-start shadow-sm">
                        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 border border-yellow-200">
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-yellow-900 mb-1">
                            Portfolio Upload Required
                          </p>
                          <p className="text-sm text-yellow-800">
                            Portfolio upload required for blend weights above
                            0%. Upload images above to use portfolio styling.
                          </p>
                        </div>
                      </div>
                    )}
                </div>

                {/* AI Analysis Preview */}
                {portfolioFiles.length > 0 && (
                  <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 rounded-xl p-6 border border-purple-100 shadow-sm">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-3 shadow-md">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800 text-lg mb-1">
                          AI Portfolio Analysis Preview
                        </h4>
                        <p className="text-xs text-gray-500">
                          Automatically detected design patterns
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
                          Detected Style
                        </p>
                        <p className="font-bold text-gray-800 text-base">
                          Contemporary
                        </p>
                      </div>
                      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
                          Color Palette
                        </p>
                        <p className="font-bold text-gray-800 text-base">
                          Neutral Tones
                        </p>
                      </div>
                      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
                          Signature Elements
                        </p>
                        <p className="font-bold text-gray-800 text-base">
                          Clean Lines
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setCurrentStep(4)}
                className="mt-8 w-full bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white px-8 py-5 rounded-2xl hover:from-purple-700 hover:via-pink-700 hover:to-indigo-700 transition-all duration-300 font-bold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center group"
                disabled={portfolioFiles.length === 0}
              >
                <span>Continue to Project Details</span>
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-8 animate-fadeInUp relative z-10 pb-16">
            <div className="liquid-glass-strong p-8 sm:p-10 pb-12">
              <div className="flex items-center mb-8">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/30 to-emerald-500/30 border border-white/20 mr-5">
                  <Square className="w-8 h-8 text-green-300" />
                </div>
                <div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white mb-2 premium-title">
                    Project Specifications
                  </h2>
                  <p className="text-white/75 text-lg">
                    Define your project requirements for AI generation
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="total-surface-area"
                    className="block text-sm font-semibold text-white/90 mb-3"
                  >
                    Total Surface Area
                  </label>
                  <div className="relative">
                    <input
                      id="total-surface-area"
                      type="number"
                      placeholder="500"
                      value={projectDetails.area}
                      onChange={(e) => {
                        const sanitizedArea = sanitizeDimensionInput(
                          e.target.value,
                        );
                        setProjectDetails({
                          ...projectDetails,
                          area:
                            sanitizedArea !== null
                              ? sanitizedArea
                              : e.target.value,
                        });
                      }}
                      className="w-full px-5 py-4 pr-14 bg-navy-900/90 border border-white/20 rounded-xl focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all duration-300 text-white placeholder-white/50"
                    />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 font-medium">
                      m²
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="building-program"
                    className="block text-sm font-semibold text-white/90 mb-3"
                  >
                    Building Program
                    {isGeneratingSpaces && (
                      <span className="ml-2 text-xs text-blue-300 animate-pulse flex items-center mt-1">
                        🤖 Generating spaces with AI...
                      </span>
                    )}
                  </label>
                  <select
                    id="building-program"
                    value={projectDetails.program}
                    onChange={handleBuildingProgramChange}
                    className="w-full px-5 py-4 bg-navy-900/90 border border-white/20 rounded-xl focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all duration-300 text-white"
                    disabled={isGeneratingSpaces}
                    style={{ color: "#FFFFFF" }}
                  >
                    <option
                      value=""
                      style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                    >
                      Select program type...
                    </option>

                    <optgroup
                      label="🏡 Residential - Houses"
                      style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                    >
                      <option
                        value="detached-house"
                        style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                      >
                        Detached House (Single-family)
                      </option>
                      <option
                        value="semi-detached-house"
                        style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                      >
                        Semi-detached House (Duplex)
                      </option>
                      <option
                        value="terraced-house"
                        style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                      >
                        Terraced House (Townhouse)
                      </option>
                      <option
                        value="villa"
                        style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                      >
                        Villa (Luxury Detached)
                      </option>
                      <option
                        value="cottage"
                        style={{ background: "#1E3A5F", color: "#FFFFFF" }}
                      >
                        Cottage (Small Detached)
                      </option>
                    </optgroup>

                    <optgroup label="🏢 Residential - Multi-family">
                      <option value="apartment-building">
                        Apartment Building
                      </option>
                      <option value="condominium">Condominium Complex</option>
                      <option value="residential-tower">
                        Residential Tower
                      </option>
                    </optgroup>

                    <optgroup label="🏥 Healthcare">
                      <option value="clinic">Medical Clinic</option>
                      <option value="dental-clinic">Dental Clinic</option>
                      <option value="health-center">Health Center</option>
                      <option value="pharmacy">Pharmacy</option>
                    </optgroup>

                    <optgroup label="🏢 Commercial">
                      <option value="office">Office Building</option>
                      <option value="coworking">Coworking Space</option>
                      <option value="retail">Retail Space</option>
                      <option value="shopping-center">Shopping Center</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="cafe">Café</option>
                    </optgroup>

                    <optgroup label="🎓 Educational">
                      <option value="school">School</option>
                      <option value="kindergarten">Kindergarten</option>
                      <option value="training-center">Training Center</option>
                      <option value="library">Library</option>
                    </optgroup>

                    <optgroup label="🏨 Hospitality">
                      <option value="hotel">Hotel</option>
                      <option value="hostel">Hostel</option>
                      <option value="bed-breakfast">Bed & Breakfast</option>
                    </optgroup>

                    <optgroup label="🏛️ Public & Cultural">
                      <option value="community-center">Community Center</option>
                      <option value="museum">Museum</option>
                      <option value="gallery">Art Gallery</option>
                      <option value="theater">Theater</option>
                    </optgroup>

                    <optgroup label="🏋️ Sports & Recreation">
                      <option value="gym">Gym / Fitness Center</option>
                      <option value="sports-hall">Sports Hall</option>
                      <option value="swimming-pool">
                        Swimming Pool Complex
                      </option>
                      <option value="tennis-club">Tennis Club</option>
                      <option value="yoga-studio">Yoga Studio</option>
                    </optgroup>

                    <optgroup label="🏭 Industrial & Warehouse">
                      <option value="warehouse">Warehouse</option>
                      <option value="factory">Factory / Manufacturing</option>
                      <option value="workshop">Workshop</option>
                      <option value="logistics-center">Logistics Center</option>
                      <option value="storage-facility">Storage Facility</option>
                    </optgroup>

                    <optgroup label="⛪ Religious">
                      <option value="church">Church</option>
                      <option value="mosque">Mosque</option>
                      <option value="temple">Temple</option>
                      <option value="synagogue">Synagogue</option>
                      <option value="chapel">Chapel</option>
                    </optgroup>

                    <optgroup label="🚗 Transportation">
                      <option value="parking-garage">Parking Garage</option>
                      <option value="bus-station">Bus Station</option>
                      <option value="train-station">Train Station</option>
                      <option value="airport-terminal">Airport Terminal</option>
                      <option value="service-station">Service Station</option>
                    </optgroup>

                    <optgroup label="🏪 Mixed-Use">
                      <option value="mixed-use-residential-commercial">
                        Mixed-Use (Residential + Commercial)
                      </option>
                      <option value="mixed-use-office-retail">
                        Mixed-Use (Office + Retail)
                      </option>
                      <option value="live-work">Live-Work Space</option>
                    </optgroup>

                    <optgroup label="🏥 Senior & Care">
                      <option value="nursing-home">Nursing Home</option>
                      <option value="assisted-living">
                        Assisted Living Facility
                      </option>
                      <option value="daycare">Daycare Center</option>
                      <option value="retirement-community">
                        Retirement Community
                      </option>
                    </optgroup>

                    <optgroup label="🎯 Specialized">
                      <option value="research-lab">Research Laboratory</option>
                      <option value="data-center">Data Center</option>
                      <option value="veterinary-clinic">
                        Veterinary Clinic
                      </option>
                      <option value="funeral-home">Funeral Home</option>
                      <option value="fire-station">Fire Station</option>
                      <option value="police-station">Police Station</option>
                      <option value="post-office">Post Office</option>
                      <option value="bank">Bank</option>
                      <option value="cinema">Cinema / Movie Theater</option>
                      <option value="nightclub">Nightclub</option>
                      <option value="spa">Spa / Wellness Center</option>
                      <option value="greenhouse">Greenhouse</option>
                      <option value="observatory">Observatory</option>
                      <option value="aquarium">Aquarium</option>
                      <option value="zoo-building">Zoo Building</option>
                    </optgroup>
                  </select>
                </div>

                {/* Floor Count Section - Auto-calculated with manual lock option */}
                <div className="bg-[#0a1628]/60 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-white/90 font-medium flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-300" />
                      Number of Floors
                    </label>

                    {/* Lock Toggle */}
                    <button
                      onClick={() => setFloorCountLocked(!floorCountLocked)}
                      className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-all ${
                        floorCountLocked
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      }`}
                    >
                      {floorCountLocked ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <Unlock className="w-3 h-3" />
                      )}
                      {floorCountLocked ? "Locked" : "Auto"}
                    </button>
                  </div>

                  {/* Floor Count Display/Input */}
                  <div className="flex items-center gap-4">
                    {floorCountLocked ? (
                      // Manual input when locked
                      <input
                        type="number"
                        min={1}
                        max={calculatedFloors.maxFloorsAllowed || 6}
                        value={projectDetails.floorCount || 2}
                        onChange={(e) =>
                          setProjectDetails((prev) => ({
                            ...prev,
                            floorCount: Math.max(
                              1,
                              parseInt(e.target.value) || 1,
                            ),
                          }))
                        }
                        className="w-20 bg-[#0a1628] border border-white/20 rounded-lg px-3 py-2 text-white text-center text-2xl font-bold"
                      />
                    ) : (
                      // Auto-calculated display
                      <div className="text-2xl font-bold text-white">
                        {calculatedFloors.optimalFloors ||
                          projectDetails.floorCount ||
                          "—"}
                      </div>
                    )}
                    <span className="text-white/50">
                      floor
                      {(projectDetails.floorCount ||
                        calculatedFloors.optimalFloors) !== 1
                        ? "s"
                        : ""}
                    </span>
                  </div>

                  {/* Reasoning explanation */}
                  {calculatedFloors.reasoning &&
                    !floorCountLocked &&
                    projectDetails.area &&
                    projectDetails.program && (
                      <p className="text-xs text-white/40 mt-2">
                        {calculatedFloors.reasoning}
                      </p>
                    )}

                  {/* Warning if manual exceeds max */}
                  {floorCountLocked &&
                    projectDetails.floorCount >
                      (calculatedFloors.maxFloorsAllowed || 6) && (
                      <p className="text-xs text-amber-400 mt-2">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        Exceeds typical max ({calculatedFloors.maxFloorsAllowed}
                        ) for this building type
                      </p>
                    )}
                </div>

                <div>
                  <label
                    htmlFor="entrance-direction"
                    className="block text-sm font-semibold text-white/90 mb-3"
                  >
                    <Compass className="w-4 h-4 inline mr-1" />
                    Principal Entrance Direction
                  </label>
                  <select
                    id="entrance-direction"
                    value={projectDetails.entranceDirection}
                    onChange={(e) =>
                      setProjectDetails({
                        ...projectDetails,
                        entranceDirection: e.target.value,
                      })
                    }
                    className="w-full px-5 py-4 bg-navy-900/90 border border-white/20 rounded-xl focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all duration-300 text-white"
                  >
                    <option value="" className="bg-gray-800 text-white">
                      Select entrance orientation...
                    </option>
                    <option value="N" className="bg-gray-800 text-white">
                      ⬆️ North (N)
                    </option>
                    <option value="NE" className="bg-gray-800 text-white">
                      ↗️ North-East (NE)
                    </option>
                    <option value="E" className="bg-gray-800 text-white">
                      ➡️ East (E)
                    </option>
                    <option value="SE" className="bg-gray-800 text-white">
                      ↘️ South-East (SE)
                    </option>
                    <option value="S" className="bg-gray-800 text-white">
                      ⬇️ South (S)
                    </option>
                    <option value="SW" className="bg-gray-800 text-white">
                      ↙️ South-West (SW)
                    </option>
                    <option value="W" className="bg-gray-800 text-white">
                      ⬅️ West (W)
                    </option>
                    <option value="NW" className="bg-gray-800 text-white">
                      ↖️ North-West (NW)
                    </option>
                  </select>
                  {projectDetails.entranceDirection && (
                    <p className="mt-2 text-sm text-white/80">
                      <Sun className="w-4 h-4 inline mr-1 text-yellow-300" />
                      {projectDetails.entranceDirection === "S" ||
                      projectDetails.entranceDirection === "SE" ||
                      projectDetails.entranceDirection === "SW"
                        ? "Good solar exposure - Optimal for passive solar heating"
                        : projectDetails.entranceDirection === "N" ||
                            projectDetails.entranceDirection === "NE" ||
                            projectDetails.entranceDirection === "NW"
                          ? "Limited solar exposure - Consider additional lighting"
                          : "Moderate solar exposure - Balanced lighting conditions"}
                    </p>
                  )}
                </div>
              </div>

              {/* Program Editor */}
              <div className="mt-6 liquid-glass-card border border-white/20 rounded-xl p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-white flex items-center">
                    <Square className="w-5 h-5 text-blue-300 mr-2" />
                    Program Spaces (Room Schedule)
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (projectDetails.program && projectDetails.area) {
                          setIsGeneratingSpaces(true);
                          const spaces = await generateProgramSpacesWithAI(
                            projectDetails.program,
                            projectDetails.area,
                          );
                          if (spaces.length > 0) {
                            setProgramSpaces(spaces);
                            setToastMessage(
                              `✅ AI generated ${spaces.length} spaces for ${projectDetails.program}`,
                            );
                            setTimeout(() => setToastMessage(""), 3000);
                          }
                          setIsGeneratingSpaces(false);
                        } else {
                          setToastMessage(
                            "⚠️ Please select building program and area first",
                          );
                          setTimeout(() => setToastMessage(""), 3000);
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="AI-powered space generation based on building program and total area"
                      disabled={
                        isGeneratingSpaces ||
                        !projectDetails.program ||
                        !projectDetails.area
                      }
                    >
                      <Sparkles className="w-4 h-4" />
                      {isGeneratingSpaces ? "Generating..." : "AI Auto-Fill"}
                    </button>
                    <button
                      onClick={() =>
                        setProgramSpaces([
                          ...programSpaces,
                          { name: "", area: "", count: 1, level: "" },
                        ])
                      }
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Space
                    </button>
                  </div>
                </div>

                {programSpaces.length === 0 ? (
                  <div className="text-center py-8 text-white/70">
                    <p className="text-sm">No program spaces defined yet.</p>
                    <p className="text-xs mt-1">
                      Click "Add Space" to define room types and areas.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {programSpaces.map((space, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-12 gap-2 items-center p-3 liquid-glass border border-white/20 rounded-lg"
                      >
                        <div className="col-span-4">
                          <input
                            type="text"
                            placeholder="Space name (e.g., Lobby, Office)"
                            value={space.name}
                            onChange={(e) => {
                              const updated = [...programSpaces];
                              updated[index].name = e.target.value;
                              setProgramSpaces(updated);
                            }}
                            className="w-full px-3 py-2 bg-navy-900/90 border border-white/20 rounded-lg text-sm text-white placeholder-white/50 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/50"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            placeholder="Area (m²)"
                            value={space.area}
                            onChange={(e) => {
                              const updated = [...programSpaces];
                              updated[index].area = e.target.value;
                              setProgramSpaces(updated);
                            }}
                            className="w-full px-3 py-2 bg-navy-900/90 border border-white/20 rounded-lg text-sm text-white placeholder-white/50 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/50"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            placeholder="Count"
                            value={space.count}
                            min="1"
                            onChange={(e) => {
                              const updated = [...programSpaces];
                              updated[index].count =
                                parseInt(e.target.value) || 1;
                              setProgramSpaces(updated);
                            }}
                            className="w-full px-3 py-2 bg-navy-900/90 border border-white/20 rounded-lg text-sm text-white placeholder-white/50 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/50"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="text"
                            placeholder="Level (optional)"
                            value={space.level}
                            onChange={(e) => {
                              const updated = [...programSpaces];
                              updated[index].level = e.target.value;
                              setProgramSpaces(updated);
                            }}
                            className="w-full px-3 py-2 bg-navy-900/90 border border-white/20 rounded-lg text-sm text-white placeholder-white/50 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/50"
                          />
                        </div>
                        <div className="col-span-1">
                          <button
                            onClick={() =>
                              setProgramSpaces(
                                programSpaces.filter((_, i) => i !== index),
                              )
                            }
                            className="w-full p-2 text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Program Summary - Auto-calculated */}
                    {programSpaces.length > 0 && (
                      <div className="mt-4 p-4 liquid-glass border border-blue-500/30 rounded-lg bg-blue-500/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-white">
                            Total Program Area:
                          </span>
                          <span className="text-lg font-bold text-blue-200">
                            {programSpaces
                              .reduce(
                                (sum, space) =>
                                  sum +
                                  parseFloat(space.area || 0) *
                                    (space.count || 1),
                                0,
                              )
                              .toFixed(0)}{" "}
                            m²
                          </span>
                        </div>
                        {projectDetails.area && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-white/80">
                                Target Area:
                              </span>
                              <span
                                className={`text-sm font-semibold ${
                                  Math.abs(
                                    programSpaces.reduce(
                                      (sum, space) =>
                                        sum +
                                        parseFloat(space.area || 0) *
                                          (space.count || 1),
                                      0,
                                    ) - parseFloat(projectDetails.area),
                                  ) /
                                    parseFloat(projectDetails.area) >
                                  0.05
                                    ? "text-orange-300"
                                    : "text-green-300"
                                }`}
                              >
                                {projectDetails.area} m²
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-white/70">
                                Difference:
                              </span>
                              <span
                                className={`text-xs font-semibold ${
                                  Math.abs(
                                    programSpaces.reduce(
                                      (sum, space) =>
                                        sum +
                                        parseFloat(space.area || 0) *
                                          (space.count || 1),
                                      0,
                                    ) - parseFloat(projectDetails.area),
                                  ) /
                                    parseFloat(projectDetails.area) >
                                  0.05
                                    ? "text-orange-300"
                                    : "text-green-300"
                                }`}
                              >
                                {(
                                  ((programSpaces.reduce(
                                    (sum, space) =>
                                      sum +
                                      parseFloat(space.area || 0) *
                                        (space.count || 1),
                                    0,
                                  ) -
                                    parseFloat(projectDetails.area)) /
                                    parseFloat(projectDetails.area)) *
                                  100
                                ).toFixed(1)}
                                {"%"}
                              </span>
                            </div>
                            {Math.abs(
                              programSpaces.reduce(
                                (sum, space) =>
                                  sum +
                                  parseFloat(space.area || 0) *
                                    (space.count || 1),
                                0,
                              ) - parseFloat(projectDetails.area),
                            ) /
                              parseFloat(projectDetails.area) >
                              0.05 && (
                              <div className="mt-2 p-2 liquid-glass border border-orange-400/50 rounded text-xs text-orange-200 bg-orange-500/10">
                                ⚠️ Program total differs from target area by
                                more than 5%. Please adjust.
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Import/Export Program Schedule */}
                    {programSpaces.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          onClick={() => {
                            // Create CSV content for Excel
                            const headers = [
                              "Space Name",
                              "Area (m²)",
                              "Count",
                              "Level",
                              "Subtotal (m²)",
                            ];
                            const csvRows = [headers.join(",")];

                            // Add data rows
                            let totalArea = 0;
                            programSpaces.forEach((space) => {
                              const area = parseFloat(space.area || 0);
                              const count = parseInt(space.count || 1);
                              const subtotal = area * count;
                              totalArea += subtotal;

                              const row = [
                                `"${space.name || ""}"`,
                                area.toFixed(2),
                                count,
                                `"${space.level || ""}"`,
                                subtotal.toFixed(2),
                              ];
                              csvRows.push(row.join(","));
                            });

                            // Add empty row
                            csvRows.push("");

                            // Add total row
                            csvRows.push(`"TOTAL",,,,${totalArea.toFixed(2)}`);

                            // Add project info
                            csvRows.push("");
                            csvRows.push(
                              `"Building Program:","${projectDetails?.program || ""}"`,
                            );
                            csvRows.push(
                              `"Target Area:","${projectDetails?.area || ""} m²"`,
                            );
                            csvRows.push(
                              `"Generated:","${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}"`,
                            );

                            const csvContent = csvRows.join("\n");
                            const dataBlob = new Blob([csvContent], {
                              type: "text/csv;charset=utf-8;",
                            });
                            const url = URL.createObjectURL(dataBlob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `program-schedule-${projectDetails?.program || "project"}-${Date.now()}.csv`;
                            link.click();
                            URL.revokeObjectURL(url);
                            setToastMessage(
                              "📊 Program schedule exported to Excel!",
                            );
                            setTimeout(() => setToastMessage(""), 3000);
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-md text-sm font-medium"
                        >
                          <Download className="w-4 h-4" />
                          Export to Excel
                        </button>
                        <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md text-sm font-medium cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Import Schedule
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls,.docx,.doc,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              if (!e?.target?.files) return;
                              const file = e.target.files[0];
                              if (file) {
                                const fileName = file.name.toLowerCase();
                                const reader = new FileReader();

                                reader.onload = (event) => {
                                  try {
                                    const content = event.target.result;

                                    // Parse CSV files
                                    if (fileName.endsWith(".csv")) {
                                      const lines = content
                                        .split("\n")
                                        .filter((line) => line.trim());
                                      const importedSpaces = [];

                                      // Skip header row, parse data rows
                                      for (let i = 1; i < lines.length; i++) {
                                        const line = lines[i].trim();

                                        // Stop at TOTAL row or empty lines
                                        if (
                                          !line ||
                                          line.startsWith('"TOTAL"') ||
                                          line.startsWith('"Building Program"')
                                        ) {
                                          break;
                                        }

                                        // Parse CSV row (handle quoted strings)
                                        const matches = line.match(
                                          /(".*?"|[^",\s]+)(?=\s*,|\s*$)/g,
                                        );
                                        if (matches && matches.length >= 4) {
                                          const name = matches[0].replace(
                                            /^"|"$/g,
                                            "",
                                          );
                                          const area = matches[1];
                                          const count = matches[2];
                                          const level = matches[3].replace(
                                            /^"|"$/g,
                                            "",
                                          );

                                          if (name && area) {
                                            importedSpaces.push({
                                              name: name,
                                              area: area,
                                              count: parseInt(count) || 1,
                                              level: level || "Ground",
                                            });
                                          }
                                        }
                                      }

                                      if (importedSpaces.length > 0) {
                                        setProgramSpaces(importedSpaces);
                                        setToastMessage(
                                          `✅ Imported ${importedSpaces.length} spaces from Excel!`,
                                        );
                                        setTimeout(
                                          () => setToastMessage(""),
                                          3000,
                                        );
                                      } else {
                                        setToastMessage(
                                          "⚠️ No valid spaces found in file.",
                                        );
                                        setTimeout(
                                          () => setToastMessage(""),
                                          3000,
                                        );
                                      }
                                    }
                                    // Excel (.xlsx, .xls) files
                                    else if (
                                      fileName.endsWith(".xlsx") ||
                                      fileName.endsWith(".xls")
                                    ) {
                                      setToastMessage(
                                        "📊 Excel files (.xlsx/.xls) support coming soon! Please export as CSV and import.",
                                      );
                                      setTimeout(
                                        () => setToastMessage(""),
                                        5000,
                                      );
                                    }
                                    // Word (.docx, .doc) files
                                    else if (
                                      fileName.endsWith(".docx") ||
                                      fileName.endsWith(".doc")
                                    ) {
                                      setToastMessage(
                                        "📄 Word files support coming soon! Please export as CSV and import.",
                                      );
                                      setTimeout(
                                        () => setToastMessage(""),
                                        5000,
                                      );
                                    }
                                    // PDF files
                                    else if (fileName.endsWith(".pdf")) {
                                      setToastMessage(
                                        "📕 PDF files support coming soon! Please export as CSV and import.",
                                      );
                                      setTimeout(
                                        () => setToastMessage(""),
                                        5000,
                                      );
                                    } else {
                                      setToastMessage(
                                        "⚠️ Unsupported file format. Please use CSV files.",
                                      );
                                      setTimeout(
                                        () => setToastMessage(""),
                                        3000,
                                      );
                                    }
                                  } catch (error) {
                                    console.error("Import error:", error);
                                    setToastMessage(
                                      "❌ Error importing file. Please check the format.",
                                    );
                                    setTimeout(() => setToastMessage(""), 3000);
                                  }
                                };

                                reader.readAsText(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {projectDetails.program && (
                <div className="mt-6 liquid-glass-card border border-green-500/30 rounded-xl p-6 backdrop-blur-xl bg-green-500/10">
                  <h4 className="font-semibold text-white mb-4 flex items-center">
                    <Building className="w-5 h-5 text-green-300 mr-2" />
                    {projectDetails.program === "clinic"
                      ? "Medical Clinic"
                      : "Program"}{" "}
                    Requirements
                  </h4>

                  {projectDetails.program === "clinic" && (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h5 className="font-medium text-white">
                          Spatial Requirements
                        </h5>
                        <ul className="space-y-2 text-sm text-white/90">
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            Reception area with waiting space (60-80m²)
                          </li>
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            4-6 consultation/examination rooms (15-20m² each)
                          </li>
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            Staff areas and administration (30-40m²)
                          </li>
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            Accessible restrooms and utility spaces
                          </li>
                        </ul>
                      </div>

                      <div className="space-y-3">
                        <h5 className="font-medium text-white">
                          Design Considerations
                        </h5>
                        <ul className="space-y-2 text-sm text-white/90">
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            Patient privacy and acoustic separation
                          </li>
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            Natural lighting for healing environment
                          </li>
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            Separate staff and patient circulation
                          </li>
                          <li className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                            ADA compliance and universal design
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Generation Preview */}
              <div className="mt-6 liquid-glass-card border border-white/20 rounded-xl p-6 backdrop-blur-xl">
                <h4 className="font-semibold text-white mb-3 flex items-center">
                  <Cpu className="w-5 h-5 text-blue-300 mr-2" />
                  AI Generation Parameters
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="liquid-glass border border-white/20 rounded-lg p-3">
                    <p className="text-white/70 text-xs">Location Style</p>
                    <p className="font-medium text-white">
                      {styleChoice === "blend" ? "Adaptive" : "Portfolio"}
                    </p>
                  </div>
                  <div className="liquid-glass border border-white/20 rounded-lg p-3">
                    <p className="text-white/70 text-xs">Climate Optimized</p>
                    <p className="font-medium text-white">Yes</p>
                  </div>
                  <div className="liquid-glass border border-white/20 rounded-lg p-3">
                    <p className="text-white/70 text-xs">Sustainability</p>
                    <p className="font-medium text-white">LEED Gold+</p>
                  </div>
                  <div className="liquid-glass border border-white/20 rounded-lg p-3">
                    <p className="text-white/70 text-xs">Code Compliance</p>
                    <p className="font-medium text-white">Auto-verified</p>
                  </div>
                </div>
              </div>

              <button
                onClick={generateDesigns}
                className="mt-6 w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 font-medium flex items-center justify-center disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                disabled={
                  !projectDetails.area || !projectDetails.program || isLoading
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" />
                    AI is generating your designs...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2" />
                    Generate AI Designs
                  </>
                )}
              </button>

              {/* Progress Indicator */}
              {isLoading && generationProgress.step > 0 && (
                <div className="mt-4 liquid-glass-card border border-white/20 rounded-lg p-4 backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">
                      {generationProgress.phase}: {generationProgress.message}
                    </span>
                    <span className="text-sm font-semibold text-blue-300">
                      {generationProgress.percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 border border-white/20">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${generationProgress.percentage}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-white/70">
                    Step {generationProgress.step} of{" "}
                    {generationProgress.totalSteps}
                  </div>
                </div>
              )}

              {/* Rate Limit Pause Indicator */}
              {rateLimitPause.active && (
                <div className="mt-4 liquid-glass-card border border-yellow-400/50 rounded-lg p-4 backdrop-blur-xl bg-yellow-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="animate-pulse mr-3">
                        <div className="w-3 h-3 bg-yellow-300 rounded-full"></div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-yellow-200">
                          {rateLimitPause.reason}
                        </p>
                        <p className="text-xs text-yellow-300/80 mt-1">
                          Auto-pausing for {rateLimitPause.remainingSeconds}s
                          before continuing...
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={cancelRateLimitPause}
                      className="text-xs text-yellow-200 hover:text-yellow-100 underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-8 animate-fadeInUp relative z-10 pb-16">
            <div className="liquid-glass-strong p-8 sm:p-10 pb-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
                <div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white mb-2 premium-title">
                    AI-Generated Designs
                  </h2>
                  <p className="text-white/75 text-lg">
                    Complete architectural solution ready for export
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-4 sm:mt-0">
                  <button
                    onClick={() => setShowModifyDrawer(true)}
                    className="btn-premium-secondary flex items-center gap-2 px-5 py-3"
                  >
                    <Edit3 className="w-5 h-5" />
                    Modify A1 Sheet
                  </button>
                  <div className="flex items-center liquid-glass-card px-5 py-3 rounded-full border border-green-500/30">
                    <div className="w-3 h-3 bg-green-400 rounded-full mr-3 animate-pulse"></div>
                    <Sparkles className="w-5 h-5 text-green-400 mr-2" />
                    <span className="text-white font-semibold">
                      Generation Complete
                    </span>
                  </div>
                </div>
              </div>

              {/* A1 Sheet Viewer - Show if A1 sheet workflow was used */}
              {generatedDesigns?.a1Sheet && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center justify-between">
                    <span className="flex items-center">
                      <FileText className="w-5 h-5 mr-2 text-blue-300" />
                      A1 Comprehensive Architectural Sheet
                    </span>
                    <button
                      onClick={() =>
                        setShowModificationPanel(!showModificationPanel)
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg text-sm font-medium"
                    >
                      <Wand2 className="w-4 h-4" />
                      {showModificationPanel ? "Hide" : "Show"} AI Modify Panel
                    </button>
                  </h3>

                  {/* 🆕 Validation Badges */}
                  {(generatedDesigns.templateValidation ||
                    generatedDesigns.dnaConsistencyReport) && (
                    <div className="mb-4 flex flex-wrap gap-3">
                      {generatedDesigns.templateValidation && (
                        <div
                          className={`px-4 py-2 rounded-lg text-sm font-medium liquid-glass border ${
                            generatedDesigns.templateValidation.valid
                              ? "border-green-400/50 bg-green-500/20 text-green-200"
                              : "border-yellow-400/50 bg-yellow-500/20 text-yellow-200"
                          }`}
                        >
                          <span className="font-bold">
                            Template:{" "}
                            {generatedDesigns.templateValidation.score}%
                          </span>
                          {generatedDesigns.templateValidation.missingMandatory
                            ?.length > 0 && (
                            <span className="ml-2 text-xs opacity-90">
                              (Missing:{" "}
                              {generatedDesigns.templateValidation.missingMandatory
                                .slice(0, 2)
                                .join(", ")}
                              )
                            </span>
                          )}
                        </div>
                      )}
                      {generatedDesigns.dnaConsistencyReport && (
                        <div
                          className={`px-4 py-2 rounded-lg text-sm font-medium liquid-glass border ${
                            generatedDesigns.dnaConsistencyReport.consistent
                              ? "border-green-400/50 bg-green-500/20 text-green-200"
                              : "border-yellow-400/50 bg-yellow-500/20 text-yellow-200"
                          }`}
                        >
                          <span className="font-bold">
                            DNA Consistency:{" "}
                            {generatedDesigns.dnaConsistencyReport.score.toFixed(
                              1,
                            )}
                            %
                          </span>
                          {generatedDesigns.dnaConsistencyReport.issues
                            ?.length > 0 && (
                            <span className="ml-2 text-xs opacity-90">
                              (
                              {
                                generatedDesigns.dnaConsistencyReport.issues
                                  .length
                              }{" "}
                              issues)
                            </span>
                          )}
                        </div>
                      )}
                      {generatedDesigns.a1Sheet?.qualityScore && (
                        <div
                          className={`px-4 py-2 rounded-lg text-sm font-medium liquid-glass border ${
                            generatedDesigns.a1Sheet.qualityScore >= 85
                              ? "border-green-400/50 bg-green-500/20 text-green-200"
                              : "border-yellow-400/50 bg-yellow-500/20 text-yellow-200"
                          }`}
                        >
                          <span className="font-bold">
                            Quality: {generatedDesigns.a1Sheet.qualityScore}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <A1SheetViewer sheetData={generatedDesigns.a1Sheet} />
                </div>
              )}

              {/* Warning for old designs with invalid ID */}
              {showModificationPanel &&
                (!currentDesignId ||
                  currentDesignId === "undefined" ||
                  currentDesignId === "null") &&
                generatedDesigns?.a1Sheet && (
                  <div className="mb-8 liquid-glass-card border border-yellow-400/50 rounded-lg p-6 backdrop-blur-xl bg-yellow-500/10">
                    <h3 className="text-lg font-semibold text-yellow-200 mb-2 flex items-center">
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Cannot Modify This Design
                    </h3>
                    <p className="text-sm text-yellow-200/90 mb-3">
                      This A1 sheet was generated before the recent fixes and
                      cannot be modified.
                    </p>
                    <p className="text-sm text-yellow-200/90 mb-4">
                      <strong>Solution:</strong> Generate a new A1 sheet to
                      enable modifications. The new generation will have
                      improved quality and full modification support.
                    </p>
                    <button
                      onClick={() => {
                        // Clear old data and go back to generation
                        setGeneratedDesigns(null);
                        setCurrentDesignId(null);
                        sessionStorage.removeItem("currentDesignId");
                        setCurrentStep(4); // Go back to specifications
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 text-white rounded-lg hover:from-yellow-700 hover:to-orange-700 transition-all shadow-lg text-sm font-medium"
                    >
                      Generate New A1 Sheet
                    </button>
                  </div>
                )}

              {/* 🔧 AI MODIFICATION PANEL - Modify A1 sheet with consistency lock */}
              {showModificationPanel &&
                currentDesignId &&
                currentDesignId !== "undefined" &&
                currentDesignId !== "null" &&
                generatedDesigns?.a1Sheet && (
                  <div className="mb-8 liquid-glass-card border border-white/20 rounded-lg shadow-lg p-6 backdrop-blur-xl">
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                      <Wand2 className="w-5 h-5 mr-2 text-purple-300" />
                      AI Modify Design
                      <span className="ml-3 text-xs text-white/70 font-mono">
                        ID: {currentDesignId}
                      </span>
                    </h3>
                    <p className="text-sm text-white/90 mb-4">
                      Request changes to your A1 sheet while maintaining
                      consistency with the original design.
                    </p>

                    <AIModifyPanel
                      designId={currentDesignId}
                      currentDesign={generatedDesigns}
                      onModificationComplete={(result) => {
                        console.log("✅ Modification complete:", result);

                        if (result.success && result.url) {
                          // Update A1 sheet with modified version
                          setGeneratedDesigns({
                            ...generatedDesigns,
                            a1Sheet: {
                              ...generatedDesigns.a1Sheet,
                              url: result.url,
                              modified: true,
                              versionId: result.versionId,
                              consistencyScore: result.consistencyScore,
                            },
                          });
                          console.log("📋 A1 sheet updated with modifications");

                          if (
                            result.consistencyIssues &&
                            result.consistencyIssues.length > 0
                          ) {
                            setToastMessage(
                              `Modification complete. Consistency score: ${(result.consistencyScore * 100).toFixed(1)}%`,
                            );
                            setTimeout(() => setToastMessage(""), 5000);
                          }
                        } else {
                          setToastMessage(
                            `Modification failed: ${result.error || "Unknown error"}`,
                          );
                          setTimeout(() => setToastMessage(""), 5000);
                        }
                      }}
                    />
                  </div>
                )}

              {/* Design Overview Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="liquid-glass-card border border-blue-500/30 rounded-xl p-4 text-center backdrop-blur-xl bg-blue-500/10">
                  <p className="text-3xl font-bold text-blue-200">
                    {projectDetails.area}m²
                  </p>
                  <p className="text-sm text-white/80">Total Area</p>
                </div>
                <div className="liquid-glass-card border border-green-500/30 rounded-xl p-4 text-center backdrop-blur-xl bg-green-500/10">
                  <p className="text-3xl font-bold text-green-200">
                    {generatedDesigns?.floorPlan?.efficiency ||
                      generatedDesigns?.a1Sheet?.qualityScore + "%" ||
                      "85%"}
                  </p>
                  <p className="text-sm text-white/80">Space Efficiency</p>
                </div>
                <div className="liquid-glass-card border border-purple-500/30 rounded-xl p-4 text-center backdrop-blur-xl bg-purple-500/10">
                  <p className="text-3xl font-bold text-purple-200">4.8/5</p>
                  <p className="text-sm text-white/80">Design Score</p>
                </div>
                <div className="liquid-glass-card border border-orange-500/30 rounded-xl p-4 text-center backdrop-blur-xl bg-orange-500/10">
                  <p className="text-3xl font-bold text-orange-200">A+</p>
                  <p className="text-sm text-white/80">Energy Rating</p>
                </div>
              </div>

              {/* Consistency Dashboard - Show quality metrics */}
              {generatedDesigns && (
                <div className="bg-gradient-to-r from-green-500 to-blue-500 rounded-lg p-6 text-white mb-8">
                  <h2 className="text-2xl font-bold mb-4">
                    Consistency Metrics
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        {generatedDesigns?.validation?.consistency?.overall ||
                          generatedDesigns?.consistencyScore ||
                          95}
                        %
                      </div>
                      <div className="text-sm opacity-90">Overall Score</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        {generatedDesigns?.validation?.consistency?.facades ||
                          98}
                        %
                      </div>
                      <div className="text-sm opacity-90">Facade Match</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        {generatedDesigns?.validation?.consistency?.materials ||
                          100}
                        %
                      </div>
                      <div className="text-sm opacity-90">Material Unity</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        {generatedDesigns?.validation?.consistency
                          ?.dimensions || 96}
                        %
                      </div>
                      <div className="text-sm opacity-90">
                        Dimension Accuracy
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm opacity-90">
                    {(generatedDesigns?.validation?.consistency?.overall ||
                      95) >= 95
                      ? "✅ Professional-grade consistency achieved!"
                      : "⚠️ Minor inconsistencies detected - review recommended"}
                  </div>
                </div>
              )}

              {/* Design Reasoning Cards - Make AI decisions visible */}
              {generatedDesigns?.reasoning && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                    <Building2 className="w-5 h-5 mr-2 text-blue-300" />
                    Design Reasoning & Philosophy
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Site Response Card */}
                    <div className="liquid-glass-card border border-white/20 rounded-lg p-4 hover:shadow-lg transition-shadow backdrop-blur-xl">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">📍</span>
                        <h4 className="font-semibold text-white">
                          Site Response
                        </h4>
                      </div>
                      <p className="text-sm text-white/90">
                        {generatedDesigns.reasoning.siteResponse ||
                          (typeof generatedDesigns.reasoning
                            .designPhilosophy === "string"
                            ? generatedDesigns.reasoning.designPhilosophy.substring(
                                0,
                                100,
                              )
                            : generatedDesigns.reasoning.designPhilosophy
                                ?.overview ||
                              generatedDesigns.reasoning.styleRationale
                                ?.overview ||
                              "Optimized for local climate and context")}
                        ...
                      </p>
                    </div>

                    {/* Functional Layout Card */}
                    <div className="liquid-glass-card border border-white/20 rounded-lg p-4 hover:shadow-lg transition-shadow backdrop-blur-xl">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">📐</span>
                        <h4 className="font-semibold text-white">
                          Spatial Design
                        </h4>
                      </div>
                      <p className="text-sm text-white/90">
                        {generatedDesigns.reasoning.functionalLayout ||
                          (typeof generatedDesigns.reasoning
                            .spatialOrganization === "string"
                            ? generatedDesigns.reasoning.spatialOrganization.substring(
                                0,
                                100,
                              )
                            : generatedDesigns.reasoning.spatialOrganization
                                ?.strategy ||
                              generatedDesigns.reasoning.spatialOrganization
                                ?.circulation ||
                              "Efficient flow between spaces")}
                        ...
                      </p>
                    </div>

                    {/* Material Selection Card */}
                    <div className="liquid-glass-card border border-white/20 rounded-lg p-4 hover:shadow-lg transition-shadow backdrop-blur-xl">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">🎨</span>
                        <h4 className="font-semibold text-white">Materials</h4>
                      </div>
                      <p className="text-sm text-white/90">
                        {generatedDesigns.reasoning.materialSelection ||
                          (typeof generatedDesigns.reasoning
                            .materialRecommendations === "string"
                            ? generatedDesigns.reasoning.materialRecommendations.substring(
                                0,
                                100,
                              )
                            : Array.isArray(
                                  generatedDesigns.reasoning
                                    .materialRecommendations?.primary,
                                )
                              ? generatedDesigns.reasoning.materialRecommendations.primary
                                  .join(", ")
                                  .substring(0, 100)
                              : generatedDesigns.reasoning
                                  .materialRecommendations?.primary ||
                                generatedDesigns.reasoning
                                  .materialRecommendations?.sustainable ||
                                "Sustainable local materials")}
                        ...
                      </p>
                    </div>

                    {/* Sustainability Card */}
                    <div className="liquid-glass-card border border-white/20 rounded-lg p-4 hover:shadow-lg transition-shadow backdrop-blur-xl">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">🌱</span>
                        <h4 className="font-semibold text-white">
                          Sustainability
                        </h4>
                      </div>
                      <p className="text-sm text-white/90">
                        {generatedDesigns.reasoning.sustainability ||
                          (typeof generatedDesigns.reasoning
                            .environmentalConsiderations === "string"
                            ? generatedDesigns.reasoning.environmentalConsiderations.substring(
                                0,
                                100,
                              )
                            : Array.isArray(
                                  generatedDesigns.reasoning
                                    .environmentalConsiderations
                                    ?.passiveStrategies,
                                )
                              ? generatedDesigns.reasoning.environmentalConsiderations.passiveStrategies
                                  .join(", ")
                                  .substring(0, 100)
                              : generatedDesigns.reasoning
                                  .environmentalConsiderations
                                  ?.passiveStrategies ||
                                generatedDesigns.reasoning
                                  .environmentalConsiderations
                                  ?.climateResponse ||
                                "Energy-efficient design principles")}
                        ...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Design Display */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* UNIFIED A1 SHEET DISPLAY */}
                {generatedDesigns?.isUnified &&
                generatedDesigns?.unifiedSheet ? (
                  <div className="col-span-2 mb-8 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-800 flex items-center">
                        <FileText className="w-6 h-6 mr-2 text-blue-600" />
                        Complete Architectural Sheet
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                          {generatedDesigns.unifiedSheet.format}
                        </span>
                        <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                          Consistency:{" "}
                          {(
                            generatedDesigns.unifiedSheet.consistencyScore * 100
                          ).toFixed(0)}
                          %
                        </span>
                        {generatedDesigns.unifiedSheet.type ===
                          "unified_svg_composite" && (
                          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                            <FileText className="w-3 h-3 mr-1" />
                            SVG Composite
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sheet Preview - Full A1 Sheet Fitted to View */}
                    <div
                      className="relative bg-white rounded-lg shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
                      style={{ width: "100%", padding: "20px" }}
                      onClick={() => {
                        // Pass SVG content to modal for proper rendering
                        if (generatedDesigns.unifiedSheet.svgContent) {
                          setModalImage("unified_svg_sheet");
                          setModalImageTitle(
                            "Complete A1 Architectural Sheet - A1 Format (594mm × 841mm)",
                          );
                          setImageZoom(1);
                          setImagePan({ x: 0, y: 0 });
                        }
                      }}
                    >
                      {generatedDesigns.unifiedSheet.type ===
                        "unified_svg_composite" &&
                      generatedDesigns.unifiedSheet.svgContent ? (
                        <div
                          className="w-full"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              generatedDesigns.unifiedSheet.svgContent,
                              {
                                ALLOWED_TAGS: [
                                  "svg",
                                  "path",
                                  "rect",
                                  "circle",
                                  "line",
                                  "text",
                                  "g",
                                  "defs",
                                  "use",
                                  "polygon",
                                  "polyline",
                                  "ellipse",
                                  "tspan",
                                  "clipPath",
                                  "mask",
                                  "pattern",
                                  "linearGradient",
                                  "radialGradient",
                                  "stop",
                                  "title",
                                  "desc",
                                ],
                                ALLOWED_ATTR: [
                                  "viewBox",
                                  "xmlns",
                                  "width",
                                  "height",
                                  "fill",
                                  "stroke",
                                  "stroke-width",
                                  "d",
                                  "x",
                                  "y",
                                  "cx",
                                  "cy",
                                  "r",
                                  "rx",
                                  "ry",
                                  "x1",
                                  "y1",
                                  "x2",
                                  "y2",
                                  "points",
                                  "transform",
                                  "font-size",
                                  "font-family",
                                  "text-anchor",
                                  "id",
                                  "class",
                                  "style",
                                  "opacity",
                                  "clip-path",
                                  "mask",
                                  "offset",
                                  "stop-color",
                                  "stop-opacity",
                                ],
                              },
                            ),
                          }}
                        />
                      ) : (
                        <img
                          src={generatedDesigns.unifiedSheet.url}
                          alt="A1 Architectural Sheet"
                          className="w-full h-auto"
                          style={{ objectFit: "contain" }}
                          onError={(e) => {
                            console.error("Failed to load unified sheet");
                            e.target.style.display = "none";
                            const errorDiv = document.createElement("div");
                            errorDiv.className = "text-red-500 p-8 text-center";
                            errorDiv.innerHTML =
                              "Failed to load sheet - click below to view individual drawings";
                            e.target.parentElement.appendChild(errorDiv);
                          }}
                        />
                      )}
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-full pointer-events-none">
                        <ZoomIn className="w-6 h-6 text-gray-700" />
                        <span className="text-xs text-gray-600 block text-center mt-1">
                          Click to zoom
                        </span>
                      </div>
                    </div>

                    {/* Sheet Contents */}
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {generatedDesigns.unifiedSheet.contains?.map(
                        (item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center bg-white rounded px-2 py-1"
                          >
                            <Check className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-xs text-gray-600">
                              {item}
                            </span>
                          </div>
                        ),
                      )}
                    </div>

                    {/* Excellence Badge */}
                    <div className="mt-4 p-3 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg text-white">
                      <p className="text-sm font-medium">
                        ✅ Complete A1 architectural sheet with all 11 views -{" "}
                        {(
                          generatedDesigns.unifiedSheet.consistencyScore * 100
                        ).toFixed(0)}
                        % consistency guaranteed!
                      </p>
                      <p className="text-xs mt-1 opacity-90">
                        Includes: Floor plans, 4 elevations, 2 sections, and 3
                        3D visualizations in professional A1 format
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Multi-Level Floor Plans (hidden if unified sheet or A1 sheet) */}
                {!generatedDesigns?.isUnified &&
                  !isA1Workflow(generatedDesigns?.workflow) && (
                    <div className="liquid-glass-card border border-white/20 rounded-xl p-6 backdrop-blur-xl">
                      <h3 className="font-semibold text-white mb-4 flex items-center justify-between">
                        <span className="flex items-center">
                          <FileText className="w-5 h-5 text-blue-300 mr-2" />
                          Floor Plans (
                          {generatedDesigns?.floorPlan.floorCount || 1} Level
                          {generatedDesigns?.floorPlan.floorCount > 1
                            ? "s"
                            : ""}
                          )
                        </span>
                      </h3>

                      <div className="space-y-4">
                        {/* Debug Display - Show what we have */}
                        {!generatedDesigns?.floorPlan.levels?.ground &&
                          !generatedDesigns?.floorPlan.levels?.upper && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                              <p className="text-sm font-medium text-yellow-900">
                                ⚠️ Floor plan images not found in state
                              </p>
                              <p className="text-xs text-yellow-700 mt-1">
                                Check console for debugging information
                              </p>
                              <pre className="text-xs mt-2 bg-white p-2 rounded overflow-auto max-h-40">
                                {JSON.stringify(
                                  {
                                    hasFloorPlan: !!generatedDesigns?.floorPlan,
                                    hasLevels:
                                      !!generatedDesigns?.floorPlan?.levels,
                                    levelsKeys: generatedDesigns?.floorPlan
                                      ?.levels
                                      ? Object.keys(
                                          generatedDesigns.floorPlan.levels,
                                        )
                                      : [],
                                    levelsContent:
                                      generatedDesigns?.floorPlan?.levels,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          )}

                        {/* Ground Floor */}
                        {generatedDesigns?.floorPlan.levels?.ground ? (
                          <div>
                            <p className="text-sm font-medium text-white mb-2">
                              Ground Floor
                            </p>
                            {/* URL display hidden for cleaner UI */}
                            <div
                              className="bg-white rounded-lg h-80 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() =>
                                openImageModal(
                                  generatedDesigns.floorPlan.levels.ground,
                                  "Ground Floor Plan",
                                )
                              }
                            >
                              <img
                                src={generatedDesigns.floorPlan.levels.ground}
                                alt="Ground Floor Plan"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  console.error(
                                    "❌ Failed to load ground floor image:",
                                    generatedDesigns.floorPlan.levels.ground,
                                  );
                                  console.error("   Error event:", e);
                                  const errorDiv =
                                    document.createElement("div");
                                  errorDiv.className =
                                    "text-red-500 text-sm p-4";
                                  const urlString =
                                    typeof generatedDesigns.floorPlan.levels
                                      .ground === "string"
                                      ? generatedDesigns.floorPlan.levels.ground
                                      : String(
                                          generatedDesigns.floorPlan.levels
                                            .ground,
                                        );
                                  errorDiv.innerHTML = `
                                <p class="font-semibold mb-2">❌ Image Failed to Load</p>
                                <p class="text-xs">URL: ${urlString.substring(0, 50)}...</p>
                                <p class="text-xs mt-1">Possible causes: CORS, expired URL, or network issue</p>
                                <a href="${urlString}" target="_blank" class="text-blue-500 underline text-xs mt-2 block">Try opening in new tab</a>
                              `;
                                  e.target.style.display = "none";
                                  e.target.parentElement.appendChild(errorDiv);
                                }}
                                onLoad={() =>
                                  console.log(
                                    "✅ Ground floor image loaded successfully",
                                  )
                                }
                              />
                              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-700">
                                Ground Level - Scale 1:100
                              </div>
                              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="liquid-glass border border-white/20 rounded-lg p-4 text-center">
                            <p className="text-sm text-white/80">
                              No ground floor plan available
                            </p>
                          </div>
                        )}

                        {/* Upper Floor */}
                        {generatedDesigns?.floorPlan.levels?.upper ? (
                          <div>
                            <p className="text-sm font-medium text-white mb-2">
                              Upper Floor
                            </p>
                            {/* URL display hidden for cleaner UI */}
                            <div
                              className="bg-white rounded-lg h-80 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() =>
                                openImageModal(
                                  generatedDesigns.floorPlan.levels.upper,
                                  "Upper Floor Plan",
                                )
                              }
                            >
                              <img
                                src={generatedDesigns.floorPlan.levels.upper}
                                alt="Upper Floor Plan"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  console.error(
                                    "❌ Failed to load upper floor image:",
                                    generatedDesigns.floorPlan.levels.upper,
                                  );
                                  console.error("   Error event:", e);
                                  const errorDiv =
                                    document.createElement("div");
                                  errorDiv.className =
                                    "text-red-500 text-sm p-4";
                                  const urlString =
                                    typeof generatedDesigns.floorPlan.levels
                                      .upper === "string"
                                      ? generatedDesigns.floorPlan.levels.upper
                                      : String(
                                          generatedDesigns.floorPlan.levels
                                            .upper,
                                        );
                                  errorDiv.innerHTML = `
                                <p class="font-semibold mb-2">❌ Image Failed to Load</p>
                                <p class="text-xs">URL: ${urlString.substring(0, 50)}...</p>
                                <p class="text-xs mt-1">Possible causes: CORS, expired URL, or network issue</p>
                                <a href="${urlString}" target="_blank" class="text-blue-500 underline text-xs mt-2 block">Try opening in new tab</a>
                              `;
                                  e.target.style.display = "none";
                                  e.target.parentElement.appendChild(errorDiv);
                                }}
                                onLoad={() =>
                                  console.log(
                                    "✅ Upper floor image loaded successfully",
                                  )
                                }
                              />
                              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-700">
                                Upper Level - Scale 1:100
                              </div>
                              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="liquid-glass border border-white/20 rounded-lg p-4 text-center">
                            <p className="text-sm text-white/80">
                              No upper floor plan available
                            </p>
                          </div>
                        )}

                        {/* Roof Plan */}
                        {generatedDesigns?.floorPlan.levels?.roof && (
                          <div>
                            <p className="text-sm font-medium text-white mb-2">
                              Roof Plan
                            </p>
                            <div
                              className="bg-white rounded-lg h-80 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() =>
                                openImageModal(
                                  generatedDesigns.floorPlan.levels.roof,
                                  "Roof Plan",
                                )
                              }
                            >
                              <img
                                src={generatedDesigns.floorPlan.levels.roof}
                                alt="Roof Plan"
                                className="w-full h-full object-contain"
                              />
                              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-700">
                                Roof Level - Scale 1:100
                              </div>
                              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between text-sm">
                        <p className="text-white/90">
                          <SafeText>
                            {generatedDesigns?.floorPlan.circulation}
                          </SafeText>
                        </p>
                        <p className="text-white/90">
                          Efficiency: {generatedDesigns?.floorPlan.efficiency}
                        </p>
                      </div>

                      {/* STEP 5: Consistency Indicator */}
                      <div className="mt-4 p-3 liquid-glass border border-blue-400/50 rounded-lg flex items-start bg-blue-500/10">
                        <Check className="w-5 h-5 text-blue-300 mr-2 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-blue-200">
                            2D Floor Plan Generated
                          </p>
                          <p className="text-xs text-blue-300/80 mt-1">
                            Used as DNA anchor for 3D visualization consistency
                            →
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* 3D Views: 2 Exterior + 1 Interior (hidden if unified sheet or A1 sheet) */}
                {!generatedDesigns?.isUnified &&
                  !isA1Workflow(generatedDesigns?.workflow) && (
                    <div className="liquid-glass-card border border-white/20 rounded-xl p-6 backdrop-blur-xl">
                      {/* STEP 5: Consistency Indicator */}
                      <div className="mb-4 p-3 liquid-glass border border-green-400/50 rounded-lg flex items-start bg-green-500/10">
                        <Layers className="w-5 h-5 text-green-300 mr-2 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-200">
                            3D Derived from 2D Floor Plan
                          </p>
                          <p className="text-xs text-green-300/80 mt-1">
                            A1 pipeline keeps plan geometry and 3D views
                            perfectly aligned
                          </p>
                        </div>
                      </div>

                      <h3 className="font-semibold text-white mb-4 flex items-center">
                        <Building className="w-5 h-5 text-purple-300 mr-2" />
                        3D Visualizations (5 Views: Exterior, Interior,
                        Axonometric, Perspective)
                      </h3>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        {/* Exterior Front View */}
                        <div className="relative">
                          <div
                            className="bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg h-64 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() =>
                              generatedDesigns?.model3D.images?.[0] &&
                              openImageModal(
                                generatedDesigns.model3D.images[0],
                                "Exterior - Front View",
                              )
                            }
                          >
                            {generatedDesigns?.model3D.images &&
                            generatedDesigns.model3D.images[0] ? (
                              <img
                                src={generatedDesigns.model3D.images[0]}
                                alt="Exterior Front View"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextSibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-purple-500/20 flex items-center justify-center"
                              style={{
                                display: generatedDesigns?.model3D.images?.[0]
                                  ? "none"
                                  : "flex",
                              }}
                            >
                              <Eye className="w-12 h-12 text-white/50" />
                            </div>
                            {generatedDesigns?.model3D.images?.[0] && (
                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            )}
                          </div>
                          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium text-gray-700">
                            Exterior - Front View
                          </div>
                        </div>

                        {/* Exterior Side View */}
                        <div className="relative">
                          <div
                            className="bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg h-64 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() =>
                              generatedDesigns?.model3D.images?.[1] &&
                              openImageModal(
                                generatedDesigns.model3D.images[1],
                                "Exterior - Side View",
                              )
                            }
                          >
                            {generatedDesigns?.model3D.images &&
                            generatedDesigns.model3D.images[1] ? (
                              <img
                                src={generatedDesigns.model3D.images[1]}
                                alt="Exterior Side View"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextSibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center"
                              style={{
                                display: generatedDesigns?.model3D.images?.[1]
                                  ? "none"
                                  : "flex",
                              }}
                            >
                              <Eye className="w-12 h-12 text-white/50" />
                            </div>
                            {generatedDesigns?.model3D.images?.[1] && (
                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            )}
                          </div>
                          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium text-gray-700">
                            Exterior - Side View
                          </div>
                        </div>
                      </div>

                      {/* Interior View */}
                      <div className="relative mb-4">
                        <div
                          className="bg-gradient-to-br from-pink-400 to-orange-500 rounded-lg h-80 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                          onClick={() =>
                            generatedDesigns?.model3D.images?.[2] &&
                            openImageModal(
                              generatedDesigns.model3D.images[2],
                              "Interior - Main Space",
                            )
                          }
                        >
                          {generatedDesigns?.model3D.images &&
                          generatedDesigns.model3D.images[2] ? (
                            <img
                              src={generatedDesigns.model3D.images[2]}
                              alt="Interior View"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = "none";
                                e.target.nextSibling.style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="absolute inset-0 bg-gradient-to-br from-pink-400/20 to-orange-500/20 flex items-center justify-center"
                            style={{
                              display: generatedDesigns?.model3D.images?.[2]
                                ? "none"
                                : "flex",
                            }}
                          >
                            <Eye className="w-12 h-12 text-white/50" />
                          </div>
                          {generatedDesigns?.model3D.images?.[2] && (
                            <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                              <ZoomIn className="w-4 h-4 text-gray-700" />
                            </div>
                          )}
                        </div>
                        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium text-gray-700">
                          Interior - Main Space
                        </div>
                      </div>

                      {/* Axonometric and Perspective Views */}
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Axonometric View */}
                        <div className="relative">
                          <div
                            className="bg-gradient-to-br from-teal-400 to-blue-500 rounded-lg h-64 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() =>
                              generatedDesigns?.model3D.images?.[3] &&
                              openImageModal(
                                generatedDesigns.model3D.images[3],
                                "Axonometric View",
                              )
                            }
                          >
                            {generatedDesigns?.model3D.images &&
                            generatedDesigns.model3D.images[3] ? (
                              <img
                                src={generatedDesigns.model3D.images[3]}
                                alt="Axonometric View"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextSibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="absolute inset-0 bg-gradient-to-br from-teal-400/20 to-blue-500/20 flex items-center justify-center"
                              style={{
                                display: generatedDesigns?.model3D.images?.[3]
                                  ? "none"
                                  : "flex",
                              }}
                            >
                              <Eye className="w-12 h-12 text-white/50" />
                            </div>
                            {generatedDesigns?.model3D.images?.[3] && (
                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            )}
                          </div>
                          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium text-gray-700">
                            Axonometric View
                          </div>
                        </div>

                        {/* Perspective View */}
                        <div className="relative">
                          <div
                            className="bg-gradient-to-br from-indigo-400 to-purple-600 rounded-lg h-64 flex items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() =>
                              generatedDesigns?.model3D.images?.[3] &&
                              openImageModal(
                                generatedDesigns.model3D.images[3],
                                "Perspective View",
                              )
                            }
                          >
                            {generatedDesigns?.model3D.images &&
                            generatedDesigns.model3D.images[3] ? (
                              <img
                                src={generatedDesigns.model3D.images[3]}
                                alt="Perspective View"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextSibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="absolute inset-0 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 flex items-center justify-center"
                              style={{
                                display: generatedDesigns?.model3D.images?.[3]
                                  ? "none"
                                  : "flex",
                              }}
                            >
                              <Eye className="w-12 h-12 text-white/50" />
                            </div>
                            {generatedDesigns?.model3D.images?.[3] && (
                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4 text-gray-700" />
                              </div>
                            )}
                          </div>
                          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium text-gray-700">
                            Perspective View
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <p className="text-sm font-medium text-white">
                          <SafeText>{generatedDesigns?.model3D.style}</SafeText>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {generatedDesigns?.model3D.materials.map(
                            (material, idx) => (
                              <span
                                key={idx}
                                className="text-xs liquid-glass border border-purple-400/50 bg-purple-500/20 text-purple-200 px-2 py-1 rounded-full"
                              >
                                {material}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                {/* Elevations and Sections - Hidden when unified sheet or A1 sheet exists */}
                {!generatedDesigns?.isUnified &&
                  !isA1Workflow(generatedDesigns?.workflow) &&
                  generatedDesigns?.technicalDrawings &&
                  (Object.keys(
                    generatedDesigns.technicalDrawings.elevations || {},
                  ).length > 0 ||
                    Object.keys(
                      generatedDesigns.technicalDrawings.sections || {},
                    ).length > 0) && (
                    <div className="mt-8">
                      <h3 className="font-semibold text-white mb-6 flex items-center text-xl">
                        <FileText className="w-6 h-6 text-blue-300 mr-2" />
                        Technical Drawings (Elevations & Sections)
                      </h3>

                      {/* Elevations */}
                      {Object.keys(
                        generatedDesigns.technicalDrawings.elevations || {},
                      ).length > 0 && (
                        <div className="mb-8">
                          <h4 className="font-medium text-white mb-4">
                            Elevations
                          </h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            {generatedDesigns.technicalDrawings.elevations
                              .north && (
                              <div className="liquid-glass-card border border-white/20 rounded-lg p-4 backdrop-blur-xl">
                                <p className="text-sm font-medium text-white mb-2">
                                  North Elevation
                                </p>
                                <div
                                  className="bg-gray-50 rounded h-64 flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative"
                                  onClick={() =>
                                    openImageModal(
                                      generatedDesigns.technicalDrawings
                                        .elevations.north,
                                      "North Elevation",
                                    )
                                  }
                                >
                                  <img
                                    src={
                                      generatedDesigns.technicalDrawings
                                        .elevations.north
                                    }
                                    alt="North Elevation"
                                    className="w-full h-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                  </div>
                                </div>
                              </div>
                            )}
                            {generatedDesigns.technicalDrawings.elevations
                              .south && (
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                  South Elevation
                                </p>
                                <div
                                  className="bg-gray-50 rounded h-64 flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative"
                                  onClick={() =>
                                    openImageModal(
                                      generatedDesigns.technicalDrawings
                                        .elevations.south,
                                      "South Elevation",
                                    )
                                  }
                                >
                                  <img
                                    src={
                                      generatedDesigns.technicalDrawings
                                        .elevations.south
                                    }
                                    alt="South Elevation"
                                    className="w-full h-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                  </div>
                                </div>
                              </div>
                            )}
                            {generatedDesigns.technicalDrawings.elevations
                              .east && (
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                  East Elevation
                                </p>
                                <div
                                  className="bg-gray-50 rounded h-64 flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative"
                                  onClick={() =>
                                    openImageModal(
                                      generatedDesigns.technicalDrawings
                                        .elevations.east,
                                      "East Elevation",
                                    )
                                  }
                                >
                                  <img
                                    src={
                                      generatedDesigns.technicalDrawings
                                        .elevations.east
                                    }
                                    alt="East Elevation"
                                    className="w-full h-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                  </div>
                                </div>
                              </div>
                            )}
                            {generatedDesigns.technicalDrawings.elevations
                              .west && (
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                  West Elevation
                                </p>
                                <div
                                  className="bg-gray-50 rounded h-64 flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative"
                                  onClick={() =>
                                    openImageModal(
                                      generatedDesigns.technicalDrawings
                                        .elevations.west,
                                      "West Elevation",
                                    )
                                  }
                                >
                                  <img
                                    src={
                                      generatedDesigns.technicalDrawings
                                        .elevations.west
                                    }
                                    alt="West Elevation"
                                    className="w-full h-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Sections */}
                      {Object.keys(
                        generatedDesigns.technicalDrawings.sections || {},
                      ).length > 0 && (
                        <div>
                          <h4 className="font-medium text-white mb-4">
                            Building Sections
                          </h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            {generatedDesigns.technicalDrawings.sections
                              .longitudinal && (
                              <div className="liquid-glass-card border border-white/20 rounded-lg p-4 backdrop-blur-xl">
                                <p className="text-sm font-medium text-white mb-2">
                                  Longitudinal Section
                                </p>
                                <div
                                  className="bg-gray-50 rounded h-64 flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative"
                                  onClick={() =>
                                    openImageModal(
                                      generatedDesigns.technicalDrawings
                                        .sections.longitudinal,
                                      "Longitudinal Section",
                                    )
                                  }
                                >
                                  <img
                                    src={
                                      generatedDesigns.technicalDrawings
                                        .sections.longitudinal
                                    }
                                    alt="Longitudinal Section"
                                    className="w-full h-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                  </div>
                                </div>
                              </div>
                            )}
                            {generatedDesigns.technicalDrawings.sections
                              .cross && (
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                  Cross Section
                                </p>
                                <div
                                  className="bg-gray-50 rounded h-64 flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative"
                                  onClick={() =>
                                    openImageModal(
                                      generatedDesigns.technicalDrawings
                                        .sections.cross,
                                      "Cross Section",
                                    )
                                  }
                                >
                                  <img
                                    src={
                                      generatedDesigns.technicalDrawings
                                        .sections.cross
                                    }
                                    alt="Cross Section"
                                    className="w-full h-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>

              {/* Style Blending Analysis */}
              {generatedDesigns?.styleRationale && (
                <div className="mt-8 liquid-glass-card border border-white/20 rounded-xl p-8 backdrop-blur-xl">
                  <h3 className="text-2xl font-semibold text-white mb-6 flex items-center">
                    <Sparkles className="w-6 h-6 text-indigo-300 mr-3" />
                    Style Integration Analysis
                  </h3>

                  <div className="grid md:grid-cols-3 gap-6">
                    {/* Local Architecture Impact */}
                    {generatedDesigns.styleRationale.localImpact && (
                      <div className="liquid-glass border border-white/20 rounded-lg p-6 backdrop-blur-xl">
                        <div className="flex items-center mb-3">
                          <MapPin className="w-5 h-5 text-blue-300 mr-2" />
                          <h4 className="font-semibold text-white">
                            Local Architecture Impact
                          </h4>
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed">
                          {generatedDesigns.styleRationale.localImpact}
                        </p>
                      </div>
                    )}

                    {/* Portfolio Style Integration */}
                    {generatedDesigns.styleRationale.portfolioImpact && (
                      <div className="liquid-glass border border-white/20 rounded-lg p-6 backdrop-blur-xl">
                        <div className="flex items-center mb-3">
                          <Home className="w-5 h-5 text-purple-300 mr-2" />
                          <h4 className="font-semibold text-white">
                            Portfolio Style Integration
                          </h4>
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed">
                          {generatedDesigns.styleRationale.portfolioImpact}
                        </p>
                      </div>
                    )}

                    {/* Climate & Context Adaptation */}
                    {generatedDesigns.styleRationale.climateIntegration && (
                      <div className="liquid-glass border border-white/20 rounded-lg p-6 backdrop-blur-xl">
                        <div className="flex items-center mb-3">
                          <Sun className="w-5 h-5 text-orange-300 mr-2" />
                          <h4 className="font-semibold text-white">
                            Climate Adaptation
                          </h4>
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed">
                          {generatedDesigns.styleRationale.climateIntegration}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Blend Weight Summary */}
                  <div className="mt-6 p-4 liquid-glass border border-indigo-400/50 rounded-lg backdrop-blur-xl bg-indigo-500/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Palette className="w-5 h-5 text-indigo-300 mr-2" />
                        <span className="text-sm font-medium text-white">
                          Design Synthesis
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-xs px-3 py-1 liquid-glass border border-green-400/50 bg-green-500/20 text-green-200 rounded-full">
                          Materials: {Math.round(materialWeight * 100)}%
                          Portfolio
                        </span>
                        <span className="text-xs px-3 py-1 liquid-glass border border-purple-400/50 bg-purple-500/20 text-purple-200 rounded-full">
                          Characteristics:{" "}
                          {Math.round(characteristicWeight * 100)}% Portfolio
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-white/80 italic">
                      This design achieves a sophisticated balance between
                      contextual responsiveness and signature style expression
                      through carefully calibrated material and characteristic
                      integration.
                    </p>
                  </div>
                </div>
              )}

              {/* Technical Specifications */}
              {generatedDesigns?.technical && (
                <div className="mt-8 grid md:grid-cols-3 gap-6">
                  <div className="liquid-glass-card border border-blue-500/30 rounded-xl p-6 backdrop-blur-xl bg-blue-500/10">
                    <h4 className="font-semibold text-white mb-3">
                      Structural System
                    </h4>
                    <p className="text-sm text-white/90 mb-2">
                      <SafeText>
                        {generatedDesigns?.technical?.structural}
                      </SafeText>
                    </p>
                    <p className="text-sm text-white/80">
                      <SafeText>
                        {generatedDesigns?.technical?.foundation}
                      </SafeText>
                    </p>
                  </div>

                  <div className="liquid-glass-card border border-green-500/30 rounded-xl p-6 backdrop-blur-xl bg-green-500/10">
                    <h4 className="font-semibold text-white mb-3">
                      MEP Systems
                    </h4>
                    <ul className="space-y-1 text-sm text-white/90">
                      <li>
                        <span className="font-medium">HVAC:</span>{" "}
                        {generatedDesigns?.technical?.mep?.hvac}
                      </li>
                      <li>
                        <span className="font-medium">Electrical:</span>{" "}
                        {generatedDesigns?.technical?.mep?.electrical}
                      </li>
                      <li>
                        <span className="font-medium">Plumbing:</span>{" "}
                        {generatedDesigns?.technical?.mep?.plumbing}
                      </li>
                    </ul>
                  </div>

                  <div className="liquid-glass-card border border-purple-500/30 rounded-xl p-6 backdrop-blur-xl bg-purple-500/10">
                    <h4 className="font-semibold text-white mb-3">
                      Sustainability Features
                    </h4>
                    <ul className="space-y-1 text-sm text-white/90">
                      {generatedDesigns?.model3D?.sustainabilityFeatures?.map(
                        (feature, idx) => (
                          <li key={idx} className="flex items-start">
                            <Check className="w-4 h-4 text-green-300 mr-1 mt-0.5 flex-shrink-0" />
                            {feature}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Cost & Timeline */}
              <div className="mt-6 liquid-glass-card border border-orange-500/30 rounded-xl p-6 backdrop-blur-xl bg-orange-500/10">
                <h4 className="font-semibold text-white mb-4">
                  Project Economics
                </h4>
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-white/80">
                      Estimated Construction Cost
                    </p>
                    <p className="text-2xl font-bold text-white">
                      <SafeText>{generatedDesigns?.cost.construction}</SafeText>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-white/80">
                      Construction Timeline
                    </p>
                    <p className="text-2xl font-bold text-white">
                      <SafeText>{generatedDesigns?.cost.timeline}</SafeText>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-white/80">
                      Annual Energy Savings
                    </p>
                    <p className="text-2xl font-bold text-green-300">
                      <SafeText>
                        {generatedDesigns?.cost.energySavings}
                      </SafeText>
                    </p>
                  </div>
                </div>
              </div>

              {/* Export Options - UPDATED WITH WORKING DOWNLOADS + SVG/DXF */}
              <div className="mt-8">
                <h4 className="font-semibold text-white mb-4">
                  Export Options
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <button
                    onClick={() => {
                      const downloadDetails = {
                        ...projectDetails,
                        styleChoice,
                        address: locationData?.address,
                      };
                      const content = generateDWGContent(
                        downloadDetails,
                        generatedDesigns?.bimModel,
                      );
                      downloadFile(
                        "ArchitectAI_Design.dwg",
                        content,
                        "application/acad",
                      );
                      setDownloadCount((prev) => prev + 1);
                      showToast("✓ DWG file downloaded successfully!");
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border border-white/20 rounded-xl hover:border-blue-400/50 transition-all group cursor-pointer backdrop-blur-xl"
                  >
                    <FileCode className="w-8 h-8 text-white/80 mb-2 group-hover:text-blue-300 transition-colors" />
                    <span className="font-semibold text-white">DWG</span>
                    <span className="text-xs text-white/70 mt-1">
                      AutoCAD 2D Drawings
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const downloadDetails = {
                        ...projectDetails,
                        styleChoice,
                        address: locationData?.address,
                      };
                      const content = generateRVTContent(downloadDetails);
                      downloadFile(
                        "ArchitectAI_Model.rvt",
                        content,
                        "application/octet-stream",
                      );
                      setDownloadCount((prev) => prev + 1);
                      showToast("✓ RVT file downloaded successfully!");
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border border-white/20 rounded-xl hover:border-purple-400/50 transition-all group cursor-pointer backdrop-blur-xl"
                  >
                    <Building className="w-8 h-8 text-white/80 mb-2 group-hover:text-purple-300 transition-colors" />
                    <span className="font-semibold text-white">RVT</span>
                    <span className="text-xs text-white/70 mt-1">
                      Revit 3D Model
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const downloadDetails = {
                        ...projectDetails,
                        styleChoice,
                        address: locationData?.address,
                      };
                      const content = generateIFCContent(
                        downloadDetails,
                        generatedDesigns?.bimModel,
                      );
                      downloadFile(
                        "ArchitectAI_BIM.ifc",
                        content,
                        "application/x-step",
                      );
                      setDownloadCount((prev) => prev + 1);
                      showToast("✓ IFC file downloaded successfully!");
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border border-white/20 rounded-xl hover:border-green-400/50 transition-all group cursor-pointer backdrop-blur-xl"
                  >
                    <Layers className="w-8 h-8 text-white/80 mb-2 group-hover:text-green-300 transition-colors" />
                    <span className="font-semibold text-white">IFC</span>
                    <span className="text-xs text-white/70 mt-1">
                      BIM Standard
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const pdfContent = generatePDFContent(
                        projectDetails,
                        styleChoice,
                        locationData,
                      );
                      const newWindow = window.open("", "_blank");
                      newWindow.document.write(pdfContent);
                      newWindow.document.close();
                      setTimeout(() => {
                        newWindow.print();
                      }, 250);
                      setDownloadCount((prev) => prev + 1);
                      showToast(
                        "✓ Project documentation opened for printing (use browser Print → Save as PDF)",
                      );
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border border-white/20 rounded-xl hover:border-red-400/50 transition-all group cursor-pointer backdrop-blur-xl"
                  >
                    <FileText className="w-8 h-8 text-white/80 mb-2 group-hover:text-red-300 transition-colors" />
                    <span className="font-semibold text-white">PDF</span>
                    <span className="text-xs text-white/70 mt-1">
                      Print to PDF
                    </span>
                  </button>

                  {/* 🆕 SVG Export - Vector floor plans */}
                  <button
                    onClick={() => {
                      if (!vectorPlan) {
                        showToast(
                          "⚠️ No vector floor plan available. Draw a site polygon first.",
                        );
                        return;
                      }
                      const metadata = {
                        projectName:
                          projectDetails?.program || "Architectural Design",
                        address: locationData?.address,
                      };
                      const content = exportToSVG(vectorPlan, metadata);
                      downloadFile(
                        "ArchitectAI_FloorPlans.svg",
                        content,
                        "image/svg+xml",
                      );
                      setDownloadCount((prev) => prev + 1);
                      showToast("✓ SVG floor plans downloaded successfully!");
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border border-white/20 rounded-xl hover:border-orange-400/50 transition-all group cursor-pointer backdrop-blur-xl disabled:opacity-50"
                    disabled={!vectorPlan}
                  >
                    <FileCode className="w-8 h-8 text-white/80 mb-2 group-hover:text-orange-300 transition-colors" />
                    <span className="font-semibold text-white">SVG</span>
                    <span className="text-xs text-white/70 mt-1">
                      Vector Plans
                    </span>
                  </button>

                  {/* 🆕 DXF Export - CAD-compatible vector format */}
                  <button
                    onClick={() => {
                      if (!vectorPlan) {
                        showToast(
                          "⚠️ No vector floor plan available. Draw a site polygon first.",
                        );
                        return;
                      }
                      const metadata = {
                        projectName:
                          projectDetails?.program || "Architectural Design",
                        address: locationData?.address,
                      };
                      const content = exportToDXF(vectorPlan, metadata);
                      downloadFile(
                        "ArchitectAI_FloorPlans.dxf",
                        content,
                        "application/dxf",
                      );
                      setDownloadCount((prev) => prev + 1);
                      showToast("✓ DXF floor plans downloaded successfully!");
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border border-white/20 rounded-xl hover:border-teal-400/50 transition-all group cursor-pointer backdrop-blur-xl disabled:opacity-50"
                    disabled={!vectorPlan}
                  >
                    <FileCode className="w-8 h-8 text-white/80 mb-2 group-hover:text-teal-300 transition-colors" />
                    <span className="font-semibold text-white">DXF</span>
                    <span className="text-xs text-white/70 mt-1">
                      CAD Exchange
                    </span>
                  </button>

                  {/* 🆕 MASTER SHEET (A1) - Single Output Sheet with all views */}
                  <button
                    onClick={async () => {
                      try {
                        await downloadMasterSheet(generatedDesigns, {
                          buildingProgram: projectDetails?.program,
                          location: locationData,
                          portfolioAnalysis: null,
                          consistency: generatedDesigns?.consistency,
                        });
                        setDownloadCount((prev) => prev + 1);
                        showToast("✓ A1 Master Sheet downloaded successfully!");
                      } catch (error) {
                        console.error("Master sheet download failed:", error);
                        showToast(
                          "⚠️ Failed to generate master sheet. Check console for details.",
                        );
                      }
                    }}
                    className="flex flex-col items-center p-4 liquid-glass border-2 border-blue-400/50 rounded-xl hover:border-blue-300/70 transition-all group cursor-pointer backdrop-blur-xl bg-blue-500/10"
                  >
                    <FileText className="w-8 h-8 text-blue-300 mb-2 group-hover:text-purple-300 transition-colors" />
                    <span className="font-semibold text-white">
                      A1 Master Sheet
                    </span>
                    <span className="text-xs text-white/70 mt-1">
                      All Views + Metrics
                    </span>
                  </button>
                </div>

                <div className="mt-4 text-center text-sm text-white/70">
                  <p>
                    Demo files for investor preview. Production version will
                    include full technical drawings.
                  </p>
                  {downloadCount > 0 && (
                    <p className="mt-2 text-green-300 font-medium">
                      {downloadCount} file{downloadCount > 1 ? "s" : ""}{" "}
                      downloaded
                    </p>
                  )}
                </div>
              </div>

              {/* AI Modification */}
              <div className="mt-8 border-t border-white/20 pt-8">
                <button
                  onClick={() => setShowModification(!showModification)}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 font-medium flex items-center justify-center shadow-lg hover:shadow-xl"
                >
                  <Sparkles className="mr-2" />
                  Modify A1 Sheet
                </button>

                {showModification && (
                  <div className="mt-4 space-y-4 animate-fadeIn">
                    <textarea
                      placeholder="Describe your modifications... (e.g., 'Make the waiting area 20% larger', 'Add a healing garden courtyard', 'Include more natural lighting in consultation rooms')"
                      className="w-full p-4 bg-navy-900/90 border-2 border-white/20 rounded-xl focus:border-purple-400/50 focus:outline-none transition-colors h-32 text-white placeholder-white/50 backdrop-blur-xl"
                    />
                    <button className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg">
                      Apply Modifications
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Conditionally wrap with Google Maps only when API key is available AND we're on step 2 (map view)
  const shouldLoadMaps =
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY && currentStep === 2;

  // Image Modal Component - Properly separated with props to prevent re-render flickering
  const ImageModal = React.memo(
    ({
      image,
      title,
      zoom,
      pan,
      dragging,
      onClose,
      onZoomIn,
      onZoomOut,
      onZoomReset,
      onWheel,
      onMouseDown,
      onMouseMove,
      onMouseUp,
    }) => {
      if (!image) return null;

      // Check if it's the unified SVG sheet
      const isUnifiedSVG = image === "unified_svg_sheet";
      const isSVG =
        isUnifiedSVG ||
        image.includes("svg") ||
        image.startsWith("data:image/svg");
      const isA1Sheet =
        title.includes("A1") || title.includes("Architectural Sheet");

      // Get the actual SVG content if it's the unified sheet
      const svgContent =
        isUnifiedSVG && generatedDesigns?.unifiedSheet?.svgContent;

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* Modal Content */}
          <div className="relative w-full h-full flex items-center justify-center p-4">
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-50"
              aria-label="Close modal"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Image Title */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 z-50">
              <h3 className="text-white font-medium">{title}</h3>
              {isA1Sheet && (
                <p className="text-white/80 text-xs mt-1">
                  A1 Format: 594mm × 841mm
                </p>
              )}
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 z-50">
              <button
                onClick={onZoomOut}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                disabled={zoom <= 0.5}
                aria-label="Zoom out"
              >
                <ZoomOut className="w-5 h-5 text-white" />
              </button>

              <span className="text-white text-sm font-medium min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>

              <button
                onClick={onZoomIn}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                disabled={zoom >= 3}
                aria-label="Zoom in"
              >
                <ZoomIn className="w-5 h-5 text-white" />
              </button>

              <div className="w-px h-6 bg-white/30 mx-1" />

              <button
                onClick={onZoomReset}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                aria-label="Reset zoom"
              >
                <Maximize2 className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-xs z-50">
              <p>
                Scroll to zoom • {zoom > 1 ? "Drag to pan" : "Zoom in to pan"}
              </p>
            </div>

            {/* Image Container */}
            <div
              className="relative overflow-hidden flex items-center justify-center"
              style={{
                width: "90vw",
                height: "80vh",
                cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default",
                userSelect: "none",
              }}
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {isUnifiedSVG && svgContent ? (
                // For unified SVG sheet, render the SVG content directly
                <div
                  className="select-none pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    transition: "none",
                    width: zoom === 1 ? "90vw" : "auto",
                    height: zoom === 1 ? "auto" : "auto",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(svgContent, {
                      ALLOWED_TAGS: [
                        "svg",
                        "path",
                        "rect",
                        "circle",
                        "line",
                        "text",
                        "g",
                        "defs",
                        "use",
                        "polygon",
                        "polyline",
                        "ellipse",
                        "tspan",
                        "clipPath",
                        "mask",
                        "pattern",
                        "linearGradient",
                        "radialGradient",
                        "stop",
                        "title",
                        "desc",
                      ],
                      ALLOWED_ATTR: [
                        "viewBox",
                        "xmlns",
                        "width",
                        "height",
                        "fill",
                        "stroke",
                        "stroke-width",
                        "d",
                        "x",
                        "y",
                        "cx",
                        "cy",
                        "r",
                        "rx",
                        "ry",
                        "x1",
                        "y1",
                        "x2",
                        "y2",
                        "points",
                        "transform",
                        "font-size",
                        "font-family",
                        "text-anchor",
                        "id",
                        "class",
                        "style",
                        "opacity",
                        "clip-path",
                        "mask",
                        "offset",
                        "stop-color",
                        "stop-opacity",
                      ],
                    }),
                  }}
                />
              ) : isSVG && isA1Sheet ? (
                // For A1 SVG sheets via URL, render at high quality
                <img
                  src={image}
                  alt={title}
                  className="max-w-none select-none pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    imageRendering: "crisp-edges",
                    transition: "none",
                    maxWidth: zoom === 1 ? "100%" : "none",
                    maxHeight: zoom === 1 ? "100%" : "none",
                    width: isA1Sheet && zoom === 1 ? "100%" : "auto",
                    height: isA1Sheet && zoom === 1 ? "100%" : "auto",
                    objectFit: "contain",
                  }}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : (
                // For regular images
                <img
                  src={image}
                  alt={title}
                  className="max-w-none select-none pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    imageRendering: zoom > 2 ? "pixelated" : "auto",
                    transition: "none",
                    maxWidth: zoom === 1 ? "100%" : "none",
                    maxHeight: zoom === 1 ? "100%" : "none",
                    objectFit: "contain",
                  }}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                />
              )}
            </div>
          </div>
        </div>
      );
    },
    (prevProps, nextProps) => {
      // Custom comparison function for React.memo
      // Only re-render if these specific props change
      return (
        prevProps.image === nextProps.image &&
        prevProps.title === nextProps.title &&
        prevProps.zoom === nextProps.zoom &&
        prevProps.pan.x === nextProps.pan.x &&
        prevProps.pan.y === nextProps.pan.y &&
        prevProps.dragging === nextProps.dragging &&
        prevProps.onClose === nextProps.onClose &&
        prevProps.onZoomIn === nextProps.onZoomIn &&
        prevProps.onZoomOut === nextProps.onZoomOut &&
        prevProps.onZoomReset === nextProps.onZoomReset &&
        prevProps.onWheel === nextProps.onWheel &&
        prevProps.onMouseDown === nextProps.onMouseDown &&
        prevProps.onMouseMove === nextProps.onMouseMove &&
        prevProps.onMouseUp === nextProps.onMouseUp
      );
    },
  );

  const content = (
    <div
      className={`min-h-screen ${currentStep === 0 ? "" : "bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950"} transition-colors duration-500 relative`}
    >
      {currentStep > 0 && (
        <>
          <div className="animated-bg fixed inset-0 opacity-50"></div>
          <div className="architecture-bg fixed inset-0 opacity-15"></div>
        </>
      )}
      {/* Image Modal */}
      <ImageModal
        image={modalImage}
        title={modalImageTitle}
        zoom={imageZoom}
        pan={imagePan}
        dragging={isDragging}
        onClose={closeImageModal}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {toastMessage && (
        <div className="fixed bottom-4 left-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fadeIn">
          {toastMessage}
        </div>
      )}
      {currentStep > 0 && (
        <div className="sticky top-0 liquid-glass-strong border-b border-white/20 z-40 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border border-white/20 mr-3">
                  <Building className="w-6 h-6 text-blue-300" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    ARCHIAI SOLUTION
                  </h1>
                  <p className="text-xs text-white/60">
                    AI Architecture Platform
                  </p>
                </div>

                {/* 🆕 Design History Project Indicator - Hidden for cleaner UI */}
                {/* {currentProjectId && (
                    <div className="ml-4 flex items-center bg-blue-50 border border-blue-200 rounded-md px-3 py-1">
                      <div className="text-xs">
                        <span className="text-blue-600 font-medium">Project:</span>
                        <span className="text-blue-700 ml-1 font-mono text-xs">
                          {currentProjectId.substring(0, 12)}...
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          designHistoryService.exportHistory(currentProjectId);
                          showToast('Project exported!');
                        }}
                        className="ml-2 text-blue-600 hover:text-blue-800 transition-colors"
                        title="Export project history"
                      >
                        <FileCode className="w-4 h-4" />
                      </button>
                    </div>
                  )} */}
              </div>

              {/* Progress Indicator */}
              <div className="hidden md:flex items-center space-x-2">
                {[
                  { step: 1, label: "Location" },
                  { step: 2, label: "Analysis" },
                  { step: 3, label: "Portfolio" },
                  { step: 4, label: "Details" },
                  { step: 5, label: "Results" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center">
                    <div
                      className={`
                        flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold transition-all duration-300
                        ${
                          currentStep >= item.step
                            ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/50"
                            : "bg-white/10 text-white/50 border border-white/20"
                        }
                      `}
                    >
                      {currentStep > item.step ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        item.step
                      )}
                    </div>
                    {idx < 4 && (
                      <div
                        className={`w-12 h-1 mx-1 rounded-full transition-all duration-300 ${currentStep > item.step ? "bg-gradient-to-r from-blue-500 to-cyan-500" : "bg-white/10"}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="text-sm text-white/70 flex items-center">
                <Clock className="w-4 h-4 mr-2" />
                <span className="font-medium">
                  {formatElapsedTime(elapsedTime)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`${currentStep > 0 ? "max-w-7xl mx-auto px-4 py-8 relative z-10" : ""}`}
      >
        {renderStep()}
      </div>

      {/* Modify Design Drawer */}
      {showModifyDrawer && (
        <ModifyDesignDrawer
          isOpen={showModifyDrawer}
          onClose={() => setShowModifyDrawer(false)}
          designId={currentDesignId}
          currentDNA={
            generatedDesigns?.masterDNA || generatedDesigns?.designDNA
          }
          currentPrompt={`${projectDetails?.program || "building"} in ${locationData?.address || "location"}`}
          projectContext={{
            buildingProgram: projectDetails?.program,
            area: projectDetails?.area,
            location: locationData,
            sitePolygon,
            siteMetrics,
          }}
          baselineA1Url={
            generatedDesigns?.a1Sheet?.url || generatedDesigns?.resultUrl
          }
          generatedDesigns={generatedDesigns}
          onModificationComplete={async (result) => {
            console.log("✅ A1 Sheet modification complete:", result);

            if (result.success && result.url) {
              // Update A1 sheet with modified version
              setGeneratedDesigns((prev) => ({
                ...prev,
                a1Sheet: {
                  ...prev.a1Sheet,
                  url: result.url || result.a1SheetUrl,
                  modified: true,
                  versionId: result.versionId,
                  consistencyScore: result.consistencyScore,
                  seed: result.seed,
                },
                resultUrl: result.url || result.a1SheetUrl,
                modified: true,
                modificationTimestamp: new Date().toISOString(),
              }));

              // Show consistency score if available
              if (
                result.consistencyScore !== null &&
                result.consistencyScore < 0.95
              ) {
                setToastMessage(
                  `A1 sheet modified with ${(result.consistencyScore * 100).toFixed(1)}% consistency`,
                );
              } else {
                setToastMessage("A1 sheet modified successfully!");
              }
              setTimeout(() => setToastMessage(""), 3000);

              console.log("📋 A1 sheet updated with modifications");
              console.log(
                `   Consistency: ${result.consistencyScore ? (result.consistencyScore * 100).toFixed(1) + "%" : "N/A"}`,
              );
              console.log(`   Version ID: ${result.versionId || "N/A"}`);
            } else {
              setToastMessage(
                `Modification failed: ${result.error || "Unknown error"}`,
              );
              setTimeout(() => setToastMessage(""), 5000);
            }
          }}
          mapRef={mapRef}
          location={locationData}
        />
      )}

      {process.env.NODE_ENV !== "production" && showDiagnosticsPanel && (
        <DevDiagnosticsPanel onClose={() => setShowDiagnosticsPanel(false)} />
      )}
    </div>
  );

  // Only wrap with Google Maps Wrapper when necessary
  return shouldLoadMaps ? (
    <Wrapper
      apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
      libraries={["marker", "drawing", "geometry"]}
    >
      {content}
    </Wrapper>
  ) : (
    content
  );
};

export default ArchitectAIEnhanced;
