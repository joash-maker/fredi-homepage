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
      source = "Fredi Homepage AI",
      transcript = ""
    } = req.body || {};

    const bookingLink = process.env.BOOKING_LINK || "https://calendar.app.google/9BEVTDBPUjEqcaRdA";
    const ownerEmail = process.env.ALERT_EMAIL || process.env.GOOGLE_ALERT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;

    const { firstName, lastName } = splitName(name);
    const leadScore = calculateLeadScore({ name, email, phone, business, painPoints, preferredCallback });
    const status = "New Lead";

    // Log to Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Leads!A:O",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }),
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
          "Yes",
          transcript,
          leadScore,
          status
        ]]
      }
    });

    // Send emails via Resend
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.FROM_EMAIL || "Mediahubink <hello@mediahubink.com>";

      // Notification to Joash
      if (ownerEmail) {
        await resend.emails.send({
          from: fromEmail,
          to: ownerEmail,
          subject: `New lead from Fredi: ${name || "Unknown"}${business ? ` — ${business}` : ""}`,
          html: `
            <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:28px;background:#0e0e14;color:#e8e8f0;border-radius:10px;">
              <h2 style="color:#c9a84c;margin:0 0 20px;">&#128276; New Lead — Fredi Homepage</h2>
              <p><strong style="color:#aaa;">Name:</strong> ${name || "—"}</p>
              <p><strong style="color:#aaa;">Email:</strong> ${email || "—"}</p>
              <p><strong style="color:#aaa;">Phone:</strong> ${phone || "—"}</p>
              <p><strong style="color:#aaa;">Business:</strong> ${business || "—"}</p>
              <p><strong style="color:#aaa;">Industry:</strong> ${industry || "—"}</p>
              <p><strong style="color:#aaa;">Pain Points:</strong> ${painPoints || "—"}</p>
              <p><strong style="color:#aaa;">Lead Score:</strong> <span style="color:#c9a84c;font-weight:700;">${leadScore}</span></p>
              <p><strong style="color:#aaa;">Callback:</strong> ${preferredCallback || "—"}</p>
              <hr style="border-color:#333;margin:20px 0;">
              <p style="color:#aaa;font-size:13px;"><strong style="color:#888;">Conversation transcript:</strong></p>
              <pre style="background:#111;padding:14px;border-radius:6px;font-size:12px;color:#ccc;white-space:pre-wrap;word-wrap:break-word;">${transcript || "—"}</pre>
              <p style="margin-top:20px;">
                <a href="${bookingLink}" style="background:#c9a84c;color:#0a0a0f;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;font-size:13px;">Book a Demo Call</a>
              </p>
            </div>
          `
        });
      }

      // Auto-reply to prospect
      if (email) {
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: "Thanks for your enquiry — Mediahubink",
          html: `
            <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:28px;">
              <h2 style="color:#c9a84c;">Thanks for getting in touch</h2>
              <p>Hi ${firstName || "there"},</p>
              <p>Thanks for your enquiry. Joash will be in touch within 24 hours.</p>
              ${bookingLink ? `<p>If you'd like to skip the wait and book a free 20-minute demo now:</p><p><a href="${bookingLink}" style="color:#c9a84c;">${bookingLink}</a></p>` : ""}
              <p>Best,<br>Joash<br><span style="color:#999;font-size:13px;">Mediahubink &middot; mediahubink.com</span></p>
            </div>
          `
        });
      }
    }

    return res.status(200).json({
      status: "Lead captured",
      lead: { name, email, business, industry, leadScore, status }
    });

  } catch (error) {
    console.error("Lead submission failed:", error);
    return res.status(500).json({
      error: "Lead submission failed",
      details: error.message
    });
  }
}
