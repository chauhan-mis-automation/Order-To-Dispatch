import { supabase } from "../lib/supabaseClient";
import { calculateItemWeight } from "./weightCalculator";
import { computeMaterialRequirements } from "./materialCalculator";

/**
 * Compares each order item's qty against fg_stock. Returns the list of
 * items that are short (qty needed > qty available), with the shortfall
 * amount. Empty array = fully fulfillable from finished-goods stock.
 */
export async function checkFgShortfall(orderItems) {
  const { data: fgRows, error } = await supabase.from("fg_stock").select("*");
  if (error) throw error;

  const shortfalls = [];
  orderItems.forEach((item) => {
    const match = (fgRows || []).find(
      (f) =>
        f.item_name === item.item_name &&
        (f.brand || "") === (item.brand || "") &&
        f.size === item.size &&
        f.thickness === item.thickness
    );
    const available = match ? Number(match.qty_available) : 0;
    const needed = Number(item.qty) || 0;
    if (available < needed) {
      shortfalls.push({
        item_name: item.item_name,
        brand: item.brand || "",
        size: item.size,
        thickness: item.thickness,
        needed,
        available,
        shortQty: needed - available,
      });
    }
  });

  return shortfalls;
}

/**
 * Given required materials (from computeMaterialRequirements) and current
 * rm_stock, returns which materials are short and by how much.
 */
export async function checkRmShortfall(requiredMaterials) {
  const { data: rmRows, error } = await supabase
    .from("rm_stock")
    .select("*, raw_materials(id, name, unit)");
  if (error) throw error;

  return requiredMaterials.map((req) => {
    const match = (rmRows || []).find((r) => r.raw_materials?.name === req.name);
    const available = match ? Number(match.qty_available) : 0;
    return {
      ...req,
      available,
      isShort: available < req.totalQty,
      shortQty: Math.max(0, req.totalQty - available),
      materialId: match?.material_id || null,
    };
  });
}

/**
 * Full requirement computation for a set of shortfall items (job items):
 * materials needed (BOM) + RM availability comparison in one call.
 */
export async function computeJobMaterialStatus(jobItems) {
  const { data: bomRows, error } = await supabase
    .from("item_bom")
    .select("*, raw_materials(id, name, unit)");
  if (error) throw error;

  const required = computeMaterialRequirements(
    jobItems.map((it) => ({ item_name: it.item_name, size: it.size, thickness: it.thickness, qty: it.qty })),
    bomRows || []
  );
  return checkRmShortfall(required);
}
