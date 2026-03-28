import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { dbGet } from './utils/api';
import { fmt } from './utils/formatting';
import Dashboard from './components/Dashboard';
import Materials from './components/Materials';
import MaterialSummary from './components/MaterialSummary';
import Contractors from './components/Contractors';
import PaymentLog from './components/PaymentLog';
import SupplierBalances from './components/SupplierBalances';
import BudgetVsActual from './components/BudgetVsActual';
import Ledgers from './components/Ledgers';
import AIChat from './components/AIChat';
import AIInsights from './components/AIInsights';

import Progress from './components/Progress';
import { ToastContainer, notify } from './components/Shared';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar, { SIDEBAR_EXPANDED } from './components/Sidebar';
import Header from './components/Header';
import MobileNav from './components/MobileNav';
import GlobalStyles from './components/GlobalStyles';
import { addKgmFooter, formatPKDate, formatDateStrForFilename, safeFilenamePart, sanitizeForPdf } from './utils/pdfUtils';

function AppContent() {
  const { S, T } = useTheme();
  const [tab, setTab] = useState("dashboard");
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);

  useEffect(() => {
    dbGet("projects", "&order=created_at.asc").then(data => {
      setProjects(data);
      if (data.length > 0) setCurrentProject(data[0]);
    });
  }, []);

  const exportPDF = async () => {
    if (!currentProject) return;
    try {
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
      doc.text("KGM Constructions", 28, 10);
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
    const totalSpent = entries.reduce((s, e) => s + (e.total || 0), 0);
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
      foot: [["", "", "", "", "", "", "TOTAL", fmt(totalSpent), fmt(totalUnpaid), ""]],
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
      leftText: `KGM Constructions \u00B7 ${currentProject.name} \u00B7 Generated ${dateStr}`,
      pageBarHeight: 8,
    });

    doc.save(`KGM_${safeFilenamePart(currentProject.name, { separator: "_" })}_${formatDateStrForFilename(dateStr)}.pdf`);
    } catch (e) { notify("PDF export failed: " + e.message, "error"); }
  };

  if (!currentProject) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${T.cardBorder}`, borderTop: `3px solid ${T.text}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ color: T.textMuted }}>Loading projects...</div>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <GlobalStyles />
      <Sidebar tab={tab} setTab={setTab} />

      <div style={{ marginLeft: SIDEBAR_EXPANDED, flex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", transition: "margin-left 0.2s ease" }} className="kgm-main">
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
          {tab === "dashboard" && <Dashboard selectedProject={currentProject.id} onNavigate={setTab} />}
          {tab === "materials" && <Materials projectId={currentProject.id} />}
          {tab === "matsummary" && <MaterialSummary projectId={currentProject.id} />}
          {tab === "contractors" && <Contractors projectId={currentProject.id} />}
          {tab === "payments" && <PaymentLog projectId={currentProject.id} />}
          {tab === "suppliers" && <SupplierBalances projectId={currentProject.id} />}
          {tab === "budget" && <BudgetVsActual projectId={currentProject.id} />}
          {tab === "ledgers" && <Ledgers projectId={currentProject.id} projectName={currentProject.name} />}
          {tab === "aiinsights" && <AIInsights projectId={currentProject.id} projectName={currentProject.name} />}
          {tab === "progress" && <Progress projectId={currentProject.id} projectName={currentProject.name} />}
        </div>
      </div>

      <MobileNav tab={tab} setTab={setTab} />
      <AIChat projectId={currentProject.id} projectName={currentProject.name} />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}
