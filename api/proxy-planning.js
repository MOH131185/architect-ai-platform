// api/proxy-planning.js (Vercel or Netlify function)
export default async function handler(req, res) {
  const { lat, lng } = req.query;
  const url = `https://planning.data.gov.uk/api/v1/constraints?lat=${lat}&lon=${lng}`;
  const response = await fetch(url);
  const text = await response.text();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(text);
}
