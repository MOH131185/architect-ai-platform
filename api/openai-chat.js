/**
 * Vercel Serverless Function - OpenAI Chat Proxy
 * Handles OpenAI API requests securely from the frontend
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";

export default async function handler(req, res) {
  // CORS
  if (
    handlePreflight(req, res, {
      methods: "GET, OPTIONS, PATCH, DELETE, POST, PUT",
    })
  )
    return;
  setCorsHeaders(req, res, {
    methods: "GET, OPTIONS, PATCH, DELETE, POST, PUT",
  });
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // In Vercel, use OPENAI_API_KEY (without REACT_APP_ prefix)
    const apiKey =
      process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OpenAI API key not found in environment variables");
      return res.status(500).json({
        error: "OpenAI API key not configured",
        details: "Please set OPENAI_API_KEY in Vercel environment variables",
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("OpenAI proxy error:", error);
    res.status(500).json({ error: error.message });
  }
}
