/**
 * Express server to proxy API calls to OpenAI and Replicate
 * This avoids CORS issues when calling from the browser during local development
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory project storage (replace with database in production)
const projects = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    openai: !!(process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY),
    replicate: !!(process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY)
  });
});

// OpenAI proxy endpoint
app.post('/api/openai/chat', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;

    if (!apiKey) {
      console.error('❌ OpenAI API key not found in environment');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Debug: Show masked API key format
    console.log(`🔑 Using OpenAI API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} (length: ${apiKey.length})`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ OpenAI API returned ${response.status}:`, JSON.stringify(data, null, 2));
      return res.status(response.status).json(data);
    }

    console.log('✅ OpenAI API call successful');
    res.json(data);
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Replicate proxy endpoint - create prediction
app.post('/api/replicate/predictions', async (req, res) => {
  try {
    const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Replicate API key not configured' });
    }

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Replicate proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Replicate proxy endpoint - get prediction status
app.get('/api/replicate/predictions/:id', async (req, res) => {
  try {
    const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Replicate API key not configured' });
    }

    const response = await fetch(`https://api.replicate.com/v1/predictions/${req.params.id}`, {
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Replicate status proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Replicate proxy endpoint - cancel prediction
app.post('/api/replicate/predictions/:id/cancel', async (req, res) => {
  try {
    const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Replicate API key not configured' });
    }

    const response = await fetch(`https://api.replicate.com/v1/predictions/${req.params.id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Replicate cancel proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================
// PROJECT API ROUTES
// ===================

// Create new project
app.post('/api/projects', async (req, res) => {
  try {
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const project = {
      id: projectId,
      ...req.body,
      status: 'created',
      createdAt: new Date().toISOString(),
      mds: null,
      layout: null,
      images: {},
      versions: []
    };

    projects.set(projectId, project);
    console.log(`✅ Project created: ${projectId}`);

    res.json({ success: true, projectId, project });
  } catch (error) {
    console.error('Project creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get project by ID
app.get('/api/projects/:id', (req, res) => {
  const project = projects.get(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

// Generate project (create MDS and trigger generation)
app.post('/api/projects/:id/generate', async (req, res) => {
  try {
    const project = projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // For now, return mock MDS (will integrate with reasoningService)
    const mds = {
      site: {
        latitude: project.location?.lat || 37.7749,
        longitude: project.location?.lng || -122.4194,
        orientation: 0,
        address: project.address || 'San Francisco, CA',
        polygon: project.sitePolygon || []
      },
      climate: {
        type: 'temperate',
        summary: 'Mediterranean climate'
      },
      dimensions: {
        floors: project.floors || 2,
        grossArea: project.area || 200,
        footprint: (project.area || 200) / (project.floors || 2),
        height: (project.floors || 2) * 3,
        floorHeight: 3
      },
      entry: {
        side: project.entryDirection || 'north',
        position: 'centered'
      },
      style: {
        tags: ['contemporary'],
        primary: 'contemporary'
      },
      materials: {
        primary: 'concrete',
        secondary: 'glass',
        facade: 'glass',
        roof: 'membrane',
        structure: 'steel'
      },
      program: [
        { name: 'Main Space', area: project.area * 0.6 || 120 },
        { name: 'Secondary Spaces', area: project.area * 0.4 || 80 }
      ],
      blendedStyle: {
        localPercentage: 50,
        portfolioPercentage: 50,
        description: 'Balanced contemporary design'
      },
      seeds: {
        master: Math.floor(Math.random() * 1000000)
      },
      metadata: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        projectId: project.id
      }
    };

    // Mock images for now
    const mockImages = {
      floorPlan: 'https://placehold.co/1024x1024/4A90E2/FFFFFF?text=Floor+Plan',
      elevation: 'https://placehold.co/1024x768/7ED321/FFFFFF?text=Elevation',
      axonometric: 'https://placehold.co/1024x768/9013FE/FFFFFF?text=Axonometric'
    };

    // Update project
    project.mds = mds;
    project.images = mockImages;
    project.status = 'generated';
    project.generatedAt = new Date().toISOString();

    projects.set(project.id, project);

    console.log(`✅ Project generated: ${project.id}`);
    res.json({
      success: true,
      mds,
      images: mockImages,
      projectId: project.id
    });
  } catch (error) {
    console.error('Project generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Modify project with text
app.post('/api/projects/:id/modify', async (req, res) => {
  try {
    const project = projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Modification text is required' });
    }

    // Save current version
    project.versions.push({
      version: project.mds?.metadata?.version || '1.0.0',
      mds: JSON.parse(JSON.stringify(project.mds)),
      timestamp: new Date().toISOString()
    });

    // Mock delta for now
    const delta = {
      dimensions: text.includes('taller') ? { floors: (project.mds?.dimensions?.floors || 2) + 1 } : null,
      materials: text.includes('brick') ? { primary: 'brick' } : null
    };

    // Apply delta to MDS
    if (project.mds) {
      if (delta.dimensions) {
        Object.assign(project.mds.dimensions, delta.dimensions);
      }
      if (delta.materials) {
        Object.assign(project.mds.materials, delta.materials);
      }
      project.mds.metadata.version = incrementVersion(project.mds.metadata.version);
      project.mds.metadata.timestamp = new Date().toISOString();
    }

    project.lastModified = new Date().toISOString();
    projects.set(project.id, project);

    console.log(`✅ Project modified: ${project.id} - "${text}"`);
    res.json({
      success: true,
      mds: project.mds,
      delta,
      projectId: project.id
    });
  } catch (error) {
    console.error('Project modification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to increment version
function incrementVersion(version) {
  const parts = version.split('.');
  parts[2] = String(parseInt(parts[2]) + 1);
  return parts.join('.');
}

app.listen(PORT, () => {
  console.log(`🔌 API Proxy Server running on http://localhost:${PORT}`);
  console.log(`🔑 OpenAI API Key: ${(process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY) ? 'Configured' : 'Missing'}`);
  console.log(`🔑 Replicate API Key: ${(process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY) ? 'Configured' : 'Missing'}`);
});

