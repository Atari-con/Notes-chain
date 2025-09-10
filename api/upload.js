// api/upload.js
import AWS from 'aws-sdk';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Настроить S3 (Storj gateway endpoint)
const s3 = new AWS.S3({
  endpoint: process.env.STORJ_S3_ENDPOINT || 'https://gateway.storjshare.io',
  accessKeyId: process.env.STORJ_ACCESS_KEY,
  secretAccessKey: process.env.STORJ_SECRET_KEY,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'Form parse error' });

    try {
      // Поддерживаем множественные файлы: input name="files" multiple
      const fileList = Array.isArray(files.files) ? files.files : [files.files];
      const results = [];

      for (const f of fileList) {
        // f.filepath для formidable v2+; для старых версий используйте f.path
        const filepath = f.filepath || f.path;
        const buffer = fs.readFileSync(filepath);
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${f.originalFilename || f.name}`;
        const key = safeName;

        await s3.putObject({
          Bucket: process.env.STORJ_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: f.mimetype || f.type || 'application/octet-stream',
        }).promise();

        // удаляем временный файл
        try { fs.unlinkSync(filepath); } catch(e){}

        const publicUrl = `${process.env.STORJ_S3_PUBLIC_BASE || process.env.STORJ_S3_ENDPOINT.replace(/^https?:\/\//,'https://')}/${process.env.STORJ_BUCKET}/${key}`;

        results.push({
          name: f.originalFilename || f.name,
          key,
          url: publicUrl,
          type: f.mimetype || f.type,
          size: f.size || buffer.length,
        });
      }

      return res.status(200).json({ files: results });
    } catch (uploadErr) {
      console.error('upload error', uploadErr);
      return res.status(500).json({ error: 'Upload failed' });
    }
  });
}