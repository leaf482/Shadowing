import fs from "node:fs";
import path from "node:path";
import {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const envPath = path.join(repoRoot, ".env");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const client = new LambdaClient({ region: process.env.AWS_REGION || "us-west-2" });
const functionName = "shadowing-api-dev-ApiFunction-GgjeZ3BMqcfq";

const current = await client.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
const variables = {
  ...current.Environment?.Variables,
  STATIC_BUCKET: env.STATIC_BUCKET || "shadowing-static-dev-sitebucket-xnygmxwbe67z",
  CLOUDFRONT_DISTRIBUTION_ID: env.CLOUDFRONT_DISTRIBUTION_ID || "E2XKSS6CLI091Q",
  RESEND_API_KEY: env.RESEND_API_KEY || current.Environment?.Variables?.RESEND_API_KEY,
  FROM_EMAIL: env.FROM_EMAIL || current.Environment?.Variables?.FROM_EMAIL,
  ADMIN_EMAILS: env.ADMIN_EMAILS || current.Environment?.Variables?.ADMIN_EMAILS,
};

await client.send(
  new UpdateFunctionConfigurationCommand({
    FunctionName: functionName,
    Environment: { Variables: variables },
  })
);

console.log("Lambda env updated:", {
  STATIC_BUCKET: variables.STATIC_BUCKET,
  CLOUDFRONT_DISTRIBUTION_ID: variables.CLOUDFRONT_DISTRIBUTION_ID,
});
