import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { scanInvoice } from '../utils/aiService';
import { Overlay, Label, notify } from './Shared';

const MAX_SIZE_MB = 4;

export default function InvoiceScanner({ onExtracted }) {
  const { S, T } = useTheme();
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [retryInfo, setRetryInfo] = useState('');
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return setError(`File too large (max ${MAX_SIZE_MB}MB)`);
    }

    setError('');
    setResults(null);
    setRetryInfo('');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPreview(dataUrl);
      setScanning(true);

      try {
        const base64 = dataUrl.split(',')[1];
        const imageType = file.type || 'image/jpeg';
        const response = await scanInvoice({ imageBase64: base64, imageType }, {
          onRetry: (attempt, max) => setRetryInfo(`Retrying (${attempt}/${max})...`),
        });

        // Parse the AI response — it returns { reply: "..." }
        let parsed;
        const raw = response.reply || response.content || '';
        try {
          // Strip markdown code fences if present
          const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          parsed = JSON.parse(cleaned);
        } catch {
          setError('Could not parse invoice data. Try a clearer photo.');
          setScanning(false);
          setRetryInfo('');
          return;
        }

        setResults(parsed);
        notify(`Extracted ${(parsed.items || []).length} item(s) from invoice`);
      } catch (e) {
        setError(e.message || 'Invoice scan failed');
      }
      setScanning(false);
      setRetryInfo('');
    };
    reader.readAsDataURL(file);
  };

  const buildExtractedItem = (item) => ({
      date: item.date || results?.date || '',
      material: item.material || '',
      supplier: item.supplier || results?.supplier || '',
      qty: item.qty != null ? String(item.qty) : '',
      unit: item.unit || '',
      rate: item.rate != null ? String(item.rate) : '',
      total: item.total != null ? String(item.total) : '',
      unpaid: String(item.total || 0),
      status: 'Unpaid',
      notes: results?.invoiceNumber ? `Invoice #${results.invoiceNumber}` : '',
    });

  const applyItem = (item, index) => {
    onExtracted(buildExtractedItem(item));
    // Remove the used item
    setResults(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const useAll = () => {
    const extractedItems = (results?.items || []).map(buildExtractedItem);
    if (extractedItems.length === 0) return;
    onExtracted(extractedItems);
    setResults(null);
    setPreview(null);
  };

  const reset = () => {
    setPreview(null);
    setResults(null);
    setError('');
    setRetryInfo('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600,
          background: "transparent", border: `1px solid ${T.cardBorder}`,
          color: T.textMuted, padding: "6px 12px", cursor: "pointer",
          transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
          borderRadius: 6,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>document_scanner</span>
        Scan Invoice
      </button>

      {(scanning || results || error) && (
        <Overlay onClose={reset} title="Invoice Scanner">
          {preview && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <img src={preview} alt="Invoice" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', border: `1px solid ${T.cardBorder}` }} />
            </div>
          )}

          {scanning && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: 32, height: 32, border: `3px solid ${T.cardBorder}`,
                borderTop: `3px solid ${T.financial}`, borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
              }} />
              <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
                {retryInfo || 'Scanning invoice...'}
              </p>
            </div>
          )}

          {error && (
            <div style={{ color: T.danger, fontSize: 12, fontFamily: "'Inter',sans-serif", padding: '8px 0' }}>
              {error}
              <button onClick={() => { setError(''); fileRef.current?.click(); }} style={{ ...S.btnGhost, marginLeft: 12, fontSize: 11 }}>Try Again</button>
            </div>
          )}

          {results && (results.items || []).length > 0 && (
            <>
              {results.supplier && (
                <div style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>
                  Supplier: <strong style={{ color: T.text }}>{results.supplier}</strong>
                  {results.date && <> · Date: <strong style={{ color: T.text }}>{results.date}</strong></>}
                  {results.invoiceNumber && <> · Invoice #{results.invoiceNumber}</>}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {results.items.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', background: T.bodyBg, border: `1px solid ${T.cardBorder}`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: "'Inter',sans-serif" }}>{item.material || '—'}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Inter',sans-serif", marginTop: 2 }}>
                        {item.qty != null ? `${item.qty} ${item.unit || ''}` : ''}
                        {item.rate != null ? ` @ PKR ${item.rate.toLocaleString()}` : ''}
                        {' → '}
                        <strong style={{ color: T.financial }}>PKR {(item.total || 0).toLocaleString()}</strong>
                      </div>
                    </div>
                    <button onClick={() => applyItem(item, i)} style={{
                      ...S.btnGold, fontSize: 10, padding: '6px 14px', marginLeft: 12,
                    }}>
                      Use
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {results.items.length > 1 && (
                  <button onClick={useAll} style={{ ...S.btnGold, flex: 1 }}>
                    Use All ({results.items.length} items)
                  </button>
                )}
                <button onClick={reset} style={{ ...S.btnGhost, flex: 1 }}>Done</button>
              </div>
            </>
          )}

          {results && (results.items || []).length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: T.textMuted, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
              No items could be extracted. Try a clearer photo.
            </div>
          )}
        </Overlay>
      )}
    </>
  );
}
