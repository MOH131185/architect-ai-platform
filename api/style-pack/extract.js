import {
  computeStylePackHash,
  extractStylePack,
} from "../../src/services/style/stylePackExtractor.js";
import { STYLE_PACK_VERSION } from "../../src/schemas/stylePack.js";

export const runtime = "nodejs";
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

function isStylePackEnabled(env = process.env) {
  const flag = String(env.STYLE_PACK_ENABLED || "")
    .trim()
    .toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !(env.VERCEL || env.NODE_ENV === "production");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const stylePack = isStylePackEnabled()
      ? extractStylePack({
          portfolioFiles: body.portfolioFiles || [],
          briefHints: body.briefHints || {},
          extractorVersion: body.extractorVersion || STYLE_PACK_VERSION,
        })
      : null;
    return res.status(200).json({
      success: true,
      style_pack: stylePack,
      stylePack,
      stylePackHash: stylePack ? computeStylePackHash(stylePack) : null,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error?.message || "Style Pack extraction failed",
    });
  }
}
