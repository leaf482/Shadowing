/** Primary specialty options. Every clinic has exactly one. */
export const PRIMARY_SPECIALTIES = [
  { value: "gp", label: "General Practice (GP)" },
  { value: "endodontics", label: "Endodontics" },
  { value: "omfs", label: "Oral and Maxillofacial Surgery (OMFS)" },
  { value: "periodontics", label: "Periodontics" },
  { value: "orthodontics", label: "Orthodontics" },
  { value: "pediatric_dentistry", label: "Pediatric Dentistry" },
  { value: "prosthodontics", label: "Prosthodontics" },
  { value: "oral_medicine", label: "Oral Medicine" },
  { value: "public_health", label: "Public Health" }
];

/** For search filter: All (default) + primary specialties */
export const PRIMARY_SPECIALTY_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  ...PRIMARY_SPECIALTIES
];

/** Secondary filter options (optional practice types). Clinics can have zero or multiple. */
export const SECONDARY_FILTERS = [
  { value: "implant", label: "Implant Dentistry" },
  { value: "cosmetic", label: "Cosmetic Dentistry" },
  { value: "sedation", label: "Sedation Dentistry" },
  { value: "hospital", label: "Hospital Dentistry" },
  { value: "community", label: "Community Clinic or FQHC" },
  { value: "academic", label: "Academic or Dental School Clinic" },
  { value: "military", label: "Military or VA Dentistry" }
];
