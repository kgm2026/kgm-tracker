import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Overlay, Label, notify } from './Shared';
import { MATERIALS_LIST, suggestCategory, toFloat, toInt } from '../utils/formatting';
import { getSignedFileUrl, getStorageFileName, isPdfStorageFile, uploadFile, storagePath } from '../utils/storage';

const BLANK_MAT = {
  date: "", material: "", category: "grey", supplier: "", unit: "",
  qty: "", rate: "", total: "", unpaid: "0", status: "Paid", notes: "", invoice_file: null, invoice_url: null
};

const MAX_INVOICE_SIZE = 5 * 1024 * 1024; // 5 MB

function PriceComparison({ material, entries, T }) {
  const hints = useMemo(() => {
    if (!material || material.length < 2) return [];
    const matName = material.toLowerCase().trim();
    const matching = entries.filter(e =>
      e.rate && e.material && e.material.toLowerCase().trim() === matName
    );
    if (matching.length === 0) return [];

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
        return { supplier, lastRate: latest.rate, lastDate: latest.date, avgRate, count: entries.length, unit: latest.unit || '' };
      })
      .sort((a, b) => a.avgRate - b.avgRate);
  }, [material, entries]);

  if (hints.length === 0) return null;
  const cheapest = hints[0];
  const mostExpensive = hints[hints.length - 1];

  return (
    <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: `${T.financial}08`, border: `1px solid ${T.financial}25`, fontFamily: "'Inter',sans-serif" }}>
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
            <span style={{ fontWeight: 700, color: hints.length > 1 && i === 0 ? T.success : hints.length > 1 && i === hints.length - 1 ? T.danger : T.text }}>
              PKR {h.lastRate.toLocaleString()}/{h.unit || 'unit'}
              {h.count > 1 && <span style={{ color: T.textMuted, fontWeight: 400 }}> (avg {h.avgRate.toLocaleString()})</span>}
            </span>
          </div>
        ))}
      </div>
      {hints.length > 1 && cheapest.avgRate < mostExpensive.avgRate && (
        <div style={{ marginTop: 6, fontSize: 10, color: T.success }}>
          {'\u2714'} Best price: <strong>{cheapest.supplier}</strong> at PKR {cheapest.avgRate.toLocaleString()}/{cheapest.unit || 'unit'}
          {' '}&mdash; saves {Math.round(((mostExpensive.avgRate - cheapest.avgRate) / mostExpensive.avgRate) * 100)}% vs {mostExpensive.supplier}
        </div>
      )}
    </div>
  );
}

function SupplierCombobox({ value, onChange, onSelect, entries, material, S, T }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const freq = {};
    const lastSeen = {};
    const lastRate = {};
    const lastUnit = {};
    const matLower = (material || '').trim().toLowerCase();

    for (const e of entries || []) {
      const name = (e.supplier || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      freq[key] = (freq[key] || 0) + 1;
      if (!lastSeen[key] || (e.date || '') > lastSeen[key]) lastSeen[key] = e.date || '';
      if (matLower && e.material && e.material.trim().toLowerCase() === matLower) {
        if (!lastSeen[key + '__mat'] || (e.date || '') > lastSeen[key + '__mat']) {
          lastSeen[key + '__mat'] = e.date || '';
          lastRate[key] = e.rate;
          lastUnit[key] = e.unit;
        }
      }
    }

    const canonical = {};
    for (const e of entries || []) {
      const name = (e.supplier || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!canonical[key] || name.length > canonical[key].length) canonical[key] = name;
    }

    return Object.keys(canonical)
      .filter(key => !q || key.includes(q))
      .sort((a, b) => {
        const aStarts = a.startsWith(q), bStarts = b.startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return (freq[b] || 0) - (freq[a] || 0);
      })
      .slice(0, 8)
      .map(key => ({ name: canonical[key], freq: freq[key] || 1, lastRate: lastRate[key], lastUnit: lastUnit[key] }));
  }, [value, entries, material]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', gridColumn: '1/-1' }}>
      <Label>Supplier</Label>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...S.inp, paddingRight: 32 }}
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Type or select supplier..."
          autoComplete="off"
        />
        <span className="material-symbols-outlined" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: T.textMuted, pointerEvents: 'none' }}>expand_more</span>
      </div>
      {open && focused && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: T.card, border: `1px solid ${T.cardBorder}`, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxHeight: 220, overflowY: 'auto', fontFamily: "'Inter',sans-serif" }}>
          {suggestions.map((s, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); onChange(s.name); onSelect(s); setOpen(false); }}
              style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.cardBorder}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = `${T.financial}15`}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.textMuted }}>storefront</span>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                <span style={{ fontSize: 10, color: T.textMuted, background: `${T.financial}18`, padding: '1px 5px', borderRadius: 3 }}>{s.freq}x</span>
              </div>
              {s.lastRate != null && (
                <span style={{ fontSize: 11, color: T.financial, fontWeight: 600 }}>PKR {Number(s.lastRate).toLocaleString()}/{s.lastUnit || 'unit'}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// value = { file: File, data: base64, name, type } for new pick | null for none
// existingUrl = already-stored Storage URL (for edit mode)
function InvoiceUpload({ value, existingUrl, onFileChange, onClearExisting, T }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [existingPreviewUrl, setExistingPreviewUrl] = useState(null);
  const [loadingExistingPreview, setLoadingExistingPreview] = useState(false);

  const processFile = (file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|pdf)$/i)) {
      notify('Only JPG, PNG, WEBP, HEIC, or PDF allowed', 'error');
      return;
    }
    if (file.size > MAX_INVOICE_SIZE) {
      notify('File must be under 5 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => onFileChange({ file, data: ev.target.result, name: file.name, type: file.type });
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); };

  useEffect(() => {
    let cancelled = false;

    if (!existingUrl || isPdfStorageFile(existingUrl)) {
      setExistingPreviewUrl(null);
      setLoadingExistingPreview(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingExistingPreview(true);
    getSignedFileUrl(existingUrl)
      .then((signedUrl) => {
        if (!cancelled) setExistingPreviewUrl(signedUrl);
      })
      .catch((err) => {
        if (!cancelled) notify(err.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingExistingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [existingUrl]);

  // Show newly-picked file
  if (value) {
    const isPdf = value.type === 'application/pdf' || value.name?.endsWith('.pdf');
    return (
      <div style={{ gridColumn: '1/-1' }}>
        <Label>Invoice / Receipt</Label>
        <div style={{ border: `1px solid ${T.cardBorder}`, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          {isPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#e55' }}>picture_as_pdf</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "'Inter',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</div>
                <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>PDF — will upload on save</div>
              </div>
            </div>
          ) : (
            <img src={value.data} alt="invoice" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block', background: '#000' }} />
          )}
          <button onClick={() => onFileChange(null)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove">
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>close</span>
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  // Show existing stored URL (edit mode)
  if (existingUrl) {
    const isPdf = isPdfStorageFile(existingUrl);
    const filename = getStorageFileName(existingUrl) || 'invoice';
    const openExisting = async () => {
      try {
        const signedUrl = await getSignedFileUrl(existingUrl);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } catch (err) {
        notify(err.message, 'error');
      }
    };

    return (
      <div style={{ gridColumn: '1/-1' }}>
        <Label>Invoice / Receipt</Label>
        <div style={{ border: `1px solid ${T.cardBorder}`, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          {isPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#e55' }}>picture_as_pdf</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "'Inter',sans-serif" }}>{filename}</div>
                <button onClick={openExisting} type="button" style={{ fontSize: 11, color: T.financial, fontFamily: "'Inter',sans-serif", background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>View PDF</button>
              </div>
            </div>
          ) : (
            loadingExistingPreview ? (
              <div style={{ width: '100%', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', fontFamily: "'Inter',sans-serif", fontSize: 12 }}>
                Loading saved image...
              </div>
            ) : (
              <img src={existingPreviewUrl || ''} alt="invoice" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block', background: '#000' }} />
            )
          )}
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
            <button onClick={() => inputRef.current?.click()} style={{ background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff', fontFamily: "'Inter',sans-serif" }}>Replace</button>
            <button onClick={onClearExisting} style={{ background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove">
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>close</span>
            </button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  // Empty state — drop zone
  return (
    <div style={{ gridColumn: '1/-1' }}>
      <Label>Invoice / Receipt (optional)</Label>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{ border: `2px dashed ${dragging ? T.financial : T.cardBorder}`, borderRadius: 6, padding: '18px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'border-color 0.2s', background: dragging ? `${T.financial}08` : 'transparent' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: T.textMuted }}>upload_file</span>
        <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Inter',sans-serif", textAlign: 'center' }}>
          Tap to attach invoice or receipt<br />
          <span style={{ fontSize: 10 }}>JPG, PNG, HEIC, PDF &mdash; max 5 MB &mdash; saved to cloud</span>
        </span>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export default function MaterialFormModal({ S, D, T, modal, editId, form, setForm, onSave, onClose, entries }) {
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
      if (k === "total" || k === "status") {
        // Always keep unpaid in sync with status
        const total = k === "total" ? (parseFloat(v) || 0) : (parseFloat(f.total) || 0);
        const status = k === "status" ? v : f.status;
        if (status === "Paid") nf.unpaid = "0";
        else if (status === "Unpaid") nf.unpaid = String(total);
        // Partial: keep existing unpaid value unless total changed and unpaid exceeds it
        else if (status === "Partial" && k === "total") {
          const cur = parseFloat(f.unpaid) || 0;
          if (cur > total) nf.unpaid = String(total);
        }
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

      // Upload invoice to Supabase Storage if a new file was picked
      let invoice_url = form.invoice_url || null;
      let invoice_name = null;
      if (form.invoice_file) {
        const path = storagePath('materials', form.invoice_file.name);
        invoice_url = await uploadFile('invoices', path, form.invoice_file.data, form.invoice_file.type);
        invoice_name = form.invoice_file.name;
      } else if (form.invoice_url) {
        invoice_name = getStorageFileName(form.invoice_url);
      }

      const data = {
        date: form.date, material: form.material, category: form.category,
        supplier: form.supplier, unit: form.unit,
        qty, rate,
        total: toInt(form.total),
        unpaid: toInt(form.unpaid, 0),
        status: form.status, notes: form.notes,
        invoice_url,
        invoice_name,
        // clear old base64 columns if editing an old entry
        invoice_data: null,
      };
      const result = await onSave(data, editId);
      if (!result?.keepOpen) onClose();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  if (!modal) return null;

  return (
    <Overlay onClose={onClose} title={editId ? "Edit Entry" : "New Material Entry"}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <Label>Date</Label>
          <input type="date" style={S.inp} value={form.date} onChange={e => setF("date", e.target.value)} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <Label>Material Description</Label>
          <input list="mat-list" style={S.inp} value={form.material} onChange={e => setF("material", e.target.value)} placeholder="Type or select..." />
          <datalist id="mat-list">{MATERIALS_LIST.map(m => <option key={m} value={m} />)}</datalist>
        </div>

        <PriceComparison material={form.material} entries={entries || []} T={T} />

        <div>
          <Label>Category</Label>
          <select style={S.inp} value={form.category} onChange={e => setF("category", e.target.value)}>
            <option value="grey">Grey Structure</option>
            <option value="finishing">Finishing</option>
          </select>
        </div>
        <div>
          <Label>Payment Status</Label>
          <select style={S.inp} value={form.status} onChange={e => setF("status", e.target.value)}>
            <option>Paid</option>
            <option>Unpaid</option>
            <option>Partial</option>
          </select>
        </div>

        <SupplierCombobox
          value={form.supplier}
          onChange={v => setF("supplier", v)}
          onSelect={s => {
            setForm(f => {
              const nf = { ...f, supplier: s.name };
              if (s.lastRate != null && !f.rate) {
                nf.rate = String(s.lastRate);
                const q = parseFloat(f.qty) || 0;
                if (q) nf.total = String(Math.round(q * s.lastRate));
              }
              if (s.lastUnit && !f.unit) nf.unit = s.lastUnit;
              return nf;
            });
          }}
          entries={entries || []}
          material={form.material}
          S={S}
          T={T}
        />

        <div>
          <Label>Quantity</Label>
          <input type="number" min="0" style={S.inp} value={form.qty} onChange={e => setF("qty", e.target.value)} />
        </div>
        <div>
          <Label>Unit</Label>
          <input list="unit-list" style={S.inp} value={form.unit} onChange={e => setF("unit", e.target.value)} placeholder="bags, cft, kg..." />
          <datalist id="unit-list">{["bags","cft","sft","rft","kg","tons","litre","nos","set","LS"].map(u => <option key={u} value={u} />)}</datalist>
        </div>
        <div>
          <Label>Unit Price (PKR)</Label>
          <input type="number" min="0" style={S.inp} value={form.rate} onChange={e => setF("rate", e.target.value)} />
        </div>
        <div>
          <Label>Total Amount (PKR)</Label>
          <input type="number" min="0" style={{ ...S.inp, fontWeight: 700 }} value={form.total} onChange={e => setF("total", e.target.value)} />
        </div>

        {form.status !== "Paid" && (
          <div style={{ gridColumn: "1/-1" }}>
            <Label>Outstanding Amount (PKR)</Label>
            <input
              type="number" min="0"
              style={{ ...S.inp, color: D.gold }}
              value={form.unpaid}
              onChange={e => setF("unpaid", e.target.value)}
            />
          </div>
        )}

        <div style={{ gridColumn: "1/-1" }}>
          <Label>Notes</Label>
          <input style={S.inp} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional notes" />
        </div>

        <InvoiceUpload
          value={form.invoice_file}
          existingUrl={form.invoice_url}
          onFileChange={v => setForm(f => ({ ...f, invoice_file: v }))}
          onClearExisting={() => setForm(f => ({ ...f, invoice_url: null }))}
          T={T}
          S={S}
        />
      </div>

      {err && <div style={{ color: "#ffb4ab", fontSize: 12, marginTop: 12, fontFamily: "'Inter',sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button style={{ ...S.btnGold, flex: 1, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? "Saving..." : editId ? "Save Changes" : "Add Entry"}</button>
        <button style={{ ...S.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
      </div>
    </Overlay>
  );
}
