# AWS cost hygiene (keep spend near zero while building)

The SAM API stack and optional static CDN are tuned for **pay-per-use**: no RDS, DynamoDB on-demand, HTTP API (not REST), Lambda **Graviton (arm64)**.

## Architecture choices (already in repo)

| Goal | What we use |
|------|----------------|
| No DB idle minimum | **DynamoDB on-demand** (`PAY_PER_REQUEST`) |
| Idle API cost | **Lambda** + HTTP API (no per-hour servers in this path) |
| Static UI | **S3 + CloudFront** optional stack (`infra/sam/static-cdn.yaml`) — sync with `npm run deploy:static` |
| Clinic map dataset | **`clinics.json`** built at build time; long CDN TTL — locks/overlays still hit `/api/*` |
| Logs don’t grow forever | Lambda **log retention** (default 7 days) on the API stack |
| Cheaper Lambda GB-ms | **256 MB** default memory (raise via stack parameter if you see OOM) |

## Things that quietly cost money (avoid by default)

1. **NAT Gateway** — hourly + data processing. Not used by this design; don’t put Lambda in private subnets that need NAT unless required.
2. **Idle Application Load Balancers** — we use HTTP API, not ALB.
3. **Elastic IP attached to stopped EC2** — still billed; release EIPs or delete stopped instances you don’t need.
4. **CloudWatch Logs with no retention** — infinite storage adds up; API stack sets retention on the function log group.

**EC2 is tooling-only** (SSH, AWS CLI, static sync / SAM helpers). It must **not** serve `shadowingnetwork.com` — that domain points at CloudFront. Keep the instance **stopped** when idle; start it only for status checks or deploys. Do **not** run Caddy with automatic HTTPS for the public domain on this host (expired certs + DNS at CloudFront cause renew loops and log noise).

## Production cutover (this project)

- **App (CloudFront + S3 + Lambda API):** **`https://shadowingnetwork.com`** (and CloudFront URL **`https://d2z5wraie5zbrx.cloudfront.net`**; hash routes: `#dashboard`, `#login`, etc.).
- **S3 bucket for uploads:** `shadowing-static-dev-sitebucket-xnygmxwbe67z` — set `STATIC_BUCKET` to this when running `npm run deploy:static`.
- **EC2:** tooling VM only — stop when idle. Public IP may change on stop/start unless an Elastic IP is attached; prefer starting on demand over always-on.
- **Elastic IP:** an EIP attached to a **stopped** instance is still billed — release it if you do not need a fixed IP.
- **Custom domain:** apex/www should resolve to CloudFront (not the EC2 public IP).

## Optional static CDN (recommended for near-zero idle)

1. Deploy API stack first (`infra/sam/template.yaml`).
2. Deploy CDN stack:

   ```bash
   cd infra/sam
   sam deploy -t static-cdn.yaml --stack-name shadowing-static-dev \
     --parameter-overrides ApiGatewayDomainName=YOUR_ID.execute-api.us-west-2.amazonaws.com ApiStagePath=/dev \
     --capabilities CAPABILITY_IAM --resolve-s3 --region us-west-2
   ```

3. Note **Outputs**: `StaticBucketName`, `CloudFrontURL`.
4. Build and upload (`npm ci` on the server if `@aws-sdk/client-s3` was just added):

   ```bash
   npm ci
   npm run build
   STATIC_BUCKET=your-bucket-name AWS_REGION=us-west-2 npm run deploy:static
   ```

5. Open **`CloudFrontURL`** in the browser (hash routes; SPA fallback is configured).

## Free tiers / pricing references (verify current AWS pricing)

- **CloudFront**: includes a monthly free data transfer allowance (check current docs).
- **SES**: Cognito sends verification/reset mail via SES (sandbox limits apply until production access).
- **Cognito**: MAU free tier is usually enough at this scale (verify current AWS pricing).

## Frontend bundle & bandwidth

- Vite already code-splits **Leaflet** (`manualChunks`). Prefer **WebP** for large raster assets when you replace PNGs.
- Most clinic bytes should come from **cached `clinics.json`** at the edge, not Dynamo per map pan.
