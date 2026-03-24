import { useState } from "react";
import { EXPERIENCE_TYPES, COUNTRIES, US_STATES, STATUS_OPTIONS } from "../data/experienceTypes.js";

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
  avgWeeklyHours: "",
  numberOfWeeks: "",
  dateStart: "",
  dateEnd: "",
  currentExperience: false,
  status: "",
  title: "",
  typeCompensated: false,
  typeAcademicCredit: false,
  typeVolunteer: false,
  notes: "",
  description: "",
};

export default function ExperienceForm({ onSubmit, onCancel, initialData }) {
  const [hoursError, setHoursError] = useState("");
  const [formState, setFormState] = useState(() => {
    if (!initialData) return EMPTY_FORM;
    return {
      ...EMPTY_FORM,
      ...initialData,
      hours: String(initialData.hours ?? ""),
      avgWeeklyHours: initialData.avgWeeklyHours != null ? String(initialData.avgWeeklyHours) : "",
      numberOfWeeks: initialData.numberOfWeeks != null ? String(initialData.numberOfWeeks) : "",
      currentExperience: !!initialData.currentExperience,
      typeCompensated: !!initialData.typeCompensated,
      typeAcademicCredit: !!initialData.typeAcademicCredit,
      typeVolunteer: !!initialData.typeVolunteer,
    };
  });

  // Auto-calc Total Hours = Avg Weekly × Number of Weeks (only when both are filled)
  const avgNum = parseFloat(formState.avgWeeklyHours);
  const weeksNum = parseFloat(formState.numberOfWeeks);
  const autoTotal =
    !Number.isNaN(avgNum) && !Number.isNaN(weeksNum) && avgNum >= 0 && weeksNum >= 0
      ? avgNum * weeksNum
      : null;
  const displayHours = autoTotal != null ? String(autoTotal) : formState.hours;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "hours" || name === "avgWeeklyHours" || name === "numberOfWeeks") {
      setHoursError("");
    }
    setFormState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setHoursError("");
    const hoursNum = autoTotal != null ? autoTotal : parseFloat(formState.hours);
    if (Number.isNaN(hoursNum) || hoursNum < 0) {
      setHoursError("Total hours is required. Enter a value or fill in average weekly hours and number of weeks.");
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
      avgWeeklyHours: formState.avgWeeklyHours ? parseFloat(formState.avgWeeklyHours) : null,
      numberOfWeeks: formState.numberOfWeeks ? parseFloat(formState.numberOfWeeks) : null,
      dateStart: formState.dateStart.trim(),
      dateEnd: formState.dateEnd.trim(),
      currentExperience: formState.currentExperience,
      status: formState.status.trim(),
      title: formState.title.trim(),
      typeCompensated: formState.typeCompensated,
      typeAcademicCredit: formState.typeAcademicCredit,
      typeVolunteer: formState.typeVolunteer,
      notes: formState.notes.trim(),
      description: formState.description.trim(),
    });

    if (!initialData) setFormState(EMPTY_FORM);
  };

  return (
    <form className="form experience-form" onSubmit={handleSubmit}>
      <h3>Add AADSAS Experience</h3>
      <p className="muted small" style={{ marginTop: "-0.25rem" }}>
        Mirrors the ADEA AADSAS experience section. Fill in what you know — hours auto-calculate when you enter average weekly hours and number of weeks.
      </p>

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
        <p className="eyebrow">Experience Dates</p>
        <div className="form__row">
          <label>
            Start date <span className="required">*</span>
            <input
              type="date"
              name="dateStart"
              value={formState.dateStart}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            End date {!formState.currentExperience && <span className="required">*</span>}
            <input
              type="date"
              name="dateEnd"
              value={formState.dateEnd}
              onChange={handleChange}
              disabled={formState.currentExperience}
            />
          </label>
        </div>
        <label>
          Current experience (ongoing)
          <div className="form__radio-group">
            <label className="form__radio">
              <input
                type="radio"
                name="currentExperience"
                checked={formState.currentExperience === true}
                onChange={() => setFormState((p) => ({ ...p, currentExperience: true }))}
              />
              Yes
            </label>
            <label className="form__radio">
              <input
                type="radio"
                name="currentExperience"
                checked={formState.currentExperience === false}
                onChange={() => setFormState((p) => ({ ...p, currentExperience: false }))}
              />
              No
            </label>
          </div>
        </label>
        <label>
          Status
          <select name="status" value={formState.status} onChange={handleChange}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form__section">
        <p className="eyebrow">Experience Details</p>
        <label>
          Title <span className="required">*</span>
          <input
            name="title"
            value={formState.title}
            onChange={handleChange}
            placeholder="e.g. Dental Shadowing, Volunteer Assistant"
            required
          />
        </label>
        <label>
          Type of recognition
          <div className="form__checkboxes">
            <label className="form__checkbox">
              <input
                type="checkbox"
                name="typeCompensated"
                checked={formState.typeCompensated}
                onChange={handleChange}
              />
              Compensated
            </label>
            <label className="form__checkbox">
              <input
                type="checkbox"
                name="typeAcademicCredit"
                checked={formState.typeAcademicCredit}
                onChange={handleChange}
              />
              Received Academic Credit
            </label>
            <label className="form__checkbox">
              <input
                type="checkbox"
                name="typeVolunteer"
                checked={formState.typeVolunteer}
                onChange={handleChange}
              />
              Volunteer
            </label>
          </div>
        </label>
        <div className="form__hours-calc">
          <label>
            Average weekly hours
            <input
              type="number"
              name="avgWeeklyHours"
              value={formState.avgWeeklyHours}
              onChange={handleChange}
              placeholder="0"
              min="0"
              step="0.5"
            />
          </label>
          <span className="form__calc-symbol">×</span>
          <label>
            Number of weeks
            <input
              type="number"
              name="numberOfWeeks"
              value={formState.numberOfWeeks}
              onChange={handleChange}
              placeholder="0"
              min="0"
              step="1"
            />
          </label>
          <span className="form__calc-symbol">=</span>
          <label>
            Total hours <span className="required">*</span>
            <input
              type="number"
              name="hours"
              value={displayHours}
              onChange={handleChange}
              placeholder="0"
              min="0"
              step="0.5"
              readOnly={autoTotal != null}
              required
            />
          </label>
        </div>
        {hoursError ? (
          <p className="muted small" style={{ color: "#dc2626" }} role="alert">
            {hoursError}
          </p>
        ) : (
          <p className="muted small">
            {autoTotal != null
              ? "Total auto-calculated. Copy this to your application."
              : "Enter avg weekly hours and weeks, or type total directly."}
          </p>
        )}
        <label>
          Description / Key responsibilities / Interactions to speak about
          <textarea
            name="description"
            value={formState.description}
            onChange={handleChange}
            placeholder="What you did, key observations, interactions you can discuss in your application..."
            rows={4}
          />
        </label>
        <label>
          Notes (internal)
          <textarea
            name="notes"
            value={formState.notes}
            onChange={handleChange}
            placeholder="Quick notes for yourself"
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
