/**
 * weightCalculator.js
 * -----------------------------------------------------------------
 * EXACT port of calculateRow() from the original Apps Script (Index.html).
 * Every lookup table, condition, and formula below is unchanged from the
 * original — only the DOM reading/writing has been removed so this can
 * run as a pure function inside React.
 *
 * Original behaviour preserved 1:1:
 *   - same size-key normalization (normSize)
 *   - same sqFtMap / mtrMap / inchM / plyKgPerSqFt / bb25KgMap / BB19_FACTOR
 *   - same item-type detection order: Flush Door > Membrane-family > Blockboard > Plywood(default)
 *   - same rounding: NA -> 3 decimals, Weight -> 3 decimals, Sq.Mtr -> 2 decimals
 *   - same "0.000" / "0.00" fallback when a value is not > 0
 * -----------------------------------------------------------------
 */

// ---- Lookup tables (verbatim from Code.gs) ----

const sqFtMap = {
  "8x4": 32, "7x4": 28, "6x4": 24, "5x4": 20,
  "8x3": 24, "7x3": 21, "6x3": 18, "5x3": 15,
};

const mtrMap = {
  "8x4": { l: 2.44, w: 1.22 }, "7x4": { l: 2.14, w: 1.22 },
  "6x4": { l: 1.84, w: 1.22 }, "5x4": { l: 1.54, w: 1.22 },
  "8x3": { l: 2.44, w: 0.92 }, "7x3": { l: 2.14, w: 0.92 },
  "6x3": { l: 1.84, w: 0.92 }, "5x3": { l: 1.54, w: 0.92 },
};

const inchM = {
  84: 2.134, 83: 2.108, 82: 2.083, 81: 2.057, 80: 2.032,
  79: 2.007, 78: 1.981, 77: 1.956, 76: 1.930, 75: 1.905,
  74: 1.880, 73: 1.854, 72: 1.829, 71: 1.803, 70: 1.778,
  48: 1.219, 45: 1.143, 42: 1.067, 40: 1.016, 39: 0.991,
  38: 0.965, 36: 0.914, 35: 0.889, 34: 0.864, 33: 0.838,
  32: 0.813, 30: 0.762, 28: 0.711, 27: 0.686, 26: 0.660,
  24: 0.610, 21: 0.533, 18: 0.457,
};

const plyKgPerSqFt = {
  4: 0.1875, 6: 0.296875, 9: 0.609375,
  12: 0.75, 16: 1.0, 19: 1.1875,
};

const bb25KgMap = {
  "8x4": 40, "7x4": 26.25, "6x4": 22.5, "5x4": 18.75,
  "8x3": 22.5, "7x3": 26.4, "6x3": 16.88, "5x3": 14.06,
};

const BB19_FACTOR = 0.9375;

// ---- Helpers (verbatim from Code.gs) ----

function normSize(s) {
  return String(s)
    .replace(/\s+/g, "")
    .replace(/[xX*×]/g, "x")
    .replace(/mm/gi, "")
    .trim()
    .toLowerCase();
}

function getDoorDims(sKey) {
  const m = sKey.match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  const li = parseInt(m[1], 10);
  const wi = parseInt(m[2], 10);
  if (li < 60 || wi < 18) return null;
  const lm = inchM[li] || parseFloat((li * 0.0254).toFixed(3));
  const wm = inchM[wi] || parseFloat((wi * 0.0254).toFixed(3));
  return { l: lm, w: wm };
}

/**
 * Pure calculation — same math as calculateRow(), no DOM.
 *
 * @param {Object} input
 * @param {string} input.itemName  - e.g. "Membrane Door", "Plywood"
 * @param {string|number} input.size      - e.g. "8x4", "72 X 24"
 * @param {string|number} input.thickness - e.g. "12MM" or 12
 * @param {number|string} input.qty       - piece count
 * @returns {{ na: string, weightTon: string, sqMtr: string, naRaw: number, weightTonRaw: number, sqMtrRaw: number }}
 */
export function calculateItemWeight({ itemName = "", size = "", thickness = "", qty = 0 }) {
  const qtyNum = parseFloat(qty) || 0;
  const sizeStr = String(size || "").trim();
  const thickStr = String(thickness || "").trim();
  const nameNorm = String(itemName || "").trim().toLowerCase();
  const thk = parseFloat(thickStr) || 0;

  const sKey = normSize(sizeStr);

  let weightTon = 0;
  let naValue = 0;
  let sqMtr = 0;

  const isFlushDoor = nameNorm.includes("flush door");
  const isMembraneDoor =
    nameNorm.includes("emd") ||
    (nameNorm.includes("membrane") && !nameNorm.includes("flush")) ||
    nameNorm.includes("pvc membrane") ||
    nameNorm.includes("super pvc") ||
    nameNorm.includes("pvc veneer");
  const isBlockboard = nameNorm.includes("block");

  if (isFlushDoor) {
    const dims = getDoorDims(sKey);
    if (dims && qtyNum > 0) {
      naValue = dims.l * dims.w * qtyNum * 3;
      weightTon = (qtyNum * 30) / 1000;
      sqMtr = dims.l * dims.w * qtyNum;
    }
  } else if (isMembraneDoor) {
    const dims = getDoorDims(sKey);
    if (dims && qtyNum > 0) {
      naValue = dims.l * dims.w * qtyNum * 3;
      weightTon = (qtyNum * 30.5) / 1000;
      sqMtr = dims.l * dims.w * qtyNum;
    }
  } else if (isBlockboard) {
    const dims = mtrMap[sKey];
    const sqFt = sqFtMap[sKey] || 0;
    if (dims) {
      naValue = (dims.l * dims.w * 12 * qtyNum) / 4;
      sqMtr = dims.l * dims.w * qtyNum;
    }
    if (thk === 19) {
      weightTon = (sqFt * BB19_FACTOR * qtyNum) / 1000;
    } else if (thk === 25) {
      const kgPcs = bb25KgMap[sKey];
      if (kgPcs !== undefined) weightTon = (kgPcs * qtyNum) / 1000;
    } else if (sqFt > 0 && thk > 0) {
      weightTon = (sqFt * (thk / 19) * BB19_FACTOR * qtyNum) / 1000;
    }
  } else if (nameNorm.length > 0) {
    const dims = mtrMap[sKey];
    const sqFt = sqFtMap[sKey] || 0;
    if (dims && thk > 0) {
      naValue = (dims.l * dims.w * thk * qtyNum) / 4;
      sqMtr = dims.l * dims.w * qtyNum;
    }
    const kgPerSqFt = plyKgPerSqFt[thk];
    if (kgPerSqFt !== undefined && sqFt > 0) {
      weightTon = (sqFt * kgPerSqFt * qtyNum) / 1000;
    } else if (dims && thk > 0) {
      weightTon = dims.l * dims.w * (thk / 1000) * 0.504 * qtyNum;
    }
  }

  return {
    na: naValue > 0 ? naValue.toFixed(3) : "0.000",
    weightTon: weightTon > 0 ? weightTon.toFixed(3) : "0.000",
    sqMtr: sqMtr > 0 ? sqMtr.toFixed(2) : "0.00",
    naRaw: naValue,
    weightTonRaw: weightTon,
    sqMtrRaw: sqMtr,
  };
}

/**
 * Sums qty / na / weight across a list of item rows — same as
 * calculateGrandTotals() / calculateDispatchTotals() in the original app.
 * @param {Array<{qty:number|string, na:string|number, weightTon:string|number}>} rows
 */
export function sumItemTotals(rows = []) {
  return rows.reduce(
    (acc, row) => {
      acc.totalQty += parseFloat(row.qty) || 0;
      acc.totalNa += parseFloat(row.na) || 0;
      acc.totalWeight += parseFloat(row.weightTon) || 0;
      return acc;
    },
    { totalQty: 0, totalNa: 0, totalWeight: 0 }
  );
}
