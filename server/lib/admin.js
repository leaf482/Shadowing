import { ADMIN_EMAILS } from "./env.js";

export function isAdminUser(userId) {
  return !!userId && ADMIN_EMAILS.has(String(userId).trim().toLowerCase());
}

export function canManageClinic(row, userId) {
  if (!userId) return false;
  return isAdminUser(userId) || row.created_by_user_id === userId;
}
