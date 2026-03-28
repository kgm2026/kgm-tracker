import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { analyzeDrawing } from '../utils/aiService';
import { LoadingSpinner, notify } from './Shared';
import { readFileAsDataUrl, pdfToImage, MAX_FILE_SIZE, QUALITY_COLORS, dropZoneStyle } from './progressFileUtils';

export default function DrawingForm() {
  const { T } = useTheme();
  const [drawDesc, setDrawDesc] = useState('');
  const [drawPreview, setDrawPreview] = useState(null);
  const [drawBase64, setDrawBase64] = useState(null);
  const [drawType, setDrawType] = useState(null);
  const [drawFileName, setDrawFileName] = useState(null);
  const [drawIsPdf, setDrawIsPdf] = useState(false);
  const [drawPageCount, setDrawPageCount] = useState(null);
  const [drawResult, setDrawResult] = useState(null);
  const [drawAnalyzing, setDrawAnalyzing] = useState(false);
  const [drawDragging, setDrawDragging] = useState(false);
  const drawFileRef = useRef(null);

  const handleDrawingFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { notify('File must be under 50MB', 'error'); return; }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    try {
      let preview, base64, type;
      if (isPdf) {
        notify('Converting all PDF pages to image...');
        const result = await pdfToImage(file);
        preview = result.preview; base64 = result.base64; type = result.type;
        setDrawPageCount(result.numPages);
        notify(`PDF converted — ${result.numPages} pages ready for AI`);
      } else {
        const result = await readFileAsDataUrl(file);
        preview = result; base64 = result.split(',')[1]; type = file.type;
      }
      setDrawBase64(base64); setDrawType(type); setDrawFileName(file.name); setDrawIsPdf(isPdf); setDrawPreview(preview);
    } catch (e) { notify('Failed to process file: ' + e.message, 'error'); }
  };

  const handleDrawingUpload = (e) => handleDrawingFile(e.target.files[0]);
  const handleDrawDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDrawDragging(true); };
  const handleDrawDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDrawDragging(false); };
  const handleDrawDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDrawDragging(false); if (e.dataTransfer.files[0]) handleDrawingFile(e.dataTransfer.files[0]); };

  const handleDrawingAnalyze = async () => {
    if (!drawBase64) return;
    setDrawAnalyzing(true);
    setDrawResult(null);
    try {
      const { analysis } = await analyzeDrawing({ imageBase64: drawBase64, imageType: drawType, description: drawDesc });
      setDrawResult(analysis);
      notify('Drawing analyzed successfully');
    } catch (e) { notify(e.message, 'error'); }
    setDrawAnalyzing(false);
  };

  const resetDrawForm = () => {
    setDrawDesc(''); setDrawPreview(null); setDrawBase64(null); setDrawType(null);
    setDrawFileName(null); setDrawIsPdf(false); setDrawPageCount(null); setDrawResult(null);
    if (drawFileRef.current) drawFileRef.current.value = '';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28 }}>
        <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>draw</span>
          Upload Drawing / Blueprint / PDF
        </h3>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2.5, color: T.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Notes (optional)</div>
        <textarea value={drawDesc} onChange={e => setDrawDesc(e.target.value)} placeholder="Floor level, revision number, etc." rows={2}
          style={{ width: '100%', background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', resize: 'vertical', marginBottom: 16 }} />
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2.5, color: T.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>File <span style={{ fontWeight: 400, letterSpacing: 1, opacity: 0.7 }}>- drag & drop or click</span></div>
        <div onClick={() => drawFileRef.current?.click()} onDragOver={handleDrawDragOver} onDragLeave={handleDrawDragLeave} onDrop={handleDrawDrop}
          style={{ ...dropZoneStyle(drawDragging, T), padding: (drawPreview || drawBase64) ? 0 : '32px 20px' }}>
          {drawDragging && (
            <div style={{ position: 'absolute', inset: 0, background: T.financial + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}>
              <span style={{ color: T.financial, fontSize: 14, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>Drop file here</span>
            </div>
          )}
          {drawBase64 ? (
            <div style={{ position: 'relative' }}>
              {drawIsPdf ? (
                <div>
                  <img src={drawPreview} alt="PDF Preview" style={{ width: '100%', height: 220, objectFit: 'contain', display: 'block', background: '#fff' }} />
                  <div style={{ padding: '8px 12px', background: T.navActiveBg, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.danger }}>picture_as_pdf</span>
                    <span style={{ color: T.text, fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>{drawFileName}</span>
                    <span style={{ color: T.textMuted, fontSize: 10, fontFamily: "'Inter',sans-serif", marginLeft: 'auto' }}>{drawPageCount} page{drawPageCount > 1 ? 's' : ''} rendered</span>
                  </div>
                </div>
              ) : (
                <img src={drawPreview} alt="Drawing Preview" style={{ width: '100%', height: 250, objectFit: 'contain', display: 'block', background: '#fff' }} />
              )}
              <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 10px', fontSize: 11, fontFamily: "'Inter',sans-serif", cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); resetDrawForm(); if (drawFileRef.current) drawFileRef.current.value = ''; }}>Change</div>
            </div>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: T.textMuted, display: 'block', marginBottom: 8 }}>upload_file</span>
              <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif", margin: 0 }}>Click or drag image / PDF here</p>
              <p style={{ color: T.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginTop: 6, opacity: 0.7 }}>Supports: JPG, PNG, PDF</p>
            </>
          )}
          <input ref={drawFileRef} type="file" accept="image/*,.pdf" onChange={handleDrawingUpload} style={{ display: 'none' }} />
        </div>
        <button onClick={handleDrawingAnalyze} disabled={drawAnalyzing || !drawBase64}
          style={{ width: '100%', background: drawAnalyzing ? T.cardBorder : T.financial, color: '#fff', border: 'none', padding: '12px 0', fontSize: 12, fontWeight: 700, fontFamily: "'Inter',sans-serif", letterSpacing: 2, textTransform: 'uppercase', cursor: drawAnalyzing ? 'default' : 'pointer' }}>
          {drawAnalyzing ? 'Analyzing...' : 'Analyze Drawing'}
        </button>
      </div>

      {/* Drawing Analysis Result */}
      <div>
        {drawAnalyzing && <LoadingSpinner text="AI is analyzing your drawing..." />}
        {drawResult && !drawAnalyzing && (
          <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>architecture</span>
              Drawing Analysis
            </h3>
            {drawResult.drawingType && <span style={{ background: T.financial + '20', color: T.financial, padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', border: `1px solid ${T.financial}40`, display: 'inline-block', marginBottom: 16 }}>{drawResult.drawingType}</span>}
            {drawResult.dimensions && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: T.navActiveBg }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>Dimensions</div>
                <p style={{ color: T.text, fontSize: 14, fontFamily: "'Inter',sans-serif", margin: 0 }}>{drawResult.dimensions.width ? `${drawResult.dimensions.width}` : ''}{drawResult.dimensions.width && drawResult.dimensions.length ? ' x ' : ''}{drawResult.dimensions.length ? `${drawResult.dimensions.length}` : ''}{drawResult.dimensions.unit ? ` ${drawResult.dimensions.unit}` : ''}</p>
              </div>
            )}
            {(drawResult.rooms || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>Rooms / Spaces</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{drawResult.rooms.map((r, i) => <span key={i} style={{ background: T.navActiveBg, padding: '4px 10px', fontSize: 12, color: T.text, fontFamily: "'Inter',sans-serif", border: `1px solid ${T.cardBorder}` }}>{r}</span>)}</div>
              </div>
            )}
            {(drawResult.materials || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>Materials Specified</div>
                {drawResult.materials.map((m, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.financial }}>{'\u2022'}</span> {m}</div>)}
              </div>
            )}
            {(drawResult.observations || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>Observations</div>
                {drawResult.observations.map((o, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.financial }}>{'\u2022'}</span> {o}</div>)}
              </div>
            )}
            {(drawResult.issues || []).length > 0 && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f43f5e10', border: `1px solid ${T.danger}40` }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.danger, fontWeight: 600, marginBottom: 8 }}>Issues / Conflicts</div>
                {drawResult.issues.map((o, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.danger }}>{'\u2022'}</span> {o}</div>)}
              </div>
            )}
            {drawResult.estimatedCost && (
              <div style={{ padding: '12px 16px', background: T.navActiveBg }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 4 }}>Estimated Cost</div>
                <p style={{ color: T.financial, fontSize: 18, fontWeight: 700, fontFamily: "'Inter',sans-serif", margin: 0 }}>{drawResult.estimatedCost}</p>
              </div>
            )}
            {(drawResult.recommendations || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.success, fontWeight: 600, marginBottom: 8 }}>Recommendations</div>
                {drawResult.recommendations.map((r, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.success }}>{i + 1}.</span> {r}</div>)}
              </div>
            )}
            <button onClick={resetDrawForm} style={{ width: '100%', background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: '10px', fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer', marginTop: 20 }}>New Drawing</button>
          </div>
        )}
        {!drawAnalyzing && !drawResult && (
          <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 60, textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: T.textMuted, display: 'block', marginBottom: 16 }}>architecture</span>
            <p style={{ color: T.textMuted, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>Upload a drawing, blueprint, or PDF</p>
            <p style={{ color: T.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif", marginTop: 8 }}>Drag & drop from Finder or Photos app</p>
          </div>
        )}
      </div>
    </div>
  );
}
