import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { fetchBoqItems, updateBoqItem } from '../utils/boqApi';
import { fmt, toFloat } from '../utils/formatting';
import { notify } from './Shared';

const STATUSES = ['planned', 'in_progress', 'completed'];

function chipColor(T, value) {
  if (value > 0) return T.danger;
  if (value < 0) return T.success;
  return T.textMuted;
}

export default function BOQ({ projectId }) {
  const { S, T } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBoqItems(projectId);
      setItems(Array.isArray(data) ? data : []);
      const initial = {};
      (data || []).forEach((row) => {
        initial[row.category] = true;
      });
      setExpanded(initial);
    } catch (error) {
      notify(`Failed to load BOQ: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => items.filter((row) => {
    const catOk = categoryFilter === 'all' || row.category === categoryFilter;
    const statusOk = statusFilter === 'all' || row.status === statusFilter;
    return catOk && statusOk;
  }), [items, categoryFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((row) => {
      if (!map.has(row.category)) map.set(row.category, []);
      map.get(row.category).push(row);
    });
    return Array.from(map.entries()).map(([category, rows]) => {
      const estimated = rows.reduce((sum, r) => sum + Number(r.estimated_cost || 0), 0);
      const actual = rows.reduce((sum, r) => sum + Number(r.actual_cost || 0), 0);
      const variance = actual - estimated;
      const pctOver = estimated > 0 ? (variance / estimated) * 100 : 0;
      return { category, rows, estimated, actual, variance, pctOver };
    });
  }, [filtered]);

  const totals = useMemo(() => {
    const estimated = filtered.reduce((sum, r) => sum + Number(r.estimated_cost || 0), 0);
    const actual = filtered.reduce((sum, r) => sum + Number(r.actual_cost || 0), 0);
    const variance = actual - estimated;
    const pctOver = estimated > 0 ? (variance / estimated) * 100 : 0;
    return { estimated, actual, variance, pctOver };
  }, [filtered]);

  const categories = useMemo(() => ['all', ...new Set(items.map((x) => x.category))], [items]);

  const onEdit = (row) => {
    setEditingId(row.id);
    setDrafts((prev) => ({
      ...prev,
      [row.id]: {
        actual_cost: row.actual_cost ?? '',
        actual_rate: row.actual_rate ?? row.actual_cost ?? '',
        vendor: row.vendor ?? '',
        status: row.status || 'planned',
        notes: row.notes || '',
      },
    }));
  };

  const onCancel = () => {
    setEditingId(null);
  };

  const onDraft = (id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }));
  };

  const onSave = async (row) => {
    const draft = drafts[row.id];
    if (!draft) return;
    setSaving((prev) => ({ ...prev, [row.id]: true }));
    try {
      const actualCost = toFloat(draft.actual_cost, 0);
      const actualRate = toFloat(draft.actual_rate, actualCost);
      const patch = {
        actual_cost: actualCost,
        actual_rate: actualRate,
        vendor: String(draft.vendor || ''),
        status: draft.status || 'planned',
        notes: String(draft.notes || ''),
      };
      await updateBoqItem(row.id, patch, projectId);
      setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
      setEditingId(null);
      notify('BOQ item updated');
    } catch (error) {
      notify(`Update failed: ${error.message}`, 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const exportCsv = () => {
    const headers = [
      'category',
      'sub_category',
      'item_name',
      'unit',
      'quantity',
      'estimated_rate',
      'estimated_cost',
      'actual_rate',
      'actual_cost',
      'vendor',
      'status',
      'notes',
    ];
    const rows = filtered.map((r) => headers.map((h) => {
      const raw = r[h] ?? '';
      const value = String(raw).replaceAll('"', '""');
      return `"${value}"`;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `boq_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, color: T.textMuted }}>
        Loading BOQ...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 24, color: T.text }}>BOQ Dashboard</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={S.inp}>
            {categories.map((cat) => <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={S.inp}>
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={exportCsv} style={S.btnGold}>Export CSV</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <div style={S.card}>
          <div style={S.cardLabel}>Total Estimated Cost</div>
          <div style={S.cardValue}>{fmt(totals.estimated)}</div>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>Total Actual Cost</div>
          <div style={S.cardValue}>{fmt(totals.actual)}</div>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>Variance</div>
          <div style={{ ...S.cardValue, color: chipColor(T, totals.variance) }}>
            {totals.variance >= 0 ? '+' : ''}{fmt(totals.variance)}
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>% Over Budget</div>
          <div style={{ ...S.cardValue, color: totals.pctOver > 0 ? T.danger : T.success }}>
            {totals.pctOver.toFixed(2)}%
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardLabel, marginBottom: 12 }}>Category Summary</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {grouped.map((group) => {
            const isAlert = group.pctOver > 10;
            return (
              <div
                key={group.category}
                style={{
                  border: `1px solid ${isAlert ? T.danger : T.cardBorder}`,
                  borderRadius: 8,
                  padding: 10,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 1.2fr) 1fr 1fr 1fr auto',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <strong style={{ color: T.text }}>{group.category}</strong>
                <span style={{ color: T.textMuted }}>Est: {fmt(group.estimated)}</span>
                <span style={{ color: T.textMuted }}>Act: {fmt(group.actual)}</span>
                <span style={{ color: chipColor(T, group.variance) }}>
                  Var: {group.variance >= 0 ? '+' : ''}{fmt(group.variance)}
                </span>
                <span style={{ color: isAlert ? T.danger : T.success, fontWeight: 700 }}>
                  {group.pctOver.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...S.card, overflow: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={S.thS}>Item</th>
              <th style={S.thS}>Sub Category</th>
              <th style={S.thS}>Estimated</th>
              <th style={S.thS}>Actual</th>
              <th style={S.thS}>Variance</th>
              <th style={S.thS}>Status</th>
              <th style={S.thS}>Vendor</th>
              <th style={S.thS}>Notes</th>
              <th style={S.thS}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <Fragment key={group.category}>
                <tr key={`${group.category}-header`} style={{ background: T.tableBg2 }}>
                  <td colSpan={9} style={{ ...S.tdS, fontWeight: 700 }}>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [group.category]: !prev[group.category] }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: T.text,
                        cursor: 'pointer',
                        fontWeight: 700,
                        padding: 0,
                      }}
                    >
                      {expanded[group.category] ? '▼' : '▶'} {group.category}
                    </button>
                  </td>
                </tr>
                {expanded[group.category] && group.rows.map((row) => {
                  const isEditing = editingId === row.id;
                  const draft = drafts[row.id] || {};
                  const estimated = Number(row.estimated_cost || 0);
                  const actual = Number(isEditing ? draft.actual_cost : row.actual_cost || 0);
                  const variance = actual - estimated;
                  return (
                    <tr key={row.id}>
                      <td style={S.tdS}>{row.item_name}</td>
                      <td style={S.tdS}>{row.sub_category}</td>
                      <td style={S.tdS}>{fmt(estimated)}</td>
                      <td style={S.tdS}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={draft.actual_cost}
                            onChange={(e) => onDraft(row.id, 'actual_cost', e.target.value)}
                            style={S.inp}
                          />
                        ) : fmt(actual)}
                      </td>
                      <td style={{ ...S.tdS, color: chipColor(T, variance) }}>
                        {variance >= 0 ? '+' : ''}{fmt(variance)}
                      </td>
                      <td style={S.tdS}>
                        {isEditing ? (
                          <select value={draft.status} onChange={(e) => onDraft(row.id, 'status', e.target.value)} style={S.inp}>
                            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        ) : row.status}
                      </td>
                      <td style={S.tdS}>
                        {isEditing ? (
                          <input value={draft.vendor} onChange={(e) => onDraft(row.id, 'vendor', e.target.value)} style={S.inp} />
                        ) : (row.vendor || '—')}
                      </td>
                      <td style={S.tdS}>
                        {isEditing ? (
                          <input value={draft.notes} onChange={(e) => onDraft(row.id, 'notes', e.target.value)} style={S.inp} />
                        ) : (row.notes || '—')}
                      </td>
                      <td style={S.tdS}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button disabled={saving[row.id]} onClick={() => onSave(row)} style={S.btnGold}>
                              {saving[row.id] ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={onCancel} style={S.btnGhost}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => onEdit(row)} style={S.btnEdit}>Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
