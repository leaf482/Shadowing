import { useEffect, useMemo, useState } from "react";
import { authFetch, formatApiErrorMessage } from "../lib/auth.js";

const FLAG_TYPES = [
  { value: "duplicate", label: "Duplicate" },
  { value: "wrong_contact", label: "Wrong contact info" },
  { value: "outdated_status", label: "Outdated status" },
  { value: "not_dental_clinic", label: "Not a dental clinic" },
  { value: "needs_verification", label: "Needs verification" },
  { value: "other", label: "Other" },
];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function detailsSummary(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

export default function AdminPage({ clinics = [] }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [reserves, setReserves] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [flagClinicId, setFlagClinicId] = useState("");
  const [flagType, setFlagType] = useState("needs_verification");
  const [flagNotes, setFlagNotes] = useState("");
  const [cleanupResults, setCleanupResults] = useState({});

  const sortedClinics = useMemo(
    () => [...clinics].sort((a, b) => a.name.localeCompare(b.name)),
    [clinics]
  );

  const loadAdminData = async () => {
    setError("");
    setLoading(true);
    try {
      const [auditRes, reservesRes, flagsRes] = await Promise.all([
        authFetch("/api/admin/audit-logs"),
        authFetch("/api/admin/reserves"),
        authFetch("/api/admin/quality-flags"),
      ]);

      if (!auditRes.ok) throw new Error(await formatApiErrorMessage(auditRes, "Could not load audit log."));
      if (!reservesRes.ok) throw new Error(await formatApiErrorMessage(reservesRes, "Could not load reserves."));
      if (!flagsRes.ok) throw new Error(await formatApiErrorMessage(flagsRes, "Could not load quality flags."));

      setAuditLogs(await auditRes.json());
      setReserves(await reservesRes.json());
      setFlags(await flagsRes.json());
    } catch (loadError) {
      setError(loadError?.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleUnreserve = async (requestId) => {
    if (!requestId) return;
    if (!confirm("Release this reserve?")) return;
    setActionMessage("");
    const res = await authFetch(`/api/admin/reserves/${requestId}`, { method: "DELETE" });
    if (res.ok) {
      setActionMessage("Reserve released.");
      await loadAdminData();
    } else {
      setError(await formatApiErrorMessage(res, "Could not release reserve."));
    }
  };

  const handleCreateFlag = async (event) => {
    event.preventDefault();
    setError("");
    setActionMessage("");
    const res = await authFetch("/api/admin/quality-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId: flagClinicId,
        flagType,
        notes: flagNotes.trim(),
      }),
    });
    if (res.ok) {
      setActionMessage("Flag created.");
      setFlagNotes("");
      await loadAdminData();
    } else {
      setError(await formatApiErrorMessage(res, "Could not create flag."));
    }
  };

  const handleResolveFlag = async (flagId) => {
    const res = await authFetch(`/api/admin/quality-flags/${flagId}/resolve`, { method: "PUT" });
    if (res.ok) {
      setActionMessage("Flag resolved.");
      await loadAdminData();
    } else {
      setError(await formatApiErrorMessage(res, "Could not resolve flag."));
    }
  };

  const handleDeleteFlag = async (flagId) => {
    if (!confirm("Delete this flag?")) return;
    const res = await authFetch(`/api/admin/quality-flags/${flagId}`, { method: "DELETE" });
    if (res.ok) {
      setActionMessage("Flag deleted.");
      await loadAdminData();
    } else {
      setError(await formatApiErrorMessage(res, "Could not delete flag."));
    }
  };

  const loadCleanupReport = async (key, endpoint) => {
    setError("");
    const res = await authFetch(endpoint);
    if (res.ok) {
      const rows = await res.json();
      setCleanupResults((prev) => ({ ...prev, [key]: rows }));
    } else {
      setError(await formatApiErrorMessage(res, "Could not load cleanup report."));
    }
  };

  const clearExpiredReserves = async () => {
    if (!confirm("Clear expired reserve records and stale locks?")) return;
    const res = await authFetch("/api/admin/cleanup/expired-reserves", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setActionMessage(`Expired cleanup complete: ${data.unlockedClinics} clinics unlocked, ${data.deletedRequests} requests deleted.`);
      await loadAdminData();
    } else {
      setError(await formatApiErrorMessage(res, "Could not clean expired reserves."));
    }
  };

  return (
    <div className="admin-page">
      <div className="topbar">
        <div className="page-header">
          <p className="eyebrow">Admin Mode</p>
          <h1>Admin tools</h1>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            Review system activity, manage reserves, flag data issues, and run cleanup checks.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={loadAdminData} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <p className="admin-alert admin-alert--error" role="alert">{error}</p>}
      {actionMessage && <p className="admin-alert admin-alert--success">{actionMessage}</p>}

      <div className="admin-grid">
        <section className="card admin-card">
          <div className="admin-card__head">
            <h2>Reserve Management</h2>
            <span className="results-count">{reserves.length} active</span>
          </div>
          {reserves.length === 0 ? (
            <p className="muted small">No active reserves.</p>
          ) : (
            <div className="admin-list">
              {reserves.map((reserve) => (
                <div className="admin-list__item" key={reserve.requestId}>
                  <div>
                    <strong>{reserve.clinicName}</strong>
                    <p className="muted small">
                      {reserve.userId || "Legacy / no user"} · until {formatDate(reserve.lockExpiresAt)}
                    </p>
                  </div>
                  <button type="button" className="button button--secondary button--small" onClick={() => handleUnreserve(reserve.requestId)}>
                    Unreserve
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card admin-card">
          <div className="admin-card__head">
            <h2>Data Quality Flags</h2>
            <span className="results-count">{flags.filter((flag) => flag.status === "open").length} open</span>
          </div>
          <form className="admin-flag-form" onSubmit={handleCreateFlag}>
            <select value={flagClinicId} onChange={(event) => setFlagClinicId(event.target.value)} required>
              <option value="">Select clinic</option>
              {sortedClinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
            <select value={flagType} onChange={(event) => setFlagType(event.target.value)}>
              {FLAG_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <textarea
              value={flagNotes}
              onChange={(event) => setFlagNotes(event.target.value)}
              rows={2}
              placeholder="Notes for admins"
            />
            <button type="submit" className="button button--primary button--small">Add flag</button>
          </form>
          <div className="admin-list admin-list--compact">
            {flags.slice(0, 12).map((flag) => (
              <div className="admin-list__item" key={flag.id}>
                <div>
                  <strong>{flag.clinicName || "Unknown clinic"}</strong>
                  <p className="muted small">{flag.flagType} · {flag.status} · {flag.notes || "No notes"}</p>
                </div>
                <div className="admin-actions">
                  {flag.status === "open" && (
                    <button type="button" className="text-button" onClick={() => handleResolveFlag(flag.id)}>Resolve</button>
                  )}
                  <button type="button" className="text-button text-button--danger" onClick={() => handleDeleteFlag(flag.id)}>Delete</button>
                </div>
              </div>
            ))}
            {flags.length === 0 && <p className="muted small">No quality flags yet.</p>}
          </div>
        </section>

        <section className="card admin-card">
          <div className="admin-card__head">
            <h2>Bulk Cleanup Tools</h2>
          </div>
          <div className="admin-tool-row">
            <button type="button" className="button button--secondary button--small" onClick={clearExpiredReserves}>
              Clear expired reserves
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => loadCleanupReport("duplicates", "/api/admin/cleanup/duplicates")}>
              Find duplicates
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => loadCleanupReport("missingContact", "/api/admin/cleanup/missing-contact")}>
              Missing contact
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => loadCleanupReport("stale", "/api/admin/cleanup/stale-clinics")}>
              Stale clinics
            </button>
          </div>
          <div className="admin-cleanup-results">
            {Object.entries(cleanupResults).map(([key, rows]) => (
              <div key={key}>
                <p className="label">{key} ({rows.length})</p>
                {rows.slice(0, 8).map((row, idx) => (
                  <p className="muted small" key={`${key}-${idx}`}>
                    {row.name || row.normalizedName || row.clinicNames?.join(", ") || row.id}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="card admin-card">
          <div className="admin-card__head">
            <h2>Audit Log</h2>
            <span className="results-count">{auditLogs.length} recent</span>
          </div>
          <div className="admin-list admin-list--audit">
            {auditLogs.map((log) => (
              <div className="admin-list__item" key={log.id}>
                <div>
                  <strong>{log.action}</strong>
                  <p className="muted small">
                    {formatDate(log.createdAt)} · {log.actorUserId}
                    {log.targetType ? ` · ${log.targetType}` : ""}
                  </p>
                  {log.details && <p className="muted small">{detailsSummary(log.details)}</p>}
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && <p className="muted small">No audit events yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
