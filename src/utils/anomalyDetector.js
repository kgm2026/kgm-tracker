/**
 * Client-side anomaly detection for material purchases.
 * Runs after each save to flag suspicious entries.
 */

const PRICE_THRESHOLD = 2.0; // flag if rate > 2x historical average
const PRICE_DROP_THRESHOLD = 0.4; // flag if rate < 40% of historical average

export function detectAnomalies(newEntry, allEntries) {
  const alerts = [];
  const others = allEntries.filter(e => e.id !== newEntry.id);

  // 1. Duplicate invoice detection (same supplier + amount + date)
  if (newEntry.supplier && newEntry.total && newEntry.date) {
    const dupes = others.filter(e =>
      (e.supplier || '').toLowerCase() === newEntry.supplier.toLowerCase() &&
      e.total === newEntry.total &&
      e.date === newEntry.date &&
      (e.material || '').toLowerCase() === (newEntry.material || '').toLowerCase()
    );
    if (dupes.length > 0) {
      alerts.push({
        type: 'duplicate',
        severity: 'high',
        icon: 'content_copy',
        title: 'Possible Duplicate',
        detail: `Entry #${dupes[0].num} has the same supplier, amount (PKR ${newEntry.total.toLocaleString()}), date, and material.`,
        relatedId: dupes[0].id,
      });
    }
  }

  // 2. Price anomaly — compare rate against historical average for same material
  if (newEntry.rate && newEntry.material) {
    const matName = newEntry.material.toLowerCase().trim();
    const similar = others.filter(e =>
      e.rate && e.material && e.material.toLowerCase().trim() === matName
    );

    if (similar.length >= 2) {
      const avgRate = similar.reduce((s, e) => s + e.rate, 0) / similar.length;
      const ratio = newEntry.rate / avgRate;

      if (ratio > PRICE_THRESHOLD) {
        alerts.push({
          type: 'price_high',
          severity: 'high',
          icon: 'trending_up',
          title: 'Price Spike',
          detail: `${newEntry.material} at PKR ${newEntry.rate.toLocaleString()}/unit is ${Math.round((ratio - 1) * 100)}% above the historical avg of PKR ${Math.round(avgRate).toLocaleString()}.`,
        });
      } else if (ratio < PRICE_DROP_THRESHOLD) {
        alerts.push({
          type: 'price_low',
          severity: 'medium',
          icon: 'trending_down',
          title: 'Unusually Low Price',
          detail: `${newEntry.material} at PKR ${newEntry.rate.toLocaleString()}/unit is ${Math.round((1 - ratio) * 100)}% below the historical avg of PKR ${Math.round(avgRate).toLocaleString()}. Verify quantity/unit.`,
        });
      }
    }
  }

  // 3. Same material, different price from same supplier
  if (newEntry.supplier && newEntry.rate && newEntry.material) {
    const matName = newEntry.material.toLowerCase().trim();
    const supName = newEntry.supplier.toLowerCase().trim();
    const sameSupplierMat = others.filter(e =>
      e.rate &&
      (e.supplier || '').toLowerCase().trim() === supName &&
      (e.material || '').toLowerCase().trim() === matName
    );

    if (sameSupplierMat.length > 0) {
      const lastRate = sameSupplierMat[sameSupplierMat.length - 1].rate;
      const diff = Math.abs(newEntry.rate - lastRate);
      const pctChange = (diff / lastRate) * 100;

      if (pctChange > 20 && diff > 100) {
        const direction = newEntry.rate > lastRate ? 'increased' : 'decreased';
        alerts.push({
          type: 'supplier_price_change',
          severity: 'medium',
          icon: 'swap_vert',
          title: 'Supplier Price Change',
          detail: `${newEntry.supplier} ${direction} ${newEntry.material} by ${Math.round(pctChange)}% (PKR ${lastRate.toLocaleString()} → ${newEntry.rate.toLocaleString()}).`,
        });
      }
    }
  }

  // 4. Large single entry (>5x the median entry total)
  if (newEntry.total) {
    const totals = others.map(e => e.total || 0).filter(t => t > 0).sort((a, b) => a - b);
    if (totals.length >= 5) {
      const median = totals[Math.floor(totals.length / 2)];
      if (newEntry.total > median * 5) {
        alerts.push({
          type: 'large_entry',
          severity: 'medium',
          icon: 'warning',
          title: 'Unusually Large Entry',
          detail: `PKR ${newEntry.total.toLocaleString()} is ${Math.round(newEntry.total / median)}x the typical entry (median PKR ${median.toLocaleString()}). Verify the amount.`,
        });
      }
    }
  }

  return alerts;
}
