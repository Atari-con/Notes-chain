// pages/api/upload.js
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const form = formidable({ multiples: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: "Form parse error", details: String(err) });

    try {
      let fileList = [];
      if (Array.isArray(files.files)) fileList = files.files;
      else if (files.files) fileList = [files.files];
      else {
        const names = Object.keys(files || {});
        if (names.length) {
          const maybe = files[names[0]];
          fileList = Array.isArray(maybe) ? maybe : [maybe];
        }
      }

      if (!fileList.length) return res.status(400).json({ error: "No files found in request" });

      const results = [];

      for (const f of fileList) {
        const filepath = f.filepath || f.path;
        const stream = fs.createReadStream(filepath);
        const key = `${Date.now()}_${Math.random().toString(36).slice(2)}_${(f.originalFilename || f.name).replace(/\s+/g, "_")}`;

        const upload = new Upload({
          client,
          params: {
            Bucket: process.env.R2_BUCKET,
            Key: key,
            Body: stream,
            ContentType: f.mimetype || f.type || "application/octet-stream",
          },
        });

        await upload.done();

        try { fs.unlinkSync(filepath); } catch (_) {}

        // --------- NEW: формируем корректный публичный base (гарантируем bucket) ----------
        const configuredPublic = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").trim();
        const account = process.env.R2_ACCOUNT_ID || "";
        const bucket = process.env.R2_BUCKET || "";

        // начнём с configuredPublic (если есть), иначе используем fallback по account+bucket
        let base = (configuredPublic || "").replace(/\/$/, "");

        if (!base) {
          // нет configuredPublic — используем fallback, но только если есть account + bucket
          base = (account && bucket) ? `https://${account}.r2.cloudflarestorage.com/${bucket}` : "";
        } else {
          // configuredPublic задан — проверим, содержит ли он имя бакета в пути; если нет и есть bucket — добавим его
          try {
            const u = new URL(base);
            const pathParts = (u.pathname || "").replace(/^\//, "").split("/").filter(Boolean);
            if (pathParts.length === 0 && bucket) {
              // configuredPublic — только хост, добавим /<bucket>
              base = `${base}/${bucket}`;
            } else {
              // configuredPublic уже имеет path — оставим как есть (предполагается, что это намеренно)
              base = base; // noop for clarity
            }
          } catch (e) {
            // configuredPublic оказался невалидным URL — fallback к account+bucket если возможно
            base = (account && bucket) ? `https://${account}.r2.cloudflarestorage.com/${bucket}` : base;
          }
        }

        const url = base ? `${base.replace(/\/$/, "")}/${key}` : null;
        // -------------------------------------------------------------------------------

        const fileObj = {
          name: f.originalFilename || f.name,
          key,
          url,
          type: f.mimetype || f.type || "application/octet-stream",
          size: f.size || 0,
        };
        results.push(fileObj);
        console.log("Uploaded file:", fileObj);
      }

      return res.status(200).json({ files: results });
    } catch (uploadErr) {
      console.error("Upload error:", uploadErr);
      return res.status(500).json({
        error: "Upload failed",
        details: uploadErr.message || String(uploadErr),
      });
    }
  });
}
