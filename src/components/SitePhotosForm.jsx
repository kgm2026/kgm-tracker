import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { analyzeProgress } from '../utils/aiService';
import { LoadingSpinner, notify } from './Shared';
import { readFileAsDataUrl, extractVideoFrames, MAX_IMAGES, MAX_FILE_SIZE, formatDuration, QUALITY_COLORS, dropZoneStyle } from './progressFileUtils';

export default function SitePhotosForm({ projectId, photos, setPhotos, description, setDescription, title, setTitle }) {
  const { T } = useTheme();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [photoDragging, setPhotoDragging] = useState(false);
  const fileRef = useRef(null);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList);
    if (photos.length + files.length > MAX_IMAGES) {
      notify(`Maximum ${MAX_IMAGES} photos/videos`, 'error');
      return;
    }
    const newPhotos = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) { notify(`${file.name} exceeds 50MB limit`, 'error'); continue; }
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
      try {
        if (isVideo) {
          notify(`Extracting frames from ${file.name}...`);
          const { frames, duration, totalFrames } = await extractVideoFrames(file);
          frames.forEach((f, i) => {
            newPhotos.push({ preview: f.preview, base64: f.base64, type: 'image/jpeg', name: `${file.name} (frame ${i + 1})`, isVideo: true, videoDuration: duration, timestamp: f.timestamp });
          });
          notify(`${totalFrames} frames extracted from ${file.name}`);
        } else {
          const result = await readFileAsDataUrl(file);
          newPhotos.push({ preview: result, base64: result.split(',')[1], type: file.type, name: file.name, isVideo: false });
        }
      } catch (e) {
        notify(`Failed to process ${file.name}: ${e.message}`, 'error');
      }
    }
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const handlePhotoUpload = (e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; };
  const handlePhotoDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setPhotoDragging(true); };
  const handlePhotoDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setPhotoDragging(false); };
  const handlePhotoDrop = (e) => { e.preventDefault(); e.stopPropagation(); setPhotoDragging(false); addFiles(e.dataTransfer.files); };
  const removePhoto = (index) => setPhotos(prev => prev.filter((_, i) => i !== index));

  const handleAnalyze = async () => {
    if (photos.length === 0 && !description.trim()) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const images = photos.map(p => ({ base64: p.base64, type: p.type }));
      const { analysis } = await analyzeProgress({ projectId, title: title || 'Site Progress', description, images });
      setAnalysisResult(analysis);
      notify(`${photos.length > 0 ? photos.length + ' photo(s) ' : ''}analyzed successfully`);
    } catch (e) { notify(e.message, 'error'); }
    setAnalyzing(false);
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setPhotos([]); setAnalysisResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
      {/* Upload Form */}
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28 }}>
        <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>upload</span>
          Upload Photos & Videos
        </h3>

        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2.5, color: T.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Title</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ground floor slab casting"
          style={{ width: '100%', background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', marginBottom: 16 }} />

        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2.5, color: T.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Description</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the work, materials, issues..." rows={3}
          style={{ width: '100%', background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', resize: 'vertical', marginBottom: 16 }} />

        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2.5, color: T.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Photos & Videos <span style={{ fontWeight: 400, letterSpacing: 1, opacity: 0.7 }}>- drag multiple files or click</span>
        </div>
        <div onClick={() => fileRef.current?.click()} onDragOver={handlePhotoDragOver} onDragLeave={handlePhotoDragLeave} onDrop={handlePhotoDrop}
          style={{ ...dropZoneStyle(photoDragging, T), padding: '32px 20px' }}>
          {photoDragging && (
            <div style={{ position: 'absolute', inset: 0, background: T.financial + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}>
              <span style={{ color: T.financial, fontSize: 14, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>Drop files here</span>
            </div>
          )}
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: T.textMuted, display: 'block', marginBottom: 8 }}>add_photo_alternate</span>
          <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif", margin: 0 }}>Click or drag photos & videos here</p>
          <p style={{ color: T.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginTop: 6, opacity: 0.7 }}>
            Images: JPG, PNG • Videos: MP4, MOV (frames auto-extracted) • Max {MAX_IMAGES} files
          </p>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={handlePhotoUpload} style={{ display: 'none' }} />
        </div>

        {photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', border: `1px solid ${T.cardBorder}` }}>
                <img src={p.preview} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {p.isVideo && (
                  <div style={{ position: 'absolute', bottom: 2, left: 2, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '1px 4px', fontSize: 8, fontFamily: "'Inter',sans-serif" }}>
                    {formatDuration(p.timestamp)}
                  </div>
                )}
                <div onClick={() => removePhoto(i)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', color: '#fff', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer' }}>x</div>
              </div>
            ))}
            {photos.length < MAX_IMAGES && (
              <div onClick={() => fileRef.current?.click()} style={{ aspectRatio: '1', border: `2px dashed ${T.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: T.textMuted }}>add</span>
              </div>
            )}
          </div>
        )}

        {photos.length > 0 && (
          <p style={{ color: T.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginBottom: 12 }}>
            {photos.filter(p => p.isVideo).length > 0 && `${photos.filter(p => p.isVideo).length} video frame(s) • `}{photos.filter(p => !p.isVideo).length} photo(s) ready
          </p>
        )}

        <button onClick={handleAnalyze} disabled={analyzing || (photos.length === 0 && !description.trim())}
          style={{ width: '100%', background: analyzing ? T.cardBorder : T.financial, color: '#fff', border: 'none', padding: '12px 0', fontSize: 12, fontWeight: 700, fontFamily: "'Inter',sans-serif", letterSpacing: 2, textTransform: 'uppercase', cursor: analyzing ? 'default' : 'pointer' }}>
          {analyzing ? 'Analyzing...' : `Analyze ${photos.length > 0 ? photos.length + ' photo(s)' : 'with AI'}`}
        </button>
      </div>

      {/* Analysis Result */}
      <div>
        {analyzing && <LoadingSpinner text={`AI is analyzing ${photos.length} photo(s)...`} />}
        {analysisResult && !analyzing && (
          <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>psychology</span>
              AI Analysis
            </h3>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {analysisResult.phase && <span style={{ background: T.financial + '20', color: T.financial, padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', border: `1px solid ${T.financial}40` }}>{analysisResult.phase}</span>}
              {analysisResult.quality && <span style={{ background: (QUALITY_COLORS[analysisResult.quality] || T.textMuted) + '20', color: QUALITY_COLORS[analysisResult.quality] || T.textMuted, padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', border: `1px solid ${QUALITY_COLORS[analysisResult.quality] || T.textMuted}40` }}>{analysisResult.quality}</span>}
              {analysisResult.progressPct != null && <span style={{ background: T.navActiveBg, color: T.text, padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, border: `1px solid ${T.cardBorder}` }}>{analysisResult.progressPct}% progress</span>}
            </div>
            {analysisResult.summary && <p style={{ color: T.text, fontSize: 14, fontFamily: "'Inter',sans-serif", lineHeight: 1.6, marginBottom: 20, padding: '12px 16px', background: T.navActiveBg, borderLeft: `3px solid ${T.financial}` }}>{analysisResult.summary}</p>}
            {(analysisResult.observations || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>Observations</div>
                {analysisResult.observations.map((o, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.financial }}>{'\u2022'}</span> {o}</div>)}
              </div>
            )}
            {(analysisResult.issues || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.danger, fontWeight: 600, marginBottom: 8 }}><span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>warning</span> Issues Found</div>
                {analysisResult.issues.map((o, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.danger }}>{'\u2022'}</span> {o}</div>)}
              </div>
            )}
            {(analysisResult.nextSteps || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.success, fontWeight: 600, marginBottom: 8 }}><span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span> Next Steps</div>
                {analysisResult.nextSteps.map((o, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.success }}>{i + 1}.</span> {o}</div>)}
              </div>
            )}
            {(analysisResult.safetyNotes || []).length > 0 && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f59e0b10', border: `1px solid ${T.warning}40` }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.warning, fontWeight: 600, marginBottom: 8 }}>Safety Notes</div>
                {analysisResult.safetyNotes.map((o, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}><span style={{ color: T.warning }}>{'\u2022'}</span> {o}</div>)}
              </div>
            )}
            {analysisResult.estimatedCostImpact && (
              <div style={{ padding: '12px 16px', background: T.navActiveBg, marginTop: 12 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, fontWeight: 600, marginBottom: 4 }}>Cost Impact</div>
                <p style={{ color: T.text, fontSize: 14, fontFamily: "'Inter',sans-serif", margin: 0 }}>{analysisResult.estimatedCostImpact}</p>
              </div>
            )}
            <button onClick={resetForm} style={{ width: '100%', background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: '10px', fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer', marginTop: 20 }}>New Entry</button>
          </div>
        )}
        {!analyzing && !analysisResult && (
          <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 60, textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: T.textMuted, display: 'block', marginBottom: 16 }}>photo_library</span>
            <p style={{ color: T.textMuted, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>Upload photos or videos, then click "Analyze"</p>
            <p style={{ color: T.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif", marginTop: 8 }}>Videos are auto-split into key frames for AI analysis</p>
          </div>
        )}
      </div>
    </div>
  );
}
