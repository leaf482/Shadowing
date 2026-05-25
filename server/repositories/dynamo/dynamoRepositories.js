import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";

function clientDoc() {
  const client = new DynamoDBClient({});
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  });
}

async function scanAll(doc, input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await doc.send(new ScanCommand({ ...input, ExclusiveStartKey }));
    items.push(...(out.Items ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** Maps Dynamo item (snake_case attrs) to SQLite-shaped row for route mappers. */
function clinicFromItem(it) {
  if (!it) return null;
  return { ...it };
}

export function createDynamoRepositories(env = process.env) {
  const doc = clientDoc();
  const T = {
    clinics: env.TABLE_CLINICS,
    users: env.TABLE_USERS,
    authSessions: env.TABLE_AUTH_SESSIONS,
    shadowingRequests: env.TABLE_SHADOWING_REQUESTS,
    experiences: env.TABLE_EXPERIENCES,
    projects: env.TABLE_PROJECTS,
    placementSessions: env.TABLE_PLACEMENT_SESSIONS,
    auditLogs: env.TABLE_AUDIT_LOGS,
    qualityFlags: env.TABLE_QUALITY_FLAGS,
    rateLimits: env.TABLE_RATE_LIMITS
  };

  const SESSION_TTL_SEC = Math.ceil(
    Number(env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000) / 1000
  );

  return {
    backend: "dynamo",

    auditLogs: {
      async insert(row) {
        await doc.send(
          new PutCommand({
            TableName: T.auditLogs,
            Item: {
              id: row.id,
              actor_user_id: row.actor_user_id,
              action: row.action,
              target_type: row.target_type,
              target_id: row.target_id,
              details: row.details,
              created_at: row.created_at ?? new Date().toISOString()
            }
          })
        );
      },
      async listRecent100() {
        const items = await scanAll(doc, { TableName: T.auditLogs });
        return items
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 100);
      }
    },

    authSessions: {
      async insert(token, userId, createdAt) {
        const ttl = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
        await doc.send(
          new PutCommand({
            TableName: T.authSessions,
            Item: { token, user_id: userId, created_at: createdAt, ttl }
          })
        );
      },
      async deleteByToken(token) {
        await doc.send(new DeleteCommand({ TableName: T.authSessions, Key: { token } }));
      },
      async deleteAllForUser(userId) {
        const items = await scanAll(doc, {
          TableName: T.authSessions,
          FilterExpression: "user_id = :u",
          ExpressionAttributeValues: { ":u": userId }
        });
        await Promise.all(items.map((it) => doc.send(new DeleteCommand({ TableName: T.authSessions, Key: { token: it.token } }))));
      },
      async findByToken(token) {
        const out = await doc.send(new GetCommand({ TableName: T.authSessions, Key: { token } }));
        return out.Item ?? null;
      },
      async updateCreatedAt(token, createdAt) {
        const ttl = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
        await doc.send(
          new UpdateCommand({
            TableName: T.authSessions,
            Key: { token },
            UpdateExpression: "SET created_at = :c, #ttl = :t",
            ExpressionAttributeNames: { "#ttl": "ttl" },
            ExpressionAttributeValues: { ":c": createdAt, ":t": ttl },
          })
        );
      }
    },

    clinics: {
      async selectAllOrdered() {
        const items = await scanAll(doc, { TableName: T.clinics });
        return items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      },
      async selectLockColumns() {
        const items = await scanAll(doc, { TableName: T.clinics });
        return items.map((it) => ({
          id: it.id,
          lock_expires_at: it.lock_expires_at ?? null,
          locked_by_request_id: it.locked_by_request_id ?? null
        }));
      },
      async selectIdAndCreatedBy() {
        const items = await scanAll(doc, { TableName: T.clinics });
        return items.map((it) => ({ id: it.id, created_by_user_id: it.created_by_user_id ?? null }));
      },
      async findById(id) {
        const out = await doc.send(new GetCommand({ TableName: T.clinics, Key: { id } }));
        return clinicFromItem(out.Item);
      },
      async insert(row) {
        await doc.send(new PutCommand({ TableName: T.clinics, Item: { ...row } }));
      },
      async updateFull(row) {
        const cur = await doc.send(new GetCommand({ TableName: T.clinics, Key: { id: row.id } }));
        if (!cur.Item) return;
        await doc.send(new PutCommand({ TableName: T.clinics, Item: { ...cur.Item, ...row } }));
      },
      async deleteById(id) {
        const reqs = await scanAll(doc, {
          TableName: T.shadowingRequests,
          FilterExpression: "clinic_id = :c",
          ExpressionAttributeValues: { ":c": id }
        });
        for (const r of reqs) {
          await doc.send(new DeleteCommand({ TableName: T.shadowingRequests, Key: { id: r.id } }));
        }
        await doc.send(new DeleteCommand({ TableName: T.clinics, Key: { id } }));
      },
      async deleteAll() {
        const [clinicItems, reqItems] = await Promise.all([
          scanAll(doc, { TableName: T.clinics }),
          scanAll(doc, { TableName: T.shadowingRequests })
        ]);
        for (const r of reqItems) {
          await doc.send(new DeleteCommand({ TableName: T.shadowingRequests, Key: { id: r.id } }));
        }
        let deleted = 0;
        for (const c of clinicItems) {
          await doc.send(new DeleteCommand({ TableName: T.clinics, Key: { id: c.id } }));
          deleted += 1;
        }
        return { changes: deleted };
      },
      async setLock(clinicId, lockExpiresAt, lockedByRequestId) {
        const cur = await this.findById(clinicId);
        if (!cur) return;
        await doc.send(
          new PutCommand({
            TableName: T.clinics,
            Item: { ...cur, lock_expires_at: lockExpiresAt, locked_by_request_id: lockedByRequestId }
          })
        );
      },
      async tryAcquireLock(clinicId, lockExpiresAt, lockedByRequestId, nowIso) {
        try {
          await doc.send(
            new UpdateCommand({
              TableName: T.clinics,
              Key: { id: clinicId },
              UpdateExpression:
                "SET lock_expires_at = :exp, locked_by_request_id = :rid",
              ConditionExpression:
                "attribute_not_exists(lock_expires_at) OR lock_expires_at <= :now",
              ExpressionAttributeValues: {
                ":exp": lockExpiresAt,
                ":rid": lockedByRequestId,
                ":now": nowIso
              }
            })
          );
          return true;
        } catch (err) {
          if (err?.name === "ConditionalCheckFailedException") return false;
          throw err;
        }
      },
      async clearLockByRequestId(requestId) {
        const items = await scanAll(doc, {
          TableName: T.clinics,
          FilterExpression: "locked_by_request_id = :r",
          ExpressionAttributeValues: { ":r": requestId }
        });
        for (const it of items) {
          await doc.send(
            new PutCommand({
              TableName: T.clinics,
              Item: {
                ...it,
                lock_expires_at: null,
                locked_by_request_id: null
              }
            })
          );
        }
      },
      async findIdNameByLockedRequest(requestId) {
        const items = await scanAll(doc, {
          TableName: T.clinics,
          FilterExpression: "locked_by_request_id = :r",
          ExpressionAttributeValues: { ":r": requestId }
        });
        const it = items[0];
        return it ? { id: it.id, name: it.name } : null;
      },
      async selectActiveReservesJoin(nowIso) {
        const clinicsLocked = await scanAll(doc, {
          TableName: T.clinics,
          FilterExpression: "attribute_exists(lock_expires_at) AND lock_expires_at > :n",
          ExpressionAttributeValues: { ":n": nowIso }
        });
        const rows = [];
        for (const c of clinicsLocked.sort((a, b) =>
          String(a.lock_expires_at).localeCompare(String(b.lock_expires_at))
        )) {
          let r = null;
          if (c.locked_by_request_id) {
            const got = await doc.send(
              new GetCommand({ TableName: T.shadowingRequests, Key: { id: c.locked_by_request_id } })
            );
            r = got.Item ?? null;
          }
          rows.push({
            clinic_id: c.id,
            clinic_name: c.name,
            shadowing_status: c.shadowing_status,
            lock_expires_at: c.lock_expires_at,
            locked_by_request_id: c.locked_by_request_id,
            user_id: r?.user_id ?? null,
            created_at: r?.created_at ?? null,
            reserve_units: r?.reserve_units ?? 1
          });
        }
        return rows;
      }
    },

    shadowingRequests: {
      async insert(row) {
        await doc.send(
          new PutCommand({
            TableName: T.shadowingRequests,
            Item: {
              id: row.id,
              clinic_id: row.clinic_id,
              user_id: row.user_id,
              lock_expires_at: row.lock_expires_at,
              reserve_units: row.reserve_units ?? 1,
              created_at: row.created_at ?? new Date().toISOString()
            }
          })
        );
      },
      async setLockExpired(requestId, nowIso) {
        const cur = await doc.send(new GetCommand({ TableName: T.shadowingRequests, Key: { id: requestId } }));
        if (!cur.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.shadowingRequests,
            Item: { ...cur.Item, lock_expires_at: nowIso }
          })
        );
      },
      async countActiveForUser(userId, nowIso) {
        const items = [];
        let ExclusiveStartKey;
        do {
          const out = await doc.send(
            new QueryCommand({
              TableName: T.shadowingRequests,
              IndexName: "UserIdIndex",
              KeyConditionExpression: "user_id = :u",
              FilterExpression: "lock_expires_at > :n",
              ExpressionAttributeValues: { ":u": userId, ":n": nowIso },
              ExclusiveStartKey
            })
          );
          items.push(...(out.Items ?? []));
          ExclusiveStartKey = out.LastEvaluatedKey;
        } while (ExclusiveStartKey);
        return items.length;
      },
      async deleteExpired(nowIso) {
        const items = await scanAll(doc, {
          TableName: T.shadowingRequests,
          FilterExpression: "attribute_exists(lock_expires_at) AND lock_expires_at <= :n",
          ExpressionAttributeValues: { ":n": nowIso }
        });
        for (const it of items) {
          await doc.send(new DeleteCommand({ TableName: T.shadowingRequests, Key: { id: it.id } }));
        }
        return { changes: items.length };
      },
      async unlockClinicsExpired(nowIso) {
        const items = await scanAll(doc, {
          TableName: T.clinics,
          FilterExpression: "attribute_exists(lock_expires_at) AND lock_expires_at <= :n",
          ExpressionAttributeValues: { ":n": nowIso }
        });
        let changes = 0;
        for (const it of items) {
          await doc.send(
            new PutCommand({
              TableName: T.clinics,
              Item: { ...it, lock_expires_at: null, locked_by_request_id: null }
            })
          );
          changes += 1;
        }
        return { changes };
      }
    },

    users: {
      async existsEmail(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        return out.Item ? { email } : null;
      },
      async insert(email, passwordHash) {
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              email,
              password_hash: passwordHash,
              created_at: new Date().toISOString(),
              is_verified: 0,
              verification_attempts: 0,
              password_reset_attempts: 0
            }
          })
        );
      },
      async insertGoogle(email, googleSub) {
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              email,
              google_sub: googleSub,
              created_at: new Date().toISOString(),
              is_verified: 1,
              verification_attempts: 0,
              password_reset_attempts: 0
            }
          })
        );
      },
      async linkGoogle(email, googleSub) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              ...out.Item,
              google_sub: googleSub,
              is_verified: 1
            }
          })
        );
      },
      async findByGoogleSub(googleSub) {
        const items = await scanAll(doc, {
          TableName: T.users,
          FilterExpression: "google_sub = :g",
          ExpressionAttributeValues: { ":g": googleSub }
        });
        const it = items[0];
        return it ? { email: it.email, google_sub: it.google_sub } : null;
      },
      async findForLogin(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        return out.Item ?? null;
      },
      async findVerificationSentAt(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        return out.Item ? { verification_sent_at: out.Item.verification_sent_at } : null;
      },
      async updateVerificationSend(email, code, expiresAt, sentAt) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              ...out.Item,
              verification_code: code,
              verification_expires_at: expiresAt,
              verification_sent_at: sentAt,
              verification_attempts: 0,
              verification_locked_until: null
            }
          })
        );
      },
      async findVerificationState(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return null;
        const it = out.Item;
        return {
          verification_code: it.verification_code,
          verification_expires_at: it.verification_expires_at,
          verification_attempts: it.verification_attempts,
          verification_locked_until: it.verification_locked_until
        };
      },
      async setVerificationAttemptsLock(email, attempts, lockUntil) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: { ...out.Item, verification_attempts: attempts, verification_locked_until: lockUntil }
          })
        );
      },
      async bumpVerificationAttempts(email, attempts) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(new PutCommand({ TableName: T.users, Item: { ...out.Item, verification_attempts: attempts } }));
      },
      async verifySuccess(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              ...out.Item,
              is_verified: 1,
              verification_code: null,
              verification_expires_at: null,
              verification_sent_at: null,
              verification_attempts: 0,
              verification_locked_until: null
            }
          })
        );
      },
      async findPasswordResetSentAt(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        return out.Item ? { password_reset_sent_at: out.Item.password_reset_sent_at } : null;
      },
      async updatePasswordResetSend(email, code, expiresAt, sentAt) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              ...out.Item,
              password_reset_code: code,
              password_reset_expires_at: expiresAt,
              password_reset_sent_at: sentAt,
              password_reset_attempts: 0,
              password_reset_locked_until: null
            }
          })
        );
      },
      async findPasswordResetState(email) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return null;
        const it = out.Item;
        return {
          password_reset_code: it.password_reset_code,
          password_reset_expires_at: it.password_reset_expires_at,
          password_reset_attempts: it.password_reset_attempts,
          password_reset_locked_until: it.password_reset_locked_until
        };
      },
      async setPasswordResetAttemptsLock(email, attempts, lockUntil) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: { ...out.Item, password_reset_attempts: attempts, password_reset_locked_until: lockUntil }
          })
        );
      },
      async bumpPasswordResetAttempts(email, attempts) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({ TableName: T.users, Item: { ...out.Item, password_reset_attempts: attempts } })
        );
      },
      async updatePasswordClearReset(email, passwordHash) {
        const out = await doc.send(new GetCommand({ TableName: T.users, Key: { email } }));
        if (!out.Item) return;
        await doc.send(
          new PutCommand({
            TableName: T.users,
            Item: {
              ...out.Item,
              password_hash: passwordHash,
              password_reset_code: null,
              password_reset_expires_at: null,
              password_reset_sent_at: null,
              password_reset_attempts: 0,
              password_reset_locked_until: null
            }
          })
        );
      }
    },

    qualityFlags: {
      async listWithClinicNames() {
        const flags = await scanAll(doc, { TableName: T.qualityFlags });
        const clinicsMap = Object.fromEntries(
          (await scanAll(doc, { TableName: T.clinics })).map((c) => [c.id, c.name])
        );
        const rows = flags.map((f) => ({
          ...f,
          clinic_name: clinicsMap[f.clinic_id] ?? null
        }));
        rows.sort((a, b) => {
          const ao = a.status === "open" ? 0 : 1;
          const bo = b.status === "open" ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return String(b.created_at).localeCompare(String(a.created_at));
        });
        return rows;
      },
      async insert(row) {
        await doc.send(
          new PutCommand({
            TableName: T.qualityFlags,
            Item: {
              id: row.id,
              clinic_id: row.clinic_id,
              flag_type: row.flag_type,
              notes: row.notes ?? "",
              status: "open",
              created_by_user_id: row.created_by_user_id,
              created_at: new Date().toISOString()
            }
          })
        );
      },
      async resolve(id, resolvedBy, resolvedAt) {
        const out = await doc.send(new GetCommand({ TableName: T.qualityFlags, Key: { id } }));
        if (!out.Item) return { changes: 0 };
        await doc.send(
          new PutCommand({
            TableName: T.qualityFlags,
            Item: {
              ...out.Item,
              status: "resolved",
              resolved_by_user_id: resolvedBy,
              resolved_at: resolvedAt
            }
          })
        );
        return { changes: 1 };
      },
      async deleteById(id) {
        const out = await doc.send(new GetCommand({ TableName: T.qualityFlags, Key: { id } }));
        if (!out.Item) return { changes: 0 };
        await doc.send(new DeleteCommand({ TableName: T.qualityFlags, Key: { id } }));
        return { changes: 1 };
      },
      async clinicIdName(clinicId) {
        const out = await doc.send(new GetCommand({ TableName: T.clinics, Key: { id: clinicId } }));
        return out.Item ? { id: out.Item.id, name: out.Item.name } : null;
      }
    },

    experiences: {
      async listFiltered(userId, q) {
        const out = await doc.send(
          new QueryCommand({
            TableName: T.experiences,
            IndexName: "UserIdIndex",
            KeyConditionExpression: "user_id = :u",
            ExpressionAttributeValues: { ":u": userId }
          })
        );
        let rows = out.Items ?? [];
        const lc = (s) => String(s ?? "").toLowerCase();
        if (q.clinic) {
          const term = lc(q.clinic);
          rows = rows.filter((r) => lc(r.organization_name).includes(term));
        }
        if (q.supervisor) {
          const term = lc(q.supervisor);
          rows = rows.filter(
            (r) =>
              lc(r.supervisor_first_name).includes(term) || lc(r.supervisor_last_name).includes(term)
          );
        }
        if (q.phone) {
          rows = rows.filter((r) => String(r.supervisor_phone ?? "").includes(q.phone));
        }
        if (q.email) {
          const term = lc(q.email);
          rows = rows.filter((r) => lc(r.supervisor_email).includes(term));
        }
        if (q.type) {
          rows = rows.filter((r) => r.experience_type === q.type);
        }
        rows.sort((a, b) => {
          const ds = String(b.date_start ?? "").localeCompare(String(a.date_start ?? ""));
          if (ds !== 0) return ds;
          return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
        });
        return rows;
      },
      async insert(row) {
        await doc.send(new PutCommand({ TableName: T.experiences, Item: { ...row } }));
      },
      async update(row) {
        const out = await doc.send(new GetCommand({ TableName: T.experiences, Key: { id: row.id } }));
        if (!out.Item || out.Item.user_id !== row.user_id) return { changes: 0 };
        await doc.send(new PutCommand({ TableName: T.experiences, Item: { ...out.Item, ...row } }));
        return { changes: 1 };
      },
      async delete(id, userId) {
        const out = await doc.send(new GetCommand({ TableName: T.experiences, Key: { id } }));
        if (!out.Item || out.Item.user_id !== userId) return { changes: 0 };
        await doc.send(new DeleteCommand({ TableName: T.experiences, Key: { id } }));
        return { changes: 1 };
      }
    },

    projects: {
      async listByUser(userId) {
        const out = await doc.send(
          new QueryCommand({
            TableName: T.projects,
            IndexName: "UserIdIndex",
            KeyConditionExpression: "user_id = :u",
            ExpressionAttributeValues: { ":u": userId }
          })
        );
        const items = [...(out.Items ?? [])];
        items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return items;
      },
      async sessionsByProject(projectId) {
        const out = await doc.send(
          new QueryCommand({
            TableName: T.placementSessions,
            IndexName: "ProjectIdIndex",
            KeyConditionExpression: "project_id = :p",
            ExpressionAttributeValues: { ":p": projectId }
          })
        );
        const items = [...(out.Items ?? [])];
        items.sort((a, b) => {
          const da = String(a.date ?? "").localeCompare(String(b.date ?? ""));
          if (da !== 0) return da;
          return String(a.created_at).localeCompare(String(b.created_at));
        });
        return items;
      },
      async findOwnedId(projectId, userId) {
        const out = await doc.send(new GetCommand({ TableName: T.projects, Key: { id: projectId } }));
        if (!out.Item || out.Item.user_id !== userId) return null;
        return { id: out.Item.id };
      },
      async findOwnedFull(projectId, userId) {
        const out = await doc.send(new GetCommand({ TableName: T.projects, Key: { id: projectId } }));
        if (!out.Item || out.Item.user_id !== userId) return null;
        return out.Item;
      },
      async insert(row) {
        await doc.send(new PutCommand({ TableName: T.projects, Item: { ...row } }));
      },
      async update(row) {
        const out = await doc.send(new GetCommand({ TableName: T.projects, Key: { id: row.id } }));
        if (!out.Item || out.Item.user_id !== row.user_id) return;
        await doc.send(new PutCommand({ TableName: T.projects, Item: { ...out.Item, ...row } }));
      },
      async deleteCascade(projectId) {
        const sess = await this.sessionsByProject(projectId);
        for (const s of sess) {
          await doc.send(new DeleteCommand({ TableName: T.placementSessions, Key: { id: s.id } }));
        }
        await doc.send(new DeleteCommand({ TableName: T.projects, Key: { id: projectId } }));
        return { changes: 1 };
      }
    },

    placementSessions: {
      async insert(row) {
        await doc.send(new PutCommand({ TableName: T.placementSessions, Item: { ...row } }));
      },
      async delete(projectId, sessionId) {
        const out = await doc.send(new GetCommand({ TableName: T.placementSessions, Key: { id: sessionId } }));
        if (!out.Item || out.Item.project_id !== projectId) return { changes: 0 };
        await doc.send(new DeleteCommand({ TableName: T.placementSessions, Key: { id: sessionId } }));
        return { changes: 1 };
      }
    },

    adminCleanup: {
      async duplicateClinicNames() {
        const clinics = await scanAll(doc, { TableName: T.clinics });
        const groups = new Map();
        for (const c of clinics) {
          const key = String(c.name ?? "")
            .trim()
            .toLowerCase();
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(c);
        }
        const rows = [];
        for (const [normalized_name, list] of groups) {
          if (list.length <= 1) continue;
          rows.push({
            normalized_name,
            count: list.length,
            clinic_ids: list.map((x) => x.id).join("|"),
            clinic_names: list.map((x) => x.name).join("|")
          });
        }
        rows.sort((a, b) => b.count - a.count || a.normalized_name.localeCompare(b.normalized_name));
        return rows;
      },
      async missingContactClinics() {
        const items = await scanAll(doc, { TableName: T.clinics });
        return items
          .filter((c) => !String(c.phone ?? "").trim() && !String(c.email ?? "").trim())
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      },
      async staleClinics() {
        const items = await scanAll(doc, { TableName: T.clinics });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 180);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        return items
          .filter((c) => !c.last_verified_at || String(c.last_verified_at) < cutoffStr)
          .sort((a, b) =>
            String(a.last_verified_at ?? "").localeCompare(String(b.last_verified_at ?? ""))
          );
      }
    },

    rateLimits: {
      async isRateLimited(key, maxAttempts, windowMs, now = Date.now()) {
        if (!T.rateLimits) return false;
        const out = await doc.send(new GetCommand({ TableName: T.rateLimits, Key: { key } }));
        const item = out.Item;
        if (!item) return false;
        const windowStart = Number(item.window_start ?? 0);
        if (now - windowStart > windowMs) return false;
        return Number(item.count ?? 0) >= maxAttempts;
      },

      async recordFailedAttempt(key, windowMs, now = Date.now()) {
        if (!T.rateLimits) return;
        const ttl = Math.floor((now + windowMs) / 1000) + 3600;
        const out = await doc.send(new GetCommand({ TableName: T.rateLimits, Key: { key } }));
        const item = out.Item;
        const windowStart = Number(item?.window_start ?? 0);
        if (!item || now - windowStart > windowMs) {
          await doc.send(
            new PutCommand({
              TableName: T.rateLimits,
              Item: { key, count: 1, window_start: now, ttl }
            })
          );
          return;
        }
        await doc.send(
          new UpdateCommand({
            TableName: T.rateLimits,
            Key: { key },
            UpdateExpression: "SET #c = #c + :one, #ttl = :ttl",
            ExpressionAttributeNames: { "#c": "count", "#ttl": "ttl" },
            ExpressionAttributeValues: { ":one": 1, ":ttl": ttl }
          })
        );
      },

      async clear(key) {
        if (!T.rateLimits) return;
        await doc.send(new DeleteCommand({ TableName: T.rateLimits, Key: { key } }));
      }
    }
  };
}
