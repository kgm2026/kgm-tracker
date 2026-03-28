import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { dbGet } from '../utils/api';
import { LoadingSpinner } from './Shared';
import { QUALITY_COLORS } from './progressFileUtils';
import SitePhotosForm from './SitePhotosForm';
import DrawingForm from './DrawingForm';
import TimelineEstimation from './TimelineEstimation';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

export default function Progress({ projectId, projectName }) {
  const { T } = useTheme();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('photos');
  const [expandedId, setExpandedId] = useState(null);

  // Shared form state for SitePhotosForm
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const data = await dbGet('progress_entries', `&project_id=eq.${projectId}&order=created_at.desc`);
    setEntries(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await dbGet('progress_entries', `&project_id=eq.${projectId}&order=created_at.desc`);
      if (!cancelled) { setEntries(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useRefreshOnMount(["progress_entries"], fetchEntries);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "progress_entries") fetchEntries();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchEntries]);

  const subTabs = [
    { id: 'photos', label: 'Site Photos', icon: 'photo_camera' },
    { id: 'drawings', label: 'Drawings & PDFs', icon: 'draw' },
    { id: 'timeline', label: 'Timeline', icon: 'timeline' },
    { id: 'gallery', label: 'All Entries', icon: 'grid_view' },
  ];

  return (
    <div style={{ padding: '32px 48px', animation: 'fadeUp 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 36, fontWeight: 300, letterSpacing: -0.5, color: T.text, margin: 0 }}>Progress Tracker</h2>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, marginTop: 8 }}>AI-Powered Site Analysis // {projectName}</p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, borderBottom: `1px solid ${T.cardBorder}` }}>
        {subTabs.map(st => (
          <div key={st.id} onClick={() => setSubTab(st.id)} style={{
            padding: '14px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: subTab === st.id ? `2px solid ${T.financial}` : '2px solid transparent',
            color: subTab === st.id ? T.financial : T.textMuted,
            fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            fontWeight: 600, transition: 'all 0.15s', marginBottom: -1,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{st.icon}</span>
            {st.label}
          </div>
        ))}
      </div>

      {/* Site Photos Tab */}
      <div style={{ display: subTab === 'photos' ? 'block' : 'none' }}>
        <SitePhotosForm projectId={projectId} photos={photos} setPhotos={setPhotos} description={description} setDescription={setDescription} title={title} setTitle={setTitle} />
      </div>

      {/* Drawings Tab */}
      <div style={{ display: subTab === 'drawings' ? 'block' : 'none' }}>
        <DrawingForm />
      </div>

      {/* Timeline Tab */}
      <div style={{ display: subTab === 'timeline' ? 'block' : 'none' }}>
        <TimelineEstimation projectId={projectId} projectName={projectName} />
      </div>

      {/* Gallery Tab */}
      <div style={{ display: subTab === 'gallery' ? 'block' : 'none' }}>
        <div>
          {loading && <LoadingSpinner text="Loading progress entries..." />}
          {!loading && entries.length === 0 && (
            <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 60, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: T.textMuted, display: 'block', marginBottom: 16 }}>photo_library</span>
              <p style={{ color: T.textMuted, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>No progress entries yet</p>
            </div>
          )}
          {!loading && entries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
              {entries.map(entry => {
                const analysis = entry.ai_analysis ? (() => { try { return JSON.parse(entry.ai_analysis); } catch { return null; } })() : null;
                const isExpanded = expandedId === entry.id;
                return (
                  <div key={entry.id} style={{ background: T.card, border: `1px solid ${T.cardBorder}`, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s' }}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.financial}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.cardBorder}>
                    {entry.image_base64 && <img src={entry.image_base64} alt={entry.title} style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />}
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <h4 style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>{entry.title}</h4>
                        <span style={{ fontSize: 10, color: T.textMuted, fontFamily: "'Inter',sans-serif", whiteSpace: 'nowrap', marginLeft: 12 }}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</span>
                      </div>
                      {entry.description && <p style={{ color: T.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif", margin: '0 0 10px', lineHeight: 1.4 }}>{entry.description}</p>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: isExpanded && analysis ? 16 : 0 }}>
                        {entry.phase && <span style={{ background: T.financial + '20', color: T.financial, padding: '2px 8px', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{entry.phase}</span>}
                        {analysis?.quality && <span style={{ background: (QUALITY_COLORS[analysis.quality] || T.textMuted) + '20', color: QUALITY_COLORS[analysis.quality] || T.textMuted, padding: '2px 8px', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{analysis.quality}</span>}
                        {analysis?.progressPct != null && <span style={{ background: T.navActiveBg, padding: '2px 8px', fontSize: 9, color: T.text, fontWeight: 700 }}>{analysis.progressPct}%</span>}
                      </div>
                      {isExpanded && analysis && (
                        <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 12, marginTop: 12 }}>
                          {analysis.summary && <p style={{ color: T.text, fontSize: 12, fontFamily: "'Inter',sans-serif", lineHeight: 1.5, marginBottom: 10 }}>{analysis.summary}</p>}
                          {(analysis.issues || []).length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: T.danger, fontWeight: 600, marginBottom: 4 }}>Issues</div>
                              {analysis.issues.map((is, i) => <div key={i} style={{ fontSize: 12, color: T.text, fontFamily: "'Inter',sans-serif", padding: '2px 0' }}>{'\u2022'} {is}</div>)}
                            </div>
                          )}
                          {(analysis.nextSteps || []).length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: T.success, fontWeight: 600, marginBottom: 4 }}>Next Steps</div>
                              {analysis.nextSteps.map((ns, i) => <div key={i} style={{ fontSize: 12, color: T.text, fontFamily: "'Inter',sans-serif", padding: '2px 0' }}>{i + 1}. {ns}</div>)}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 8, fontFamily: "'Inter',sans-serif" }}>{isExpanded ? 'Click to collapse' : 'Click to expand'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
