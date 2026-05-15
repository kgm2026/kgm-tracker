import { useState, useEffect, Suspense, lazy } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { dbGet, dbInsert } from './utils/api';
import { fmt } from './utils/formatting';
import { ToastContainer, notify } from './components/Shared';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MobileNav from './components/MobileNav';
import GlobalStyles from './components/GlobalStyles';
import { addKgmFooter, formatPKDate, formatDateStrForFilename, safeFilenamePart, sanitizeForPdf } from './utils/pdfUtils';
import kgmLogo from './assets/kgm-homes-logo.jpeg';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Materials = lazy(() => import('./components/Materials'));
const MaterialSummary = lazy(() => import('./components/MaterialSummary'));
const Contractors = lazy(() => import('./components/Contractors'));
const PaymentLog = lazy(() => import('./components/PaymentLog'));
const SupplierBalances = lazy(() => import('./components/SupplierBalances'));
const BudgetVsActual = lazy(() => import('./components/BudgetVsActual'));
const BOQ = lazy(() => import('./components/BOQ'));
const Ledgers = lazy(() => import('./components/Ledgers'));
const AIChat = lazy(() => import('./components/AIChat'));
const AIInsights = lazy(() => import('./components/AIInsights'));
const Progress = lazy(() => import('./components/Progress'));

function AppContent() {
  const { S, T } = useTheme();
  const getInitialTab = () => {
    if (typeof window === "undefined") return "dashboard";
    const path = window.location.pathname.toLowerCase();
    if (path === "/boq") return "boq";
    return "dashboard";
  };
  const [tab, setTab] = useState(getInitialTab);
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    setProjectsLoading(true);
    dbGet("projects", "&order=created_at.asc").then(data => {
      setProjects(data);
      if (data.length > 0) setCurrentProject(data[0]);
      setProjectsLoading(false);
    }).catch(() => {
      setProjectsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextPath = tab === "boq" ? "/boq" : "/";
    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, "", nextPath);
    }
  }, [tab]);

  const exportPDF = async () => {
    if (!currentProject) return;
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const entries = await dbGet("material_purchases", `&project_id=eq.${currentProject.id}&order=num.asc`);
      const payments = await dbGet("payment_log", `&project_id=eq.${currentProject.id}&order=created_at.asc`);
      const contractors = await dbGet("contractors", `&project_id=eq.${currentProject.id}`);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const dateStr = formatPKDate();
    const navy = [26, 26, 46], gold = [246, 173, 85], white = [255, 255, 255], gray = [245, 245, 245], red = [220, 53, 69], green = [40, 167, 69];

    const addHeader = (title) => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, W, 22, "F");
      doc.setFillColor(...gold);
      doc.rect(0, 22, W, 2, "F");
      doc.setFillColor(...gold);
      doc.roundedRect(8, 4, 14, 14, 2, 2, "F");
      doc.setTextColor(...navy);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("KGM", 15, 13, { align: "center" });
      doc.setTextColor(...white);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("KGM Homes", 28, 10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...gold);
      doc.text(title, 28, 17);
      doc.setTextColor(...white);
      doc.setFontSize(8);
      doc.text(dateStr, W - 10, 10, { align: "right" });
      doc.setTextColor(180, 180, 180);
      doc.text(currentProject?.address || "", W - 10, 16, { align: "right" });
    };

    addHeader(`Project: ${currentProject.name}  ·  Material Purchases`);
    const matTotal = entries.reduce((s, e) => s + (e.total || 0), 0);
    const contractorPayments = payments.filter(p => !p.payment_type || p.payment_type === "contractor");
    const totalContractorPayments = contractorPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalSpent = matTotal + totalContractorPayments;
    const totalUnpaid = entries.reduce((s, e) => s + (e.unpaid || 0), 0);
    const paidCount = entries.filter(e => (e.status || "").toLowerCase() === "paid").length;
    const kpis = [
      { label: "TOTAL SPENT", value: fmt(totalSpent), color: gold },
      { label: "OUTSTANDING", value: fmt(totalUnpaid), color: red },
      { label: "TOTAL ENTRIES", value: String(entries.length), color: navy },
      { label: "PAID ENTRIES", value: String(paidCount), color: green }
    ];
    const kpiW = (W - 20) / 4;
    kpis.forEach((k, i) => {
      const x = 10 + i * (kpiW + 2);
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(x, 27, kpiW, 18, 2, 2, "FD");
      doc.setFillColor(...k.color);
      doc.rect(x, 27, 3, 18, "F");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.text(k.label, x + 6, 34);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(k.value, x + 6, 41);
    });

    autoTable(doc, {
      startY: 50,
      head: [["#", "DATE", "MATERIAL", "CAT", "SUPPLIER", "QTY", "RATE", "TOTAL", "UNPAID", "STATUS"]],
      body: entries.map(e => [
        e.num || "",
        sanitizeForPdf(e.date) || "",
        sanitizeForPdf(e.material, 100) || "",
        sanitizeForPdf(e.category, 50).toUpperCase() || "",
        sanitizeForPdf(e.supplier, 100) || "\u2014",
        e.qty ? `${e.qty} ${sanitizeForPdf(e.unit, 20) || ""}` : "\u2014",
        e.rate ? fmt(e.rate) : "\u2014",
        fmt(e.total || 0),
        e.unpaid ? fmt(e.unpaid) : "\u2014",
        sanitizeForPdf(e.status, 50) || "Paid"
      ]),
      foot: [["", "", "", "", "", "", "TOTAL", fmt(matTotal), fmt(totalUnpaid), ""]],
      styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
      headStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: gray },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 22 }, 2: { cellWidth: 40, fontStyle: "bold" },
        3: { cellWidth: 16, halign: "center" }, 4: { cellWidth: 28 }, 5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 26, halign: "right" }, 7: { cellWidth: 28, halign: "right", textColor: [180, 110, 0], fontStyle: "bold" },
        8: { cellWidth: 26, halign: "right", textColor: red }, 9: { cellWidth: 20, halign: "center" }
      },
      margin: { left: 10, right: 10 }
    });

    if (contractors.length > 0 || payments.length > 0) {
      doc.addPage();
      addHeader(`Project: ${currentProject.name}  ·  Contractors & Payments`);
      if (contractors.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...navy);
        doc.text("CONTRACTORS", 10, 32);
        doc.setFillColor(...gold);
        doc.rect(10, 33, 30, 1, "F");
        autoTable(doc, {
          startY: 36,
          head: [["NAME", "TRADE", "CONTACT", "CONTRACT VALUE", "AMOUNT PAID", "AMOUNT DUE", "PAY STATUS", "WORK STATUS"]],
          body: contractors.map(c => [
            sanitizeForPdf(c.name, 100) || "",
            sanitizeForPdf(c.trade, 100) || "",
            sanitizeForPdf(c.contact, 100) || "\u2014",
            fmt(c.contract_value || 0),
            fmt(c.amount_paid || 0),
            fmt(c.amount_due || 0),
            sanitizeForPdf(c.payment_status, 50) || "",
            sanitizeForPdf(c.work_status, 50) || ""
          ]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 7.5 },
          alternateRowStyles: { fillColor: gray },
          columnStyles: { 3: { halign: "right" }, 4: { halign: "right", textColor: green, fontStyle: "bold" }, 5: { halign: "right", textColor: red } },
          margin: { left: 10, right: 10 }
        });
      }
      if (payments.length > 0) {
        const af = doc.lastAutoTable?.finalY || 36;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...navy);
        doc.text("PAYMENT LOG", 10, af + 10);
        doc.setFillColor(...gold);
        doc.rect(10, af + 11, 30, 1, "F");
        const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        autoTable(doc, {
          startY: af + 14,
          head: [["#", "DATE", "CONTRACTOR", "AMOUNT", "METHOD", "REFERENCE", "REMARKS"]],
          body: payments.map(p => [
            p.num || "",
            sanitizeForPdf(p.date, 50) || "",
            sanitizeForPdf(p.contractor_name, 100) || "",
            fmt(p.amount || 0),
            sanitizeForPdf(p.method, 50) || "",
            sanitizeForPdf(p.reference, 200) || "\u2014",
            sanitizeForPdf(p.remarks, 500) || "\u2014"
          ]),
          foot: [["", "", "TOTAL PAID", fmt(totalPaid), "", "", ""]],
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 7.5 },
          footStyles: { fillColor: green, textColor: white, fontStyle: "bold" },
          alternateRowStyles: { fillColor: gray },
          columnStyles: { 0: { cellWidth: 10, halign: "center" }, 3: { halign: "right", textColor: green, fontStyle: "bold" } },
          margin: { left: 10, right: 10 }
        });
      }
    }

    addKgmFooter(doc, {
      leftText: `KGM Homes \u00B7 ${currentProject.name} \u00B7 Generated ${dateStr}`,
      pageBarHeight: 8,
    });

    doc.save(`KGM_${safeFilenamePart(currentProject.name, { separator: "_" })}_${formatDateStrForFilename(dateStr)}.pdf`);
    } catch (e) { notify("PDF export failed: " + e.message, "error"); }
  };

  const createStarterProject = async () => {
    try {
      const row = await dbInsert("projects", {
        name: "DHA Lahore - Luxury House",
        address: "DHA Lahore",
        client: "KGM Homes Client",
      });
      setProjects([row]);
      setCurrentProject(row);
      notify("Starter project created");
    } catch (e) {
      notify("Failed to create project: " + e.message, "error");
    }
  };

  if (projectsLoading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${T.cardBorder}`, borderTop: `3px solid ${T.text}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ color: T.textMuted }}>Loading projects...</div>
      </div>
    </div>
  );

  if (!currentProject) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...S.card, maxWidth: 520, width: "100%", textAlign: "center" }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, color: T.text }}>No Projects Yet</h2>
        <p style={{ marginTop: 0, marginBottom: 20, color: T.textMuted }}>
          Create a project to start tracking materials, budgets, and BOQ.
        </p>
        <button style={S.btnGold} onClick={createStarterProject}>
          Create Starter Project
        </button>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <GlobalStyles />
      <Sidebar tab={tab} setTab={setTab} />

      <div style={{ marginLeft: "var(--kgm-sidebar-width, 256px)", flex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", transition: "margin-left 0.2s ease" }} className="kgm-main">
        <Header
          tab={tab}
          currentProject={currentProject}
          projects={projects}
          setCurrentProject={setCurrentProject}
          setTab={setTab}
          onExportPDF={exportPDF}
          setProjects={setProjects}
        />

        <div className="kgm-body" role="tabpanel" id={`panel-${tab}`} style={{ flex: 1, ...S.body }}>
          <Suspense fallback={<div style={{ padding: 40, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>Loading section...</div>}>
            {tab === "dashboard" && <Dashboard selectedProject={currentProject.id} onNavigate={setTab} />}
            {tab === "materials" && <Materials projectId={currentProject.id} />}
            {tab === "matsummary" && <MaterialSummary projectId={currentProject.id} />}
            {tab === "contractors" && <Contractors projectId={currentProject.id} />}
            {tab === "payments" && <PaymentLog projectId={currentProject.id} />}
            {tab === "suppliers" && <SupplierBalances projectId={currentProject.id} />}
            {tab === "budget" && <BudgetVsActual projectId={currentProject.id} />}
            {tab === "boq" && <BOQ projectId={currentProject.id} />}
            {tab === "ledgers" && <Ledgers projectId={currentProject.id} projectName={currentProject.name} />}
            {tab === "aiinsights" && <AIInsights projectId={currentProject.id} projectName={currentProject.name} />}
            {tab === "progress" && <Progress projectId={currentProject.id} projectName={currentProject.name} />}
          </Suspense>
        </div>
      </div>

      <MobileNav tab={tab} setTab={setTab} />
      <Suspense fallback={null}>
        <AIChat projectId={currentProject.id} projectName={currentProject.name} />
      </Suspense>
      <ToastContainer />
    </div>
  );
}

function AuthScreen() {
  const { S, T, toggle, theme } = useTheme();
  const { login, resetPassword, updatePassword, passwordRecovery, error, isConfigured } = useAuth();
  const [email, setEmail] = useState((import.meta.env.VITE_ADMIN_EMAIL || "").trim());
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || "").trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    setNotice("");

    setSubmitting(true);
    try {
      if (passwordRecovery) {
        await updatePassword(newPassword);
        setNewPassword("");
        setNotice("Password updated. You can continue into KGM Homes.");
      } else {
        await login(email, password);
        setPassword("");
      }
    } catch (err) {
      setLocalError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setLocalError("");
    setNotice("");
    setSubmitting(true);
    try {
      await resetPassword(email);
      setNotice(`Password reset email sent to ${email || adminEmail}.`);
    } catch (err) {
      setLocalError(err.message || "Password reset failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <GlobalStyles />

      <button
        onClick={toggle}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          background: "transparent",
          border: `1px solid ${T.cardBorder}`,
          color: T.textMuted,
          padding: "8px 12px",
          cursor: "pointer",
          borderRadius: 6,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          {theme === "dark" ? "light_mode" : "dark_mode"}
        </span>
      </button>

      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <img src={kgmLogo} alt="KGM Homes logo" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", border: `1px solid ${T.cardBorder}` }} />
            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: T.textMuted, fontWeight: 600 }}>KGM Homes</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.text }}>Sign In</div>
            </div>
          </div>
          <p style={{ margin: 0, color: T.textMuted, lineHeight: 1.6 }}>
            {passwordRecovery
              ? "Choose a new password to finish account recovery."
              : "Sign in with an approved KGM Homes account."}
          </p>
        </div>

        {isConfigured && (
          <>
            {!passwordRecovery && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...S.cardLabel, marginBottom: 6 }}>Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLocalError("");
                    setNotice("");
                  }}
                  placeholder={adminEmail || "name@example.com"}
                  style={S.inp}
                  autoFocus
                />
              </div>
            )}

            {passwordRecovery ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ ...S.cardLabel, marginBottom: 6 }}>New Password</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setLocalError("");
                  }}
                  placeholder="At least 8 characters"
                  style={S.inp}
                  autoFocus
                />
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div style={{ ...S.cardLabel, marginBottom: 6 }}>Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLocalError("");
                  }}
                  placeholder="Enter password"
                  style={S.inp}
                />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              {notice && <div style={{ color: T.success || T.financial, fontSize: 13, lineHeight: 1.5 }}>{notice}</div>}
              {(localError || error) && <div style={{ color: T.danger, fontSize: 13, lineHeight: 1.5 }}>
                {localError || error}
              </div>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{ ...S.btnGold, width: "100%", opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? "Please wait..." : passwordRecovery ? "Update Password" : "Open KGM Homes"}
            </button>

            {!passwordRecovery && (
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={submitting}
                style={{ ...S.btnGhost, width: "100%", marginTop: 10 }}
              >
                Forgot password
              </button>
            )}
          </>
        )}
      </form>
    </div>
  );
}

function AppShell() {
  const { isAdmin, isLoading } = useAuth();
  const { S, T } = useTheme();

  if (isLoading) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${T.cardBorder}`, borderTop: `3px solid ${T.text}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ color: T.textMuted }}>Checking session...</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) return <AuthScreen />;

  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
