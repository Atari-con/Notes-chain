// pages/api/check-image.js
export default async function handler(req, res) {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ ok: false, error: "url required" });

  try {
    let resp = await fetch(url, { method: "HEAD" });
    if (!resp.ok) resp = await fetch(url, { method: "GET" });
    const contentType = resp.headers.get("content-type") || null;
    return res.status(200).json({ ok: true, status: resp.status, contentType, urlOk: resp.ok });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
