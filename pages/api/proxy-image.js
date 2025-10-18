// pages/api/proxy-image.js
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import stream from "stream";
import { promisify } from "util";

const pipeline = promisify(stream.pipeline);

const account = (process.env.R2_ACCOUNT_ID || "").trim();
const bucket = (process.env.R2_BUCKET || "").trim();
const configuredPublic = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").trim();

// init S3 client for R2 (server-side only)
const s3client = new S3Client({
  region: "auto",
  endpoint: account ? `https://${account}.r2.cloudflarestorage.com` : undefined,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

function joinp(...parts) {
  return parts.map(p => String(p || "").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

export default async function handler(req, res) {
  const { key, url } = req.query || {};

  // quick validation
  if (!key && !url) {
    return res.status(400).send("key or url required");
  }

  // If url provided -> validate host (optional) and directly fetch it (same as before)
  if (url) {
    try {
      const u = new URL(url);
      // optional host check could be added here
      console.log("proxy-image: direct proxy url:", url);
      const upstream = await fetch(url);
      if (!upstream.ok) {
        const body = await upstream.text().catch(() => "<no-body>");
        console.warn("proxy-image: direct upstream failed", upstream.status, body.slice(0, 2000));
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(upstream.status).send(`Upstream returned ${upstream.status}\n\n${body.slice(0,2000)}`);
      }
      const ct = upstream.headers.get("content-type") || "application/octet-stream";
      const arr = await upstream.arrayBuffer();
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).send(Buffer.from(arr));
    } catch (err) {
      console.error("proxy-image: invalid url", err);
      return res.status(400).send("Invalid url");
    }
  }

  // now we have key: try multiple candidate public URLs first (safe), then S3 GetObject fallback
  const candidates = [];
  if (configuredPublic) {
    candidates.push(`${configuredPublic.replace(/\/$/, "")}/${key}`);
    if (bucket) {
      // if configuredPublic lacked bucket path, try adding it
      candidates.push(`${configuredPublic.replace(/\/$/, "")}/${bucket}/${key}`);
    }
  }
  if (account && bucket) {
    candidates.push(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`);
  }
  if (account) {
    candidates.push(`https://${account}.r2.cloudflarestorage.com/${key}`);
  }
  // also try raw key on configuredPublic host again (dedupe handled below)
  if (configuredPublic && key.includes("/")) {
    candidates.push(`${configuredPublic.replace(/\/$/, "")}/${key}`);
  }

  const uniqCandidates = Array.from(new Set(candidates));

  console.log("proxy-image: will try HTTP candidates for key:", key, uniqCandidates);

  // try HTTP candidates
  for (const fetchUrl of uniqCandidates) {
    try {
      const upstream = await fetch(fetchUrl);
      if (!upstream.ok) {
        const txt = await upstream.text().catch(() => "<no-body>");
        console.warn("proxy-image: upstream", fetchUrl, "=>", upstream.status, txt.slice(0, 400));
        continue;
      }
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const arr = await upstream.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");
      console.log("proxy-image: success via HTTP for", fetchUrl);
      return res.status(200).send(Buffer.from(arr));
    } catch (err) {
      console.error("proxy-image: HTTP fetch error for", fetchUrl, err && err.message ? err.message : err);
      continue;
    }
  }

  // HTTP attempts failed -> S3 GetObject fallback
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.error("proxy-image: no R2 credentials for S3 fallback; cannot GetObject");
    return res.status(502).json({ ok: false, message: "All HTTP attempts failed and no server R2 credentials found for GetObject fallback" });
  }

  // build candidate keys for GetObject
  const keyCandidates = [];
  keyCandidates.push(key);
  // if key already contains bucket prefix like "bucket/..." then try both with and without
  if (key.startsWith(`${bucket}/`)) {
    keyCandidates.push(key.replace(`${bucket}/`, ""));
  } else if (bucket) {
    keyCandidates.push(joinp(bucket, key)); // "bucket/key"
  }

  console.log("proxy-image: will try S3 GetObject with keys:", keyCandidates);

  for (const candidateKey of Array.from(new Set(keyCandidates))) {
    try {
      console.log("proxy-image: S3 GetObject try:", { Bucket: bucket, Key: candidateKey });
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: candidateKey });
      const data = await s3client.send(cmd);
      // data.Body is a stream (Node.js Readable)
      const ct = data.ContentType || data.ContentType || "application/octet-stream";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Stream body to response
      // In Node, data.Body is a stream.Readable
      console.log("proxy-image: S3 GetObject success, streaming to client for key:", candidateKey);
      await pipeline(data.Body, res);
      return; // response streamed
    } catch (err) {
      // typical errors: NoSuchKey or AccessDenied; log snippet
      console.warn("proxy-image: S3 GetObject failed for", candidateKey, "err:", err && err.message ? err.message : err);
      continue;
    }
  }

  // If reached here — nothing worked
  console.error("proxy-image: all attempts failed for key:", key);
  return res.status(502).json({ ok: false, message: "All attempts (HTTP + S3 GetObject) failed for key", key });
}
