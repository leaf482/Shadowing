import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
} from "amazon-cognito-identity-js";

let userPool = null;

export function configureCognitoPool({ userPoolId, clientId }) {
  if (!userPoolId || !clientId) {
    userPool = null;
    return null;
  }
  userPool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
  return userPool;
}

export function getCognitoUserPool() {
  return userPool;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function userForEmail(email) {
  if (!userPool) throw new Error("Cognito is not configured.");
  return new CognitoUser({ Username: normalizeEmail(email), Pool: userPool });
}

function promisify(fn) {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export async function cognitoSignUp(email, password) {
  const normalized = normalizeEmail(email);
  const attributeList = [
    new CognitoUserAttribute({ Name: "email", Value: normalized }),
  ];

  return promisify((cb) => {
    userPool.signUp(normalized, password, attributeList, null, cb);
  });
}

export async function cognitoConfirmSignUp(email, code) {
  const user = userForEmail(email);
  return promisify((cb) => user.confirmRegistration(String(code).trim(), true, cb));
}

export async function cognitoResendSignUpCode(email) {
  const user = userForEmail(email);
  return promisify((cb) => user.resendConfirmationCode(cb));
}

export async function cognitoSignIn(email, password) {
  const user = userForEmail(email);
  const authDetails = new AuthenticationDetails({
    Username: normalizeEmail(email),
    Password: password,
  });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve({
          email: normalizeEmail(email),
          accessToken: session.getAccessToken().getJwtToken(),
          idToken: session.getIdToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
        });
      },
      onFailure: reject,
      newPasswordRequired: () => {
        reject(new Error("A new password is required. Please reset your password."));
      },
    });
  });
}

export async function cognitoForgotPassword(email) {
  const user = userForEmail(email);
  return promisify((cb) => user.forgotPassword(cb));
}

export async function cognitoConfirmPassword(email, code, newPassword) {
  const user = userForEmail(email);
  return promisify((cb) => user.confirmPassword(String(code).trim(), newPassword, cb));
}

export function cognitoSignOut(email) {
  try {
    const user = userForEmail(email);
    user.signOut();
  } catch {
    // ignore
  }
}

const COGNITO_ERROR_MESSAGES = {
  CodeMismatchException: "Invalid code. Please check the code and try again.",
  ExpiredCodeException: "This code has expired. Request a new code and try again.",
  InvalidPasswordException: "Password does not meet requirements. Use at least 8 characters with letters and numbers.",
  LimitExceededException: "Too many attempts. Please wait a few minutes and try again.",
  UserNotConfirmedException: "This account is not verified yet. Check your email for the verification code.",
  UserNotFoundException: "No account found for that email address.",
};

export function cognitoErrorMessage(err, fallback = "Something went wrong.") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err.code && COGNITO_ERROR_MESSAGES[err.code]) return COGNITO_ERROR_MESSAGES[err.code];
  return err.message || err.code || fallback;
}
