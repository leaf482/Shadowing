export default function PasswordChecklist({ checks }) {
  return (
    <ul className="login__password-checklist" aria-live="polite">
      <li className={checks.minLength ? "is-valid" : ""}>
        <span>{checks.minLength ? "✓" : "○"}</span> At least 8 characters
      </li>
      <li className={checks.hasLetter ? "is-valid" : ""}>
        <span>{checks.hasLetter ? "✓" : "○"}</span> Includes a letter (A-Z)
      </li>
      <li className={checks.hasNumber ? "is-valid" : ""}>
        <span>{checks.hasNumber ? "✓" : "○"}</span> Includes a number (0-9)
      </li>
    </ul>
  );
}
