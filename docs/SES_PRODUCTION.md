# SES production access (Cognito email)

Shadow Network sends sign-up and password-reset email via **Amazon Cognito → Amazon SES** (`noreply@shadowingnetwork.com`). This only works reliably for arbitrary `.edu` addresses when SES is **out of sandbox**.

## Current check

From a machine with AWS credentials (e.g. EC2 `friend`):

```bash
bash scripts/check-ses-production.sh
```

| Field | Meaning |
|-------|---------|
| `ProductionAccessEnabled: true` | Production — any recipient can receive mail |
| `ProductionAccessEnabled: false` | Sandbox — only **SES-verified** recipient addresses |
| `ReviewStatus: PENDING` | AWS is reviewing a production request |
| `ReviewStatus: GRANTED` | Approved; `ProductionAccessEnabled` should become `true` (can lag) |

## Request or re-request production access

```bash
bash scripts/request-ses-production-access.sh
```

Uses `aws sesv2 put-account-details --production-access-enabled` in **us-west-2**.

## If review is GRANTED but still sandbox

This happened on this project: `ReviewDetails.Status` was `GRANTED` while `ProductionAccessEnabled` stayed `false`, so Cognito reported “code sent” but `@uw.edu` inboxes never received mail.

1. Run `bash scripts/request-ses-production-access.sh` again (status may return to `PENDING`).
2. Open **AWS Support Center** → [Case history](https://support.console.aws.amazon.com/support/home#/case/history) → look for **SES** / **Service limit** cases in **us-west-2**.
3. Create a case if needed: **Service limit increase** → **SES Sending Limits** — explain that production was granted but `GetAccount.ProductionAccessEnabled` is still `false` in `us-west-2`.

## Cognito + SES wiring (already deployed)

- Domain `shadowingnetwork.com` verified in SES (DKIM SUCCESS).
- Cognito User Pool email: `DEVELOPER` + SES identity ARN.
- Identity policy `AllowCognitoUserPoolSend`: `bash scripts/apply-cognito-ses-policy.sh`

## Temporary workaround (single user)

While in sandbox, you can **admin-confirm** a Cognito user (no email needed):

```bash
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id us-west-2_5GBVjb1NA \
  --username user@uw.edu --region us-west-2

aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-west-2_5GBVjb1NA \
  --username user@uw.edu \
  --user-attributes Name=email_verified,Value=true \
  --region us-west-2
```

Alternatively verify their address in **SES → Verified identities** (they must click the link AWS sends).

## After production is enabled

1. Run `bash scripts/check-ses-production.sh` — confirm `ProductionAccessEnabled: true` and higher quota than 200/day.
2. Test: new sign-up on https://shadowingnetwork.com with a fresh `.edu` address.
3. Check spam folder for first messages from `noreply@shadowingnetwork.com`.
