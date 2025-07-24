import { useState, useEffect } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const match = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(match.matches);
    const listener = (e) => setIsDark(e.matches);
    match.addEventListener('change', listener);
    return () => match.removeEventListener('change', listener);
  }, []);

  const baseColor = isDark ? '#f0f0f0' : '#333333';
  const cardBackground = isDark ? '#1e1e1e' : '#f9f9f9';
  const preBackground = isDark ? '#2c2c2c' : '#fff';

  async function handleUpload() {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setPreview(data.extracted);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row: preview }),
    });
    const result = await res.json();
    if (result.success) {
      alert('✅ บันทึกสำเร็จ!');
      setPreview(null);
      setFile(null);
    } else {
      alert('❌ บันทึกไม่สำเร็จ');
    }
  }

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', padding: '2rem', maxWidth: 720, margin: 'auto', color: baseColor }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', textAlign: 'center' }}>Resume Data Extractor</h1>
      <p style={{ textAlign: 'center', marginBottom: '2rem', color: baseColor }}>
        อัปโหลด Resume และดึงข้อมูลสำคัญเข้า Google Sheets อัตโนมัติ
      </p>

      <div
        style={{
          border: '2px dashed #ccc',
          padding: '2rem',
          borderRadius: '12px',
          background: cardBackground,
          textAlign: 'center',
          cursor: 'pointer',
        }}
        onClick={() => document.getElementById('resume-input').click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) {
            setFile(e.dataTransfer.files[0]);
          }
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⬆️</div>
        <strong style={{ color: baseColor }}>ลากไฟล์ Resume มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</strong>
        <p style={{ fontSize: '0.9rem', color: baseColor }}>รองรับไฟล์ PDF, DOC, DOCX</p>
        <input
          id="resume-input"
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setFile(e.target.files[0])}
          style={{ display: 'none' }}
        />
        {file && <p style={{ marginTop: '1rem', color: baseColor }}>📎 {file.name}</p>}
      </div>

      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            background: '#0066ff',
            color: 'white',
            padding: '10px 24px',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'กำลังวิเคราะห์...' : '🔍 ดึงข้อมูลจาก Resume'}
        </button>
      </div>

      {error && (
        <p style={{ color: 'red', marginTop: '1rem', textAlign: 'center' }}>⚠️ {error}</p>
      )}

      {preview && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: cardBackground, borderRadius: '8px' }}>
          <h3>👀 ข้อมูลที่ได้จาก AI</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'monospace', background: preBackground, color: baseColor, padding: '1rem', borderRadius: '6px' }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
          <button
            onClick={handleSave}
            style={{
              marginTop: '1rem',
              background: '#28a745',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            ✅ บันทึกลง Google Sheets
          </button>
        </div>
      )}
    </div>
  );
}
