import { IncomingForm } from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import OpenAI from 'openai';

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseForm = async (req) => {
  const form = new IncomingForm();
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
};

const cleanResumeText = (rawText) => {
  return rawText
    .replace(/Page\s*\d+\s*of\s*\d+/gi, '')
    .replace(/(Curriculum Vitae|Resume)/gi, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  try {
    const { files } = await parseForm(req);
    const file = files.file[0];
    const buffer = fs.readFileSync(file.filepath);
    let text = '';

    if (file.mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const cleanedText = cleanResumeText(text);
    const tokenEstimate = Math.round(cleanedText.length / 4);
    const model = tokenEstimate < 3000 ? 'gpt-3.5-turbo' : 'gpt-4';

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Extract the following from this resume and return as JSON:

{
  "full_name": "",
  "phone_number": "",
  "email": "",
  "gender": "",
  "age": "",
  "graduated_from": "",
  "major": "",
  "graduation_year": "",
  "gpa": "",

  "company_1": "",
  "position_1": "",
  "job_details_1": "",
  "duration_1": "",

  "company_2": "",
  "position_2": "",
  "job_details_2": "",
  "duration_2": "",

  "company_3": "",
  "position_3": "",
  "job_details_3": "",
  "duration_3": "",

  "other_companies": "",
  "skills": [],
  "current_salary": "",
  "expected_salary": ""
}

Rules:
- Work experience should be ordered by most recent first.
- If fewer than 3 companies exist, use "-" for missing fields.
- If more than 3 companies, put 4+ into "other_companies" with name, dates, and position (1 per line, \\n separated).
- Return only valid JSON.
- Do not explain anything. Do not wrap JSON in markdown or code block.
- Do not use smart quotes. Avoid backslashes.
- Respond only with machine-parsable JSON.

Resume:
${cleanedText}`;

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
      response_format: 'json' // 🧠 เปิด response_format เพื่อ JSON ที่ parse ได้
    });

    let extracted;
    try {
      extracted = JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error('❌ JSON parse error:', err.message);
      console.error('🧠 AI raw response:\n', completion.choices[0].message.content);
      return res.status(500).json({
        error: 'AI returned invalid JSON. Check formatting.',
        detail: err.message
      });
    }

    res.status(200).json({ extracted, model_used: model });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', detail: error.message });
  }
}
