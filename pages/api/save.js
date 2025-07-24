import { google } from 'googleapis';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { row } = req.body;
  if (!row) return res.status(400).json({ error: 'Missing data row' });

  try {
    const keyPath = path.join(process.cwd(), 'service-account.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const formatValue = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.join(' | ');
      if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
      return String(value);
    };

    const today = new Date();
    const recordDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const countRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A2:A',
    });
    const currentRowCount = (countRes.data.values || []).length;
    const nextId = currentRowCount + 1;

    const values = [
      nextId,
      recordDate,
      formatValue(row["full_name"]),
      formatValue(row["phone_number"]),
      formatValue(row["email"]),
      formatValue(row["gender"]),
      formatValue(row["age"]),
      formatValue(row["graduated_from"]),
      formatValue(row["major"]),
      formatValue(row["graduation_year"]),
      formatValue(row["gpa"]),

      formatValue(row["company_1"]),
      formatValue(row["position_1"]),
      formatValue(row["job_details_1"]),
      formatValue(row["duration_1"]),

      formatValue(row["company_2"]),
      formatValue(row["position_2"]),
      formatValue(row["job_details_2"]),
      formatValue(row["duration_2"]),

      formatValue(row["company_3"]),
      formatValue(row["position_3"]),
      formatValue(row["job_details_3"]),
      formatValue(row["duration_3"]),

      formatValue(row["other_companies"]),
      formatValue(row["skills"]),
      formatValue(row["current_salary"]),
      formatValue(row["expected_salary"])
    ];

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A2:Z',
    });
    const oldRows = existing.data.values || [];
    const newData = [values, ...oldRows];

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Sheet1!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: newData },
    });

    res.status(200).json({ success: true, result: response.data });

  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
}
