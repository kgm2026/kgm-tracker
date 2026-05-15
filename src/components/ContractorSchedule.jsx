import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { dbGet, dbInsert, dbPatch, dbDelete } from '../utils/api';
import { getSignedFileUrl, getStorageFileName, isPdfStorageFile, uploadFile, storagePath } from '../utils/storage';
import { Overlay, Label, notify } from './Shared';

const BLANK = {
  milestone: '', amount: '', due_date: '', paid_date: '',
  status: 'Pending', notes: '', doc_file: null, doc_url: null, doc_name: null,
};

const STATUS_COLORS = { Paid: '#22c55e', Pending: '#f59e0b', Overdue: '#ef4444' };

function DocUpload({ value, existingUrl, existingName, onFileChange, onClearExisting, T }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const processFile = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify('Max 10 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => onFileChange({ file, data: ev.target.result, name: file.name, type: file.type });
    reader.readAsDataURL(file);
  };

  if (value) {
    const isPdf = value.type === 'application/pdf' || value.name?.endsWith('.pdf');
    return (
      <div style={{ gridColumn: '1/-1' }}>
        <Label>Attachment</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${T.cardBorder}`, borderRadius: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: isPdf ? '#e55' : T.financial }}>
            {isPdf ? 'picture_as_pdf' : 'image'}
          </span>
          <span style={{ flex: 1, fontSize: 12, color: T.text, fontFamily: "'Inter',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
          <button onClick={() => onFileChange(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  if (existingUrl) {
    const isPdf = isPdfStorageFile(existingUrl, existingName);
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
        <Label>Attachment</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${T.cardBorder}`, borderRadius: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: isPdf ? '#e55' : T.financial }}>{isPdf ? 'picture_as_pdf' : 'image'}</span>
          <button onClick={openExisting} type="button" style={{ flex: 1, fontSize: 12, color: T.financial, fontFamily: "'Inter',sans-serif", textDecoration: 'none', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
            {existingName || getStorageFileName(existingUrl) || 'View document'}
          </button>
          <button onClick={() => inputRef.current?.click()} style={{ background: 'none', border: `1px solid ${T.cardBorder}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: T.text, fontFamily: "'Inter',sans-serif" }}>Replace</button>
          <button onClick={onClearExisting} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div style={{ gridColumn: '1/-1' }}>
      <Label>Attachment (optional)</Label>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{ border: `2px dashed ${dragging ? T.financial : T.cardBorder}`, borderRadius: 6, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', background: dragging ? `${T.financial}08` : 'transparent' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: T.textMuted }}>upload_file</span>
        <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>Attach PDF or image &mdash; max 10 MB</span>
      </div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

function ScheduleFormModal({ open, onClose, onSaved, editRow, contractor, projectId }) {
  const { T } = useTheme();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const S = { inp: { width: '100%', boxSizing: 'border-box', background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, padding: '8px 10px', fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none', borderRadius: 4 } };

  useEffect(() => {
    if (editRow) {
      setForm({ ...BLANK, ...editRow, doc_file: null, doc_url: editRow.doc_url || null, doc_name: editRow.doc_name || null });
    } else {
      setForm(BLANK);
    }
  }, [editRow, open]);

  const save = async () => {
    if (!form.milestone.trim()) return notify('Milestone name required', 'error');
    if (!form.amount) return notify('Amount required', 'error');
    setSaving(true);
    try {
      let doc_url = form.doc_url || null;
      let doc_name = form.doc_name || null;
      if (form.doc_file) {
        const path = storagePath(`contractor-docs/${contractor.contractor_id}`, form.doc_file.name);
        doc_url = await uploadFile('contractor-docs', path, form.doc_file.data, form.doc_file.type);
        doc_name = form.doc_file.name;
      } else if (doc_url && !doc_name) {
        doc_name = getStorageFileName(doc_url);
      }
      const data = {
        contractor_id: contractor.contractor_id,
        project_id: projectId,
        milestone: form.milestone,
        amount: parseFloat(form.amount) || 0,
        due_date: form.due_date || null,
        paid_date: form.paid_date || null,
        status: form.status,
        notes: form.notes,
        doc_url,
        doc_name,
      };
      if (editRow?.id) {
        await dbPatch('contractor_schedules', editRow.id, data);
      } else {
        await dbInsert('contractor_schedules', data);
      }
      notify(editRow ? 'Updated' : 'Milestone added', 'success');
      onSaved();
      onClose();
    } catch (e) {
      notify(e.message, 'error');
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <Overlay onClose={onClose} title={editRow ? 'Edit Milestone' : 'Add Payment Milestone'}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <Label>Milestone / Description</Label>
          <input style={S.inp} value={form.milestone} onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))} placeholder="e.g. Foundation complete, Slab done..." />
        </div>
        <div>
          <Label>Amount (PKR)</Label>
          <input type="number" min="0" style={S.inp} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
        <div>
          <Label>Status</Label>
          <select style={S.inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option>Pending</option>
            <option>Paid</option>
            <option>Overdue</option>
          </select>
        </div>
        <div>
          <Label>Due Date</Label>
          <input type="date" style={S.inp} value={form.due_date || ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
        <div>
          <Label>Paid Date</Label>
          <input type="date" style={S.inp} value={form.paid_date || ''} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <Label>Notes</Label>
          <input style={S.inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
        </div>
        <DocUpload
          value={form.doc_file}
          existingUrl={form.doc_url}
          existingName={form.doc_name}
          onFileChange={v => setForm(f => ({ ...f, doc_file: v }))}
          onClearExisting={() => setForm(f => ({ ...f, doc_url: null, doc_name: null }))}
          T={T}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          onClick={save} disabled={saving}
          style={{ flex: 1, background: T.financial, color: '#000', border: 'none', borderRadius: 4, padding: '10px 0', fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >{saving ? 'Saving...' : editRow ? 'Save Changes' : 'Add Milestone'}</button>
        <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: `1px solid ${T.cardBorder}`, borderRadius: 4, padding: '10px 0', fontFamily: "'Inter',sans-serif", fontSize: 13, color: T.text, cursor: 'pointer' }}>Cancel</button>
      </div>
    </Overlay>
  );
}

export default function ContractorSchedule({ contractor, projectId }) {
  const { T } = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [docViewer, setDocViewer] = useState(null);
  const [openingDocId, setOpeningDocId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dbGet('contractor_schedules',
        `&contractor_id=eq.${encodeURIComponent(contractor.contractor_id)}&project_id=eq.${projectId}&order=due_date.asc.nullslast`
      );
      setRows(data || []);
    } catch { setRows([]); }
    setLoading(false);
  }, [contractor.contractor_id, projectId]);

  useEffect(() => { load(); }, [load]);

  const del = async (row) => {
    setRows(prev => prev.filter(r => r.id !== row.id));
    const t = setTimeout(async () => {
      try {
        await dbDelete('contractor_schedules', row.id);
      } catch (err) {
        setRows(prev => [...prev, row].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')));
        notify(`Failed to delete milestone: ${err.message}`, 'error');
      }
    }, 4000);
    notify('Milestone deleted', 'undo', () => { clearTimeout(t); setRows(prev => [...prev, row].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))); });
  };

  const totalScheduled = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = rows.filter(r => r.status === 'Paid').reduce((s, r) => s + (r.amount || 0), 0);
  const totalPending = rows.filter(r => r.status !== 'Paid').reduce((s, r) => s + (r.amount || 0), 0);

  const openDocViewer = async (row) => {
    if (!row?.doc_url) return;
    setOpeningDocId(row.id);
    try {
      const signedUrl = await getSignedFileUrl(row.doc_url);
      setDocViewer({
        url: signedUrl,
        name: row.doc_name || getStorageFileName(row.doc_url) || 'Document',
      });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setOpeningDocId(null);
    }
  };

  return (
    <div style={{ padding: '16px 0 0' }}>
      {/* Summary row */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Scheduled', value: totalScheduled, color: T.text },
            { label: 'Paid', value: totalPaid, color: STATUS_COLORS.Paid },
            { label: 'Remaining', value: totalPending, color: STATUS_COLORS.Pending },
          ].map(m => (
            <div key={m.label} style={{ flex: 1, minWidth: 100, background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: T.textMuted, fontFamily: "'Inter',sans-serif", textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: m.color, fontFamily: "'Inter',sans-serif", marginTop: 2 }}>PKR {m.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {totalScheduled > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textMuted, fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>
            <span>Payment Progress</span>
            <span>{Math.round((totalPaid / totalScheduled) * 100)}%</span>
          </div>
          <div style={{ height: 6, background: T.cardBorder, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(totalPaid / totalScheduled) * 100}%`, background: STATUS_COLORS.Paid, borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Milestones list */}
      {loading ? (
        <div style={{ fontSize: 13, color: T.textMuted, fontFamily: "'Inter',sans-serif", textAlign: 'center', padding: 16 }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textMuted, fontFamily: "'Inter',sans-serif", textAlign: 'center', padding: 16 }}>No payment milestones yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const isOverdue = r.status === 'Pending' && r.due_date && new Date(r.due_date) < new Date();
            const status = isOverdue ? 'Overdue' : r.status;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 6, borderLeft: `3px solid ${STATUS_COLORS[status] || T.cardBorder}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: "'Inter',sans-serif" }}>{r.milestone}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLORS[status] || T.text, background: `${STATUS_COLORS[status]}18`, padding: '2px 7px', borderRadius: 3, fontFamily: "'Inter',sans-serif" }}>{status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.financial, fontFamily: "'Inter',sans-serif" }}>PKR {(r.amount || 0).toLocaleString()}</span>
                    {r.due_date && <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>Due: {r.due_date}</span>}
                    {r.paid_date && <span style={{ fontSize: 11, color: STATUS_COLORS.Paid, fontFamily: "'Inter',sans-serif" }}>Paid: {r.paid_date}</span>}
                    {r.notes && <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>{r.notes}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  {r.doc_url && (
                    <button
                      onClick={() => openDocViewer(r)}
                      title="View document"
                      disabled={openingDocId === r.id}
                      style={{ background: 'none', border: `1px solid ${T.financial}60`, borderRadius: 4, padding: '4px 7px', cursor: openingDocId === r.id ? 'default' : 'pointer', color: T.financial, display: 'flex', alignItems: 'center', opacity: openingDocId === r.id ? 0.6 : 1 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{openingDocId === r.id ? 'progress_activity' : 'description'}</span>
                    </button>
                  )}
                  <button onClick={() => { setEditRow(r); setModal(true); }} style={{ background: 'none', border: `1px solid ${T.cardBorder}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: T.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif" }}>Edit</button>
                  <button onClick={() => del(r)} style={{ background: 'none', border: `1px solid ${T.danger}40`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: T.danger, fontSize: 11, fontFamily: "'Inter',sans-serif" }}>Del</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => { setEditRow(null); setModal(true); }}
        style={{ marginTop: 12, width: '100%', background: 'transparent', border: `1px dashed ${T.financial}60`, borderRadius: 6, padding: '9px 0', cursor: 'pointer', color: T.financial, fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
        Add Milestone
      </button>

      <ScheduleFormModal
        open={modal}
        onClose={() => setModal(false)}
        onSaved={load}
        editRow={editRow}
        contractor={contractor}
        projectId={projectId}
      />

      {/* Document viewer */}
      {docViewer && (
        <div onClick={() => setDocViewer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10001, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 8, padding: 16, maxWidth: 860, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: T.text }}>{docViewer.name || 'Document'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={docViewer.url} download={docViewer.name} style={{ background: T.financial, color: '#000', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span> Download
                </a>
                <button onClick={() => setDocViewer(null)} style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: T.text, fontSize: 12, fontFamily: "'Inter',sans-serif" }}>Close</button>
              </div>
            </div>
            {(docViewer.url.includes('.pdf') || (docViewer.name || '').endsWith('.pdf')) ? (
              <iframe src={docViewer.url} title="Document" style={{ flex: 1, minHeight: 520, border: 'none', borderRadius: 4 }} />
            ) : (
              <img src={docViewer.url} alt="Document" style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 80px)', objectFit: 'contain', borderRadius: 4 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
