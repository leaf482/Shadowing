import { useState } from "react";
import { PRIMARY_SPECIALTIES, SECONDARY_FILTERS } from "../data/specialties.js";

const EMPTY_FORM = {
  name: "",
  address: "",
  phone: "",
  email: "",
  lat: "",
  lng: "",
  shadowingStatus: "mixed",
  primarySpecialty: "gp",
  secondaryFilter: "all",
  notes: "",
  zip: ""
};

export default function ClinicForm({
  clinics,
  statusOptions,
  onSubmit,
  centerFallback
}) {
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }
    setSearchStatus("loading");
    setSearchError("");
    try {
      // Add "Tacoma WA" context so local dental clinics surface reliably
      const queryWithContext = `${searchQuery.trim()}, Tacoma, WA`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=us&q=${encodeURIComponent(
          queryWithContext
        )}`
      );
      if (!response.ok) {
        throw new Error("Search failed.");
      }
      const data = await response.json();
      // If no results with Tacoma context, fall back to plain query
      if (!data.length) {
        const fallback = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=us&q=${encodeURIComponent(
            searchQuery.trim()
          )}`
        );
        const fallbackData = fallback.ok ? await fallback.json() : [];
        setSearchResults(fallbackData);
      } else {
        setSearchResults(data);
      }
      setSearchStatus("success");
    } catch (error) {
      setSearchError("Could not fetch results. Try again in a moment.");
      setSearchStatus("error");
    }
  };

  const buildCleanAddress = (result) => {
    const a = result.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city || a.town || a.village || a.suburb || "";
    const state = a.state || "";
    const parts = [street, city, state].filter(Boolean);
    return parts.length >= 2 ? parts.join(", ") : result.display_name;
  };

  const handleSelectResult = (result) => {
    const name = result.name ?? result.display_name.split(",")[0];
    const zip = result.address?.postcode ?? "";
    const cleanAddress = buildCleanAddress(result);
    setFormState((prev) => ({
      ...prev,
      name: prev.name || name,
      address: cleanAddress,
      lat: Number(result.lat),
      lng: Number(result.lon),
      zip: prev.zip || zip
    }));
    setSearchResults([]);
  };

  const [submitError, setSubmitError] = useState("");

  const geocodeAddress = async (address) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`
      );
      const data = res.ok ? await res.json() : [];
      if (data.length) {
        return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
      }
    } catch {}
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    let latValue = formState.lat === "" ? null : Number(formState.lat);
    let lngValue = formState.lng === "" ? null : Number(formState.lng);

    if (latValue === null || lngValue === null) {
      const address = formState.address.trim();
      if (address) {
        setSearchStatus("loading");
        const coords = await geocodeAddress(address);
        setSearchStatus("idle");
        if (coords) {
          latValue = coords.lat;
          lngValue = coords.lng;
        } else {
          setSubmitError("Could not locate this address. Use the Search button above to find the clinic and select a result to set the correct coordinates.");
          return;
        }
      } else {
        // No address typed — cannot determine location
        setSubmitError("Please enter an address or use the Search button to set the clinic location.");
        return;
      }
    }

    const proposed = {
      name: formState.name.trim(),
      address: formState.address.trim(),
      phone: formState.phone.trim(),
      email: formState.email.trim(),
      lat: latValue,
      lng: lngValue,
      zip: formState.zip.trim(),
      shadowingStatus: formState.shadowingStatus,
      primarySpecialty: formState.primarySpecialty,
      secondaryFilters:
        formState.secondaryFilter === "all"
          ? []
          : [formState.secondaryFilter],
      notes: formState.notes.trim()
    };

    onSubmit({
      type: "new",
      clinicId: null,
      proposed
    });

    setFormState(EMPTY_FORM);
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form__row">
        <label>
          Clinic name
          <input
            name="name"
            value={formState.name}
            onChange={handleChange}
            placeholder="Tacoma Smiles Dental"
            required
          />
        </label>
        <label>
          Primary specialty
          <select
            name="primarySpecialty"
            value={formState.primarySpecialty}
            onChange={handleChange}
            required
          >
            {PRIMARY_SPECIALTIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shadowing status
          <select
            name="shadowingStatus"
            value={formState.shadowingStatus}
            onChange={handleChange}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Secondary filter (optional)
        <select
          name="secondaryFilter"
          value={formState.secondaryFilter}
          onChange={handleChange}
        >
          <option value="all">None</option>
          {SECONDARY_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Search clinic (auto-fill)
        <div className="inline-input">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by clinic name or address"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={handleSearch}
            disabled={searchStatus === "loading"}
          >
            {searchStatus === "loading" ? "Searching..." : "Search"}
          </button>
        </div>
        {searchError ? <p className="muted small">{searchError}</p> : null}
        {searchResults.length > 0 ? (
          <div className="search-results">
            {searchResults.map((result) => (
              <button
                key={result.place_id}
                type="button"
                className="search-results__item"
                onClick={() => handleSelectResult(result)}
              >
                <strong>{result.name ?? result.display_name.split(",")[0]}</strong>
                <span className="muted small">{result.display_name}</span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="muted small">
          Choose a result to auto-fill address and coordinates.
        </p>
      </label>

      <label>
        Address
        <input
          name="address"
          value={formState.address}
          onChange={handleChange}
          placeholder="Street, City, State"
          required
        />
      </label>

      <label>
        Email address
        <input
          type="email"
          name="email"
          value={formState.email}
          onChange={handleChange}
          placeholder="clinic@example.com"
        />
      </label>

      <label>
        Phone number
        <input
          name="phone"
          value={formState.phone}
          onChange={handleChange}
          placeholder="(000) 123-4567"
        />
      </label>

      <label>
        ZIP code
        <input
          name="zip"
          value={formState.zip}
          onChange={handleChange}
          placeholder="98402"
        />
      </label>

      <label>
        Notes
        <textarea
          name="notes"
          value={formState.notes}
          onChange={handleChange}
          placeholder="Any details about scheduling or contact info"
          rows={3}
        />
      </label>

      {submitError && (
        <p className="muted small" style={{ color: "#b45309", background: "#fef9c3", borderRadius: "10px", padding: "0.5rem 0.75rem" }}>
          {submitError}
        </p>
      )}
      <button className="primary-button" type="submit">
        Save clinic
      </button>
    </form>
  );
}
