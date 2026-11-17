console.log("==================================================================");
console.log("TEST: RECORD PAYMENT PAYLOAD COMPATIBILITY & VALIDATION");
console.log("==================================================================\n");

function testPayloadParsing(body) {
  const rawAmount = body.receivedAmount ?? body.amount;
  const rawDate = body.date ?? body.paymentDate;
  const rawMode = body.mode ?? body.paymentMode;
  const rawRemark = body.remark ?? body.note;

  const amountNum = Number(rawAmount);
  if (!amountNum || amountNum <= 0 || isNaN(amountNum)) {
    return {
      status: 400,
      message: "Payment amount must be greater than 0",
    };
  }

  const paymentDateVal = rawDate ? new Date(rawDate) : new Date();

  return {
    status: 200,
    paymentEntry: {
      receivedAmount: amountNum,
      amount: amountNum,
      date: paymentDateVal,
      paymentDate: paymentDateVal,
      mode: rawMode || "Cash",
      paymentMode: rawMode || "Cash",
      remark: rawRemark ? String(rawRemark).trim() : "",
      note: rawRemark ? String(rawRemark).trim() : "",
    },
  };
}

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  passed++;
  console.log(`✅ PASS: ${message}`);
}

// Case 1: Frontend format (amount, paymentDate, paymentMode, note) - The one from user screenshot!
const frontendPayload = {
  amount: 4400,
  paymentDate: "2026-11-20",
  paymentMode: "Cash",
  note: "",
};
const res1 = testPayloadParsing(frontendPayload);
assert(res1.status === 200, "Frontend payload { amount: 4400 } accepted with status 200");
assert(res1.paymentEntry.receivedAmount === 4400, "receivedAmount correctly populated as 4400");
assert(res1.paymentEntry.amount === 4400, "amount correctly populated as 4400");
assert(res1.paymentEntry.mode === "Cash", "mode correctly populated as Cash");

// Case 2: Backend legacy format (receivedAmount, date, mode, remark)
const legacyPayload = {
  receivedAmount: 4400,
  date: "2026-11-20",
  mode: "Cash",
  remark: "Advance",
};
const res2 = testPayloadParsing(legacyPayload);
assert(res2.status === 200, "Legacy payload { receivedAmount: 4400 } accepted with status 200");
assert(res2.paymentEntry.receivedAmount === 4400, "receivedAmount correctly populated as 4400");
assert(res2.paymentEntry.amount === 4400, "amount correctly populated as 4400");
assert(res2.paymentEntry.note === "Advance", "note correctly populated as Advance");

// Case 3: Invalid 0 or negative or empty amounts
const resZero = testPayloadParsing({ amount: 0 });
assert(resZero.status === 400 && resZero.message === "Payment amount must be greater than 0", "Zero amount rejected with 400");

const resNeg = testPayloadParsing({ amount: -500 });
assert(resNeg.status === 400 && resNeg.message === "Payment amount must be greater than 0", "Negative amount rejected with 400");

const resEmpty = testPayloadParsing({ amount: "" });
assert(resEmpty.status === 400 && resEmpty.message === "Payment amount must be greater than 0", "Empty amount rejected with 400");

const resNaN = testPayloadParsing({ amount: "invalid" });
assert(resNaN.status === 400 && resNaN.message === "Payment amount must be greater than 0", "NaN amount rejected with 400");

console.log("\n==================================================================");
console.log(`ALL ${passed} / ${total} RECORD PAYMENT TESTS PASSED!`);
console.log("==================================================================");
