// utils/cloudflareR2.js
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const bucket = process.env.R2_BUCKET;
if (!bucket) throw new Error("R2_BUCKET not defined in environment variables!");

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

export async function deleteFilesFromR2(keys) {
  if (!keys || !keys.length) return;

  const objects = keys.map((k) => ({ Key: k }));
  try {
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects, Quiet: true },
    });
    const res = await client.send(command);
    console.log("R2 delete success:", res);
  } catch (err) {
    console.error("R2 delete error:", err);
    throw err;
  }
}
