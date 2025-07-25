import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { row } = req.body;
  if (!row) return res.status(400).json({ error: 'Missing data row' });

  try {
    /* ✅ สร้าง auth จาก ENV
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    */

    // ใช้ Environment Variable แทนไฟล์ JSON
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey, // ใช้ credentials แทน keyFile
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    console.log('📊 Sheet ID:', sheetId);


    // 🗓️ วันที่รูปแบบ DD/MM/YYYY
    const today = new Date();
    const recordDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // 🔢 ID = จำนวน row ปัจจุบัน + 1
    const countRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A2:A',
    });
    const currentRowCount = (countRes.data.values || []).length;
    const nextId = currentRowCount + 1;

    // 🔁 ฟังก์ชัน format ข้อมูลก่อนส่งเข้า Sheets
    const formatValue = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return value;
      if (Array.isArray(value)) return value.join('\n');
      if (typeof value === 'object') {
        return Object.entries(value)
          .map(([key, val]) => `${key}: ${val}`)
          .join(', ');
      }
      return String(value);
    };

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

    // 📦 ดึงข้อมูลเดิมทั้งหมด (A2 ลงไป)
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A2:Z',
    });
    const oldRows = existing.data.values || [];

    // 🔁 เพิ่ม row ใหม่ไว้ด้านบน
    const newData = [values, ...oldRows];

    // ✍️ อัปเดตแถวทั้งหมด
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Sheet1!A2',
      valueInputOption: 'RAW',
      requestBody: {
        values: newData,
      },
    });

    console.log('✅ Data saved to Google Sheets');
    res.status(200).json({ success: true, result: response.data });

  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
    });
  }
}
