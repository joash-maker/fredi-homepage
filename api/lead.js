// api/lead.js · saves a lead from the Fredi demo chat
// The browser sends the conversation transcript once the visitor has shared contact details.
// We extract the prospect's details here, skip role-play-only chats, log the lead to the
// top of the Leads sheet, alert Joash, and send the prospect a confirmation.

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { addLeadRow } from "./_sheets.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You extract sales-lead details from a chat between Fredi (an AI assistant) and a website visitor on Mediahubink's product page.

Important: visitors sometimes role-play as one of their own customers (for example "I'm a patient wanting a check-up" or "my tap is leaking") to test the demo. Details given during role-play belong to an imaginary customer and are NOT the prospect's details.

Fredi steps out of character after a role-play (for example "That's what your customers would get"). Details the visitor gives AFTER that point, in answer to Fredi asking for their own details, are the prospect's. Details given before it, while acting as a customer, are not, and Fredi addressing the visitor by a role-play name does not make them real.

The prospect is the business owner or manager interested in buying Mediahubink's service. Extract only the prospect's own details.

Return ONLY a JSON object, no other text:
{"isProspectLead": true or false (true only if the visitor shared their OWN real email or phone as a business owner wanting to be contacted),
 "name": "", "email": "", "phone": "", "business": "",
 "industry": "one of: Trades, Transport, Hospitality, Fitness, Commercial Property, School, Church, Legal, Estate Agent, Dental, Retail, General",
 "painPoints": "one or two sentences on their problem, or empty",
 "preferredCallback": "when they'd like a call, or empty"}`;

const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function leadScore(l) {
  let score = 0;
  if (l.name) score += 20;
  if (l.email) score += 20;
  if (l.phone) score += 15;
  if (l.business) score += 15;
  if (l.painPoints && l.painPoints.length > 10) score += 20;
  if (l.preferredCallback) score += 10;
  return score >= 80 ? "High" : score >= 50 ? "Medium" : "Low";
}

async function extract(transcript) {
  try {
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: `Conversation:\n\n${transcript}` }],
    });
    const raw = (r.content[0]?.text || "{}").replace(/```json|```/g, "").trim();
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) {
    console.error("Lead extraction failed:", e.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const transcript = clip(body.transcript, 20000);
  const source = clip(body.source || "Fredi Homepage AI", 60);
  if (!transcript.trim()) return res.status(400).json({ error: "No transcript" });

  const found = await extract(transcript);
  // If extraction failed, save anyway with the transcript so a lead is never lost.
  const lead = {
    name: clip(found?.name, 100),
    email: clip(found?.email, 160),
    phone: clip(found?.phone, 40),
    business: clip(found?.business, 120),
    industry: clip(found?.industry, 40),
    painPoints: clip(found?.painPoints, 600),
    preferredCallback: clip(found?.preferredCallback, 120),
  };
  if (found && found.isProspectLead === false) {
    return res.status(200).json({ status: "skipped", reason: "No prospect contact details (demo role-play only)" });
  }

  const { firstName, lastName } = splitName(lead.name);
  const score = found ? leadScore(lead) : "Check transcript";
  const bookingLink = process.env.BOOKING_LINK || "https://calendar.app.google/9BEVTDBPUjEqcaRdA";
  let saved = false;

  try {
    await addLeadRow(
      [
        new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }),
        firstName, lastName, lead.name, lead.business, lead.email, lead.phone,
        lead.industry, lead.painPoints, lead.preferredCallback, source, "Yes", transcript, score, "New Lead",
      ],
      { valueInputOption: "RAW" }
    );
    saved = true;
  } catch (e) {
    console.error("Sheets error:", e.message);
  }

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.FROM_EMAIL || "Mediahubink <hello@mediahubink.com>";
    const alertEmails = [process.env.ALERT_EMAIL, process.env.ALERT_EMAIL_2].filter(Boolean);
    if (!alertEmails.length) alertEmails.push("hello@mediahubink.com");
    const row = (label, v) => `<p><strong style="color:#aaa;">${label}:</strong> ${v ? esc(v) : "Not given"}</p>`;
    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:28px;background:#0e0e14;color:#e8e8f0;border-radius:10px;">
        <h2 style="color:#c9a84c;margin:0 0 20px;">New lead from the Fredi page</h2>
        ${row("Name", lead.name)}${row("Business", lead.business)}${row("Email", lead.email)}${row("Phone", lead.phone)}
        ${row("Industry", lead.industry)}${row("Pain points", lead.painPoints)}${row("Callback", lead.preferredCallback)}${row("Lead score", score)}
        ${saved ? "" : '<p style="color:#ff8a93;"><strong>Note:</strong> this lead could not be written to the Sheet. Please add it manually.</p>'}
        <hr style="border-color:#333;margin:20px 0;">
        <p style="color:#888;font-size:13px;"><strong>Conversation transcript:</strong></p>
        <pre style="background:#111;padding:14px;border-radius:6px;font-size:12px;color:#ccc;white-space:pre-wrap;word-wrap:break-word;">${esc(transcript)}</pre>
      </div>`;
    try {
      for (const to of alertEmails) {
        await resend.emails.send({
          from: fromEmail,
          to,
          reply_to: lead.email || undefined,
          subject: `New lead from Fredi: ${lead.name || "Unknown"}${lead.business ? " · " + lead.business : ""}`,
          html,
        });
      }
      saved = true;
    } catch (e) {
      console.error("Alert email failed:", e.message);
    }

    if (lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) {
      try {
        await resend.emails.send({
          from: fromEmail,
          to: lead.email,
          subject: "Thanks for your enquiry · Mediahubink",
          html: `
            <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:28px;">
              <h2 style="color:#c9a84c;">Thanks for getting in touch</h2>
              <p>Hi ${esc(firstName) || "there"},</p>
              <p>Thanks for chatting with Fredi. I'll be in touch within 24 hours to confirm a time.</p>
              <p>If you'd rather pick a slot now, you can book a free 20-minute call here:</p>
              <p><a href="${bookingLink}" style="color:#c9a84c;">${bookingLink}</a></p>
              <p>Best,<br>Joash<br><span style="color:#999;font-size:13px;">Mediahubink · mediahubink.com</span></p>
            </div>`,
        });
      } catch (e) {
        console.error("Confirmation email failed:", e.message);
      }
    }
  }

  if (!saved) return res.status(502).json({ error: "Lead could not be saved" });
  return res.status(200).json({ status: "Lead captured" });
}
