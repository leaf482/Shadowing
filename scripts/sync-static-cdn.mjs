/**
 * Upload Vite dist/ + server/generated/clinics.json to the S3 bucket behind CloudFront.
 * Run after: npm run build
 *
 *   set STATIC_BUCKET=your-bucket-from-stack
 *   set AWS_REGION=us-west-2
 *   set CLOUDFRONT_DISTRIBUTION_ID=E123…   (optional — invalidates /* after upload)
 *   node scripts/sync-static-cdn.mjs
 */
import {
  CloudFrontClient,
  CreateInvalidationCommand
} from "@aws-sdk/client-cloudfront";
import { readFile } from "fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function cacheControlFor(key) {
  if (key === "index.html") return "no-cache";
  if (key.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (key === "clinics.json") {
    return "public, max-age=86400, stale-while-revalidate=604800";
  }
  return "public, max-age=3600";
}

async function putFile(client, bucket, key, absPath, cacheControl) {
  const ext = extname(absPath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const Body = await readFile(absPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body,
      ContentType: contentType,
      CacheControl: cacheControl
    })
  );
}

async function main() {
  const bucket = process.env.STATIC_BUCKET || process.env.STATIC_BUCKET_NAME;
  if (!bucket) {
    console.error("Set STATIC_BUCKET (or STATIC_BUCKET_NAME) to the S3 bucket from static-cdn stack Outputs.");
    process.exit(1);
  }
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2";
  const distDir = join(repoRoot, "dist");
  if (!statSync(distDir).isDirectory()) {
    console.error("Missing dist/. Run npm run build first.");
    process.exit(1);
  }

  const client = new S3Client({ region });
  const files = walkFiles(distDir);

  for (const abs of files) {
    const key = relative(distDir, abs).replace(/\\/g, "/");
    await putFile(client, bucket, key, abs, cacheControlFor(key));
    console.log(`uploaded ${key}`);
  }

  const clinicsPath = join(repoRoot, "server", "generated", "clinics.json");
  try {
    if (statSync(clinicsPath).isFile()) {
      await putFile(client, bucket, "clinics.json", clinicsPath, cacheControlFor("clinics.json"));
      console.log("uploaded clinics.json");
    }
  } catch {
    console.warn("skipped clinics.json (run npm run build to generate)");
  }

  const cfDistId =
    process.env.CLOUDFRONT_DISTRIBUTION_ID || process.env.CF_DISTRIBUTION_ID;
  if (cfDistId) {
    const cf = new CloudFrontClient({ region: "us-east-1" });
    const callerReference = `shadowing-static-${Date.now()}`;
    const inv = await cf.send(
      new CreateInvalidationCommand({
        DistributionId: cfDistId,
        InvalidationBatch: {
          CallerReference: callerReference,
          Paths: { Quantity: 1, Items: ["/*"] }
        }
      })
    );
    console.log(
      "CloudFront invalidation:",
      inv.Invalidation?.Id,
      `(${inv.Invalidation?.Status})`
    );
  } else {
    console.log(
      "Tip: set CLOUDFRONT_DISTRIBUTION_ID to invalidate /* after upload, or run: aws cloudfront create-invalidation --distribution-id ID --paths \"/*\""
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
