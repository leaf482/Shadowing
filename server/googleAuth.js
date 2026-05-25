/** Verify a Google Identity Services ID token (no extra npm deps). */
export async function verifyGoogleIdToken(credential, clientId) {
  if (!credential || !clientId) return null;

  let res;
  try {
    res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let payload;
  try {
    payload = await res.json();
  } catch {
    return null;
  }

  if (payload.aud !== clientId) return null;
  if (payload.email_verified !== "true" && payload.email_verified !== true) return null;
  if (!payload.email || !payload.sub) return null;

  return {
    email: String(payload.email).trim().toLowerCase(),
    sub: String(payload.sub),
  };
}
