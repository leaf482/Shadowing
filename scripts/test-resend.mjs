import fs from "node:fs";
import path from "node:path";

const envPath = process.argv[2] || ".env";
const to = process.argv[3] || `resendtest${Date.now()}@uw.edu`;
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: env.FROM_EMAIL,
    to: [to],
    subject: "Shadow Network Resend connectivity test",
    html: "<p>If you received this, Resend delivery works.</p>",
  }),
});

const body = await response.text();
console.log(JSON.stringify({ status: response.status, to, body: body.slice(0, 500) }, null, 2));
