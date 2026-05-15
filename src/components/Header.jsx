import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbDelete, dbInsert, dbPatch } from '../utils/api';
import { supabase } from '../utils/supabaseClient';
import { Overlay, Label, notify } from './Shared';
import { TABS } from './Sidebar';

const BLANK_ACCESS_USER = { email: "", role: "viewer", is_active: true };

function isMissingAccessTable(error) {
  return ['42P01', 'PGRST205'].includes(error?.code) || /app_user_roles|relation .* does not exist|schema cache/i.test(error?.message || '');
}

export default function Header({ tab, currentProject, projects, setCurrentProject, setTab, onExportPDF, setProjects }) {
  const { S, T, toggle: toggleTheme, theme } = useTheme();
  const { isAdmin, logout, user } = useAuth();
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessSetupMissing, setAccessSetupMissing] = useState(false);
  const [accessForm, setAccessForm] = useState(BLANK_ACCESS_USER);
  const [savingAccess, setSavingAccess] = useState(false);
  const [newProj, setNewProj] = useState({ name: "", address: "", client: "" });
  const [savingProj, setSavingProj] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowProjectMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!showAccess || !isAdmin) return;
    supabase
      .from("app_user_roles")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          if (isMissingAccessTable(error)) {
            setAccessSetupMissing(true);
            setAccessUsers([]);
            return;
          }
          notify(error.message, "error");
          return;
        }
        setAccessSetupMissing(false);
        setAccessUsers(data || []);
      });
  }, [showAccess, isAdmin]);

  const createProject = async () => {
    if (!newProj.name.trim()) return notify("Project name required", "error");
    setSavingProj(true);
    try {
      const row = await dbInsert("projects", {
        name: newProj.name.trim(),
        address: newProj.address,
        client: newProj.client
      });
      setProjects(prev => [...prev, row]);
      setCurrentProject(row);
      setShowNewProject(false);
      setNewProj({ name: "", address: "", client: "" });
    } catch (e) { notify(e.message, "error"); }
    setSavingProj(false);
  };

  const saveAccessUser = async () => {
    if (accessSetupMissing) {
      notify("Apply the Supabase access migration before adding users.", "error");
      return;
    }
    const email = accessForm.email.trim().toLowerCase();
    if (!email) return notify("Email required", "error");
    setSavingAccess(true);
    try {
      const existing = accessUsers.find(u => u.email?.toLowerCase() === email);
      const payload = { email, role: accessForm.role, is_active: accessForm.is_active };
      const row = existing
        ? await dbPatch("app_user_roles", existing.id, payload).then(() => ({ ...existing, ...payload }))
        : await dbInsert("app_user_roles", payload);
      setAccessUsers(prev => existing
        ? prev.map(u => u.id === existing.id ? row : u)
        : [...prev, row]);
      setAccessForm(BLANK_ACCESS_USER);
      notify(existing ? "Access updated" : "Access added");
    } catch (e) {
      notify(e.message, "error");
    }
    setSavingAccess(false);
  };

  const toggleAccess = async (row) => {
    try {
      await dbPatch("app_user_roles", row.id, { is_active: !row.is_active });
      setAccessUsers(prev => prev.map(u => u.id === row.id ? { ...u, is_active: !u.is_active } : u));
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const removeAccess = async (row) => {
    if (!window.confirm(`Remove access for ${row.email}?`)) return;
    try {
      await dbDelete("app_user_roles", row.id);
      setAccessUsers(prev => prev.filter(u => u.id !== row.id));
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const tabLabel = TABS.find(t => t.id === tab)?.label || "Dashboard";

  return (
    <>
      <div className="kgm-header no-print" style={{ background: T.header, borderBottom: `1px solid ${T.headerBorder}`, padding: "0 32px", height: 80, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="kgm-header-main" style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <h2 style={{ fontFamily: "'Inter',sans-serif", letterSpacing: 3, textTransform: "uppercase", fontSize: 12, fontWeight: 300, color: T.text, margin: 0 }}>{tabLabel}</h2>
          <div style={{ position: "relative" }} ref={dropRef}>
            <button className="kgm-project-trigger" onClick={() => setShowProjectMenu(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0, minWidth: 0 }}>
              <span className="kgm-project-name" style={{ fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 900, color: T.text }}>{currentProject.name}</span>
              {currentProject.address && <span className="kgm-project-address" style={{ color: T.textMuted, fontSize: 12 }}>{currentProject.address}</span>}
              <span style={{ color: T.textMuted, fontSize: 12, transform: showProjectMenu ? "rotate(180deg)" : "rotate(0)", transition: "0.2s" }}>&#9660;</span>
            </button>
            {showProjectMenu && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: T.card, border: `1px solid ${T.cardBorder}`, minWidth: 240, zIndex: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "hidden" }}>
                <div style={{ padding: "8px 0" }}>
                  {projects.map(p => (
                    <button key={p.id} onClick={() => { setCurrentProject(p); setShowProjectMenu(false); setTab("dashboard"); }} style={{ width: "100%", background: p.id === currentProject.id ? T.cardBorder : "none", border: "none", padding: "10px 16px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{p.name} {p.id === currentProject.id && "\u2713"}</span>
                      {p.address && <span style={{ fontSize: 11, color: T.textMuted }}>{p.address}</span>}
                    </button>
                  ))}
                </div>
                {isAdmin && <div style={{ borderTop: `1px solid ${T.cardBorder}`, padding: "8px 0" }}><button onClick={() => { setShowNewProject(true); setShowProjectMenu(false); }} style={{ width: "100%", background: "none", border: "none", padding: "10px 16px", textAlign: "left", cursor: "pointer", color: T.text, fontWeight: 700, fontSize: 13 }}>+ New Project</button></div>}
              </div>
            )}
          </div>
        </div>
        <div className="kgm-header-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} style={{ background: "transparent", border: `1px solid ${T.cardBorder}`, color: T.textMuted, padding: "7px 11px", cursor: "pointer", fontSize: 15 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{theme === "dark" ? "light_mode" : "dark_mode"}</span>
          </button>
          <button onClick={onExportPDF} aria-label="Export project data to PDF" style={{ background: "transparent", border: `1px solid ${T.text}`, color: T.text, fontSize: 10, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontFamily: "'Inter',sans-serif", letterSpacing: 2, textTransform: "uppercase" }}>
            Export PDF
          </button>
          {isAdmin && (
            <button onClick={() => setShowAccess(true)} aria-label="Manage access" style={{ background: "transparent", border: `1px solid ${T.cardBorder}`, color: T.text, fontSize: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontFamily: "'Inter',sans-serif", letterSpacing: 2, textTransform: "uppercase" }}>
              Access
            </button>
          )}
          {user?.email && (
            <span className="kgm-user-email" style={{ fontSize: 11, color: T.textMuted, padding: "0 6px" }}>
              {user.email}
            </span>
          )}
          {isAdmin && (
            <button onClick={logout} aria-label="Logout" style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 11 }}>
              Logout
            </button>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <Overlay onClose={() => setShowNewProject(false)} title="New Project">
          <Label>Project Name</Label>
          <input style={S.inp} value={newProj.name} onChange={e => setNewProj(f => ({ ...f, name: e.target.value }))} placeholder="e.g. C-364, B-101..." />
          <Label>Address</Label>
          <input style={S.inp} value={newProj.address} onChange={e => setNewProj(f => ({ ...f, address: e.target.value }))} placeholder="e.g. DHA Phase 7, Lahore" />
          <Label>Client</Label>
          <input style={S.inp} value={newProj.client} onChange={e => setNewProj(f => ({ ...f, client: e.target.value }))} placeholder="Client name" />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...S.btnGold, flex: 1, opacity: savingProj ? 0.6 : 1 }} onClick={createProject} disabled={savingProj}>{savingProj ? "Creating..." : "Create Project"}</button>
            <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => setShowNewProject(false)}>Cancel</button>
          </div>
        </Overlay>
      )}

      {showAccess && isAdmin && (
        <Overlay onClose={() => setShowAccess(false)} title="Manage Access">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px", gap: 8, marginBottom: 14 }}>
            <input
              style={S.inp}
              type="email"
              value={accessForm.email}
              onChange={e => setAccessForm(f => ({ ...f, email: e.target.value }))}
              placeholder="person@example.com"
            />
            <select style={S.inp} value={accessForm.role} onChange={e => setAccessForm(f => ({ ...f, role: e.target.value }))}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button style={{ ...S.btnGold, opacity: savingAccess ? 0.6 : 1 }} onClick={saveAccessUser} disabled={savingAccess}>
              Add
            </button>
          </div>
          <p style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
            Add the email here, then create or invite the same email in Supabase Auth. Viewers can sign in and view data; admins can manage projects and access.
          </p>
          {accessSetupMissing && (
            <div style={{ border: `1px solid ${T.danger}55`, color: T.text, background: `${T.danger}10`, padding: 12, fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
              The access table has not been created in Supabase yet. Apply the migration at <strong>supabase/migrations/20260514000000_multi_user_access_roles.sql</strong>, then reopen this panel.
            </div>
          )}
          <div style={{ border: `1px solid ${T.cardBorder}`, maxHeight: 320, overflow: "auto" }}>
            {accessUsers.length === 0 ? (
              <div style={{ padding: 14, color: T.textMuted, fontSize: 13 }}>No access rows yet.</div>
            ) : accessUsers.map(row => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 76px", gap: 8, alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${T.cardBorder}` }}>
                <span style={{ color: T.text, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{row.email}</span>
                <span style={{ color: T.textMuted, fontSize: 12, textTransform: "uppercase" }}>{row.role}</span>
                <button style={{ ...S.btnGhost, padding: "5px 8px", fontSize: 11 }} onClick={() => toggleAccess(row)}>
                  {row.is_active ? "Active" : "Paused"}
                </button>
                <button style={{ ...S.btnGhost, padding: "5px 8px", fontSize: 11, color: T.danger }} onClick={() => removeAccess(row)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Overlay>
      )}
    </>
  );
}
