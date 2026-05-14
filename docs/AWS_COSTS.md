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

If you still run **EC2 + Caddy** for production, that instance has an **always-on** cost. To align with “no always-on servers”, **stop or terminate EC2** once you’re happy serving from **CloudFront + Lambda**, or only start EC2 when developing.

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
4. Build and upload:

   ```bash
   npm run build
   set STATIC_BUCKET=your-bucket-name
   npm run deploy:static
   ```

5. Open **`CloudFrontURL`** in the browser (hash routes; SPA fallback is configured).

## Free tiers / pricing references (verify current AWS pricing)

- **CloudFront**: includes a monthly free data transfer allowance (check current docs).
- **SES**: often cheaper at scale than some SaaS providers; you currently use **Resend** — migrating is optional.
- **Cognito**: generous free tier if you ever replace custom auth (not required for cost alone).

## Frontend bundle & bandwidth

- Vite already code-splits **Leaflet** (`manualChunks`). Prefer **WebP** for large raster assets when you replace PNGs.
- Most clinic bytes should come from **cached `clinics.json`** at the edge, not Dynamo per map pan.
