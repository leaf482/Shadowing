import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

let idVerifier = null;
let accessVerifier = null;
let cognitoClient = null;

function getUserPoolId() {
  return process.env.COGNITO_USER_POOL_ID || "";
}

function getClientId() {
  return process.env.COGNITO_CLIENT_ID || "";
}

function getRegion() {
  return process.env.AWS_REGION || process.env.COGNITO_REGION || "us-west-2";
}

function getIdVerifier() {
  const userPoolId = getUserPoolId();
  const clientId = getClientId();
  if (!userPoolId || !clientId) return null;

  if (!idVerifier) {
    idVerifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "id",
      clientId,
    });
  }
  return idVerifier;
}

function getAccessVerifier() {
  const userPoolId = getUserPoolId();
  const clientId = getClientId();
  if (!userPoolId || !clientId) return null;

  if (!accessVerifier) {
    accessVerifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });
  }
  return accessVerifier;
}

function getCognitoClient() {
  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({ region: getRegion() });
  }
  return cognitoClient;
}

export function isCognitoAuthEnabled() {
  return Boolean(getUserPoolId() && getClientId());
}

export function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function normalizeEmail(value) {
  if (!value || typeof value !== "string" || !value.includes("@")) return null;
  return value.trim().toLowerCase();
}

async function lookupEmailByCognitoUsername(username) {
  const userPoolId = getUserPoolId();
  if (!userPoolId || !username) return null;

  try {
    const response = await getCognitoClient().send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      })
    );
    const emailAttr = response.UserAttributes?.find((attr) => attr.Name === "email");
    return normalizeEmail(emailAttr?.Value);
  } catch {
    return null;
  }
}

async function emailFromIdToken(token) {
  const verifier = getIdVerifier();
  if (!verifier) return null;

  try {
    const payload = await verifier.verify(token);
    return normalizeEmail(payload.email);
  } catch {
    return null;
  }
}

async function emailFromAccessToken(token) {
  const verifier = getAccessVerifier();
  if (!verifier) return null;

  try {
    const payload = await verifier.verify(token);
    const directEmail = normalizeEmail(payload.email);
    if (directEmail) return directEmail;

    const username = payload.username || payload["cognito:username"] || payload.sub || "";
    if (!username) return null;
    if (username.includes("@")) return normalizeEmail(username);
    return lookupEmailByCognitoUsername(username);
  } catch {
    return null;
  }
}

/** Returns normalized email (user id) from Cognito JWT, or null. */
export async function getUserIdFromCognitoAccessToken(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  return (await emailFromIdToken(token)) || (await emailFromAccessToken(token));
}

export function getCognitoPublicConfig() {
  if (!isCognitoAuthEnabled()) return null;
  const oauthDomain = process.env.COGNITO_OAUTH_DOMAIN || "";
  const googleEnabled = process.env.COGNITO_GOOGLE_ENABLED === "true" && Boolean(oauthDomain);
  return {
    userPoolId: getUserPoolId(),
    clientId: getClientId(),
    region: getRegion(),
    oauth: googleEnabled
      ? {
          enabled: true,
          domain: oauthDomain,
        }
      : { enabled: false },
  };
}
