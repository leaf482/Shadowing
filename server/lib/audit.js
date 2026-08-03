import { randomUUID } from "crypto";

export function createAuditWriter(repos) {
  return async function writeAuditLog(actorUserId, action, targetType = null, targetId = null, details = null) {
    if (!actorUserId) return;
    try {
      await repos.auditLogs.insert({
        id: randomUUID(),
        actor_user_id: actorUserId,
        action,
        target_type: targetType,
        target_id: targetId,
        details: details == null ? null : JSON.stringify(details),
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[audit]", error);
    }
  };
}
