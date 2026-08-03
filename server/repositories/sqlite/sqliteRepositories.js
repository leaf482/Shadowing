import { createInMemoryRateLimits } from "../rateLimits/inMemoryRateLimits.js";

/**
 * SQLite-backed repository implementation for server routes.
 * Mirrors DynamoDB repo API (createDynamoRepositories).
 */
export function createSqliteRepositories(db) {
  return {
    backend: "sqlite",

    auditLogs: {
      async insert(row) {
        await db.run(
          `insert into admin_audit_logs (id, actor_user_id, action, target_type, target_id, details)
           values (?, ?, ?, ?, ?, ?)`,
          [row.id, row.actor_user_id, row.action, row.target_type, row.target_id, row.details]
        );
      },
      async listRecent100() {
        return db.all("select * from admin_audit_logs order by created_at desc limit 100");
      }
    },

    authSessions: {
      async insert(token, userId, createdAt) {
        await db.run("insert into auth_sessions (token, user_id, created_at) values (?, ?, ?)", [
          token,
          userId,
          createdAt
        ]);
      },
      async deleteByToken(token) {
        await db.run("delete from auth_sessions where token = ?", [token]);
      },
      async deleteAllForUser(userId) {
        await db.run("delete from auth_sessions where user_id = ?", [userId]);
      },
      async findByToken(token) {
        return db.get("select user_id, created_at from auth_sessions where token = ?", [token]);
      },
      async updateCreatedAt(token, createdAt) {
        await db.run("update auth_sessions set created_at = ? where token = ?", [createdAt, token]);
      }
    },

    clinics: {
      async selectAllOrdered() {
        return db.all("select * from clinics order by name");
      },
      async selectLockColumns() {
        return db.all("select id, lock_expires_at, locked_by_request_id from clinics");
      },
      async selectIdAndCreatedBy() {
        return db.all("select id, created_by_user_id from clinics");
      },
      async findById(id) {
        return db.get("select * from clinics where id = ?", [id]);
      },
      async insert(row) {
        await db.run(
          `insert into clinics (id, name, address, phone, email, lat, lng, zip, shadowing_status, primary_specialty, secondary_filters, notes, last_verified_at, created_by_user_id)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.name,
            row.address,
            row.phone,
            row.email,
            row.lat,
            row.lng,
            row.zip,
            row.shadowing_status,
            row.primary_specialty,
            row.secondary_filters,
            row.notes,
            row.last_verified_at,
            row.created_by_user_id
          ]
        );
      },
      async updateFull(row) {
        await db.run(
          `update clinics
           set name = ?, address = ?, phone = ?, email = ?, lat = ?, lng = ?, zip = ?, shadowing_status = ?, primary_specialty = ?, secondary_filters = ?, notes = ?, last_verified_at = ?
           where id = ?`,
          [
            row.name,
            row.address,
            row.phone,
            row.email,
            row.lat,
            row.lng,
            row.zip,
            row.shadowing_status,
            row.primary_specialty,
            row.secondary_filters,
            row.notes,
            row.last_verified_at,
            row.id
          ]
        );
      },
      async deleteById(id) {
        await db.run("delete from shadowing_requests where clinic_id = ?", [id]);
        await db.run("delete from clinics where id = ?", [id]);
      },
      async deleteAll() {
        await db.run("delete from shadowing_requests");
        return db.run("delete from clinics");
      },
      async setLock(clinicId, lockExpiresAt, lockedByRequestId) {
        await db.run(
          "update clinics set lock_expires_at = ?, locked_by_request_id = ? where id = ?",
          [lockExpiresAt, lockedByRequestId, clinicId]
        );
      },
      async tryAcquireLock(clinicId, lockExpiresAt, lockedByRequestId, nowIso) {
        const result = await db.run(
          `update clinics
             set lock_expires_at = ?, locked_by_request_id = ?
           where id = ?
             and (lock_expires_at is null or lock_expires_at <= ?)`,
          [lockExpiresAt, lockedByRequestId, clinicId, nowIso]
        );
        return Number(result?.changes ?? 0) > 0;
      },
      async clearLockByRequestId(requestId) {
        await db.run(
          "update clinics set lock_expires_at = null, locked_by_request_id = null where locked_by_request_id = ?",
          [requestId]
        );
      },
      async findIdNameByLockedRequest(requestId) {
        return db.get("select id, name from clinics where locked_by_request_id = ?", [requestId]);
      },
      async selectActiveReservesJoin(nowIso) {
        return db.all(
          `
          select
            c.id as clinic_id,
            c.name as clinic_name,
            c.shadowing_status,
            c.lock_expires_at,
            c.locked_by_request_id,
            r.user_id,
            r.created_at,
            r.reserve_units
          from clinics c
          left join shadowing_requests r on r.id = c.locked_by_request_id
          where c.lock_expires_at is not null and c.lock_expires_at > ?
          order by c.lock_expires_at asc
        `,
          [nowIso]
        );
      }
    },

    shadowingRequests: {
      async insert(row) {
        await db.run(
          "insert into shadowing_requests (id, clinic_id, user_id, lock_expires_at, reserve_units) values (?, ?, ?, ?, ?)",
          [row.id, row.clinic_id, row.user_id, row.lock_expires_at, row.reserve_units ?? 1]
        );
      },
      async setLockExpired(requestId, nowIso) {
        await db.run("update shadowing_requests set lock_expires_at = ? where id = ?", [
          nowIso,
          requestId
        ]);
      },
      async countActiveForUser(userId, nowIso) {
        const row = await db.get(
          "select count(*) as count from shadowing_requests where user_id = ? and lock_expires_at > ?",
          [userId, nowIso]
        );
        return Number(row?.count ?? 0);
      },
      async deleteExpired(nowIso) {
        return db.run(
          "delete from shadowing_requests where lock_expires_at is not null and lock_expires_at <= ?",
          [nowIso]
        );
      },
      async unlockClinicsExpired(nowIso) {
        return db.run(
          `update clinics
             set lock_expires_at = null, locked_by_request_id = null
           where lock_expires_at is not null and lock_expires_at <= ?`,
          [nowIso]
        );
      }
    },

    users: {
      async existsEmail(email) {
        return db.get("select email from users where email = ?", [email]);
      },
      async insert(email, passwordHash) {
        await db.run("insert into users (email, password_hash) values (?, ?)", [email, passwordHash]);
      },
      async findForLogin(email) {
        return db.get(
          "select email, password_hash, is_verified, google_sub from users where email = ?",
          [email]
        );
      },
      async findVerificationSentAt(email) {
        return db.get("select verification_sent_at from users where email = ?", [email]);
      },
      async updateVerificationSend(email, code, expiresAt, sentAt) {
        await db.run(
          `update users
           set verification_code = ?,
               verification_expires_at = ?,
               verification_sent_at = ?,
               verification_attempts = 0,
               verification_locked_until = null
           where email = ?`,
          [code, expiresAt, sentAt, email]
        );
      },
      async findVerificationState(email) {
        return db.get(
          `select verification_code, verification_expires_at, verification_attempts, verification_locked_until
           from users where email = ?`,
          [email]
        );
      },
      async setVerificationAttemptsLock(email, attempts, lockUntil) {
        await db.run("update users set verification_attempts = ?, verification_locked_until = ? where email = ?", [
          attempts,
          lockUntil,
          email
        ]);
      },
      async bumpVerificationAttempts(email, attempts) {
        await db.run("update users set verification_attempts = ? where email = ?", [attempts, email]);
      },
      async verifySuccess(email) {
        await db.run(
          `update users
           set is_verified = 1,
               verification_code = null,
               verification_expires_at = null,
               verification_sent_at = null,
               verification_attempts = 0,
               verification_locked_until = null
           where email = ?`,
          [email]
        );
      },
      async findPasswordResetSentAt(email) {
        return db.get("select password_reset_sent_at from users where email = ?", [email]);
      },
      async updatePasswordResetSend(email, code, expiresAt, sentAt) {
        await db.run(
          `update users
           set password_reset_code = ?,
               password_reset_expires_at = ?,
               password_reset_sent_at = ?,
               password_reset_attempts = 0,
               password_reset_locked_until = null
           where email = ?`,
          [code, expiresAt, sentAt, email]
        );
      },
      async findPasswordResetState(email) {
        return db.get(
          `select password_reset_code, password_reset_expires_at, password_reset_attempts, password_reset_locked_until
           from users where email = ?`,
          [email]
        );
      },
      async setPasswordResetAttemptsLock(email, attempts, lockUntil) {
        await db.run(
          "update users set password_reset_attempts = ?, password_reset_locked_until = ? where email = ?",
          [attempts, lockUntil, email]
        );
      },
      async bumpPasswordResetAttempts(email, attempts) {
        await db.run("update users set password_reset_attempts = ? where email = ?", [attempts, email]);
      },
      async updatePasswordClearReset(email, passwordHash) {
        await db.run(
          `update users
           set password_hash = ?,
               password_reset_code = null,
               password_reset_expires_at = null,
               password_reset_sent_at = null,
               password_reset_attempts = 0,
               password_reset_locked_until = null
           where email = ?`,
          [passwordHash, email]
        );
      }
    },

    qualityFlags: {
      async listWithClinicNames() {
        return db.all(`
          select f.*, c.name as clinic_name
          from clinic_quality_flags f
          left join clinics c on c.id = f.clinic_id
          order by
            case when f.status = 'open' then 0 else 1 end,
            f.created_at desc
        `);
      },
      async insert(row) {
        await db.run(
          `insert into clinic_quality_flags (id, clinic_id, flag_type, notes, created_by_user_id)
           values (?, ?, ?, ?, ?)`,
          [row.id, row.clinic_id, row.flag_type, row.notes, row.created_by_user_id]
        );
      },
      async resolve(id, resolvedBy, resolvedAt) {
        return db.run(
          `update clinic_quality_flags
             set status = 'resolved', resolved_by_user_id = ?, resolved_at = ?
           where id = ?`,
          [resolvedBy, resolvedAt, id]
        );
      },
      async deleteById(id) {
        return db.run("delete from clinic_quality_flags where id = ?", [id]);
      },
      async clinicIdName(clinicId) {
        return db.get("select id, name from clinics where id = ?", [clinicId]);
      }
    },

    experiences: {
      async listFiltered(userId, q) {
        let sql = "select * from experiences where user_id = ?";
        const params = [userId];
        if (q.clinic) {
          sql += " and lower(organization_name) like lower(?)";
          params.push(`%${q.clinic}%`);
        }
        if (q.supervisor) {
          sql +=
            " and (lower(supervisor_first_name) like lower(?) or lower(supervisor_last_name) like lower(?))";
          params.push(`%${q.supervisor}%`, `%${q.supervisor}%`);
        }
        if (q.phone) {
          sql += " and supervisor_phone like ?";
          params.push(`%${q.phone}%`);
        }
        if (q.email) {
          sql += " and lower(supervisor_email) like lower(?)";
          params.push(`%${q.email}%`);
        }
        if (q.type) {
          sql += " and experience_type = ?";
          params.push(q.type);
        }
        sql += " order by date_start desc, created_at desc";
        return db.all(sql, params);
      },
      async insert(row) {
        await db.run(
          `insert into experiences (
            id, user_id, experience_type, organization_name, address, address2, city, state_province, country, zip,
            supervisor_first_name, supervisor_last_name, supervisor_title, supervisor_phone, supervisor_email,
            hours, date_start, date_end, notes, description, avg_weekly_hours, number_of_weeks,
            current_experience, status, title, type_compensated, type_academic_credit, type_volunteer
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.user_id,
            row.experience_type,
            row.organization_name,
            row.address,
            row.address2,
            row.city,
            row.state_province,
            row.country,
            row.zip,
            row.supervisor_first_name,
            row.supervisor_last_name,
            row.supervisor_title,
            row.supervisor_phone,
            row.supervisor_email,
            row.hours,
            row.date_start,
            row.date_end,
            row.notes,
            row.description,
            row.avg_weekly_hours,
            row.number_of_weeks,
            row.current_experience,
            row.status,
            row.title,
            row.type_compensated,
            row.type_academic_credit,
            row.type_volunteer
          ]
        );
      },
      async update(row) {
        return db.run(
          `update experiences set
            experience_type = ?, organization_name = ?, address = ?, address2 = ?, city = ?, state_province = ?, country = ?, zip = ?,
            supervisor_first_name = ?, supervisor_last_name = ?, supervisor_title = ?, supervisor_phone = ?, supervisor_email = ?,
            hours = ?, date_start = ?, date_end = ?, notes = ?, description = ?, avg_weekly_hours = ?, number_of_weeks = ?,
            current_experience = ?, status = ?, title = ?, type_compensated = ?, type_academic_credit = ?, type_volunteer = ?
          where id = ? and user_id = ?`,
          [
            row.experience_type,
            row.organization_name,
            row.address,
            row.address2,
            row.city,
            row.state_province,
            row.country,
            row.zip,
            row.supervisor_first_name,
            row.supervisor_last_name,
            row.supervisor_title,
            row.supervisor_phone,
            row.supervisor_email,
            row.hours,
            row.date_start,
            row.date_end,
            row.notes,
            row.description,
            row.avg_weekly_hours,
            row.number_of_weeks,
            row.current_experience,
            row.status,
            row.title,
            row.type_compensated,
            row.type_academic_credit,
            row.type_volunteer,
            row.id,
            row.user_id
          ]
        );
      },
      async delete(id, userId) {
        return db.run("delete from experiences where id = ? and user_id = ?", [id, userId]);
      }
    },

    projects: {
      async listByUser(userId) {
        return db.all("select * from projects where user_id = ? order by created_at desc", [userId]);
      },
      async sessionsByProject(projectId) {
        return db.all(
          "select * from sessions where project_id = ? order by date asc, created_at asc",
          [projectId]
        );
      },
      async findOwnedId(projectId, userId) {
        return db.get("select id from projects where id = ? and user_id = ?", [projectId, userId]);
      },
      async findOwnedFull(projectId, userId) {
        return db.get("select * from projects where id = ? and user_id = ?", [projectId, userId]);
      },
      async insert(row) {
        await db.run(
          `insert into projects (
            id, user_id, name, date_start, clinic_id, experience_type,
            address, address2, city, state_province, country, zip,
            supervisor_first_name, supervisor_last_name, supervisor_title,
            supervisor_phone, supervisor_email,
            status, description, notes
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.user_id,
            row.name,
            row.date_start,
            row.clinic_id,
            row.experience_type,
            row.address,
            row.address2,
            row.city,
            row.state_province,
            row.country,
            row.zip,
            row.supervisor_first_name,
            row.supervisor_last_name,
            row.supervisor_title,
            row.supervisor_phone,
            row.supervisor_email,
            row.status,
            row.description,
            row.notes
          ]
        );
      },
      async update(row) {
        await db.run(
          `update projects
             set name = ?, date_start = ?, clinic_id = ?, experience_type = ?,
                 address = ?, address2 = ?, city = ?, state_province = ?, country = ?, zip = ?,
                 supervisor_first_name = ?, supervisor_last_name = ?, supervisor_title = ?,
                 supervisor_phone = ?, supervisor_email = ?,
                 status = ?, description = ?, notes = ?
           where id = ? and user_id = ?`,
          [
            row.name,
            row.date_start,
            row.clinic_id,
            row.experience_type,
            row.address,
            row.address2,
            row.city,
            row.state_province,
            row.country,
            row.zip,
            row.supervisor_first_name,
            row.supervisor_last_name,
            row.supervisor_title,
            row.supervisor_phone,
            row.supervisor_email,
            row.status,
            row.description,
            row.notes,
            row.id,
            row.user_id
          ]
        );
      },
      async deleteCascade(projectId) {
        await db.run("delete from sessions where project_id = ?", [projectId]);
        return db.run("delete from projects where id = ?", [projectId]);
      }
    },

    placementSessions: {
      async insert(row) {
        await db.run("insert into sessions (id, project_id, date, hours, notes) values (?, ?, ?, ?, ?)", [
          row.id,
          row.project_id,
          row.date,
          row.hours,
          row.notes
        ]);
      },
      async delete(projectId, sessionId) {
        return db.run("delete from sessions where id = ? and project_id = ?", [sessionId, projectId]);
      }
    },

    adminCleanup: {
      async duplicateClinicNames() {
        return db.all(`
          select lower(trim(name)) as normalized_name, count(*) as count, group_concat(id, '|') as clinic_ids, group_concat(name, '|') as clinic_names
          from clinics
          group by lower(trim(name))
          having count(*) > 1
          order by count desc, normalized_name asc
        `);
      },
      async missingContactClinics() {
        return db.all(`
          select id, name, phone, email, shadowing_status
          from clinics
          where coalesce(trim(phone), '') = '' and coalesce(trim(email), '') = ''
          order by name asc
        `);
      },
      async staleClinics() {
        return db.all(`
          select id, name, last_verified_at, shadowing_status
          from clinics
          where last_verified_at is null or last_verified_at < date('now', '-180 days')
          order by last_verified_at asc, name asc
        `);
      }
    },

    rateLimits: createInMemoryRateLimits(),
  };
}
