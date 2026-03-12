import { google } from "googleapis";
import { Resend } from "resend";

function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      name = "",
      email = "",
      phone = "",
      business = "",
      industry = "",
      painPoints = "",
      preferredCallback = "",
      source = "Website AI",
      bookingLinkOffered = "Yes",
      transcript = ""
    } = req.body || {};

    const bookingLink = process.env.BOOKING_LINK || "";
    const ownerEmail = process.env.ALERT_EMAIL || process.env.GOOGLE_ALERT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;

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
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({
      version: "v4",
      auth
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
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

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.FROM_EMAIL || "Mediahubink <hello@mediahubink.com>";

      if (ownerEmail) {
        await resend.emails.send({
          from: fromEmail,
          to: ownerEmail,
          subject: `New lead captured: ${name || "Unknown Lead"}`,
          html: `
            <h2>New lead captured</h2>
            <p><strong>Name:</strong> ${name || "-"}</p>
            <p><strong>Email:</strong> ${email || "-"}</p>
            <p><strong>Phone:</strong> ${phone || "-"}</p>
            <p><strong>Business:</strong> ${business || "-"}</p>
            <p><strong>Industry:</strong> ${industry || "-"}</p>
            <p><strong>Pain Points:</strong> ${painPoints || "-"}</p>
            <p><strong>Preferred Callback:</strong> ${preferredCallback || "-"}</p>
            <p><strong>Lead Score:</strong> ${leadScore}</p>
            <p><strong>Status:</strong> ${status}</p>
            <p><strong>Source:</strong> ${source}</p>
            <hr />
            <p><strong>Transcript:</strong></p>
            <pre>${transcript || "-"}</pre>
          `
        });
      }

      if (email) {
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: "Thanks for your enquiry",
          html: `
            <h2>Thanks for getting in touch</h2>
            <p>Hi ${firstName || "there"},</p>
            <p>Thanks for your enquiry. Your details have been passed on and someone will follow up with you soon.</p>
            ${bookingLink ? `<p>If you'd like to book a demo now, you can use this link:</p><p><a href="${bookingLink}">${bookingLink}</a></p>` : ""}
            <p>Regards,<br />Mediahubink</p>
          `
        });
      }
    }

    return res.status(200).json({
      status: "Lead captured",
      lead: { name, email, business, industry, leadScore, status }
    });
  } catch (error) {
    console.error("Lead capture failed:", error);

    return res.status(500).json({
      error: "Lead capture failed",
      details: error.message
    });
  }
}