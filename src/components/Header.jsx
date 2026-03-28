import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbInsert } from '../utils/api';
import { Overlay, Label, notify } from './Shared';
import { TABS } from './Sidebar';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

export default function Header({ tab, currentProject, projects, setCurrentProject, setTab, onExportPDF, setProjects }) {
  const { S, T, toggle: toggleTheme, theme } = useTheme();
  const { isAdmin, login, logout, error: authError } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProj, setNewProj] = useState({ name: "", address: "", client: "" });
  const [savingProj, setSavingProj] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    if (authError) setPwErr(authError);
  }, [authError]);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowProjectMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogin = async () => {
    if (!pw) return setPwErr("Enter admin password");
    try {
      await login(pw);
      setShowLogin(false);
      setPw("");
      setPwErr("");
    } catch (e) {
      setPwErr(e.message || "Login failed");
    }
  };

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

  const tabLabel = TABS.find(t => t.id === tab)?.label || "Dashboard";

  return (
    <>
      <div className="no-print" style={{ background: T.header, borderBottom: `1px solid ${T.headerBorder}`, padding: "0 32px", height: 80, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <h2 style={{ fontFamily: "'Inter',sans-serif", letterSpacing: 3, textTransform: "uppercase", fontSize: 12, fontWeight: 300, color: T.text, margin: 0 }}>{tabLabel}</h2>
          <div style={{ position: "relative" }} ref={dropRef}>
            <button onClick={() => setShowProjectMenu(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
              <span className="kgm-project-name" style={{ fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 900, color: T.text }}>{currentProject.name}</span>
              {currentProject.address && <span style={{ color: T.textMuted, fontSize: 12 }}>{currentProject.address}</span>}
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
          {!(ADMIN_EMAIL || ADMIN_PASSWORD) ? (
            <span style={{ fontSize: 13, color: T.danger }}>Setup .env.local!</span>
          ) : isAdmin ? (
            <><span style={{ fontSize: 11, color: "#48bb78", fontWeight: 700, background: "#48bb7820", padding: "6px 12px" }}>&#128275; Admin</span><button onClick={logout} aria-label="Logout from admin" style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 11 }}>Logout</button></>
          ) : (
            <button onClick={() => setShowLogin(true)} aria-label="Login as admin" style={{ ...S.btnGhost, padding: "8px 16px", fontSize: 11 }}>&#128274; Admin Login</button>
          )}
        </div>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <Overlay onClose={() => { setShowLogin(false); setPw(""); setPwErr(""); }} title="Admin Login">
          <Label>Password</Label>
          <input type="password" style={S.inp} value={pw} onChange={e => { setPw(e.target.value); setPwErr(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter admin password" autoFocus />
          {pwErr && <div style={{ color: "#fc8181", fontSize: 12, marginTop: 8 }}>{pwErr}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...S.btnGold, flex: 1 }} onClick={handleLogin}>Login</button>
            <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => { setShowLogin(false); setPw(""); setPwErr(""); }}>Cancel</button>
          </div>
        </Overlay>
      )}

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
    </>
  );
}
