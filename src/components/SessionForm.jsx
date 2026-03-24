import { useState } from "react";

const EMPTY = { date: "", hours: "", notes: "" };

export default function SessionForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const hoursNum = parseFloat(form.hours);
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
              type="number"
              name="hours"
              value={form.hours}
              onChange={handleChange}
              placeholder="0"
              min="0"
              step="0.5"
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
