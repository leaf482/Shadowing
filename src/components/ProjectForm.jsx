import { useState } from "react";
import { EXPERIENCE_TYPES, COUNTRIES, US_STATES, STATUS_OPTIONS } from "../data/experienceTypes.js";

const EMPTY = {
  name: "",
  experienceType: "dental_shadowing_in_person",
  address: "",
  address2: "",
  city: "",
  country: "",
  zip: "",
  stateProvince: "",
  supervisorFirstName: "",
  supervisorLastName: "",
  supervisorTitle: "",
  supervisorPhone: "",
  supervisorEmail: "",
  status: "",
  description: "",
  notes: "",
};

export default function ProjectForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      experienceType: form.experienceType,
      address: form.address.trim(),
      address2: form.address2.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      zip: form.zip.trim(),
      stateProvince: form.stateProvince.trim(),
      supervisorFirstName: form.supervisorFirstName.trim(),
      supervisorLastName: form.supervisorLastName.trim(),
      supervisorTitle: form.supervisorTitle.trim(),
      supervisorPhone: form.supervisorPhone.trim(),
      supervisorEmail: form.supervisorEmail.trim(),
      status: form.status.trim(),
      description: form.description.trim(),
      notes: form.notes.trim(),
    });
    setForm(EMPTY);
  };

  return (
    <form className="form experience-form" onSubmit={handleSubmit}>
      <h3>Add project</h3>

      <div className="form__section">
        <p className="eyebrow">Experience Type</p>
        <label>
          Type <span className="required">*</span>
          <select name="experienceType" value={form.experienceType} onChange={handleChange} required>
            {EXPERIENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Organization</p>
        <label>
          Name <span className="required">*</span>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Dental clinic or organization name"
            required
          />
        </label>
        <label>
          Address
          <input name="address" value={form.address} onChange={handleChange} placeholder="Street address" />
        </label>
        <label>
          Address 2
          <input name="address2" value={form.address2} onChange={handleChange} placeholder="Apt, suite, etc." />
        </label>
        <div className="form__row form__row--3">
          <label>
            City
            <input name="city" value={form.city} onChange={handleChange} placeholder="City" />
          </label>
          <label>
            Country
            <select name="country" value={form.country} onChange={handleChange}>
              <option value="">Select Country</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Zip Code
            <input name="zip" value={form.zip} onChange={handleChange} placeholder="Zip" />
          </label>
        </div>
        <label>
          State / Province
          <select name="stateProvince" value={form.stateProvince} onChange={handleChange}>
            <option value="">Select a State/Province</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Supervisor</p>
        <div className="form__row">
          <label>
            First Name
            <input name="supervisorFirstName" value={form.supervisorFirstName} onChange={handleChange} placeholder="First name" />
          </label>
          <label>
            Last Name
            <input name="supervisorLastName" value={form.supervisorLastName} onChange={handleChange} placeholder="Last name" />
          </label>
        </div>
        <label>
          Title
          <input name="supervisorTitle" value={form.supervisorTitle} onChange={handleChange} placeholder="e.g. DDS, Office Manager" />
        </label>
        <label>
          Contact Phone
          <input name="supervisorPhone" value={form.supervisorPhone} onChange={handleChange} placeholder="(201) 555-0123" />
        </label>
        <label>
          Contact Email
          <input type="email" name="supervisorEmail" value={form.supervisorEmail} onChange={handleChange} placeholder="supervisor@clinic.com" />
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Details</p>
        <label>
          Status
          <select name="status" value={form.status} onChange={handleChange}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Key responsibilities, what you observed..."
            rows={3}
          />
        </label>
        <label>
          Notes (internal)
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Quick notes for yourself"
            rows={2}
          />
        </label>
      </div>

      <div className="form__actions">
        <button className="primary-button" type="submit">Save project</button>
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}
