/**
 * Summarizes raw project data into a compact format for AI consumption.
 * Reduces payload size 10-50x vs sending raw arrays.
 */

export function summarizeProjectData(projectData) {
  const { projectName, materials = [], payments = [], contractors = [], budgets = [], totalBudget = 0, progressEntries = [] } = projectData;

  // Material aggregates
  const matByCategory = {};
  const matBySupplier = {};
  const matByMonth = {};
  let totalSpent = 0;
  let totalUnpaid = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  materials.forEach(m => {
    const cat = m.category || 'uncategorized';
    const sup = m.supplier || 'Unknown';
    const month = (m.date || '').slice(0, 7) || 'undated';
    const total = m.total || 0;
    const unpaid = m.unpaid || 0;

    totalSpent += total;
    totalUnpaid += unpaid;

    const status = (m.status || '').toLowerCase();
    if (status === 'paid') paidCount++;
    else if (status === 'partial') partialCount++;
    else unpaidCount++;

    if (!matByCategory[cat]) matByCategory[cat] = { total: 0, unpaid: 0, count: 0 };
    matByCategory[cat].total += total;
    matByCategory[cat].unpaid += unpaid;
    matByCategory[cat].count++;

    if (!matBySupplier[sup]) matBySupplier[sup] = { total: 0, unpaid: 0, count: 0 };
    matBySupplier[sup].total += total;
    matBySupplier[sup].unpaid += unpaid;
    matBySupplier[sup].count++;

    if (!matByMonth[month]) matByMonth[month] = { total: 0, count: 0 };
    matByMonth[month].total += total;
    matByMonth[month].count++;
  });

  // Top 10 suppliers by total spend
  const topSuppliers = Object.entries(matBySupplier)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, data]) => ({ name, ...data }));

  // Top 5 most expensive individual materials
  const topMaterials = [...materials]
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, 5)
    .map(m => ({ material: m.material, supplier: m.supplier, total: m.total, date: m.date, category: m.category }));

  // Monthly spending (sorted)
  const monthlySpend = Object.entries(matByMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({ month, ...data }));

  // Payment aggregates
  let totalPaid = 0;
  const payByMethod = {};
  const payByMonth = {};
  const payByType = { supplier: 0, contractor: 0 };

  payments.forEach(p => {
    const amount = p.amount || 0;
    totalPaid += amount;

    const method = p.method || 'Unknown';
    payByMethod[method] = (payByMethod[method] || 0) + amount;

    const month = (p.date || '').slice(0, 7) || 'undated';
    if (!payByMonth[month]) payByMonth[month] = 0;
    payByMonth[month] += amount;

    const type = p.payment_type || 'contractor';
    payByType[type] = (payByType[type] || 0) + amount;
  });

  // Contractor aggregates
  const contractorSummary = contractors.map(c => ({
    name: c.name,
    trade: c.trade,
    contractValue: c.contract_value || 0,
    amountPaid: c.amount_paid || 0,
    amountDue: c.amount_due || 0,
    paymentStatus: c.payment_status,
    workStatus: c.work_status,
  }));

  const contractorTotals = {
    totalContractValue: contractors.reduce((s, c) => s + (c.contract_value || 0), 0),
    totalPaid: contractors.reduce((s, c) => s + (c.amount_paid || 0), 0),
    totalDue: contractors.reduce((s, c) => s + (c.amount_due || 0), 0),
    count: contractors.length,
  };

  // Progress summary
  const recentProgress = progressEntries.slice(0, 5).map(p => ({
    title: p.title,
    date: p.created_at?.slice(0, 10),
    phase: p.ai_phase,
    quality: p.ai_quality,
    progressPct: p.ai_progress_pct,
  }));

  return {
    projectName,
    totalBudget,
    overview: {
      totalMaterialSpend: totalSpent,
      totalUnpaid,
      totalPayments: totalPaid,
      materialEntries: materials.length,
      paymentEntries: payments.length,
      statusBreakdown: { paid: paidCount, partial: partialCount, unpaid: unpaidCount },
    },
    materialsByCategory: matByCategory,
    topSuppliers,
    topMaterials,
    monthlySpend,
    payments: {
      totalPaid,
      byMethod: payByMethod,
      byType: payByType,
      count: payments.length,
    },
    contractors: contractorSummary,
    contractorTotals,
    budgets,
    recentProgress,
  };
}
