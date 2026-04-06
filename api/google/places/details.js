export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Google Maps API key not configured" });
  }

  const { place_id: placeId, fields = "geometry" } = req.query || {};

  if (!placeId) {
    return res.status(400).json({ error: "place_id is required" });
  }

  try {
    const params = new URLSearchParams({
      place_id: String(placeId),
      fields: String(fields),
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
    );
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
