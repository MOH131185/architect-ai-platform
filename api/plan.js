/**
 * Plan API Endpoint - Vercel Serverless Function
 *
 * REFACTORED: Generates Project DNA using ModelRouter
 * POST /api/plan
 *
 * Accepts project context and returns validated Design DNA
 * Does NOT generate images (use /api/render for that)
 */

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      address,
      program,
      area,
      climate,
      styleWeights,
      siteMetrics,
      programSpaces,
      seed,
    } = req.body;

    console.log("[Plan API] Generating DNA for:", address || program);

    // In serverless environment, we need to use Together.ai directly
    // ModelRouter would require bundling, so we'll use Together API directly here
    const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

    if (!TOGETHER_API_KEY) {
      return res.status(500).json({
        error: "API key not configured",
        message: "TOGETHER_API_KEY environment variable is required",
      });
    }

    // Build DNA generation prompt
    const systemPrompt = `You are an expert architect creating Master Design DNA for architectural projects.
Return valid JSON with exact specifications: dimensions, materials (with hex colors), rooms, elevations, and consistency rules.`;

    const userPrompt = `Generate Master Design DNA for:
Address: ${address || "Not specified"}
Program: ${program || "residential"}
Area: ${area || 200}m²
Climate: ${climate?.type || "Temperate"}
Site: ${siteMetrics?.areaM2 || "TBD"}m²

${
  programSpaces && programSpaces.length > 0
    ? `Program Spaces:
${programSpaces.map((s) => `- ${s.name}: ${s.area}m²`).join("\n")}`
    : ""
}

Return JSON with: dimensions{length, width, totalHeight, floorCount, floorHeights[]}, materials{exterior, roof, windows}, levels[], floorPlans{}, elevations{}, consistencyRules[].`;

    // Call Together.ai
    const response = await fetch(
      "https://api.together.xyz/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOGETHER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `Together API error: ${response.status}`);
    }

    const data = await response.json();
    const dnaContent = data.choices[0].message.content;

    // Parse DNA
    let dna;
    try {
      dna = JSON.parse(dnaContent);
    } catch (parseError) {
      console.error("[Plan API] Failed to parse DNA:", dnaContent);
      throw new Error("Invalid JSON response from AI");
    }

    // Add metadata
    const design = {
      id: `design-${Date.now()}`,
      seed: seed || Math.floor(Math.random() * 1000000),
      dna,
      site: {
        address,
        area: siteMetrics?.areaM2,
        orientation: siteMetrics?.orientationDeg,
      },
      createdAt: new Date().toISOString(),
    };

    console.log("[Plan API] DNA generated successfully");

    return res.status(200).json({
      success: true,
      design,
      note: "DNA generated. No images created. Use /api/render for views.",
    });
  } catch (error) {
    console.error("[Plan API] Error:", error);
    return res.status(500).json({
      error: "DNA generation failed",
      message: error.message,
    });
  }
}
