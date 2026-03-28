import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../utils/formatting';
import { notify } from './Shared';
import { PDF_COLORS, addKgmFooter } from '../utils/pdfUtils';

export function exportLedgerPDF({ selected, projectName, getContractorLedger, getSupplierLedger }) {
  if (!selected) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const { navy, gold, white, gray, red, green } = PDF_COLORS;
  const dateStr = new Date().toLocaleDateString("en-PK");
  const timeStr = new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

  const addHeader = (title) => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 28, "F");
    doc.setFillColor(...gold);
    doc.rect(0, 28, W, 2, "F");
    doc.setFillColor(...gold);
    doc.roundedRect(8, 5, 18, 18, 2, 2, "F");
    doc.setTextColor(...navy);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("KGM", 17, 16, { align: "center" });
    doc.setTextColor(...white);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("KGM CONSTRUCTIONS", 32, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 180);
    doc.text("Project: " + projectName, 32, 20);
    doc.setTextColor(...white);
    doc.setFontSize(7);
    doc.text(`${dateStr}  |  ${timeStr}`, W - 10, 13, { align: "right" });
    doc.text("Confidential", W - 10, 20, { align: "right" });
    doc.setFillColor(250, 250, 250);
    doc.rect(0, 33, W, 12, "F");
    doc.setFillColor(...gold);
    doc.rect(0, 33, 3, 12, "F");
    doc.setTextColor(...navy);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(title, 10, 41);
  };

  // Footer is added at the end using shared addKgmFooter

  if (selected.type === "contractor") {
    const { contractor: c, payments: cPays } = getContractorLedger(selected.name);
    const totalPaid = cPays.reduce((s, p) => s + (p.amount || 0), 0);
    const contractValue = c?.contract_value || 0;
    const balanceDue = contractValue - totalPaid;

    addHeader(`CONTRACTOR LEDGER  |  ${selected.name.toUpperCase()}`);

    const kpiY = 50;
    const kpiW = (W - 24) / 3;
    const kpis = [
      { label: "CONTRACT VALUE", value: fmt(contractValue), color: navy },
      { label: "TOTAL PAID", value: fmt(totalPaid), color: green },
      { label: "BALANCE DUE", value: fmt(balanceDue), color: balanceDue > 0 ? red : green },
    ];
    kpis.forEach((k, i) => {
      const x = 8 + i * (kpiW + 4);
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(x, kpiY, kpiW, 18, 1, 1, "FD");
      doc.setFillColor(...k.color);
      doc.rect(x, kpiY, 3, 18, "F");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.text(k.label, x + 6, kpiY + 7);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(k.value, x + 6, kpiY + 14);
    });

    if (c) {
      const infoY = kpiY + 24;
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(8, infoY, W - 16, 10, 1, 1, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`Trade: ${(c.trade || "General").toUpperCase()}  |  Contact: ${c.contact || "—"}  |  Work Status: ${(c.work_status || "—").toUpperCase()}  |  Payment: ${(c.payment_status || "—").toUpperCase()}`, 12, infoY + 6);
    }

    const tableY = kpiY + 40;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...navy);
    doc.text("PAYMENT HISTORY", 10, tableY);
    doc.setFillColor(...gold);
    doc.rect(10, tableY + 1, 30, 1, "F");

    autoTable(doc, {
      startY: tableY + 6,
      head: [["#", "DATE", "AMOUNT (PKR)", "METHOD", "REFERENCE", "REMARKS"]],
      body: cPays.length > 0
        ? cPays.map((p, i) => [i + 1, p.date || "", fmt(p.amount || 0), (p.method || "").toUpperCase(), p.reference || "—", p.remarks || "—"])
        : [["—", "—", "—", "—", "—", "No transactions recorded"]],
      foot: cPays.length > 0 ? [["", "TOTAL", fmt(totalPaid), `${cPays.length} payments`, "", ""]] : undefined,
      styles: { fontSize: 8, cellPadding: 3, font: "helvetica", lineColor: [230, 230, 230], lineWidth: 0.3 },
      headStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: gray },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        2: { halign: "right", textColor: green, fontStyle: "bold" },
        3: { halign: "center" },
      },
      margin: { left: 8, right: 8 },
    });

    const lastY = doc.lastAutoTable?.finalY || tableY + 20;
    if (lastY < H - 40) {
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(8, lastY + 6, W - 16, 20, 1, 1, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("BALANCE SUMMARY", 12, lastY + 13);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(`Contract Value: ${fmt(contractValue)}`, 12, lastY + 20);
      doc.setTextColor(...green);
      doc.text(`Total Paid: ${fmt(totalPaid)}`, 70, lastY + 20);
      doc.setTextColor(...(balanceDue > 0 ? red : green));
      doc.text(`Balance Due: ${fmt(balanceDue)}`, 130, lastY + 20);
    }
  } else {
    const { purchases: sp, payments: sy } = getSupplierLedger(selected.name);
    const totalBill = sp.reduce((s, p) => s + (p.total || 0), 0);
    const totalUnpaid = sp.reduce((s, p) => s + (p.unpaid || 0), 0);
    const totalPaidAmt = sy.reduce((s, p) => s + (p.amount || 0), 0);
    const balance = totalBill - totalPaidAmt;

    addHeader(`SUPPLIER LEDGER  |  ${selected.name.toUpperCase()}`);

    const kpiY = 50;
    const kpiW = (W - 24) / 4;
    const kpis = [
      { label: "TOTAL BILL", value: fmt(totalBill), color: navy },
      { label: "TOTAL PAID", value: fmt(totalPaidAmt), color: green },
      { label: "OUTSTANDING", value: fmt(totalUnpaid), color: red },
      { label: "BALANCE", value: fmt(balance), color: balance > 0 ? red : green },
    ];
    kpis.forEach((k, i) => {
      const x = 8 + i * (kpiW + 4);
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(x, kpiY, kpiW, 18, 1, 1, "FD");
      doc.setFillColor(...k.color);
      doc.rect(x, kpiY, 3, 18, "F");
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.text(k.label, x + 6, kpiY + 7);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(k.value, x + 6, kpiY + 14);
    });

    const tableY = kpiY + 26;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...navy);
    doc.text("MATERIAL PURCHASES", 10, tableY);
    doc.setFillColor(...gold);
    doc.rect(10, tableY + 1, 38, 1, "F");

    autoTable(doc, {
      startY: tableY + 6,
      head: [["#", "DATE", "MATERIAL", "QTY", "RATE", "TOTAL (PKR)", "UNPAID", "STATUS"]],
      body: sp.length > 0
        ? sp.map((p, i) => [
            i + 1, p.date || "", p.material || "",
            p.qty ? `${p.qty} ${p.unit || ""}` : "—",
            p.rate ? fmt(p.rate) : "—",
            fmt(p.total || 0),
            p.unpaid ? fmt(p.unpaid) : "—",
            (p.status || "Paid").toUpperCase(),
          ])
        : [["—", "—", "—", "—", "—", "—", "—", "No purchases recorded"]],
      foot: sp.length > 0 ? [["", "", "", "", "TOTAL", fmt(totalBill), fmt(totalUnpaid), ""]] : undefined,
      styles: { fontSize: 8, cellPadding: 3, font: "helvetica", lineColor: [230, 230, 230], lineWidth: 0.3 },
      headStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: gray },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        3: { halign: "center" },
        4: { halign: "right" },
        5: { halign: "right", fontStyle: "bold" },
        6: { halign: "right", textColor: red },
        7: { halign: "center", fontStyle: "bold" },
      },
      margin: { left: 8, right: 8 },
    });

    if (sy.length > 0) {
      const payY = (doc.lastAutoTable?.finalY || tableY + 20) + 10;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...navy);
      doc.text("PAYMENTS MADE", 10, payY);
      doc.setFillColor(...green);
      doc.rect(10, payY + 1, 30, 1, "F");

      const totalSyPaid = sy.reduce((s, p) => s + (p.amount || 0), 0);
      autoTable(doc, {
        startY: payY + 6,
        head: [["#", "DATE", "AMOUNT (PKR)", "METHOD", "REFERENCE"]],
        body: sy.map((p, i) => [i + 1, p.date || "", fmt(p.amount || 0), (p.method || "").toUpperCase(), p.reference || "—"]),
        foot: [["", "TOTAL PAID", fmt(totalSyPaid), `${sy.length} payments`, ""]],
        styles: { fontSize: 8, cellPadding: 3, font: "helvetica", lineColor: [230, 230, 230], lineWidth: 0.3 },
        headStyles: { fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 7.5 },
        footStyles: { fillColor: green, textColor: white, fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: gray },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          2: { halign: "right", textColor: green, fontStyle: "bold" },
        },
        margin: { left: 8, right: 8 },
      });
    }

    const lastY = doc.lastAutoTable?.finalY || tableY + 20;
    if (lastY < H - 40) {
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(8, lastY + 6, W - 16, 20, 1, 1, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("BALANCE SUMMARY", 12, lastY + 13);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(`Total Bill: ${fmt(totalBill)}`, 12, lastY + 20);
      doc.setTextColor(...green);
      doc.text(`Total Paid: ${fmt(totalPaidAmt)}`, 70, lastY + 20);
      doc.setTextColor(...red);
      doc.text(`Outstanding: ${fmt(totalUnpaid)}`, 130, lastY + 20);
    }
  }

  addKgmFooter(doc, {
    leftText: `KGM Constructions \u00B7 ${projectName} \u00B7 Ledger: ${selected.name}`,
    pageBarHeight: 10,
  });

  doc.save(`KGM_Ledger_${selected.name.replace(/\s+/g, "_")}_${dateStr.replace(/\//g, "-")}.pdf`);
  notify("Ledger exported");
}
