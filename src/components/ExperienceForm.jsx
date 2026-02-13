import { useState } from "react";
import { EXPERIENCE_TYPES, COUNTRIES, US_STATES } from "../data/experienceTypes.js";

const EMPTY_FORM = {
  experienceType: "dental_shadowing_in_person",
  organizationName: "",
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
  hours: "",
  dateStart: "",
  dateEnd: "",
  notes: "",
};

export default function ExperienceForm({ onSubmit, onCancel, initialData }) {
  const [formState, setFormState] = useState(
    initialData
      ? {
          ...EMPTY_FORM,
          ...initialData,
          hours: String(initialData.hours ?? ""),
        }
      : EMPTY_FORM
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const hoursNum = parseFloat(formState.hours);
    if (Number.isNaN(hoursNum) || hoursNum < 0) {
      return;
    }

    onSubmit({
      experienceType: formState.experienceType,
      organizationName: formState.organizationName.trim(),
      address: formState.address.trim(),
      address2: formState.address2.trim(),
      city: formState.city.trim(),
      country: formState.country.trim(),
      zip: formState.zip.trim(),
      stateProvince: formState.stateProvince.trim(),
      supervisorFirstName: formState.supervisorFirstName.trim(),
      supervisorLastName: formState.supervisorLastName.trim(),
      supervisorTitle: formState.supervisorTitle.trim(),
      supervisorPhone: formState.supervisorPhone.trim(),
      supervisorEmail: formState.supervisorEmail.trim(),
      hours: hoursNum,
      dateStart: formState.dateStart.trim(),
      dateEnd: formState.dateEnd.trim(),
      notes: formState.notes.trim(),
    });

    if (!initialData) setFormState(EMPTY_FORM);
  };

  return (
    <form className="form experience-form" onSubmit={handleSubmit}>
      <h3>Add experience</h3>

      <div className="form__section">
        <p className="eyebrow">Experience Type</p>
        <label>
          What type of experience do you want to add? <span className="required">*</span>
          <select
            name="experienceType"
            value={formState.experienceType}
            onChange={handleChange}
            required
          >
            {EXPERIENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Organization</p>
        <label>
          Name <span className="required">*</span>
          <input
            name="organizationName"
            value={formState.organizationName}
            onChange={handleChange}
            placeholder="Dental clinic or organization name"
            required
          />
        </label>
        <label>
          Address
          <input
            name="address"
            value={formState.address}
            onChange={handleChange}
            placeholder="Street address"
          />
        </label>
        <label>
          Address 2
          <input
            name="address2"
            value={formState.address2}
            onChange={handleChange}
            placeholder="Apt, suite, etc."
          />
        </label>
        <div className="form__row form__row--3">
          <label>
            City
            <input
              name="city"
              value={formState.city}
              onChange={handleChange}
              placeholder="City"
            />
          </label>
          <label>
            Country
            <select
              name="country"
              value={formState.country}
              onChange={handleChange}
            >
              <option value="">Select Country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zip Code
            <input
              name="zip"
              value={formState.zip}
              onChange={handleChange}
              placeholder="Zip"
            />
          </label>
        </div>
        <label>
          State / Province
          <select
            name="stateProvince"
            value={formState.stateProvince}
            onChange={handleChange}
          >
            <option value="">Select a State/Province</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Supervisor</p>
        <div className="form__row">
          <label>
            First Name
            <input
              name="supervisorFirstName"
              value={formState.supervisorFirstName}
              onChange={handleChange}
              placeholder="First name"
            />
          </label>
          <label>
            Last Name
            <input
              name="supervisorLastName"
              value={formState.supervisorLastName}
              onChange={handleChange}
              placeholder="Last name"
            />
          </label>
        </div>
        <label>
          Title
          <input
            name="supervisorTitle"
            value={formState.supervisorTitle}
            onChange={handleChange}
            placeholder="e.g. DDS, Office Manager"
          />
        </label>
        <label>
          Contact Phone
          <input
            name="supervisorPhone"
            value={formState.supervisorPhone}
            onChange={handleChange}
            placeholder="(201) 555-0123"
          />
        </label>
        <label>
          Contact Email
          <input
            type="email"
            name="supervisorEmail"
            value={formState.supervisorEmail}
            onChange={handleChange}
            placeholder="supervisor@clinic.com"
          />
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Hours & dates</p>
        <label>
          Hours <span className="required">*</span>
          <input
            type="number"
            name="hours"
            value={formState.hours}
            onChange={handleChange}
            placeholder="0"
            min="0"
            step="0.5"
            required
          />
        </label>
        <div className="form__row">
          <label>
            Start date
            <input
              type="date"
              name="dateStart"
              value={formState.dateStart}
              onChange={handleChange}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              name="dateEnd"
              value={formState.dateEnd}
              onChange={handleChange}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            name="notes"
            value={formState.notes}
            onChange={handleChange}
            placeholder="Additional notes"
            rows={2}
          />
        </label>
      </div>

      <div className="form__actions">
        <button className="primary-button" type="submit">
          {initialData ? "Update" : "Save"} experience
        </button>
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
