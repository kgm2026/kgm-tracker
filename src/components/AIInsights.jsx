import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getInsights } from '../utils/aiService';
import { dbGet } from '../utils/api';
import { LoadingSpinner } from './Shared';
import { onDataChange } from '../utils/aiCacheInvalidation';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const SEVERITY_COLORS = { high: '#f43f5e', medium: '#f59e0b', low: '#3b82f6' };

// Module-level cache to persist across tab switches
const insightsCache = new Map();
const insightsTimestamps = new Map();
const projectDataCache = new Map();

export default function AIInsights({ projectId, projectName }) {
  const { T } = useTheme();
  const [insights, setInsights] = useState(() => insightsCache.get(projectId) || null);
  const [loading, setLoading] = useState(!insightsCache.has(projectId));
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(() => insightsTimestamps.get(projectId) || null);

  const fetchAndAnalyze = useCallback(async (force = false) => {
    if (!force && insightsCache.has(projectId)) {
      setInsights(insightsCache.get(projectId));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [materials, payments, contractors, progressEntries] = await Promise.all([
        dbGet('material_purchases', `&project_id=eq.${projectId}&order=num.asc`),
        dbGet('payment_log', `&project_id=eq.${projectId}&order=created_at.asc`),
        dbGet('contractors', `&project_id=eq.${projectId}`),
        dbGet('progress_entries', `&project_id=eq.${projectId}&order=created_at.desc&limit=20`),
      ]);
      const projects = await dbGet('projects', `&id=eq.${projectId}`);
      const proj = projects[0] || {};

      const matActual = { grey: 0, finishing: 0 };
      materials.forEach(m => {
        if (m.category === 'grey') matActual.grey += m.total || 0;
        else matActual.finishing += m.total || 0;
      });
      const contractorActual = contractors.reduce((s, c) => s + (c.amount_paid || 0), 0);

      const budgets = [
        { cat: 'Grey Structure', key: 'grey', budget: 0, actual: matActual.grey },
        { cat: 'Finishing', key: 'finishing', budget: 0, actual: matActual.finishing },
        { cat: 'Contractors', key: 'contractors', budget: 0, actual: contractorActual },
      ];

      const projectData = { projectName, materials, payments, contractors, budgets, totalBudget: proj.budget || 0, progressEntries };
      projectDataCache.set(projectId, projectData);

      const data = await getInsights(projectData);
      const now = new Date();
      insightsCache.set(projectId, data);
      insightsTimestamps.set(projectId, now);
      setInsights(data);
      setGeneratedAt(now);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [projectId, projectName]);

  useEffect(() => {
    if (!insightsCache.has(projectId)) {
      fetchAndAnalyze();
    }
  }, [projectId, fetchAndAnalyze]);

  // Auto-invalidate cache when project data changes
  useEffect(() => {
    return onDataChange(() => {
      insightsCache.delete(projectId);
      insightsTimestamps.delete(projectId);
    });
  }, [projectId]);

  // Also invalidate when kgm-db-changed fires for relevant tables
  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases" || table === "payment_log" || table === "contractors" || table === "progress_entries" || table === "projects") {
        insightsCache.delete(projectId);
        insightsTimestamps.delete(projectId);
      }
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [projectId]);

  useRefreshOnMount(["material_purchases", "payment_log", "contractors", "progress_entries", "projects"], () => {
    insightsCache.delete(projectId);
    insightsTimestamps.delete(projectId);
  });

  const handleRefresh = () => {
    insightsCache.delete(projectId);
    insightsTimestamps.delete(projectId);
    fetchAndAnalyze(true);
  };

  if (loading) return <LoadingSpinner text="Analyzing project data..." />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: T.danger, fontSize: 14, fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>{error}</p>
        <button onClick={() => fetchAndAnalyze(true)} style={{ background: T.financial, color: '#fff', border: 'none', padding: '8px 20px', fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Retry</button>
      </div>
    );
  }

  if (!insights) return null;

  const healthColor = insights.budgetHealth === 'good' ? T.success : insights.budgetHealth === 'warning' ? T.warning : T.danger;

  return (
    <div style={{ padding: '32px 48px', animation: 'fadeUp 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 36, fontWeight: 300, letterSpacing: -0.5, color: T.text, margin: 0 }}>AI Insights</h2>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: T.textMuted, marginTop: 8 }}>Intelligence Report // {projectName}</p>
        </div>
        <button onClick={handleRefresh} style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: '8px 16px', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>refresh</span>
          Refresh
        </button>
      </div>

      {/* Summary Card */}
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{
            background: healthColor + '20',
            color: healthColor,
            padding: '4px 12px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            border: `1px solid ${healthColor}40`,
          }}>{insights.budgetHealth || 'unknown'}</span>
          {insights.budgetUtilizationPct != null && (
            <span style={{ color: T.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif" }}>{insights.budgetUtilizationPct}% budget utilized</span>
          )}
        </div>
        <p style={{ color: T.text, fontSize: 15, fontFamily: "'Inter',sans-serif", lineHeight: 1.6, margin: 0 }}>{insights.summary}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Alerts */}
        <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28 }}>
          <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>warning</span>
            Alerts
          </h3>
          {(insights.alerts || []).length === 0 ? (
            <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>No alerts detected.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {insights.alerts.map((a, i) => (
                <div key={i} style={{
                  padding: '12px 16px',
                  borderLeft: `3px solid ${SEVERITY_COLORS[a.severity] || T.textMuted}`,
                  background: T.navActiveBg,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}>{a.title}</span>
                    <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: SEVERITY_COLORS[a.severity] || T.textMuted, fontWeight: 700 }}>{a.severity}</span>
                  </div>
                  <p style={{ color: T.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif", margin: 0, lineHeight: 1.5 }}>{a.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price Trends */}
        <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28 }}>
          <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>trending_up</span>
            Price Trends
          </h3>
          {(insights.priceTrends || []).length === 0 ? (
            <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Not enough data for price trends.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {insights.priceTrends.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.cardBorder}` }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: T.text, fontFamily: "'Inter',sans-serif" }}>{t.material}</span>
                    <span style={{ color: T.textMuted, fontSize: 11, marginLeft: 8, fontFamily: "'Inter',sans-serif" }}>{t.trend}</span>
                  </div>
                  <span style={{
                    color: t.trend === 'rising' ? T.danger : t.trend === 'falling' ? T.success : T.textMuted,
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: "'Inter',sans-serif",
                  }}>{t.changePct > 0 ? '+' : ''}{t.changePct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: 28, marginBottom: 24 }}>
        <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 20px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>lightbulb</span>
          Recommendations
        </h3>
        {(insights.recommendations || []).length === 0 ? (
          <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>No recommendations at this time.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.recommendations.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: T.financial, fontWeight: 700, fontSize: 13, minWidth: 20, fontFamily: "'Inter',sans-serif" }}>{i + 1}.</span>
                <p style={{ color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", margin: 0, lineHeight: 1.5 }}>{r}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unpaid Highlight */}
      {insights.unpaidHighlight && (
        <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderLeft: `3px solid ${T.warning}`, padding: 28, marginBottom: 24 }}>
          <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: T.text, fontWeight: 600, margin: '0 0 12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8 }}>account_balance</span>
            Outstanding Payments
          </h3>
          <p style={{ color: T.text, fontSize: 14, fontFamily: "'Inter',sans-serif", margin: 0, lineHeight: 1.6 }}>{insights.unpaidHighlight}</p>
        </div>
      )}

      {/* Ask AI CTA */}
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, padding: '20px 28px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: T.text, margin: '0 0 4px', fontWeight: 600 }}>Have questions about this report?</p>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: T.textMuted, margin: 0 }}>Use the AI Assistant to ask follow-up questions about these insights.</p>
        </div>
        <button
          onClick={() => {
            const fab = document.querySelector('[aria-label="AI Assistant"]');
            if (fab) fab.click();
          }}
          style={{
            background: T.financial, color: '#fff', border: 'none', padding: '10px 20px',
            fontSize: 11, cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700,
            letterSpacing: 1.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_toy</span>
          Ask AI
        </button>
      </div>

      {/* Freshness Indicator */}
      {generatedAt && (
        <div style={{ textAlign: 'right', padding: '8px 0', fontFamily: "'Inter',sans-serif", fontSize: 10, color: T.textMuted, letterSpacing: 1 }}>
          Generated {generatedAt.toLocaleTimeString()} · <span onClick={handleRefresh} style={{ cursor: 'pointer', color: T.financial, textDecoration: 'underline' }}>Refresh</span>
        </div>
      )}
    </div>
  );
}
