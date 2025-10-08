/**
 * Debug Service to help diagnose production issues
 */

class DebugService {
  constructor() {
    this.logs = [];
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  log(category, message, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      category,
      message,
      data,
      isProduction: this.isProduction
    };

    this.logs.push(entry);

    // Always log to console
    console.log(`[${category}] ${message}`, data || '');

    return entry;
  }

  getEnvironmentInfo() {
    return {
      NODE_ENV: process.env.NODE_ENV,
      REACT_APP_REPLICATE_API_KEY: process.env.REACT_APP_REPLICATE_API_KEY ? 'SET' : 'NOT_SET',
      REACT_APP_OPENAI_API_KEY: process.env.REACT_APP_OPENAI_API_KEY ? 'SET' : 'NOT_SET',
      REACT_APP_GOOGLE_MAPS_API_KEY: process.env.REACT_APP_GOOGLE_MAPS_API_KEY ? 'SET' : 'NOT_SET',
      REACT_APP_OPENWEATHER_API_KEY: process.env.REACT_APP_OPENWEATHER_API_KEY ? 'SET' : 'NOT_SET',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      isLocalhost: window.location.hostname === 'localhost',
      userAgent: navigator.userAgent
    };
  }

  async testReplicateAPI() {
    const apiUrl = this.isProduction
      ? '/api/replicate-predictions'
      : 'http://localhost:3001/api/replicate/predictions';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          input: {
            prompt: "Test image generation",
            width: 512,
            height: 512,
            num_inference_steps: 10
          }
        })
      });

      const data = await response.json();

      return {
        success: response.ok,
        status: response.status,
        data,
        url: apiUrl
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: apiUrl
      };
    }
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }

  exportDebugInfo() {
    return {
      environment: this.getEnvironmentInfo(),
      logs: this.getLogs(),
      timestamp: new Date().toISOString()
    };
  }
}

export default new DebugService();