import { useState } from "react";

const EMPTY_FORM = {
  name: "",
  address: "",
  phone: "",
  lat: "",
  lng: "",
  shadowingStatus: "mixed",
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
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(
          searchQuery.trim()
        )}`
      );
      if (!response.ok) {
        throw new Error("Search failed.");
      }
      const data = await response.json();
      setSearchResults(data);
      setSearchStatus("success");
    } catch (error) {
      setSearchError("Could not fetch results. Try again in a moment.");
      setSearchStatus("error");
    }
  };

  const handleSelectResult = (result) => {
    const name = result.name ?? result.display_name.split(",")[0];
    const zip = result.address?.postcode ?? "";
    setFormState((prev) => ({
      ...prev,
      name: prev.name || name,
      address: result.display_name,
      lat: Number(result.lat),
      lng: Number(result.lon),
      zip: prev.zip || zip
    }));
    setSearchResults([]);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const latValue =
      formState.lat === "" ? centerFallback.lat : Number(formState.lat);
    const lngValue =
      formState.lng === "" ? centerFallback.lng : Number(formState.lng);

    const proposed = {
      name: formState.name.trim(),
      address: formState.address.trim(),
      phone: formState.phone.trim(),
      lat: latValue,
      lng: lngValue,
      zip: formState.zip.trim(),
      shadowingStatus: formState.shadowingStatus,
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

      <button className="primary-button" type="submit">
        Save clinic
      </button>
    </form>
  );
}
