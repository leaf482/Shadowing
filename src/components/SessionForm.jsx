import { useState } from "react";

const EMPTY = { date: "", hours: "", notes: "" };

function parseHoursInput(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return Number.NaN;

  // Supports formats like 2.5 and 2:30 / 2:45
  if (value.includes(":")) {
    const match = value.match(/^(\d+):(\d{1,2})$/);
    if (!match) return Number.NaN;
    const hrs = Number(match[1]);
    const mins = Number(match[2]);
    if (!Number.isFinite(hrs) || !Number.isFinite(mins) || mins < 0 || mins >= 60) {
      return Number.NaN;
    }
    return hrs + mins / 60;
  }

  return Number(value);
}

export default function SessionForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const hoursNum = parseHoursInput(form.hours);
    if (Number.isNaN(hoursNum) || hoursNum < 0) return;
    onSubmit({ date: form.date || null, hours: hoursNum, notes: form.notes.trim() });
    setForm(EMPTY);
  };

  return (
    <form className="form experience-form" onSubmit={handleSubmit}>
      <h3>Log session</h3>
      <div className="form__section">
        <div className="form__row">
          <label>
            Date
            <input type="date" name="date" value={form.date} onChange={handleChange} />
          </label>
          <label>
            Hours <span className="required">*</span>
            <input
              type="text"
              name="hours"
              value={form.hours}
              onChange={handleChange}
              placeholder="2.5 or 2:30"
              inputMode="decimal"
              required
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="What you observed, procedures seen..."
            rows={2}
          />
        </label>
      </div>
      <div className="form__actions">
        <button className="primary-button" type="submit">Save session</button>
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}
