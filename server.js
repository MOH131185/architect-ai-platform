/**
 * Express server to proxy API calls to OpenAI and Replicate
 * This avoids CORS issues when calling from the browser
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

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
      return res.status(response.status).json(data);
    }

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

app.listen(PORT, () => {
  console.log(`🚀 API Proxy Server running on http://localhost:${PORT}`);
  console.log(`✅ OpenAI API Key: ${(process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY) ? 'Configured' : 'Missing'}`);
  console.log(`✅ Replicate API Key: ${(process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY) ? 'Configured' : 'Missing'}`);
});
