export function isValidEduEmail(email) {
  if (!email || typeof email !== "string") return false;
  const norm = email.trim().toLowerCase();
  if (!norm.includes("@")) return false;
  const domain = norm.split("@")[1];
  return typeof domain === "string" && domain.endsWith(".edu");
}
