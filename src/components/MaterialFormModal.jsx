import { useState, useCallback, useMemo } from 'react';
import { Overlay, Label, notify } from './Shared';
import { MATERIALS_LIST, suggestCategory, toFloat, toInt, fmt } from '../utils/formatting';

const BLANK_MAT = {
  date: "", material: "", category: "grey", supplier: "", unit: "",
  qty: "", rate: "", total: "", unpaid: "0", status: "Paid", notes: ""
};

function PriceComparison({ material, entries, T }) {
  const hints = useMemo(() => {
    if (!material || material.length < 2) return [];
    const matName = material.toLowerCase().trim();
    const matching = entries.filter(e =>
      e.rate && e.material && e.material.toLowerCase().trim() === matName
    );
    if (matching.length === 0) return [];

    // Group by supplier
    const bySupplier = {};
    matching.forEach(e => {
      const raw = (e.supplier || 'Unknown').trim();
      const key = raw.toLowerCase();
      if (!bySupplier[key]) bySupplier[key] = { name: raw, entries: [] };
      if (raw.length > bySupplier[key].name.length || (raw !== bySupplier[key].name && raw[0] === raw[0].toUpperCase())) {
        bySupplier[key].name = raw;
      }
      bySupplier[key].entries.push(e);
    });

    return Object.values(bySupplier)
      .map(({ name: supplier, entries }) => {
        const sorted = entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const latest = sorted[0];
        const avgRate = Math.round(entries.reduce((s, e) => s + e.rate, 0) / entries.length);
        return {
          supplier,
          lastRate: latest.rate,
          lastDate: latest.date,
          avgRate,
          count: entries.length,
          unit: latest.unit || '',
        };
      })
      .sort((a, b) => a.avgRate - b.avgRate);
  }, [material, entries]);

  if (hints.length === 0) return null;

  const cheapest = hints[0];
  const mostExpensive = hints[hints.length - 1];

  return (
    <div style={{
      gridColumn: '1/-1', padding: '10px 14px',
      background: `${T.financial}08`, border: `1px solid ${T.financial}25`,
      fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.financial }}>compare_arrows</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.financial, letterSpacing: 2, textTransform: 'uppercase' }}>Price History</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {hints.map((h, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span style={{ color: T.text }}>
              <strong>{h.supplier}</strong>
              <span style={{ color: T.textMuted, marginLeft: 6 }}>({h.count}x, last {h.lastDate || '?'})</span>
            </span>
            <span style={{
              fontWeight: 700,
              color: hints.length > 1 && i === 0 ? T.success :
                     hints.length > 1 && i === hints.length - 1 ? T.danger : T.text,
            }}>
              PKR {h.lastRate.toLocaleString()}/{h.unit || 'unit'}
              {h.count > 1 && <span style={{ color: T.textMuted, fontWeight: 400 }}> (avg {h.avgRate.toLocaleString()})</span>}
            </span>
          </div>
        ))}
      </div>
      {hints.length > 1 && cheapest.avgRate < mostExpensive.avgRate && (
        <div style={{ marginTop: 6, fontSize: 10, color: T.success }}>
          {'\u2714'} Best price: <strong>{cheapest.supplier}</strong> at PKR {cheapest.avgRate.toLocaleString()}/{cheapest.unit || 'unit'}
          {' '} — saves {Math.round(((mostExpensive.avgRate - cheapest.avgRate) / mostExpensive.avgRate) * 100)}% vs {mostExpensive.supplier}
        </div>
      )}
    </div>
  );
}

export default function MaterialFormModal({ S, D, T, modal, setModal, editId, setEditId, form, setForm, onSave, entries }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const setF = useCallback((k, v) => {
    setForm(f => {
      const nf = { ...f, [k]: v };
      if (k === "qty" || k === "rate") {
        const q = parseFloat(k === "qty" ? v : f.qty) || 0;
        const r = parseFloat(k === "rate" ? v : f.rate) || 0;
        if (q && r) nf.total = String(Math.round(q * r));
      }
      if (k === "status") {
        if (v === "Paid") nf.unpaid = "0";
        else if (v === "Unpaid") nf.unpaid = nf.total || "0";
      }
      if (k === "material") {
        const suggested = suggestCategory(v);
        if (suggested) nf.category = suggested;
      }
      return nf;
    });
  }, [setForm]);

  const save = async () => {
    setErr("");
    if (!form.date) return setErr("Date required");
    if (!form.material.trim()) return setErr("Material required");
    if (!form.total) return setErr("Total required");
    setSaving(true);
    try {
      const qty = form.qty ? toFloat(form.qty, 0) : null;
      const rate = form.rate ? toFloat(form.rate, 0) : null;
      const data = {
        date: form.date, material: form.material, category: form.category,
        supplier: form.supplier, unit: form.unit,
        qty, rate,
        total: toInt(form.total),
        unpaid: toInt(form.unpaid, 0),
        status: form.status, notes: form.notes
      };
      await onSave(data, editId);
      setModal(false); setEditId(null); setForm(BLANK_MAT);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  if (!modal) return null;

  return (
    <Overlay onClose={() => { setModal(false); setEditId(null); setForm(BLANK_MAT); }} title={editId ? "Edit Entry" : "New Material Entry"}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1/-1" }}><Label>Date</Label><input type="date" style={S.inp} value={form.date} onChange={e => setF("date", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Material Description</Label><input list="mat-list" style={S.inp} value={form.material} onChange={e => setF("material", e.target.value)} placeholder="Type or select..." /><datalist id="mat-list">{MATERIALS_LIST.map(m => <option key={m} value={m} />)}</datalist></div>

        {/* Supplier Price Comparison */}
        <PriceComparison material={form.material} entries={entries || []} T={T} />

        <div><Label>Category</Label><select style={S.inp} value={form.category} onChange={e => setF("category", e.target.value)}><option value="grey">Grey Structure</option><option value="finishing">Finishing</option></select></div>
        <div><Label>Payment Status</Label><select style={S.inp} value={form.status} onChange={e => setF("status", e.target.value)}><option>Paid</option><option>Unpaid</option><option>Partial</option></select></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Supplier</Label><input style={S.inp} value={form.supplier} onChange={e => setF("supplier", e.target.value)} placeholder="Supplier name" /></div>
        <div><Label>Quantity</Label><input type="number" min="0" style={S.inp} value={form.qty} onChange={e => setF("qty", e.target.value)} /></div>
        <div><Label>Unit</Label><input style={S.inp} value={form.unit} onChange={e => setF("unit", e.target.value)} placeholder="bags, cft, kg..." /></div>
        <div><Label>Unit Price (PKR)</Label><input type="number" min="0" style={S.inp} value={form.rate} onChange={e => setF("rate", e.target.value)} /></div>
        <div><Label>Total Amount (PKR)</Label><input type="number" min="0" style={{ ...S.inp, fontWeight: 700 }} value={form.total} onChange={e => setF("total", e.target.value)} /></div>
        {form.status !== "Paid" && <div style={{ gridColumn: "1/-1" }}><Label>Outstanding Amount</Label><input type="number" min="0" style={{ ...S.inp, color: D.gold }} value={form.unpaid} onChange={e => setF("unpaid", e.target.value)} /></div>}
        <div style={{ gridColumn: "1/-1" }}><Label>Notes</Label><input style={S.inp} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional notes" /></div>
      </div>
      {err && <div style={{ color: "#ffb4ab", fontSize: 12, marginTop: 12, fontFamily: "'Inter',sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button style={{ ...S.btnGold, flex: 1, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? "Saving..." : editId ? "Save Changes" : "Add Entry"}</button>
        <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => { setModal(false); setEditId(null); setForm(BLANK_MAT); }}>Cancel</button>
      </div>
    </Overlay>
  );
}
