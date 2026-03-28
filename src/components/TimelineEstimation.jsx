import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { dbGet } from '../utils/api';
import { fmt } from '../utils/formatting';
import { sendChatMessage } from '../utils/aiService';
import { LoadingSpinner } from './Shared';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const timelineCache = new Map();

export default function TimelineEstimation({ projectId, projectName }) {
  const { T, S } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeline, setTimeline] = useState(() => timelineCache.get(projectId) || null);
  const [generatedAt, setGeneratedAt] = useState(null);

  const D = { muted: T.textMuted, outline: T.cardBorder, accent: T.financial };

  // Clear cached timeline when underlying data changes
  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases" || table === "contractors" || table === "progress_entries") {
        timelineCache.delete(projectId);
        setTimeline(null);
      }
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [projectId]);

  useRefreshOnMount(["material_purchases", "contractors", "progress_entries"], () => {
    timelineCache.delete(projectId);
    setTimeline(null);
  });

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [materials, contractors, progressEntries] = await Promise.all([
        dbGet('material_purchases', `&project_id=eq.${projectId}&order=date.asc`),
        dbGet('contractors', `&project_id=eq.${projectId}`),
        dbGet('progress_entries', `&project_id=eq.${projectId}&order=created_at.desc&limit=10`),
      ]);

      // Compute monthly spending velocity
      const byMonth = {};
      const byCatMonth = { grey: {}, finishing: {} };
      materials.forEach(m => {
        const month = (m.date || '').slice(0, 7);
        if (!month) return;
        byMonth[month] = (byMonth[month] || 0) + (m.total || 0);
        const cat = m.category || 'grey';
        if (byCatMonth[cat]) byCatMonth[cat][month] = (byCatMonth[cat][month] || 0) + (m.total || 0);
      });

      const greyTotal = materials.filter(m => m.category === 'grey').reduce((s, m) => s + (m.total || 0), 0);
      const finishingTotal = materials.filter(m => m.category === 'finishing').reduce((s, m) => s + (m.total || 0), 0);
      const totalSpent = greyTotal + finishingTotal;

      // Progress from AI photo analysis
      const progressSummary = progressEntries.slice(0, 5).map(p => {
        let analysis = null;
        try { analysis = p.ai_analysis ? JSON.parse(p.ai_analysis) : null; } catch {}
        return {
          title: p.title, date: p.created_at?.slice(0, 10),
          phase: p.phase || analysis?.phase,
          progressPct: analysis?.progressPct,
          quality: analysis?.quality,
          summary: analysis?.summary?.slice(0, 200),
        };
      });

      const contractorSummary = contractors.map(c => ({
        name: c.name, trade: c.trade, workStatus: c.work_status,
        contractValue: c.contract_value, amountPaid: c.amount_paid,
      }));

      // Keep data compact
      const months = Object.entries(byMonth).slice(-6).map(([m, t]) => `${m}:${t}`).join(',');
      const contShort = contractors.slice(0, 5).map(c => `${c.name}(${c.trade}):${c.work_status}`).join(';');
      const progShort = progressEntries.slice(0, 3).map(p => {
        let a = null;
        try { a = p.ai_analysis ? JSON.parse(p.ai_analysis) : null; } catch {}
        return `${p.title || ''}:${a?.progressPct || '?'}%`;
      }).join(';');

      const messages = [
        {
          role: 'system',
          content: `Construction timeline estimator. Return ONLY valid compact JSON, no markdown. Schema: {"phases":[{"name":"str","status":"completed|in_progress|upcoming","estimatedEnd":"YYYY-MM-DD","progressPct":N,"notes":"max 15 words"}],"overallProgress":N,"estimatedCompletion":"YYYY-MM-DD","monthlyBurnRate":N,"estimatedRemainingCost":N,"risks":["max 2 short"],"summary":"1 sentence"} Max 4 phases. Keep notes very short. Today: ${new Date().toISOString().split('T')[0]}. PKR.`
        },
        {
          role: 'user',
          content: `Project:${projectName} Grey:${greyTotal} Finishing:${finishingTotal} Total:${totalSpent} Monthly:${months} Contractors:${contShort} Progress:${progShort}`
        }
      ];

      const response = await sendChatMessage(messages, {});
      const raw = response.reply || response.content || '';
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to salvage truncated JSON
        let salvaged = cleaned.replace(/,\s*$/, '').replace(/,\s*"[^"]*":\s*("[^"]*)?$/, '').replace(/,\s*\{[^}]*$/, '');
        const ob = (salvaged.match(/{/g) || []).length - (salvaged.match(/}/g) || []).length;
        const ok = (salvaged.match(/\[/g) || []).length - (salvaged.match(/\]/g) || []).length;
        for (let i = 0; i < ok; i++) salvaged += ']';
        for (let i = 0; i < ob; i++) salvaged += '}';
        try { parsed = JSON.parse(salvaged); }
        catch { throw new Error('AI response was truncated. Try again.'); }
      }

      timelineCache.set(projectId, parsed);
      setTimeline(parsed);
      setGeneratedAt(new Date());
    } catch (e) {
      setError(e.message || 'Failed to estimate timeline');
    }
    setLoading(false);
  }, [projectId, projectName]);

  const statusColor = (s) => {
    switch (s) {
      case 'completed': return T.success;
      case 'in_progress': return T.financial;
      default: return T.textMuted;
    }
  };

  const confidenceLabel = (c) => {
    switch (c) {
      case 'high': return { color: T.success, label: 'HIGH CONFIDENCE' };
      case 'medium': return { color: T.financial, label: 'MEDIUM CONFIDENCE' };
      default: return { color: T.danger, label: 'LOW CONFIDENCE' };
    }
  };

  return (
    <div>
      {/* Generate Button */}
      {!timeline && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: D.outline, display: 'block', marginBottom: 16 }}>timeline</span>
          <p style={{ fontSize: 14, color: D.muted, fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>Estimate project completion dates based on spending and progress data</p>
          <button onClick={fetchTimeline} style={{ ...S.btnGold, padding: '12px 28px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>psychology</span>
            Generate Timeline
          </button>
        </div>
      )}

      {loading && <LoadingSpinner text="Analyzing spending velocity and progress..." />}

      {error && (
        <div style={{ color: T.danger, fontSize: 13, padding: '12px 16px', background: `${T.danger}10`, border: `1px solid ${T.danger}30`, marginBottom: 24 }}>
          {error}
          <button onClick={fetchTimeline} style={{ ...S.btnGhost, marginLeft: 12, fontSize: 11 }}>Retry</button>
        </div>
      )}

      {timeline && !loading && (
        <>
          {/* Summary + KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: T.card, border: `1px solid ${D.outline}`, padding: 20 }}>
              <div style={{ fontSize: 10, color: D.muted, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Overall Progress</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: T.text }}>{timeline.overallProgress}%</div>
              <div style={{ width: '100%', height: 4, background: D.outline, marginTop: 8 }}>
                <div style={{ width: `${timeline.overallProgress}%`, height: '100%', background: D.accent, transition: 'width 0.5s' }} />
              </div>
            </div>
            <div style={{ background: T.card, border: `1px solid ${D.outline}`, padding: 20 }}>
              <div style={{ fontSize: 10, color: D.muted, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Est. Completion</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{timeline.estimatedCompletion || '—'}</div>
            </div>
            <div style={{ background: T.card, border: `1px solid ${D.outline}`, padding: 20 }}>
              <div style={{ fontSize: 10, color: D.muted, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Monthly Burn Rate</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.financial }}>{fmt(timeline.monthlyBurnRate)}</div>
            </div>
            <div style={{ background: T.card, border: `1px solid ${D.outline}`, padding: 20 }}>
              <div style={{ fontSize: 10, color: D.muted, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Est. Remaining Cost</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.danger }}>{fmt(timeline.estimatedRemainingCost)}</div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ background: T.card, border: `1px solid ${D.outline}`, padding: 20, marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif", lineHeight: 1.7, margin: 0 }}>{timeline.summary}</p>
          </div>

          {/* Visual Timeline */}
          <div style={{ background: T.card, border: `1px solid ${D.outline}`, marginBottom: 24 }}>
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${D.outline}` }}>
              <h3 style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: D.muted, fontWeight: 600, margin: 0 }}>Project Phases</h3>
            </div>
            <div style={{ padding: '24px' }}>
              {(timeline.phases || []).map((phase, i) => (
                <div key={i} style={{ display: 'flex', gap: 20, marginBottom: i < timeline.phases.length - 1 ? 0 : 0 }}>
                  {/* Timeline line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                    <div style={{
                      width: 16, height: 16, minHeight: 16, borderRadius: '50%',
                      background: statusColor(phase.status),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {phase.status === 'completed' && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>{'\u2713'}</span>}
                    </div>
                    {i < timeline.phases.length - 1 && (
                      <div style={{
                        width: 2, flex: 1, minHeight: 40,
                        background: phase.status === 'completed' ? T.success : D.outline,
                      }} />
                    )}
                  </div>

                  {/* Phase content */}
                  <div style={{ flex: 1, paddingBottom: i < timeline.phases.length - 1 ? 24 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "'Inter',sans-serif" }}>{phase.name}</span>
                        <span style={{
                          marginLeft: 10, fontSize: 9, fontWeight: 600, padding: '2px 8px',
                          letterSpacing: 1, textTransform: 'uppercase',
                          background: `${statusColor(phase.status)}15`,
                          color: statusColor(phase.status),
                        }}>{phase.status.replace('_', ' ')}</span>
                        {phase.confidence && (() => {
                          const c = confidenceLabel(phase.confidence);
                          return <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 600, padding: '2px 6px', letterSpacing: 1, color: c.color, background: `${c.color}10` }}>{c.label}</span>;
                        })()}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {phase.estimatedEnd && <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'Inter',sans-serif" }}>{phase.estimatedEnd}</div>}
                        {phase.startDate && <div style={{ fontSize: 10, color: D.muted }}>Started {phase.startDate}</div>}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {phase.progressPct != null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1, height: 6, background: D.outline }}>
                          <div style={{ width: `${phase.progressPct}%`, height: '100%', background: statusColor(phase.status), transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 32, textAlign: 'right' }}>{phase.progressPct}%</span>
                      </div>
                    )}

                    {phase.notes && <p style={{ fontSize: 12, color: D.muted, fontFamily: "'Inter',sans-serif", margin: 0, lineHeight: 1.5 }}>{phase.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risks */}
          {(timeline.risks || []).length > 0 && (
            <div style={{ background: T.card, border: `1px solid ${D.outline}`, marginBottom: 24 }}>
              <div style={{ padding: '16px 24px', borderBottom: `1px solid ${D.outline}` }}>
                <h3 style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.danger, fontWeight: 600, margin: 0 }}>Timeline Risks</h3>
              </div>
              <div style={{ padding: '16px 24px' }}>
                {timeline.risks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', fontSize: 12, color: T.text, fontFamily: "'Inter',sans-serif" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.danger, marginTop: 1 }}>warning</span>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Freshness + Refresh */}
          <div style={{ textAlign: 'right', fontSize: 10, color: D.muted, letterSpacing: 1, fontFamily: "'Inter',sans-serif" }}>
            {generatedAt && <>Generated {generatedAt.toLocaleTimeString()} · </>}
            <span onClick={() => { timelineCache.delete(projectId); fetchTimeline(); }} style={{ cursor: 'pointer', color: D.accent, textDecoration: 'underline' }}>Refresh</span>
          </div>
        </>
      )}
    </div>
  );
}
