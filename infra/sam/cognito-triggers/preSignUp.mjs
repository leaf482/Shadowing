/** Cognito Pre sign-up: only allow .edu emails (Google hd or email domain). */

export async function handler(event) {

  const attrs = event.request?.userAttributes || {};

  const email = String(attrs.email || "")

    .trim()

    .toLowerCase();

  const hostedDomain = String(attrs["custom:domain"] || "")

    .trim()

    .toLowerCase();



  const emailDomain = email.includes("@") ? email.split("@")[1] : "";

  const domainToCheck = hostedDomain || emailDomain;



  if (!domainToCheck || !domainToCheck.endsWith(".edu")) {

    throw new Error("Access Denied: Only .edu email addresses are allowed.");

  }



  if (event.triggerSource === "PreSignUp_ExternalProvider") {

    event.response.autoConfirmUser = true;

    event.response.autoVerifyEmail = true;

  }



  return event;

}

