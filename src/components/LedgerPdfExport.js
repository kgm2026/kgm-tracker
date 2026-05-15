import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt, fmtDate } from '../utils/formatting';
import { notify } from './Shared';
import { PDF_COLORS, addKgmFooter } from '../utils/pdfUtils';

// ─── constants ──────────────────────────────────────────────────────────────
const MARGIN = 14;
const { navy, gold, white, gray, red, green } = PDF_COLORS;
const lightGold  = [255, 248, 230];
const lightGreen = [235, 252, 240];
const lightRed   = [255, 235, 235];
const borderGray = [210, 210, 210];
const textDark   = [30,  30,  30];
const textMid    = [90,  90,  90];
const textLight  = [150, 150, 150];

// ─── helpers ─────────────────────────────────────────────────────────────────

// All date formatting goes through fmtDate() from formatting.js — one consistent format.
const pkDate = fmtDate;

function nowStr() {
  const now = new Date();
  return fmtDate(now.toISOString()) + ', ' +
    now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Draw the full-width letterhead on a fresh page */
function addLetterhead(doc, subtitle) {
  const W = doc.internal.pageSize.getWidth();

  // Navy bar
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 32, 'F');

  // Gold accent stripe
  doc.setFillColor(...gold);
  doc.rect(0, 32, W, 2.5, 'F');

  // Logo badge
  doc.setFillColor(...gold);
  doc.roundedRect(MARGIN, 6, 20, 20, 2, 2, 'F');
  doc.setTextColor(...navy);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('KGM', MARGIN + 10, 18, { align: 'center' });

  // Company name
  doc.setTextColor(...white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('KGM HOMES', MARGIN + 24, 14);

  // Tagline
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 190, 190);
  doc.text('Homes & Construction · Pakistan', MARGIN + 24, 21);

  // Subtitle (document type)
  doc.setTextColor(...gold);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(subtitle.toUpperCase(), MARGIN + 24, 28);

  // Timestamp top-right
  doc.setTextColor(...white);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated: ' + nowStr(), W - MARGIN, 14, { align: 'right' });
  doc.text('CONFIDENTIAL', W - MARGIN, 21, { align: 'right' });

  return 38; // y after letterhead
}

/** Coloured KPI card strip */
function addKpiStrip(doc, y, cards) {
  const W  = doc.internal.pageSize.getWidth();
  const cW = (W - MARGIN * 2 - (cards.length - 1) * 4) / cards.length;
  cards.forEach((k, i) => {
    const x = MARGIN + i * (cW + 4);
    // card bg
    doc.setFillColor(...(k.bgColor || [248, 248, 248]));
    doc.setDrawColor(...borderGray);
    doc.roundedRect(x, y, cW, 20, 1.5, 1.5, 'FD');
    // left accent bar
    doc.setFillColor(...k.color);
    doc.rect(x, y, 3, 20, 'F');
    // label
    doc.setTextColor(...textLight);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(k.label.toUpperCase(), x + 6, y + 7);
    // value
    doc.setTextColor(...k.color);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(k.value, x + 6, y + 15);
    // sub-label if given
    if (k.sub) {
      doc.setTextColor(...textLight);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(k.sub, x + cW - 4, y + 15, { align: 'right' });
    }
  });
  return y + 26;
}

/** Section heading with underline */
function sectionHead(doc, y, text, underlineColor = gold) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(text, MARGIN, y);
  doc.setFillColor(...underlineColor);
  doc.rect(MARGIN, y + 1.5, text.length * 1.65, 1, 'F');
  return y + 7;
}

/** Progress bar */
function progressBar(doc, y, pct, label) {
  const W = doc.internal.pageSize.getWidth();
  const barW = W - MARGIN * 2;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMid);
  doc.text(label, MARGIN, y);
  doc.text(pct.toFixed(1) + '%', W - MARGIN, y, { align: 'right' });
  doc.setFillColor(...borderGray);
  doc.roundedRect(MARGIN, y + 2, barW, 4, 1, 1, 'F');
  doc.setFillColor(...green);
  doc.roundedRect(MARGIN, y + 2, barW * Math.min(pct / 100, 1), 4, 1, 1, 'F');
  return y + 10;
}

/** Info row strip (grey band with key-value pairs) */
function infoStrip(doc, y, pairs) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(245, 246, 248);
  doc.rect(0, y, W, 11, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, y, 3, 11, 'F');
  const colW = (W - MARGIN * 2) / pairs.length;
  pairs.forEach((p, i) => {
    const x = MARGIN + i * colW;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textLight);
    doc.text(p.label.toUpperCase(), x + 4, y + 4.5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    doc.text(String(p.value || '—'), x + 4, y + 9.5);
  });
  return y + 15;
}

/**
 * Signature block — drawn near bottom of current page.
 * Always tries to fit on the last page; if not enough room, adds a new page.
 */
function addSignatureBlock(doc, type, partyName) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const BLOCK_H = type === 'contractor' ? 100 : 75;

  // Ensure enough space
  const lastY = doc.lastAutoTable?.finalY ?? (H * 0.6);
  if (lastY > H - BLOCK_H - 20) doc.addPage();

  const startY = Math.max(
    (doc.lastAutoTable?.finalY ?? 0) + 14,
    H - BLOCK_H - 20
  );

  // Divider
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, startY, W - MARGIN, startY);

  // Title
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text('ACKNOWLEDGEMENT & CERTIFICATION', MARGIN, startY + 7);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMid);
  doc.text(
    type === 'contractor'
      ? 'I/We hereby confirm that the above statement of accounts is true and correct to the best of my/our knowledge.'
      : 'This ledger is certified accurate by KGM Homes management. Outstanding dues are payable upon presentation.',
    MARGIN, startY + 13,
    { maxWidth: W - MARGIN * 2 }
  );

  const sigY = startY + 24;

  if (type === 'contractor') {
    // Three signature columns: KGM Auth | Contractor | Witness
    const cols = [
      { title: 'KGM Authorised Signatory', sub: 'Name & Designation' },
      { title: partyName || 'Contractor', sub: 'Name, CNIC & Signature' },
      { title: 'Witness', sub: 'Name & Signature' },
    ];
    const colW = (W - MARGIN * 2) / cols.length;
    cols.forEach((col, i) => {
      const x = MARGIN + i * colW;
      // Signature line
      doc.setDrawColor(...borderGray);
      doc.setLineWidth(0.5);
      doc.line(x + 4, sigY + 22, x + colW - 8, sigY + 22);
      // Label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...navy);
      doc.text(col.title, x + (colW / 2) - 4, sigY + 27, { align: 'center', maxWidth: colW - 8 });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMid);
      doc.text(col.sub, x + (colW / 2) - 4, sigY + 32, { align: 'center', maxWidth: colW - 8 });

      // Date field
      doc.text('Date: ____________________', x + 4, sigY + 40);

      // Stamp box
      doc.setDrawColor(...borderGray);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x + 4, sigY + 44, colW - 14, 18);
      doc.setLineDashPattern([], 0);
      doc.setFontSize(6);
      doc.setTextColor(...textLight);
      doc.text('STAMP / SEAL', x + (colW / 2) - 4, sigY + 54, { align: 'center' });
    });

    // Terms below
    const termsY = sigY + 66;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('TERMS & CONDITIONS:', MARGIN, termsY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMid);
    const terms = [
      '1. This document is generated from KGM Homes project management system and is valid without physical alteration.',
      '2. Any discrepancy must be reported in writing within 7 days of receipt.',
      '3. Signed copy to be retained by both parties.',
    ];
    terms.forEach((t, i) => {
      doc.text(t, MARGIN, termsY + 5 + i * 5, { maxWidth: W - MARGIN * 2 });
    });
  } else {
    // Supplier: two columns only
    const cols = [
      { title: 'KGM Authorised Signatory', sub: 'Name & Designation' },
      { title: 'Supplier Representative', sub: 'Name & Signature' },
    ];
    const colW = (W - MARGIN * 2) / cols.length;
    cols.forEach((col, i) => {
      const x = MARGIN + i * colW;
      doc.setDrawColor(...borderGray);
      doc.line(x + 4, sigY + 22, x + colW - 8, sigY + 22);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...navy);
      doc.text(col.title, x + (colW / 2), sigY + 27, { align: 'center', maxWidth: colW - 8 });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMid);
      doc.text(col.sub, x + (colW / 2), sigY + 32, { align: 'center', maxWidth: colW - 8 });
      doc.text('Date: ____________________', x + 4, sigY + 40);
      doc.setDrawColor(...borderGray);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x + 4, sigY + 44, colW - 14, 14);
      doc.setLineDashPattern([], 0);
      doc.setFontSize(6);
      doc.setTextColor(...textLight);
      doc.text('STAMP / SEAL', x + (colW / 2), sigY + 52, { align: 'center' });
    });
  }
}

// ─── main export ─────────────────────────────────────────────────────────────

export function exportLedgerPDF({ selected, projectName, getContractorLedger, getSupplierLedger }) {
  if (!selected) return;

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();

  // ── CONTRACTOR LEDGER ────────────────────────────────────────────────────
  if (selected.type === 'contractor') {
    const { contractor: c, payments: cPays } = getContractorLedger(selected.name);
    const totalPaid    = cPays.reduce((s, p) => s + (p.amount || 0), 0);
    const contractVal  = c?.contract_value || 0;
    const balanceDue   = contractVal - totalPaid;
    const pct          = contractVal > 0 ? (totalPaid / contractVal) * 100 : 0;

    // — Page 1: Letterhead + details ———————————————————————————————————————
    let y = addLetterhead(doc, 'Contractor Payment Ledger');

    // Document title band
    doc.setFillColor(...lightGold);
    doc.rect(0, y, W, 14, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, y, 4, 14, 'F');
    doc.setTextColor(...navy);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(selected.name.toUpperCase(), MARGIN + 4, y + 9.5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMid);
    doc.text(`Project: ${projectName}`, W - MARGIN, y + 5.5, { align: 'right' });
    doc.text(`Ref: LDR-C-${(c?.contractor_id || 'N/A').toUpperCase()}`, W - MARGIN, y + 11, { align: 'right' });
    y += 18;

    // KPI strip
    y = addKpiStrip(doc, y, [
      { label: 'Contract Value', value: fmt(contractVal), color: navy,  bgColor: [245,245,255] },
      { label: 'Total Paid',     value: fmt(totalPaid),   color: green, bgColor: lightGreen,   sub: `${cPays.length} payments` },
      { label: 'Balance Due',    value: fmt(balanceDue),  color: balanceDue > 0 ? red : green, bgColor: balanceDue > 0 ? lightRed : lightGreen },
      { label: 'Retention',      value: fmt(c?.retention_amount || 0), color: [246, 173, 85], bgColor: lightGold },
    ]);

    // Progress bar
    y = progressBar(doc, y, pct, 'Payment Progress');

    // Contractor info strip
    y = infoStrip(doc, y, [
      { label: 'Trade',          value: c?.trade || '—' },
      { label: 'Contact',        value: c?.contact || '—' },
      { label: 'Work Status',    value: c?.work_status || '—' },
      { label: 'Payment Status', value: c?.payment_status || '—' },
      { label: 'Start Date',     value: pkDate(c?.start_date) },
    ]);

    // Notes
    if (c?.notes) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...textMid);
      doc.text(`Notes: ${c.notes}`, MARGIN, y);
      y += 7;
    }

    y = sectionHead(doc, y, 'PAYMENT HISTORY');

    autoTable(doc, {
      startY: y,
      head: [['#', 'DATE', 'AMOUNT (PKR)', 'METHOD', 'REFERENCE / CHEQUE NO.', 'REMARKS']],
      body: cPays.length > 0
        ? cPays.map((p, i) => [
            i + 1,
            pkDate(p.date),
            fmt(p.amount || 0),
            (p.method || 'Cash').toUpperCase(),
            p.reference || '—',
            p.remarks   || '—',
          ])
        : [['', '', '', '', '', 'No transactions recorded yet']],
      foot: cPays.length > 0
        ? [['', 'TOTAL PAID', fmt(totalPaid), `${cPays.length} pmts`, 'BALANCE DUE', fmt(balanceDue)]]
        : undefined,
      styles: { fontSize: 8, cellPadding: 3.5, font: 'helvetica', lineColor: borderGray, lineWidth: 0.3 },
      headStyles: { fillColor: navy, textColor: white, fontStyle: 'bold', fontSize: 7.5, cellPadding: 4 },
      footStyles: { fillColor: navy, textColor: white, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: gray },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        2: { halign: 'right', textColor: green, fontStyle: 'bold' },
        3: { halign: 'center', cellWidth: 22 },
        5: { textColor: textMid, fontSize: 7 },
      },
      margin: { left: MARGIN, right: MARGIN },
      didParseCell: (data) => {
        if (data.section === 'foot' && data.column.index === 5) {
          data.cell.styles.textColor = balanceDue > 0 ? red : green;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // — Signature block ——————————————————————————————————————————————————
    addSignatureBlock(doc, 'contractor', selected.name, c);

  // ── SUPPLIER LEDGER ──────────────────────────────────────────────────────
  } else {
    const { purchases: sp, payments: sy } = getSupplierLedger(selected.name);
    const totalBill    = sp.reduce((s, p) => s + (p.total   || 0), 0);
    const totalUnpaid  = sp.reduce((s, p) => s + (p.unpaid  || 0), 0);
    const totalPaidAmt = sy.reduce((s, p) => s + (p.amount  || 0), 0);
    const balance      = totalUnpaid; // outstanding on purchases
    const pct          = totalBill > 0 ? ((totalBill - totalUnpaid) / totalBill) * 100 : 100;

    let y = addLetterhead(doc, 'Supplier Account Ledger');

    // Title band
    doc.setFillColor(...lightGold);
    doc.rect(0, y, W, 14, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, y, 4, 14, 'F');
    doc.setTextColor(...navy);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(selected.name.toUpperCase(), MARGIN + 4, y + 9.5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMid);
    doc.text(`Project: ${projectName}`, W - MARGIN, y + 5.5, { align: 'right' });
    const firstDate = sp.map(p => p.date).filter(Boolean).sort()[0];
    const lastDate  = sp.map(p => p.date).filter(Boolean).sort().reverse()[0];
    doc.text(`Period: ${pkDate(firstDate)} – ${pkDate(lastDate)}`, W - MARGIN, y + 11, { align: 'right' });
    y += 18;

    // KPI strip
    y = addKpiStrip(doc, y, [
      { label: 'Total Purchases', value: fmt(totalBill),    color: navy,  bgColor: [245,245,255], sub: `${sp.length} items` },
      { label: 'Total Paid',      value: fmt(totalPaidAmt), color: green, bgColor: lightGreen,    sub: `${sy.length} payments` },
      { label: 'Outstanding',     value: fmt(totalUnpaid),  color: totalUnpaid > 0 ? red : green, bgColor: totalUnpaid > 0 ? lightRed : lightGreen },
      { label: 'Net Balance',     value: fmt(balance),      color: balance > 0 ? red : green, bgColor: balance > 0 ? lightRed : lightGreen },
    ]);

    // Payment progress
    y = progressBar(doc, y, pct, 'Settlement Progress');

    // Category breakdown
    const categories = {};
    sp.forEach(p => {
      const cat = p.category === 'grey' ? 'Grey Structure' : 'Finishing';
      categories[cat] = (categories[cat] || 0) + (p.total || 0);
    });
    const catPairs = Object.entries(categories).map(([k, v]) => ({ label: k, value: fmt(v) }));
    if (catPairs.length > 0) {
      catPairs.unshift({ label: 'Transactions', value: `${sp.length}` });
      y = infoStrip(doc, y, catPairs);
    }

    // ── Table 1: Material Purchases ───────────────────────────────────────
    y = sectionHead(doc, y, 'MATERIAL PURCHASES');

    autoTable(doc, {
      startY: y,
      head: [['#', 'DATE', 'MATERIAL / DESCRIPTION', 'QTY', 'RATE', 'TOTAL (PKR)', 'OUTSTANDING', 'STATUS']],
      body: sp.length > 0
        ? sp.map((p, i) => [
            i + 1,
            pkDate(p.date),
            p.material || '—',
            p.qty ? `${p.qty} ${p.unit || ''}`.trim() : '—',
            p.rate ? fmt(p.rate) : '—',
            fmt(p.total || 0),
            p.unpaid > 0 ? fmt(p.unpaid) : '—',
            (p.status || 'Paid').toUpperCase(),
          ])
        : [['', '', 'No purchases recorded', '', '', '', '', '']],
      foot: sp.length > 0
        ? [['', '', '', '', 'TOTAL', fmt(totalBill), fmt(totalUnpaid), '']]
        : undefined,
      styles: { fontSize: 7.5, cellPadding: 3, font: 'helvetica', lineColor: borderGray, lineWidth: 0.3 },
      headStyles: { fillColor: navy, textColor: white, fontStyle: 'bold', fontSize: 7, cellPadding: 3.5 },
      footStyles: { fillColor: navy, textColor: white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: gray },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        2: { cellWidth: 50 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right',  cellWidth: 22 },
        5: { halign: 'right',  fontStyle: 'bold', cellWidth: 26 },
        6: { halign: 'right',  textColor: red, cellWidth: 24 },
        7: { halign: 'center', cellWidth: 18, fontSize: 6.5 },
      },
      margin: { left: MARGIN, right: MARGIN },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const s = String(data.cell.raw || '').toLowerCase();
          data.cell.styles.textColor = s === 'paid' ? green : s === 'unpaid' ? red : [246, 173, 85];
        }
        if (data.section === 'foot' && data.column.index === 6) {
          data.cell.styles.textColor = totalUnpaid > 0 ? red : green;
        }
      },
    });

    // ── Table 2: Payments made ────────────────────────────────────────────
    if (sy.length > 0) {
      const payY = (doc.lastAutoTable?.finalY || y + 20) + 12;
      const tbl2Y = sectionHead(doc, payY, 'PAYMENTS RECEIVED', green);

      autoTable(doc, {
        startY: tbl2Y,
        head: [['#', 'DATE', 'AMOUNT (PKR)', 'PAYMENT METHOD', 'REFERENCE / CHEQUE NO.', 'REMARKS']],
        body: sy.map((p, i) => [
          i + 1,
          pkDate(p.date),
          fmt(p.amount || 0),
          (p.method || 'Cash').toUpperCase(),
          p.reference || '—',
          p.remarks || '—',
        ]),
        foot: [['', 'TOTAL RECEIVED', fmt(totalPaidAmt), `${sy.length} payments`, 'OUTSTANDING BALANCE', fmt(balance)]],
        styles: { fontSize: 7.5, cellPadding: 3, font: 'helvetica', lineColor: borderGray, lineWidth: 0.3 },
        headStyles: { fillColor: [...green], textColor: white, fontStyle: 'bold', fontSize: 7, cellPadding: 3.5 },
        footStyles: { fillColor: navy, textColor: white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: lightGreen },
        columnStyles: {
          0: { cellWidth: 7, halign: 'center' },
          2: { halign: 'right', textColor: green, fontStyle: 'bold' },
          3: { halign: 'center' },
        },
        margin: { left: MARGIN, right: MARGIN },
        didParseCell: (data) => {
          if (data.section === 'foot' && data.column.index === 5) {
            data.cell.styles.textColor = balance > 0 ? red : green;
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    }

    // Signature block
    addSignatureBlock(doc, 'supplier', selected.name);
  }

  // ── Footer on every page ───────────────────────────────────────────────
  addKgmFooter(doc, {
    leftText: `KGM Homes · ${projectName} · ${selected.type === 'contractor' ? 'Contractor' : 'Supplier'} Ledger: ${selected.name}`,
    pageBarHeight: 10,
  });

  // ── Watermark "OFFICIAL" on every page ────────────────────────────────
  const pW = doc.internal.pageSize.getWidth();
  const pH = doc.internal.pageSize.getHeight();
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(52);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 46, 0.04);
    doc.text('KGM OFFICIAL', pW / 2, pH / 2, { align: 'center', angle: 45 });
  }

  const safeName = selected.name.replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, '_');
  const fname = `KGM_Ledger_${safeName}_${fmtDate(new Date().toISOString()).replace(/\s/g, '_')}.pdf`;
  doc.save(fname);
  notify('Ledger exported — ready to print & sign');
}
