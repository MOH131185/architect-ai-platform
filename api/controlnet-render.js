/**
 * ControlNet Canny Rendering API
 *
 * Vercel serverless endpoint that calls Replicate's ControlNet Canny model.
 * Accepts a Canny edge image + prompt and returns a geometry-locked render.
 *
 * POST /api/controlnet-render
 * Body: { cannyImage, prompt, negative_prompt, controlnet_strength, seed, width, height }
 * Returns: { url, seed, metadata }
 *
 * Requires: REPLICATE_API_TOKEN environment variable
 */

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const replicateKey =
    process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
  if (!replicateKey) {
    return res
      .status(500)
      .json({ error: "REPLICATE_API_TOKEN not configured" });
  }

  try {
    const {
      cannyImage,
      prompt,
      negative_prompt = "",
      controlnet_strength = 0.75,
      seed,
      width = 1024,
      height = 1024,
    } = req.body;

    if (!cannyImage || !prompt) {
      return res
        .status(400)
        .json({ error: "cannyImage and prompt are required" });
    }

    console.log(
      `[ControlNet] Generating render (${width}x${height}, strength: ${controlnet_strength})`,
    );

    // Create prediction on Replicate
    const createResponse = await fetch(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${replicateKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version:
            "aff48af9c68d162388d230a2ab003f68d2638d88307bdaf1c2f1ac95079c9613",
          input: {
            image: cannyImage,
            prompt,
            negative_prompt,
            num_inference_steps: 30,
            guidance_scale: 7.5,
            seed: seed || Math.floor(Math.random() * 1000000),
            controlnet_conditioning_scale: controlnet_strength,
            image_resolution: Math.max(width, height),
          },
        }),
      },
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Replicate create failed: ${createResponse.status} - ${errorText}`,
      );
    }

    const prediction = await createResponse.json();
    console.log(`[ControlNet] Prediction created: ${prediction.id}`);

    // Poll for completion (max 2 minutes, 2s intervals)
    const MAX_POLLS = 60;
    const POLL_INTERVAL_MS = 2000;
    let result = prediction;

    for (let i = 0; i < MAX_POLLS; i++) {
      if (result.status === "succeeded") {
        const outputUrl = Array.isArray(result.output)
          ? result.output[result.output.length - 1]
          : result.output;

        console.log(`[ControlNet] Generation succeeded: ${outputUrl}`);
        return res.status(200).json({
          url: outputUrl,
          seed,
          metadata: {
            model: "controlnet-canny",
            provider: "replicate",
            width,
            height,
            controlnet_strength,
            prediction_id: result.id,
          },
        });
      }

      if (result.status === "failed" || result.status === "canceled") {
        throw new Error(
          `ControlNet generation ${result.status}: ${result.error || "unknown error"}`,
        );
      }

      // Wait before next poll
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const statusResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { Authorization: `Token ${replicateKey}` } },
      );

      if (!statusResponse.ok) {
        throw new Error(
          `Replicate status check failed: ${statusResponse.status}`,
        );
      }

      result = await statusResponse.json();
    }

    throw new Error("ControlNet generation timed out after 2 minutes");
  } catch (error) {
    console.error("[ControlNet] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};
