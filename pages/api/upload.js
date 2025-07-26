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

// ฟังก์ชันทำความสะอาด JSON response
const cleanJsonResponse = (responseText) => {
  // ลบ markdown code blocks
  let cleaned = responseText.replace(/```json\s?/gi, '').replace(/```\s?/gi, '');
  
  // ลบ text ที่ไม่ใช่ JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // แทนที่ smart quotes และ special characters
  cleaned = cleaned
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/[\u2013\u2014]/g, '-') // em/en dash
    .replace(/\r\n/g, '\\n') // Windows line endings
    .replace(/\n/g, '\\n') // Unix line endings
    .replace(/\r/g, '\\n') // Mac line endings
    .replace(/\t/g, '\\t') // tabs
    .trim();
    
  return cleaned;
};

// ฟังก์ชันแก้ไข JSON ที่เสียหาย
const fixBrokenJson = (jsonStr) => {
  try {
    // ลองหา string ที่ไม่สมบูรณ์และแก้ไข
    let fixed = jsonStr;
    
    // หาตำแหน่ง quote ล่าสุดที่ไม่ได้ปิด
    const lastQuoteIndex = fixed.lastIndexOf('"');
    const secondLastQuoteIndex = fixed.lastIndexOf('"', lastQuoteIndex - 1);
    
    // ถ้าจำนวน quote เป็นเลขคี่ แสดงว่าขาด closing quote
    const quoteCount = (fixed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // เพิ่ม closing quote ก่อน } หรือ , ที่ใกล้ที่สุด
      const nextSpecialChar = fixed.search(/[,}]/);
      if (nextSpecialChar > lastQuoteIndex) {
        fixed = fixed.slice(0, nextSpecialChar) + '"' + fixed.slice(nextSpecialChar);
      } else {
        fixed += '"';
      }
    }
    
    // แก้ไข trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // ตรวจสอบว่ามี closing brace หรือไม่
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      fixed += '}';
    }
    
    return fixed;
  } catch (error) {
    return jsonStr; // ถ้าแก้ไม่ได้ให้คืนค่าเดิม
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  try {
    // ตรวจสอบ OpenAI API Key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        detail: 'OPENAI_API_KEY environment variable is missing'
      });
    }

    const { files } = await parseForm(req);
    const file = files.file[0];
    const buffer = fs.readFileSync(file.filepath);
    let text = '';

    console.log('📄 Processing file:', file.originalFilename, file.mimetype);

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

    console.log('🤖 Using model:', model, 'Token estimate:', tokenEstimate);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prompt = `Extract information from this resume and return ONLY valid JSON with no additional text.

Return this exact JSON structure:
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

CRITICAL RULES for work experience extraction:
- ONLY extract companies where the person actually WORKED with clear employment history
- Look for sections labeled "EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT HISTORY", "CAREER" or similar
- Each work entry MUST have: company name, job title/position, and job responsibilities
- IGNORE company names that appear in:
  * Headers or footers of the document
  * Contact information sections
  * Document templates or letterheads
  * Reference sections
  * Companies mentioned as clients or projects (unless clearly employed there)
  * Recruitment agency information
  * Resume service provider information
- Work experience should be ordered by most recent first
- If less than 3 companies, use "" (empty string) for missing fields
- If more than 3 companies, put extras in "other_companies" (one per line)
- Duration must show employment period (start date to end date)
- Verify each company has corresponding job duties and responsibilities listed
- If a company name appears without clear employment context, DO NOT include it

Additional validation:
- Check that job_details describe actual work responsibilities
- Ensure duration shows a time period, not just contact info
- Cross-reference company names with their context in the document

Keep text short and simple. No line breaks in values (use spaces instead). Use regular quotes only. Return pure JSON only.

Resume: ${cleanedText.substring(0, 8000)}`; // จำกัดความยาวของ resume text

    console.log('🚀 Calling OpenAI API...');

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1, // เพิ่ม temperature เล็กน้อยเพื่อลด repetition
      max_tokens: 1500, // เพิ่ม max_tokens
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" }
    });

    const rawResponse = completion.choices[0].message.content;
    console.log('🧠 Raw AI response length:', rawResponse.length);
    console.log('🧠 Raw AI response preview:', rawResponse.substring(0, 200) + '...');

    let extracted;
    try {
      // ลองแปลง JSON ตรงๆ ก่อน
      extracted = JSON.parse(rawResponse);
      console.log('✅ JSON parsed successfully');
    } catch (firstError) {
      console.log('❌ First JSON parse failed, trying to clean response...');
      console.log('❌ Parse error:', firstError.message);
      
      // ถ้าแปลงไม่ได้ ให้ทำความสะอาดก่อน
      try {
        const cleanedResponse = cleanJsonResponse(rawResponse);
        console.log('🧹 Cleaned response preview:', cleanedResponse.substring(0, 300) + '...');
        extracted = JSON.parse(cleanedResponse);
        console.log('✅ JSON parsed after cleaning');
      } catch (secondError) {
        console.log('❌ Second JSON parse failed, trying to fix broken JSON...');
        console.log('❌ Cleaned parse error:', secondError.message);
        
        // ลองแก้ไข JSON ที่เสียหาย
        try {
          const cleanedResponse = cleanJsonResponse(rawResponse);
          const fixedResponse = fixBrokenJson(cleanedResponse);
          console.log('🔧 Fixed response preview:', fixedResponse.substring(0, 300) + '...');
          extracted = JSON.parse(fixedResponse);
          console.log('✅ JSON parsed after fixing');
        } catch (thirdError) {
          console.error('❌ All JSON parsing attempts failed');
          console.error('❌ Original error:', firstError.message);
          console.error('❌ Cleaned error:', secondError.message);
          console.error('❌ Fixed error:', thirdError.message);
          console.error('🧠 Full raw response:');
          console.error(rawResponse);
          
          // สร้าง fallback object พื้นฐาน
          console.log('🆘 Creating fallback object...');
          extracted = {
            full_name: "Error parsing resume",
            phone_number: "",
            email: "",
            gender: "",
            age: "",
            graduated_from: "",
            major: "",
            graduation_year: "",
            gpa: "",
            company_1: "",
            position_1: "",
            job_details_1: "",
            duration_1: "",
            company_2: "",
            position_2: "",
            job_details_2: "",
            duration_2: "",
            company_3: "",
            position_3: "",
            job_details_3: "",
            duration_3: "",
            other_companies: "",
            skills: [],
            current_salary: "",
            expected_salary: "",
            _error: "JSON parsing failed - please try uploading again or contact support",
            _raw_response_preview: rawResponse.substring(0, 500)
          };
          
          return res.status(200).json({ 
            extracted, 
            model_used: model,
            warning: "Partial parsing failure - please verify data accuracy"
          });
        }
      }
    }

      const validateWorkExperience = (extracted, originalText) => {
        // คำที่บ่งบอกว่าเป็นส่วน header/footer หรือข้อมูลที่ไม่ใช่ work experience
        const excludeKeywords = [
          'contact@', 'www.', '.com', '.co.th', '.net', '.org',
          'phone:', 'tel:', 'email:', 'address:',
          'reference:', 'upon request', 'available',
          'recruiter', 'recruitment', 'agency', 'consultant',
          'cv', 'resume', 'curriculum vitae'
        ];

        // ตรวจสอบแต่ละ company
        ['company_1', 'company_2', 'company_3'].forEach(companyKey => {
          const company = extracted[companyKey];
          const positionKey = companyKey.replace('company', 'position');
          const detailsKey = companyKey.replace('company', 'job_details');
          const durationKey = companyKey.replace('company', 'duration');
      
          if (company) {
            // ตรวจสอบว่าชื่อบริษัทมี keyword ที่น่าสงสัย
            const companyLower = company.toLowerCase();
            const hasExcludeKeyword = excludeKeywords.some(keyword => 
              companyLower.includes(keyword.toLowerCase())
            );
          
            // ตรวจสอบว่ามี job details และ position หรือไม่
            const hasJobDetails = extracted[detailsKey] && extracted[detailsKey].trim().length > 10;
            const hasPosition = extracted[positionKey] && extracted[positionKey].trim().length > 0;
            const hasDuration = extracted[durationKey] && extracted[durationKey].trim().length > 0;
          
            // ถ้าพบ keyword ที่น่าสงสัย หรือไม่มี job details ที่สมเหตุสมผล
            if (hasExcludeKeyword || !hasJobDetails || !hasPosition) {
              console.log(`⚠️ Suspicious work entry removed: ${company}`);
              console.log(`  - Has exclude keyword: ${hasExcludeKeyword}`);
              console.log(`  - Has job details: ${hasJobDetails}`);
              console.log(`  - Has position: ${hasPosition}`);
            
              // ลบข้อมูลนี้ออก
              extracted[companyKey] = "";
              extracted[positionKey] = "";
              extracted[detailsKey] = "";
              extracted[durationKey] = "";
            }
          }
        });

        // จัดเรียงข้อมูลใหม่ให้ company ที่มีข้อมูลอยู่ด้านบน
        const companies = [];
        ['company_1', 'company_2', 'company_3'].forEach(companyKey => {
          if (extracted[companyKey]) {
            const positionKey = companyKey.replace('company', 'position');
            const detailsKey = companyKey.replace('company', 'job_details');
            const durationKey = companyKey.replace('company', 'duration');
        
            companies.push({
              company: extracted[companyKey],
              position: extracted[positionKey],
              details: extracted[detailsKey],
              duration: extracted[durationKey]
            });
          }
        });

        // รีเซ็ตข้อมูล company ทั้งหมด
        ['company_1', 'company_2', 'company_3'].forEach(companyKey => {
          const positionKey = companyKey.replace('company', 'position');
          const detailsKey = companyKey.replace('company', 'job_details');
          const durationKey = companyKey.replace('company', 'duration');
    
          extracted[companyKey] = "";
          extracted[positionKey] = "";
          extracted[detailsKey] = "";
          extracted[durationKey] = "";
        });

        // เติมข้อมูล company ที่ถูกต้องกลับเข้าไป
        companies.forEach((comp, index) => {
          if (index < 3) {
            const num = index + 1;
            extracted[`company_${num}`] = comp.company;
            extracted[`position_${num}`] = comp.position;
            extracted[`job_details_${num}`] = comp.details;
            extracted[`duration_${num}`] = comp.duration;
          }
        });

          return extracted;
        };

    // ตรวจสอบว่า extracted มี field ที่จำเป็น
    const requiredFields = ['full_name', 'phone_number', 'email'];
    const missingFields = requiredFields.filter(field => !extracted.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      console.warn('⚠️ Missing required fields:', missingFields);
      // เติม field ที่ขาดหายด้วยค่าว่าง
      missingFields.forEach(field => {
        extracted[field] = '';
      });
    }

    console.log('✅ Successfully extracted data from resume');
    res.status(200).json({ extracted, model_used: model });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    // ให้รายละเอียด error มากขึ้น
    if (error.response?.status === 401) {
      return res.status(500).json({ 
        error: 'OpenAI API authentication failed',
        detail: 'Check your OPENAI_API_KEY'
      });
    } else if (error.response?.status === 429) {
      return res.status(500).json({ 
        error: 'OpenAI API rate limit exceeded',
        detail: 'Please try again later'
      });
    } else if (error.code === 'ENOENT') {
      return res.status(500).json({ 
        error: 'File processing failed',
        detail: 'Could not read uploaded file'
      });
    }
    
    res.status(500).json({ 
      error: 'Upload failed', 
      detail: error.message,
      stack: error.stack?.split('\n')[0] // แค่บรรทัดแรก
    });
  }
}