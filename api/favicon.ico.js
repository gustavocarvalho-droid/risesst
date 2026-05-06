export default function handler(req, res) {
  res.setHeader("Content-Type", "image/svg+xml");
  res.status(200).send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="#06080f"/>
    <text x="32" y="39" text-anchor="middle" font-size="20" font-family="Arial" font-weight="800" fill="#3dbdbd">SWG</text>
  </svg>`);
}
