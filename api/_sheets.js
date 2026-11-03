// api/_sheets.js · shared helper (files starting with "_" are not deployed as endpoints)
// Inserts a lead as a new row directly under the header of the "Leads" tab,
// so the newest lead is always at the top of the Sheet.

const TAB = "Leads";
let cachedTabId = null;

export async function addLeadRow(values, { valueInputOption = "RAW" } = {}) {
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_ID;

  try {
    if (cachedTabId === null) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
      const tab = (meta.data.sheets || []).find((s) => s.properties && s.properties.title === TAB);
      if (!tab) throw new Error(`Tab "${TAB}" not found`);
      cachedTabId = tab.properties.sheetId;
    }
    // Insert an empty row at position 2 (just under the header), then fill it
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: { sheetId: cachedTabId, dimension: "ROWS", startIndex: 1, endIndex: 2 },
            inheritFromBefore: false,
          },
        }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A2:O2`,
      valueInputOption,
      requestBody: { values: [values] },
    });
  } catch (err) {
    // Fall back to the old behaviour (append at the bottom) so a lead is never lost
    console.error("Sheets insert-at-top failed, appending instead:", err.message);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A:O`,
      valueInputOption,
      requestBody: { values: [values] },
    });
  }
}
