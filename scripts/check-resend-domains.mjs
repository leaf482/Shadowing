import fs from "node:fs";

const envPath = process.argv[2] || ".env";
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

const response = await fetch("https://api.resend.com/domains", {
  headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
});
const body = await response.json();
console.log(JSON.stringify({ status: response.status, body }, null, 2));
