import crypto from "crypto";

/**
 * Normalizes payment mode string to standard CRM enum / string.
 */
export const normalizePaymentMode = (rawMode) => {
  if (!rawMode) return "BANK";
  const s = String(rawMode).trim().toUpperCase();
  if (s.includes("CASH")) return "CASH";
  if (s.includes("UPI") || s.includes("GPAY") || s.includes("GOOGLE")) return "UPI";
  if (s.includes("CHEQUE") || s.includes("CHQ")) return "Cheque";
  if (s.includes("CARD")) return "Card";
  return "BANK";
};

/**
 * Parses Excel dates (serial numbers, ISO strings, or formatted text like "OCT--25").
 */
export const parseExcelPaymentDate = (rawDate) => {
  if (rawDate === undefined || rawDate === null || rawDate === "") return null;

  // Excel serial number (e.g. 45909)
  if (typeof rawDate === "number" || (!isNaN(rawDate) && !String(rawDate).includes("-") && !String(rawDate).includes("/"))) {
    const serial = Number(rawDate);
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  const str = String(rawDate).trim();

  // Try standard Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  // Month-Year string like "OCT--25" or "OCT-25"
  const myMatch = str.match(/^([A-Za-z]{3})[-]+(\d{2,4})$/);
  if (myMatch) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mIdx = monthNames.indexOf(myMatch[1].toLowerCase());
    let y = parseInt(myMatch[2], 10);
    if (y < 100) y += 2000;
    if (mIdx !== -1) {
      return new Date(y, mIdx, 1);
    }
  }

  return null;
};

/**
 * Reads the evaluated numeric value from an Excel cell.
 * Never imports raw formula strings like "=K3-L3".
 */
export const evaluateCellNumeric = (cell) => {
  if (cell === undefined || cell === null || cell === "") return 0;
  if (typeof cell === "object") {
    if (cell.v !== undefined && cell.v !== null) {
      const num = parseFloat(cell.v);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }
  const str = String(cell).trim();
  if (str.startsWith("=")) {
    return 0; // Don't parse raw formula string as value
  }
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
};

/**
 * Extracts and deduplicates payment blocks across grouped rows for a Job Number.
 * Preserves distinct legitimate payments while deduplicating row repetitions.
 */
export const extractContractPayments = (rowsForJobNo, jobNo, contractCharges = 0) => {
  const distinctPayments = [];
  const seenBlockFingerprints = new Map(); // key -> payment object
  const warnings = [];

  for (const row of rowsForJobNo) {
    const rIdx = row.rowIdx;
    const raw = row.fullRow || [];

    // 4 payment blocks in AMC - PC:
    // P1: Col 11 (Rec), 12 (Date), 13 (Mode), 14 (Bal)
    // P2: Col 15 (Rec), 16 (Date), 17 (Mode), 18 (Bal)
    // P3: Col 19 (Rec), 20 (Date), 21 (Mode), 22 (Bal)
    // P4: Col 23 (Rec), 24 (Date), 25 (Mode), 26 (Bal)
    const blocks = [
      { blockIndex: 1, rec: raw[11], date: raw[12], mode: raw[13], bal: raw[14] },
      { blockIndex: 2, rec: raw[15], date: raw[16], mode: raw[17], bal: raw[18] },
      { blockIndex: 3, rec: raw[19], date: raw[20], mode: raw[21], bal: raw[22] },
      { blockIndex: 4, rec: raw[23], date: raw[24], mode: raw[25], bal: raw[26] },
    ];

    for (const b of blocks) {
      const amount = evaluateCellNumeric(b.rec);
      if (amount <= 0) continue;

      const paymentDate = parseExcelPaymentDate(b.date);
      const mode = normalizePaymentMode(b.mode);
      const dateStr = paymentDate ? paymentDate.toISOString().slice(0, 10) : "NO_DATE";

      // Fingerprint includes block index, amount, date, mode
      const blockFingerprint = `${jobNo}|P${b.blockIndex}|${amount}|${dateStr}|${mode}`;

      if (seenBlockFingerprints.has(blockFingerprint)) {
        // Multi-row repetition of the exact same installment block
        const existingPayment = seenBlockFingerprints.get(blockFingerprint);
        if (!existingPayment.sourceRows.includes(rIdx)) {
          existingPayment.sourceRows.push(rIdx);
        }
      } else {
        const paymentEntry = {
          jobNo,
          blockIndex: b.blockIndex,
          amount,
          date: paymentDate,
          mode,
          sourceRows: [rIdx],
          fingerprint: blockFingerprint,
          isAmbiguous: false,
        };

        seenBlockFingerprints.set(blockFingerprint, paymentEntry);
        distinctPayments.push(paymentEntry);
      }
    }
  }

  // Check cumulative payments against contract charges
  const totalPaid = distinctPayments.reduce((sum, p) => sum + p.amount, 0);
  if (contractCharges > 0 && totalPaid > contractCharges) {
    warnings.push({
      type: "OVERPAYMENT_OR_DUPLICATE_PAYMENT",
      message: `Total payments (₹${totalPaid}) exceed contract charges (₹${contractCharges}) by ₹${totalPaid - contractCharges}.`,
      jobNo,
      totalPaid,
      contractCharges,
    });
  }

  return {
    payments: distinctPayments,
    totalPaid,
    warnings,
  };
};
