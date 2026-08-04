import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const TABLE_MAP = {
  parties: { table: "parties", col: "name" },
  salesPersons: { table: "sales_persons", col: "name" },
  brands: { table: "brands", col: "name" },
  items: { table: "items", col: "name" },
  sizesFt: { table: "sizes_ft", col: "label" },
  thickness: { table: "thickness", col: "label" },
  destinations: { table: "destinations", col: "name" },
};

const EMPTY = {
  parties: [],
  salesPersons: [],
  brands: [],
  items: [],
  sizesFt: [],
  thickness: [],
  destinations: [],
  modelsByItem: {}, // { "MEMBRANE DOOR": ["EMD-51", "EMD-52", ...] }
};

/**
 * Loads every dropdown list the Order form needs, and exposes an
 * `addNew(key, value)` helper that mirrors the old "+" add-master-data
 * buttons (insert once, then refresh the local list — no full page reload).
 */
export function useMasterData() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        partiesRes,
        salesRes,
        brandsRes,
        itemsRes,
        sizesRes,
        thickRes,
        destRes,
        modelsRes,
      ] = await Promise.all([
        supabase.from("parties").select("name").order("name"),
        supabase.from("sales_persons").select("name").order("name"),
        supabase.from("brands").select("name").order("name"),
        supabase.from("items").select("name").order("name"),
        supabase.from("sizes_ft").select("label").order("label"),
        supabase.from("thickness").select("label").order("label"),
        supabase.from("destinations").select("name").order("name"),
        supabase.from("item_models").select("item_name, model_number").order("model_number"),
      ]);

      const firstError = [
        partiesRes, salesRes, brandsRes, itemsRes, sizesRes, thickRes, destRes, modelsRes,
      ].find((r) => r.error);
      if (firstError) throw firstError.error;

      const modelsByItem = {};
      (modelsRes.data || []).forEach((row) => {
        const key = String(row.item_name || "").trim().toUpperCase();
        if (!key) return;
        if (!modelsByItem[key]) modelsByItem[key] = [];
        modelsByItem[key].push(row.model_number);
      });

      setData({
        parties: (partiesRes.data || []).map((r) => r.name),
        salesPersons: (salesRes.data || []).map((r) => r.name),
        brands: (brandsRes.data || []).map((r) => r.name),
        items: (itemsRes.data || []).map((r) => r.name),
        sizesFt: (sizesRes.data || []).map((r) => r.label),
        thickness: (thickRes.data || []).map((r) => r.label),
        destinations: (destRes.data || []).map((r) => r.name),
        modelsByItem,
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAll();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchAll]);

  const addNew = useCallback(
    async (key, value) => {
      const cfg = TABLE_MAP[key];
      if (!cfg || !value?.trim()) return { success: false, message: "Invalid field or empty value" };

      const { error: insertError } = await supabase
        .from(cfg.table)
        .insert({ [cfg.col]: value.trim() });

      // duplicate (unique constraint) isn't a real failure — value already exists
      if (insertError && insertError.code !== "23505") {
        return { success: false, message: insertError.message };
      }

      setData((prev) => {
        const list = prev[key];
        if (list.includes(value.trim())) return prev;
        return { ...prev, [key]: [...list, value.trim()].sort() };
      });

      return { success: true, message: "Added!" };
    },
    []
  );

  return { ...data, loading, error, refresh: fetchAll, addNew };
}
