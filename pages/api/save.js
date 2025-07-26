import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { row } = req.body;
  if (!row) return res.status(400).json({ error: 'Missing data row' });

  try {
    // 🔍 ตรวจสอบ Environment Variables ก่อน
    console.log('🔍 Checking Environment Variables...');
    console.log('📊 GOOGLE_SHEET_ID exists:', !!process.env.GOOGLE_SHEET_ID);
    console.log('🔑 GOOGLE_SERVICE_ACCOUNT_KEY exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    if (!process.env.GOOGLE_SHEET_ID) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }
    
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
    }

    // ✅ Parse Service Account Key
    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      console.log('✅ Service account key parsed successfully');
      console.log('📧 Client email:', serviceAccountKey.client_email);
    } catch (parseError) {
      console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', parseError.message);
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format');
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const sheetId = process.env.GOOGLE_SHEET_ID;

    console.log('📊 Sheet ID (hardcoded):', sheetId);

    // 🔍 ตรวจสอบว่า spreadsheet มีอยู่จริงและ get sheet names
    console.log('🔍 Getting spreadsheet metadata...');
    
    let firstSheetName = 'Sheet1'; // default value
    
    try {
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });
      
      console.log('✅ Spreadsheet access successful!');
      console.log('📊 Spreadsheet title:', spreadsheetInfo.data.properties.title);
      console.log('📋 Available sheets:', spreadsheetInfo.data.sheets.map(s => s.properties.title));
      
      // ใช้ชื่อ sheet แรกที่มี
      firstSheetName = spreadsheetInfo.data.sheets[0].properties.title;
      console.log('📊 Using sheet name:', firstSheetName);
      
    } catch (metadataError) {
      console.error('❌ Failed to get spreadsheet metadata:', metadataError.message);
      console.error('❌ Error code:', metadataError.code);
      console.error('❌ Error details:', {
        status: metadataError.status,
        message: metadataError.message,
        response: metadataError.response?.data || 'No response data'
      });
      
      throw new Error(`Cannot access spreadsheet: ${metadataError.message} (${metadataError.code})`);
    }

    // 🗓️ วันที่รูปแบบ DD/MM/YYYY
    const today = new Date();
    const recordDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // 🔢 ID = จำนวน row ปัจจุบัน + 1
    console.log('📋 Getting current row count...');
    const countRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${firstSheetName}!A2:A`, // ใช้ชื่อ sheet ที่ได้จริง
    });
    const currentRowCount = (countRes.data.values || []).length;
    const nextId = currentRowCount + 1;
    console.log('🔢 Next ID will be:', nextId);

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
    console.log('📦 Getting existing data...');
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${firstSheetName}!A2:Z`, // ใช้ชื่อ sheet ที่ได้จริง
    });
    const oldRows = existing.data.values || [];

    // 🔁 เพิ่ม row ใหม่ไว้ด้านบน
    const newData = [values, ...oldRows];

    // ✍️ อัปเดตแถวทั้งหมด
    console.log('✍️ Updating spreadsheet...');
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${firstSheetName}!A2`, // ใช้ชื่อ sheet ที่ได้จริง
      valueInputOption: 'RAW',
      requestBody: {
        values: newData,
      },
    });

    console.log('✅ Data saved to Google Sheets');
    res.status(200).json({ success: true, result: response.data });

  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack?.split('\n')[0] // แค่บรรทัดแรกของ stack
    });

    // ให้ข้อมูล error ที่ละเอียดขึ้น
    let errorMessage = error.message;
    let errorCode = error.code || 'UNKNOWN_ERROR';

    if (error.code === 401) {
      console.error('🔐 Authentication failed. Check your credentials.');
      errorMessage = 'Google Sheets authentication failed. Check service account credentials.';
    } else if (error.code === 403) {
      console.error('🚫 Permission denied. Check sheet sharing permissions.');
      errorMessage = 'Permission denied. Make sure the service account has access to the sheet.';
    } else if (error.code === 404) {
      console.error('📄 Sheet not found. Check your GOOGLE_SHEET_ID.');
      errorMessage = `Sheet not found. Check GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID}`;
    } else if (error.message?.includes('GOOGLE_SHEET_ID')) {
      errorMessage = 'GOOGLE_SHEET_ID environment variable is missing';
    } else if (error.message?.includes('GOOGLE_SERVICE_ACCOUNT_KEY')) {
      errorMessage = 'GOOGLE_SERVICE_ACCOUNT_KEY environment variable is missing or invalid';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      code: errorCode,
      debug: {
        hasSheetId: !!process.env.GOOGLE_SHEET_ID,
        hasServiceKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        sheetId: process.env.GOOGLE_SHEET_ID || 'NOT_SET'
      }
    });
  }
}