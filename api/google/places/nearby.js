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

  const { location, radius = "10", type } = req.query || {};

  if (!location) {
    return res.status(400).json({ error: "location is required" });
  }

  try {
    const params = new URLSearchParams({
      location: String(location),
      radius: String(radius),
      key: apiKey,
    });

    if (type) {
      params.set("type", String(type));
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`,
    );
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
