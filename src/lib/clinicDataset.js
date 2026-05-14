import { formatApiErrorMessage } from "./auth.js";

const SAME_ORIGIN_FETCH = {
  credentials: "same-origin",
  cache: "no-store"
};

export function mergeLockOverlay(base, locksPayload) {
  const lockMap = new Map(locksPayload.map((x) => [x.id, x]));
  return base.map((c) => {
    const L = lockMap.get(c.id);
    return {
      ...c,
      lockExpiresAt: L?.lockExpiresAt ?? null,
      lockedByRequestId: L?.lockedByRequestId ?? null
    };
  });
}

export function mergeSessionOverlay(merged, overlayList) {
  const m = new Map(overlayList.map((x) => [x.id, x]));
  return merged.map((c) => {
    const o = m.get(c.id);
    if (!o) return c;
    return {
      ...c,
      ownedByCurrentUser: o.ownedByCurrentUser,
      canManage: o.canManage
    };
  });
}

/**
 * Live `/api/clinics` first (matches Dynamo); fallback to static `/clinics.json` if API fails.
 * Then merges lock rows + session overlay for the logged-in viewer.
 */
export async function fetchClinicDataset() {
  let snapshot;

  const apiListRes = await fetch("/api/clinics", SAME_ORIGIN_FETCH);
  if (apiListRes.ok) {
    snapshot = await apiListRes.json();
  } else {
    const snapRes = await fetch("/clinics.json", SAME_ORIGIN_FETCH);
    if (!snapRes.ok) {
      const message = await formatApiErrorMessage(
        apiListRes,
        "Failed to load clinics."
      );
      throw new Error(message);
    }
    snapshot = await snapRes.json();
  }

  if (!Array.isArray(snapshot)) snapshot = [];

  const locksRes = await fetch("/api/clinics/locks", SAME_ORIGIN_FETCH);
  const locksPayload = locksRes.ok ? await locksRes.json() : [];
  let merged = mergeLockOverlay(snapshot, locksPayload);

  const overlayRes = await fetch("/api/clinics/session-overlay", SAME_ORIGIN_FETCH);
  if (overlayRes.ok) {
    const body = await overlayRes.json();
    merged = mergeSessionOverlay(merged, body.clinics ?? []);
  }

  return merged;
}
