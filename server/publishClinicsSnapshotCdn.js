import { readFile } from "fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

let publishChain = Promise.resolve();

/** Upload clinics.json snapshot to the static S3 bucket (+ optional CF invalidation). */
export function publishClinicsSnapshotCdn(filePath) {
  const bucket = process.env.STATIC_BUCKET?.trim();
  if (!bucket) return publishChain;

  publishChain = publishChain.then(async () => {
    try {
      const body = await readFile(filePath);
      const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2";
      await new S3Client({ region }).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: "clinics.json",
          Body: body,
          ContentType: "application/json; charset=utf-8",
          CacheControl: "public, max-age=86400, stale-while-revalidate=604800",
        })
      );

      const distId = process.env.CLOUDFRONT_DISTRIBUTION_ID?.trim();
      if (distId) {
        await new CloudFrontClient({ region: "us-east-1" }).send(
          new CreateInvalidationCommand({
            DistributionId: distId,
            InvalidationBatch: {
              CallerReference: `clinics-${Date.now()}`,
              Paths: { Quantity: 1, Items: ["/clinics.json"] },
            },
          })
        );
      }
    } catch (error) {
      console.error("[clinics snapshot cdn]", error?.message || error);
    }
  });

  return publishChain;
}
