import { google } from "googleapis";
import { Resend } from "resend";

function clean(value = "") {
  return String(value).trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitName(fullName = "") {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";
  return { firstName, lastName };
}

function calculateLeadScore(lead) {
  let score = 0;

  if (lead.name) score += 20;
  if (lead.email) score += 20;
  if (lead.phone) score += 15;
  if (lead.business) score += 15;
  if (lead.painPoints && lead.painPoints.length > 10) score += 20;
  if (lead.preferredCallback) score += 10;

  if (score >= 80) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function validateLead({ name, email, phone, business, painPoints }) {
  const errors = [];

  if (!clean(name)) errors.push("Name is required.");
  if (!clean(email)) errors.push("Email is required.");
  if (!clean(phone)) errors.push("Phone is required.");
  if (!clean(business)) errors.push("Business is required.");
  if (!clean(painPoints)) errors.push("Pain points are required.");

  if (clean(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email))) {
    errors.push("Email format is invalid.");
  }

  if (clean(phone) && clean(phone).replace(/[^\d+]/g, "").length < 7) {
    errors.push("Phone format is invalid.");
  }

  return errors;
}

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" ? value : fallback;
}

function buildOwnerEmailHtml({
  name,
  email,
  phone,
  business,
  industry,
  painPoints,
  preferredCallback,
  source,
  bookingLinkOffered,
  leadScore,
  status,
  transcript,
  bookingLink
}) {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 16px;">New lead captured</h2>

      <table cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; width: 100%; max-width: 720px;">
        <tr><td style="font-weight: bold; width: 180px;">Name</td><td>${escapeHtml(name || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Email</td><td>${escapeHtml(email || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Phone</td><td>${escapeHtml(phone || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Business</td><td>${escapeHtml(business || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Industry</td><td>${escapeHtml(industry || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Pain points</td><td>${escapeHtml(painPoints || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Preferred callback</td><td>${escapeHtml(preferredCallback || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Lead score</td><td>${escapeHtml(leadScore)}</td></tr>
        <tr><td style="font-weight: bold;">Status</td><td>${escapeHtml(status)}</td></tr>
        <tr><td style="font-weight: bold;">Source</td><td>${escapeHtml(source || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Booking link offered</td><td>${escapeHtml(bookingLinkOffered || "-")}</td></tr>
      </table>

      ${
        bookingLink
          ? `<p style="margin-top: 18px;"><strong>Booking link:</strong><br><a href="${escapeHtml(
              bookingLink
            )}">${escapeHtml(bookingLink)}</a></p>`
          : ""
      }

      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />

      <h3 style="margin-bottom: 8px;">Transcript</h3>
      <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; background: #f9fafb; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px;">${escapeHtml(
        transcript || "-"
      )}</pre>
    </div>
  `;
}

function buildLeadEmailHtml({ firstName, bookingLink }) {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 16px;">Thanks for getting in touch</h2>

      <p>Hi ${escapeHtml(firstName || "there")},</p>

      <p>
        Thanks for your enquiry. Your details have been captured and passed on.
        Someone will follow up with you soon.
      </p>

      ${
        bookingLink
          ? `
            <p>
              If you'd like to book a demo now, you can use this link:
            </p>
            <p>
              <a href="${escapeHtml(bookingLink)}">${escapeHtml(bookingLink)}</a>
            </p>
          `
          : ""
      }

      <p>Regards,<br />Mediahubink</p>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const name = clean(body.name);
    const email = clean(body.email);
    const phone = clean(body.phone);
    const business = clean(body.business);
    const industry = clean(body.industry);
    const painPoints = clean(body.painPoints);
    const preferredCallback = clean(body.preferredCallback);
    const source = clean(body.source) || "Website AI";
    const bookingLinkOffered = clean(body.bookingLinkOffered) || "Yes";
    const transcript = clean(body.transcript);

    const validationErrors = validateLead({
      name,
      email,
      phone,
      business,
      painPoints
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationErrors
      });
    }

    const bookingLink = getEnv("BOOKING_LINK");
    const ownerEmail =
      getEnv("ALERT_EMAIL") ||
      getEnv("GOOGLE_ALERT_EMAIL") ||
      "";

    const sheetId = getEnv("SHEET_ID");
    const googleClientEmail = getEnv("GOOGLE_CLIENT_EMAIL");
    const googlePrivateKey = getEnv("GOOGLE_PRIVATE_KEY");
    const resendApiKey = getEnv("RESEND_API_KEY");
    const fromEmail = getEnv("FROM_EMAIL", "Mediahubink <hello@mediahubink.com>");

    if (!sheetId) {
      return res.status(500).json({ error: "Missing SHEET_ID environment variable" });
    }

    if (!googleClientEmail || !googlePrivateKey) {
      return res.status(500).json({
        error: "Missing Google Sheets credentials"
      });
    }

    const { firstName, lastName } = splitName(name);
    const leadScore = calculateLeadScore({
      name,
      email,
      phone,
      business,
      painPoints,
      preferredCallback
    });

    const status = "New Lead";

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: googleClientEmail,
        private_key: googlePrivateKey.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({
      version: "v4",
      auth
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Leads!A:O",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toISOString(),
          firstName,
          lastName,
          name,
          business,
          email,
          phone,
          industry,
          painPoints,
          preferredCallback,
          source,
          bookingLinkOffered,
          transcript,
          leadScore,
          status
        ]]
      }
    });

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);

      if (ownerEmail) {
        await resend.emails.send({
          from: fromEmail,
          to: ownerEmail,
          subject: `New lead captured: ${name || "Unknown Lead"}`,
          html: buildOwnerEmailHtml({
            name,
            email,
            phone,
            business,
            industry,
            painPoints,
            preferredCallback,
            source,
            bookingLinkOffered,
            leadScore,
            status,
            transcript,
            bookingLink
          })
        });
      }

      if (email) {
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: "Thanks for your enquiry",
          html: buildLeadEmailHtml({
            firstName,
            bookingLink
          })
        });
      }
    }

    return res.status(200).json({
      status: "Lead captured",
      lead: {
        name,
        email,
        phone,
        business,
        industry,
        painPoints,
        preferredCallback,
        leadScore,
        status
      }
    });
  } catch (error) {
    console.error("Lead capture failed:", error);

    return res.status(500).json({
      error: "Lead capture failed",
      details: error.message || "Unknown error"
    });
  }
}
