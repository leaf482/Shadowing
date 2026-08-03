export function getPasswordChecks(password) {
  return {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

export function isPasswordValid(checks) {
  return checks.minLength && checks.hasLetter && checks.hasNumber;
}
