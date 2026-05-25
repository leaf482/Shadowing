#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const envPath = path.join(repoRoot, ".env");

if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath} — copy .env.example and set RESEND_API_KEY, ADMIN_EMAILS, etc.`);
  process.exit(1);
}

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

const resendKey = env.RESEND_API_KEY || "";
const fromEmail = env.FROM_EMAIL || "Shadow Network <noreply@shadowingnetwork.com>";
const adminEmails = env.ADMIN_EMAILS || "";
const staticBucket =
  env.STATIC_BUCKET || env.STATIC_BUCKET_NAME || "shadowing-static-dev-sitebucket-xnygmxwbe67z";
const cloudFrontId = env.CLOUDFRONT_DISTRIBUTION_ID || env.CF_DISTRIBUTION_ID || "E2XKSS6CLI091Q";
const googleClientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || "";

if (!resendKey) {
  console.error("RESEND_API_KEY is required in .env for production Lambda deploy.");
  process.exit(1);
}

const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const parameterOverrides = [
  `ResendApiKey=${resendKey}`,
  `FromEmail=${quote(fromEmail)}`,
  `AdminEmails=${quote(adminEmails)}`,
  `StaticBucketName=${staticBucket}`,
  `CloudFrontDistributionId=${cloudFrontId}`,
  `GoogleClientId=${googleClientId}`,
].join(" ");

const samDir = path.join(repoRoot, "infra/sam");
const cleanScript = path.join(samDir, "clean-build-artifact.sh");

const build = spawnSync("sam", ["build", "--template-file", "template.yaml"], {
  cwd: samDir,
  stdio: "inherit",
  env: process.env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const clean = spawnSync("bash", [cleanScript, path.join(samDir, ".aws-sam/build/ApiFunction")], {
  cwd: samDir,
  stdio: "inherit",
  env: process.env,
});
if (clean.status !== 0) process.exit(clean.status ?? 1);

const zipPath = "/tmp/lambda-deploy.zip";
const zip = spawnSync("bash", ["-lc", `cd "${path.join(samDir, ".aws-sam/build/ApiFunction")}" && zip -qr "${zipPath}" .`], {
  stdio: "inherit",
});
if (zip.status !== 0) process.exit(zip.status ?? 1);

const builtTemplate = path.join(samDir, ".aws-sam/build/template.yaml");

const samDeploy = spawnSync(
  "sam",
  [
    "deploy",
    "--template-file",
    builtTemplate,
    "--stack-name",
    "shadowing-api-dev",
    "--region",
    "us-west-2",
    "--capabilities",
    "CAPABILITY_IAM",
    "--resolve-s3",
    "--no-confirm-changeset",
    "--parameter-overrides",
    parameterOverrides,
  ],
  { cwd: samDir, stdio: "inherit", env: process.env }
);
if (samDeploy.status !== 0) {
  console.warn("sam deploy failed — uploading cleaned zip via update-function-code");
  const fnName = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stack-resource",
      "--stack-name",
      "shadowing-api-dev",
      "--logical-resource-id",
      "ApiFunction",
      "--region",
      "us-west-2",
      "--query",
      "StackResourceDetail.PhysicalResourceId",
      "--output",
      "text",
    ],
    { encoding: "utf8" }
  );
  const functionName = fnName.stdout?.trim();
  if (!functionName) process.exit(samDeploy.status ?? 1);

  const codeUpdate = spawnSync(
    "aws",
    [
      "lambda",
      "update-function-code",
      "--region",
      "us-west-2",
      "--function-name",
      functionName,
      "--zip-file",
      `fileb://${zipPath}`,
    ],
    { stdio: "inherit" }
  );
  if (codeUpdate.status !== 0) process.exit(codeUpdate.status ?? 1);
}

const envUpdate = spawnSync("bash", [path.join(samDir, "update-lambda-env.sh")], {
  cwd: samDir,
  stdio: "inherit",
});
if (envUpdate.status !== 0) process.exit(envUpdate.status ?? 1);

process.exit(0);
