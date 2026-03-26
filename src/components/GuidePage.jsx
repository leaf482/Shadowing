import { useState } from "react";

const SECTIONS = [
  { id: "how-to-use",    label: "How to Use" },
  { id: "terms",         label: "Terms of Service" },
  { id: "privacy",       label: "Privacy Policy" },
  { id: "disclaimer",    label: "Disclaimer" },
  { id: "security",      label: "Security" },
  { id: "content-rules", label: "Content Rules" },
  { id: "reporting",     label: "Reporting" },
  { id: "copyright",     label: "Copyright" },
];

function Ul({ items }) {
  return (
    <ul className="guide-list">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

const CONTENT = {
  "how-to-use": {
    eyebrow: "Getting Started",
    title: "How to Use Shadow Network",
    body: (
      <>
        <p>Shadow Network is a community-reported directory of dental clinics in the Pierce County / UW Tacoma region. Follow these steps to get started:</p>
        <ol className="guide-list guide-list--ol">
          <li>Open the <strong>Dashboard</strong> to view clinic pins on the map around UW Tacoma.</li>
          <li>Click a pin to see clinic details — specialty, contact info, and shadowing status.</li>
          <li>Use the <strong>Clinics</strong> page to filter by ZIP code, specialty, status, and radius.</li>
          <li>Use <strong>Add clinic</strong> on the Dashboard to submit a new or updated clinic listing.</li>
          <li><strong>Always confirm availability directly with the clinic</strong> before visiting. This platform shows community-reported information only.</li>
          <li>Use the <strong>Tracker</strong> to log your shadowing and volunteer hours. Create a project per clinic, log sessions, and build your AADSAS-ready experience summary.</li>
          <li>Keep notes professional and accurate. Avoid including personal or sensitive details.</li>
        </ol>
        <div className="guide-callout guide-callout--info">
          <strong>Important:</strong> Availability data is community-reported and may not reflect real-time status. Shadowing opportunities are arranged independently between students and clinics. Shadow Network does not guarantee access or availability.
        </div>
      </>
    ),
  },

  "terms": {
    eyebrow: "Legal",
    title: "Terms of Service",
    body: (
      <>
        <p>By accessing or using Shadow Network, you agree to the following terms. If you do not agree, do not use this platform.</p>
        <h3>Permitted Use</h3>
        <Ul items={[
          "Shadow Network is intended for pre-dental students at accredited universities to discover shadowing opportunities.",
          "Users must register with a valid .edu email address.",
          "Users may submit, edit, and report clinic listings in good faith.",
          "Users may use the Tracker to log personal shadowing and volunteer hours.",
        ]} />
        <h3>Prohibited Conduct</h3>
        <Ul items={[
          "You may not submit false, misleading, or fabricated clinic listings.",
          "You may not post inappropriate, offensive, or irrelevant businesses.",
          "You may not harass, contact, or spam dental clinics or healthcare providers through or because of this platform.",
          "You may not scrape, copy, or reproduce the clinic database for any commercial or competing purpose.",
          "You may not create multiple accounts or abuse the platform in any way.",
          "You may not attempt to access, alter, or damage the platform's infrastructure.",
        ]} />
        <h3>Account Termination</h3>
        <Ul items={[
          "Shadow Network reserves the right to suspend or remove accounts that violate these terms.",
          "Accounts found submitting false clinics, abusing the reporting system, or harassing users or clinics will be permanently banned.",
          "You may request deletion of your account and associated data at any time.",
        ]} />
        <h3>Intellectual Property</h3>
        <Ul items={[
          "The compiled clinic database, platform design, and all original content belong to Shadow Network.",
          "Community-submitted clinic data remains publicly visible and may be edited or removed by moderators.",
          "You retain ownership of your personal tracker data (hours, notes). Shadow Network does not claim rights to your personal logs.",
        ]} />
        <h3>Limitation of Liability</h3>
        <Ul items={[
          "Shadow Network provides informational listings only and does not guarantee shadowing placement.",
          "Shadow Network is not responsible for outcomes resulting from user-submitted data, including incorrect clinic information.",
          "Shadowing arrangements are made independently between students and clinics. Shadow Network is not a party to those arrangements.",
        ]} />
        <div className="guide-callout guide-callout--warn">
          These terms may be updated periodically. Continued use of the platform constitutes acceptance of any changes.
        </div>
      </>
    ),
  },

  "privacy": {
    eyebrow: "Legal",
    title: "Privacy Policy",
    body: (
      <>
        <p>Shadow Network is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights.</p>
        <h3>Data We Collect</h3>
        <Ul items={[
          "Email address (required for account creation — must be a .edu address)",
          "Password (stored as a secure hash — never in plain text)",
          "Session tokens (used to keep you logged in, expire after 7 days)",
          "Clinic submissions (name, address, specialty, contact info, notes you submit)",
          "Tracker data (project names, session dates, hours, notes you enter)",
          "Activity data (login timestamps, IP address for rate-limiting purposes)",
        ]} />
        <h3>How We Use Your Data</h3>
        <Ul items={[
          "To authenticate your account and maintain your session.",
          "To store and display your tracker projects and logged hours.",
          "To display clinic listings you or other users have submitted.",
          "To prevent abuse, spam, and unauthorized access.",
          "We do not sell your data to third parties.",
          "We do not use your data for advertising.",
        ]} />
        <h3>Data Sharing</h3>
        <Ul items={[
          "Clinic listings you submit are visible to all logged-in users.",
          "Your personal tracker data (hours, notes) is private and only visible to you.",
          "Your email address is never publicly displayed.",
          "We may share data if required by law.",
        ]} />
        <h3>Your Rights</h3>
        <Ul items={[
          "You may request a copy of your data at any time.",
          "You may request deletion of your account and all associated data.",
          "You may correct inaccurate information in your profile.",
          "California residents (CCPA) and EU users (GDPR) have additional rights under applicable law.",
        ]} />
        <h3>Data Retention</h3>
        <Ul items={[
          "Active session tokens expire after 7 days.",
          "Account data is retained until you request deletion.",
          "Clinic submissions may be retained for platform integrity even after account deletion.",
        ]} />
        <div className="guide-callout guide-callout--info">
          To request data deletion or export, contact the platform administrator through your university's pre-dental club.
        </div>
      </>
    ),
  },

  "disclaimer": {
    eyebrow: "Healthcare Context",
    title: "Disclaimer",
    body: (
      <>
        <div className="guide-callout guide-callout--warn">
          <strong>Shadow Network provides informational listings only.</strong> It is not a placement service, scheduling system, or guarantee of shadowing access.
        </div>
        <Ul items={[
          "Clinic availability data is community-reported and based on recent student outreach. It may not reflect current conditions.",
          "Shadowing opportunities are arranged independently between students and clinics. Shadow Network is not involved in or responsible for those arrangements.",
          "This platform exists to reduce redundant cold-contacting, not to increase request volume. Users are expected to research clinics, space out contact attempts, and respect clinic capacity.",
          "A listed clinic does not guarantee shadowing. Always contact the clinic professionally and respect their response.",
          "Shadow Network does not verify the accuracy of user-submitted clinic information. Users rely on this data at their own discretion.",
          "Any issues arising during a shadowing arrangement are between the student and the clinic. Shadow Network bears no liability.",
        ]} />
        <p className="muted small">
          Recommended contact approach: Space requests across clinics. Do not contact the same clinic multiple times within a short period. Respect clinic preferences regarding email vs. phone and advance notice requirements.
        </p>
      </>
    ),
  },

  "security": {
    eyebrow: "Technical",
    title: "Security Practices",
    body: (
      <>
        <p>Shadow Network implements industry-standard security practices to protect user data and platform integrity.</p>
        <h3>Authentication &amp; Passwords</h3>
        <Ul items={[
          "Passwords are hashed using scrypt — never stored in plain text.",
          "All sessions use server-issued HttpOnly cookies (email/user IDs are never used as auth credentials).",
          "Session cookies expire after 7 days and are invalidated on logout.",
          "Login attempts are rate-limited: more than 10 failed attempts from a single IP within 10 minutes results in a temporary block.",
        ]} />
        <h3>Data Transmission</h3>
        <Ul items={[
          "All traffic is served over HTTPS (TLS encryption).",
          "Authenticated API requests rely on secure server-side session cookies over encrypted connections.",
        ]} />
        <h3>Input Validation</h3>
        <Ul items={[
          "All user input is validated and sanitized server-side.",
          "Parameterized SQL queries are used throughout — no raw string concatenation.",
          "Email addresses are validated to ensure .edu domain at registration.",
        ]} />
        <h3>Database Backups</h3>
        <Ul items={[
          "The database is backed up regularly to prevent data loss.",
          "Backups are stored separately from the primary server.",
          "In the event of a server failure, data can be restored from the most recent backup.",
        ]} />
        <h3>Access Control</h3>
        <Ul items={[
          "Only authenticated users with verified .edu emails may access the platform.",
          "Write operations (adding/editing clinics, logging hours) require a valid authenticated session cookie.",
          "Administrative actions are restricted to platform maintainers.",
        ]} />
      </>
    ),
  },

  "content-rules": {
    eyebrow: "Community",
    title: "User Content Rules",
    body: (
      <>
        <p>Shadow Network relies on community-submitted data. All users are responsible for the accuracy and appropriateness of their submissions.</p>
        <h3>What You Can Submit</h3>
        <Ul items={[
          "Legitimate dental clinics and healthcare providers in the listed region.",
          "Accurate contact information, specialties, and shadowing availability based on direct outreach.",
          "Neutral, factual notes about scheduling preferences or requirements the clinic has communicated.",
        ]} />
        <h3>What Is Not Allowed</h3>
        <Ul items={[
          "False, fabricated, or misleading clinic information.",
          "Non-dental or inappropriate businesses (bars, unrelated services, etc.).",
          "Offensive, discriminatory, or harassing content in any field.",
          "Personal attacks on clinics, staff, or other users.",
          "Spam submissions or duplicate listings.",
        ]} />
        <h3>Moderation</h3>
        <Ul items={[
          "Platform administrators may edit, hide, or remove any listing that violates these rules.",
          "Reported listings are reviewed by a moderator before action is taken.",
          "Users who repeatedly submit violating content will have their accounts suspended.",
          "The clinic database is considered intellectual property of Shadow Network — scraping or bulk copying is prohibited.",
        ]} />
        <div className="guide-callout guide-callout--info">
          When in doubt, err on the side of accuracy. If you are unsure about a clinic's status, mark it as "Unknown" rather than guessing.
        </div>
      </>
    ),
  },

  "reporting": {
    eyebrow: "Community",
    title: "Reporting Incorrect or Inappropriate Listings",
    body: (
      <>
        <p>If you encounter a clinic listing that appears inaccurate, inappropriate, or outdated, please report it. Community oversight helps keep the directory reliable.</p>
        <h3>What to Report</h3>
        <Ul items={[
          "Clinics with incorrect addresses, phone numbers, or email addresses.",
          "Outdated availability status (e.g., listed as available but confirmed unavailable).",
          "Inappropriate, offensive, or non-dental business listings.",
          "Duplicate entries for the same clinic.",
          "Listings with false or fabricated information.",
        ]} />
        <h3>How Reports Are Handled</h3>
        <Ul items={[
          "Reported listings are flagged for moderator review.",
          "Moderators will verify the report and take appropriate action (edit, hide, or remove the listing).",
          "Users who submit false reports in bad faith may have their accounts reviewed.",
          "Significant data corrections may be announced to the community.",
        ]} />
        <div className="guide-callout guide-callout--info">
          <strong>Coming soon:</strong> An in-app report button on each clinic listing. For now, flag concerns through your pre-dental club officer or platform administrator.
        </div>
      </>
    ),
  },

  "copyright": {
    eyebrow: "Legal",
    title: "Copyright & Intellectual Property",
    body: (
      <>
        <Ul items={[
          "© 2026 Shadow Network. All rights reserved.",
          "The Shadow Network platform, including its design, codebase, and compiled clinic database, is the intellectual property of Shadow Network.",
          "Community-submitted clinic information is licensed to Shadow Network for display and distribution within the platform.",
          "Unauthorized reproduction, distribution, or commercial use of the clinic database or platform content is prohibited.",
          'The name "Shadow Network" and associated branding may be subject to trademark protection as the platform grows.',
        ]} />
        <p className="muted small">
          For licensing inquiries or permission requests, contact the platform administrator through your university's pre-dental club.
        </p>
      </>
    ),
  },
};

export default function GuidePage() {
  const [active, setActive] = useState("how-to-use");
  const current = CONTENT[active];

  return (
    <div className="guide-page">
      {/* ── Page header ── */}
      <div className="topbar">
        <div className="page-header">
          <p className="eyebrow">Shadow Network · Legal &amp; Guidelines</p>
          <h1>Platform Guidelines</h1>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            Usage guidelines, legal policies, and platform rules for Shadow Network.
            Last updated: March 2026.
          </p>
        </div>
      </div>

      {/* ── Tab nav ── */}
      <nav className="guide-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`guide-nav__btn${active === s.id ? " guide-nav__btn--active" : ""}`}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ── Active section ── */}
      <div className="guide-content">
        <section className="guide-section card">
          <p className="eyebrow">{current.eyebrow}</p>
          <h2 className="guide-section__title">{current.title}</h2>
          <div className="guide-section__body">{current.body}</div>
        </section>
      </div>
    </div>
  );
}
