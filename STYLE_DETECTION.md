# Local Architecture Style Detection Service

## Overview

The Style Detection Service (`styleDetectionService.js`) uses Google Street View/Satellite imagery combined with deep-learning models (Mask R-CNN / Faster R-CNN) to automatically detect local architectural styles, building footprints, and design elements. This data is cross-referenced with the `globalArchitecturalDatabase` to provide context-sensitive design recommendations.

## Research Foundation

This implementation is based on research demonstrating that deep-learning models can identify architectural styles and segment building footprints with high precision:

- **Source 1**: "Building Footprint Extraction from High-Resolution Satellite Imagery Using Deep Learning" (MDPI) - Demonstrates Mask R-CNN achieving 92%+ accuracy in building footprint extraction
- **Source 2**: "Architectural Style Classification using Deep Learning" (MDPI) - Shows CNNs can classify architectural styles with 85-95% accuracy

## Workflow Architecture

### Step 2.1: Download Representative Imagery

**Google Street View API**:
- 4 cardinal directions (N, E, S, W) from site location
- 640×640 resolution (high quality)
- 90° field of view
- Metadata check to confirm Street View availability

**Google Static Maps API (Satellite)**:
- Zoom level 19 (maximum detail for building footprints)
- 640×640 resolution
- Satellite imagery type

**Context Imagery**:
- Street View from 4 nearby locations (50m radius: N, E, S, W)
- Captures surrounding architectural context

### Step 2.2: Apply Deep-Learning Models

**ML Endpoint** (configurable via `REACT_APP_ML_ENDPOINT`):
- **Primary model**: Mask R-CNN or Faster R-CNN
- **Tasks**:
  1. **Style Classification**: Detect architectural style (Modern, Victorian, Art Deco, etc.)
  2. **Building Footprint Detection**: Segment buildings and extract footprint polygons
  3. **Material Recognition**: Identify materials (brick, concrete, glass, wood, stone)
  4. **Design Element Extraction**: Detect features (columns, arches, balconies, etc.)

**Fallback** (when ML endpoint unavailable):
- Rule-based analysis using location data
- Query `globalArchitecturalDatabase` for regional styles
- Confidence reduced but workflow continues

### Step 2.3: Cross-Reference with Global Architectural Database

- Match detected styles with database entries for the location
- Combine ML-detected materials with database materials
- Generate style blending recommendations:
  1. **Local Style Adaptation**: Use predominant local style as primary language
  2. **Hybrid Approach**: Blend local + contemporary for innovation
  3. **Contemporary Interpretation**: Modern design with local materials/proportions

## API Structure

### Main Method: `detectLocalArchitectureStyle(location)`

**Input**:
```javascript
{
  coordinates: { lat: 37.7749, lng: -122.4194 },
  addressComponents: {
    locality: "San Francisco",
    adminAreaLevel1: "California",
    country: "United States",
    // ... full address components
  }
}
```

**Output**:
```javascript
{
  success: true,
  imagery: {
    streetView: [
      {
        url: "https://maps.googleapis.com/maps/api/streetview?...",
        heading: 0,
        direction: "North",
        available: true,
        panoId: "abc123..."
      },
      // ... 3 more directions
    ],
    satellite: {
      url: "https://maps.googleapis.com/maps/api/staticmap?...",
      zoom: 19,
      mapType: "satellite",
      available: true
    },
    context: [
      // 4 nearby location images
    ]
  },
  mlAnalysis: {
    detectedStyles: [
      {
        style: "Victorian",
        confidence: 0.87,
        source: "deep-learning-model"
      },
      {
        style: "Italianate",
        confidence: 0.65,
        source: "deep-learning-model"
      }
    ],
    buildingFootprints: [
      {
        area: 250.5,  // square meters
        shape: "rectangular",
        dimensions: { width: 15, depth: 17 },
        confidence: 0.92
      }
    ],
    materials: ["Brick", "Wood siding", "Bay windows", "Gabled roof"],
    designElements: ["Ornate cornices", "Bay windows", "Vertical proportions", "Decorative trim"],
    source: "deep-learning-model",
    modelType: "Mask R-CNN",
    timestamp: "2025-10-06T..."
  },
  styleProfile: {
    primaryLocalStyles: ["Victorian", "Italianate"],
    secondaryLocalStyles: ["Edwardian", "Arts and Crafts"],
    materials: ["Brick", "Wood siding", "Stucco", "Bay windows", "Decorative trim"],
    designElements: ["Ornate cornices", "Bay windows", "Vertical proportions", "Gabled roofs", "Front porches"],
    buildingFootprints: [
      {
        area: 250.5,
        shape: "rectangular",
        confidence: 0.92
      }
    ],
    styleBlendingRecommendations: [
      {
        strategy: "Local Style Adaptation",
        primaryStyle: "Victorian",
        description: "Adopt Victorian as primary architectural language to harmonize with local context",
        materials: ["Brick", "Wood siding", "Stucco"],
        confidence: "High"
      },
      {
        strategy: "Hybrid Approach",
        styles: ["Victorian", "Edwardian"],
        description: "Blend Victorian massing with Edwardian detailing for contextual innovation",
        materials: ["Brick", "Wood siding", "Stucco", "Bay windows", "Decorative trim"],
        confidence: "Medium"
      },
      {
        strategy: "Contemporary Interpretation",
        description: "Use local materials and proportions in a contemporary design vocabulary",
        materials: ["Brick", "Wood", "Glass", "Metal"],
        note: "Balances innovation with contextual sensitivity",
        confidence: "Medium-High"
      }
    ],
    confidence: {
      overall: "87%",
      styleDetection: "High",
      databaseMatch: "High",
      note: "ML-enhanced detection"
    }
  },
  timestamp: "2025-10-06T...",
  source: "deep-learning-style-detection"
}
```

## Google APIs Used

### 1. Street View Static API

**Endpoint**:
```
GET https://maps.googleapis.com/maps/api/streetview?size={size}&location={lat},{lng}&heading={heading}&pitch={pitch}&fov={fov}&key={API_KEY}
```

**Parameters**:
- `size`: Image dimensions (640x640)
- `location`: Latitude, longitude
- `heading`: Compass direction (0=North, 90=East, 180=South, 270=West)
- `pitch`: Vertical angle (0=horizontal, -90=down, 90=up)
- `fov`: Field of view (90° for standard view)
- `key`: Google Maps API key

**Metadata Check** (confirms Street View availability):
```
GET https://maps.googleapis.com/maps/api/streetview/metadata?location={lat},{lng}&key={API_KEY}
```

**Response**:
```javascript
{
  status: "OK",  // or "ZERO_RESULTS"
  pano_id: "abc123...",
  location: { lat: 37.7749, lng: -122.4194 },
  date: "2023-06",
  copyright: "© 2023 Google"
}
```

### 2. Static Maps API (Satellite)

**Endpoint**:
```
GET https://maps.googleapis.com/maps/api/staticmap?center={lat},{lng}&zoom={zoom}&size={size}&maptype=satellite&key={API_KEY}
```

**Parameters**:
- `center`: Center point latitude, longitude
- `zoom`: Zoom level (19 = maximum detail for buildings)
- `size`: Image dimensions (640x640)
- `maptype`: "satellite" for aerial imagery
- `key`: Google Maps API key

## Deep Learning ML Endpoint

### Configuration

Set the ML endpoint URL in `.env`:
```
REACT_APP_ML_ENDPOINT=https://your-ml-service.com/api/v1/detect
```

If not configured, service falls back to rule-based analysis.

### Expected ML Endpoint API

**Request**:
```json
POST /api/v1/detect
Content-Type: application/json

{
  "images": [
    {
      "url": "https://maps.googleapis.com/maps/api/streetview?...",
      "type": "street_view",
      "direction": "North"
    },
    {
      "url": "https://maps.googleapis.com/maps/api/staticmap?...",
      "type": "satellite",
      "zoom": 19
    }
  ],
  "tasks": ["style_classification", "building_footprint_detection"],
  "location": { "lat": 37.7749, "lng": -122.4194 }
}
```

**Response**:
```json
{
  "styles": [
    {
      "style": "Victorian",
      "confidence": 0.87
    },
    {
      "style": "Italianate",
      "confidence": 0.65
    }
  ],
  "footprints": [
    {
      "area": 250.5,
      "shape": "rectangular",
      "dimensions": { "width": 15, "depth": 17 },
      "polygon": [[x1,y1], [x2,y2], ...],
      "confidence": 0.92
    }
  ],
  "materials": ["Brick", "Wood siding", "Bay windows"],
  "design_elements": ["Ornate cornices", "Bay windows", "Vertical proportions"],
  "confidence": {
    "overall": 0.87
  },
  "model_type": "Mask R-CNN",
  "processing_time_ms": 1250
}
```

## ML Model Implementation Options

### Option 1: Cloud-Based ML Service (Recommended for Production)

**Providers**:
1. **Google Cloud Vision API**: Pre-trained models, easy integration
2. **AWS Rekognition Custom Labels**: Train custom architectural style classifier
3. **Azure Custom Vision**: Upload architectural style training data
4. **Roboflow Hosted Inference**: Deploy Mask R-CNN models with API

**Advantages**:
- No infrastructure management
- Auto-scaling
- Low latency (global edge deployment)
- Pay-per-use pricing

**Cost Estimates**:
- Google Vision API: $1.50 per 1,000 images
- AWS Rekognition: $1.00 per 1,000 images (custom model)
- **Per complete design**: ~$0.01-$0.02 (8-10 images analyzed)

### Option 2: Self-Hosted ML Endpoint

**Stack**:
- **Model**: Detectron2 (Facebook AI) with Mask R-CNN
- **Framework**: PyTorch or TensorFlow
- **Web server**: Flask or FastAPI
- **Deployment**: Docker container on AWS EC2, Google Cloud Run, or Azure Container Instances

**Training Data**:
- Curate architectural style dataset (10,000+ images across 20-30 styles)
- Use transfer learning from COCO-pretrained Mask R-CNN
- Fine-tune on architectural images

**Sample Code** (Flask + Detectron2):
```python
from flask import Flask, request, jsonify
from detectron2.engine import DefaultPredictor
from detectron2.config import get_cfg
import cv2
import numpy as np

app = Flask(__name__)

# Load pretrained model
cfg = get_cfg()
cfg.merge_from_file("path/to/config.yaml")
cfg.MODEL.WEIGHTS = "path/to/model_final.pth"
predictor = DefaultPredictor(cfg)

@app.route('/api/v1/detect', methods=['POST'])
def detect():
    data = request.json
    images = data['images']

    results = {
        'styles': [],
        'footprints': [],
        'materials': [],
        'design_elements': []
    }

    for img_data in images:
        # Download image from URL
        img = download_image(img_data['url'])

        # Run detection
        outputs = predictor(img)

        # Extract style classification
        styles = extract_styles(outputs)
        results['styles'].extend(styles)

        # Extract building footprints
        footprints = extract_footprints(outputs)
        results['footprints'].extend(footprints)

    return jsonify(results)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Option 3: Fallback Rule-Based Analysis (Built-in)

When ML endpoint is unavailable, the service uses rule-based analysis:
- Queries `globalArchitecturalDatabase` for regional styles
- Infers likely materials based on location
- Provides lower-confidence recommendations
- Workflow continues without interruption

## Integration with aiIntegrationService

The style detection is now integrated into the main AI workflow at **Step 1.5**:

```javascript
// Step 1: Site context analysis (location + climate)
const siteAnalysis = await this.analyzeSiteContext(projectContext);

// Step 1.5: Local architecture style detection
const styleDetection = await this.detectLocalStyles(siteAnalysis);
siteAnalysis.styleDetection = styleDetection;

// Detected styles now available for:
// - Material selection (align with local materials)
// - Design reasoning (reference local architectural character)
// - SDXL prompt generation (incorporate local style elements)
```

**Data Flow**:
```
styleDetection.primaryLocalStyles → Material selection
styleDetection.materials → Design reasoning
styleDetection.designElements → SDXL prompts
styleDetection.styleBlendingRecommendations → Feasibility analysis
```

## API Costs

### Google Maps Platform

**Street View Static API**:
- Free tier: $200/month credit (~1,333 requests)
- Cost: $0.007 per request (after free tier)
- Per complete design: 8-10 Street View images = $0.056-$0.070

**Static Maps API**:
- Free tier: $200/month credit (~5,000 requests)
- Cost: $0.002 per request (after free tier)
- Per complete design: 1 satellite image = $0.002

**Total imagery cost per design**: ~$0.058-$0.072

### ML Endpoint

**Cloud-based** (Google Vision, AWS, Azure):
- Cost: ~$0.01-$0.02 per design (8-10 images)

**Self-hosted**:
- Infrastructure: ~$50-$200/month (AWS EC2 t3.medium with GPU)
- Variable cost: ~$0.001-$0.005 per design (compute only)

### Combined Total Cost per Complete Design

With style detection enabled:
- Enhanced location service: $0.006
- Style detection (imagery): $0.058-$0.072
- Style detection (ML): $0.01-$0.02 (cloud) or $0.001-$0.005 (self-hosted)
- **Subtotal site analysis**: ~$0.074-$0.098
- OpenAI GPT-4: $0.20-$0.40
- Replicate SDXL: $1.20-$2.40
- **Grand total**: ~$1.47-$2.90 per complete design

## Performance Estimates

- **Imagery download**: ~2-4 seconds (8-10 API calls)
- **ML inference** (cloud): ~1-3 seconds
- **ML inference** (self-hosted GPU): ~0.5-2 seconds
- **Cross-referencing**: <0.1 seconds
- **Total style detection**: ~3-7 seconds

## Error Handling

### Street View Not Available
- Service attempts all 4 directions
- If none available, uses satellite imagery only
- Reduces style detection confidence but continues

### ML Endpoint Failure
- Automatically falls back to rule-based analysis
- Logs warning but doesn't crash workflow
- User sees note: "ML-enhanced detection unavailable"

### API Quota Exceeded
- Returns cached results if available
- Falls back to database-only analysis
- Graceful degradation maintains functionality

## Example Usage

### Basic Usage
```javascript
import styleDetectionService from './services/styleDetectionService';

const location = {
  coordinates: { lat: 37.7749, lng: -122.4194 },
  addressComponents: {
    locality: "San Francisco",
    adminAreaLevel1: "California",
    country: "United States"
  }
};

const result = await styleDetectionService.detectLocalArchitectureStyle(location);

console.log('Detected styles:', result.styleProfile.primaryLocalStyles);
console.log('Materials:', result.styleProfile.materials);
console.log('Confidence:', result.styleProfile.confidence.overall);
```

### Full Workflow Integration
```javascript
import aiIntegrationService from './services/aiIntegrationService';

const projectContext = {
  location: {
    address: "123 Main St, San Francisco, CA"
  },
  buildingType: "residential-detached",
  siteArea: 500
};

const completeDesign = await aiIntegrationService.generateCompleteDesign(projectContext);

console.log('Site analysis:', completeDesign.siteAnalysis);
console.log('Local styles:', completeDesign.styleDetection.primaryLocalStyles);
console.log('Blending recommendations:', completeDesign.styleDetection.styleBlendingRecommendations);
```

## Future Enhancements

1. **3D Building Reconstruction**: Use photogrammetry to generate 3D models from Street View
2. **Historical Imagery Analysis**: Track architectural changes over time using Google's historical Street View
3. **Neighborhood-Level Analysis**: Analyze entire neighborhoods for comprehensive style profiling
4. **Facade Material Classification**: Train specialized model for material identification (brick, wood, concrete, glass, metal)
5. **Ornament Detection**: Fine-grained detection of architectural ornaments (cornices, moldings, capitals)
6. **Style Transfer**: Apply detected local styles to generated designs using neural style transfer

## ML Model Training Guide

### Dataset Preparation

**Required Images**: 10,000+ architectural images across 20-30 styles

**Style Categories** (example):
- Modern: Contemporary, Minimalist, Brutalist, High-Tech
- Classical: Greek Revival, Roman, Neoclassical, Beaux-Arts
- Medieval: Gothic, Romanesque, Byzantine
- Renaissance: Italian Renaissance, French Renaissance, Spanish Renaissance
- Historic American: Colonial, Georgian, Federal, Victorian, Italianate, Queen Anne
- 20th Century: Art Nouveau, Art Deco, Bauhaus, International, Postmodern
- Regional: Adobe, Prairie, Craftsman, Pueblo Revival, Spanish Mission

**Labeling**:
- Use Label Studio or CVAT for image annotation
- Label styles, materials, and building footprints (polygon masks)
- Minimum 500 images per style category

### Training with Detectron2

**Setup**:
```bash
pip install detectron2
pip install torch torchvision
```

**Training Script**:
```python
from detectron2.engine import DefaultTrainer
from detectron2.config import get_cfg
from detectron2 import model_zoo

cfg = get_cfg()
cfg.merge_from_file(model_zoo.get_config_file("COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"))
cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url("COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml")  # Transfer learning
cfg.DATASETS.TRAIN = ("architectural_styles_train",)
cfg.DATASETS.TEST = ("architectural_styles_val",)
cfg.DATALOADER.NUM_WORKERS = 4
cfg.SOLVER.IMS_PER_BATCH = 2
cfg.SOLVER.BASE_LR = 0.00025
cfg.SOLVER.MAX_ITER = 10000
cfg.MODEL.ROI_HEADS.NUM_CLASSES = 30  # 30 architectural styles

trainer = DefaultTrainer(cfg)
trainer.resume_or_load(resume=False)
trainer.train()
```

**Deployment**:
- Export model to ONNX for faster inference
- Deploy on AWS Lambda (serverless) or EC2 (dedicated)
- Use TorchServe for production-grade serving

---

**Status**: ✅ Production-ready (with fallback)
**ML Endpoint**: Optional (falls back to rule-based)
**Version**: 1.0.0
**Last Updated**: 2025-10-06
