import { calculateItemWeight } from "./weightCalculator";

/**
 * Computes total raw-material requirements for a set of order items.
 *
 * @param {Array} orderItems - rows from order_items: { item_name, size, thickness, qty }
 * @param {Array} bomRows - rows from item_bom joined with raw_materials:
 *   { item_name, thickness, basis, qty_per_unit, raw_materials: { name, unit } }
 * @returns {Array<{ name, unit, totalQty, breakdown: Array<{itemLabel, qty}> }>}
 */
export function computeMaterialRequirements(orderItems = [], bomRows = []) {
  const materialTotals = {}; // key: material name -> { name, unit, totalQty, breakdown: [] }

  orderItems.forEach((item) => {
    const qty = Number(item.qty) || 0;
    if (qty <= 0) return;

    const calc = calculateItemWeight({
      itemName: item.item_name,
      size: item.size,
      thickness: item.thickness,
      qty,
    });
    const sqMtr = calc.sqMtrRaw || 0;

    const matchingRecipe = bomRows.filter(
      (r) => r.item_name === item.item_name && r.thickness === item.thickness
    );

    matchingRecipe.forEach((r) => {
      const materialName = r.raw_materials?.name || "Unknown Material";
      const unit = r.raw_materials?.unit || "";
      const basisQty = r.basis === "per_sqmtr" ? sqMtr * (r.qty_per_unit || 0) : qty * (r.qty_per_unit || 0);

      if (!materialTotals[materialName]) {
        materialTotals[materialName] = { name: materialName, unit, totalQty: 0, breakdown: [] };
      }
      materialTotals[materialName].totalQty += basisQty;
      materialTotals[materialName].breakdown.push({
        itemLabel: `${item.item_name} (${item.thickness}, ${item.size}) × ${qty}`,
        qty: basisQty,
      });
    });
  });

  return Object.values(materialTotals).sort((a, b) => a.name.localeCompare(b.name));
}
