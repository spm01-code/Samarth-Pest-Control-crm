import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================================");
console.log("TEST SUITE: GLOBAL DIALOG SCROLL LOCK & TOAST UI IMPROVEMENTS");
console.log("==================================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

// ================================================================
// TEST 1: scrollLock.js Logic Simulation
// ================================================================
console.log("--- TEST 1: Scroll Lock Reference Counting & Restoration ---");

// Mock browser window and document
global.window = {
  scrollY: 450,
  innerWidth: 1920,
  scrollTo: (opts) => {
    global.window.lastScrolledTo = opts;
  },
  lastScrolledTo: null,
};

global.document = {
  documentElement: {
    clientWidth: 1905, // 15px scrollbar
    classList: {
      classes: new Set(),
      add(cls) { this.classes.add(cls); },
      remove(cls) { this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); },
    },
  },
  body: {
    style: {
      overflow: "",
      position: "",
      top: "",
      left: "",
      right: "",
      width: "",
      paddingRight: "",
    },
  },
};

const scrollLockMod = await import("./src/utils/scrollLock.js");
const { lockScroll, unlockScroll, getActiveLockCount, getScrollbarWidth } = scrollLockMod;

assert(getScrollbarWidth() === 15, "Scrollbar width correctly calculated as 15px");
assert(getActiveLockCount() === 0, "Initial active lock count is 0");

// First modal opens
lockScroll();
assert(getActiveLockCount() === 1, "Active lock count is 1 after first modal opens");
assert(document.body.style.overflow === "hidden", "body.style.overflow is hidden");
assert(document.body.style.position === "fixed", "body.style.position is fixed");
assert(document.body.style.top === "-450px", "body.style.top preserves -450px scroll position");
assert(document.body.style.paddingRight === "15px", "body.style.paddingRight compensates for 15px scrollbar");
assert(document.documentElement.classList.contains("modal-scroll-locked"), "modal-scroll-locked class added to html");

// Second (nested) modal opens
lockScroll();
assert(getActiveLockCount() === 2, "Active lock count is 2 after second modal opens");
assert(document.body.style.position === "fixed", "body remains fixed when nested modal opens");

// Second modal closes (first still open)
unlockScroll();
assert(getActiveLockCount() === 1, "Active lock count decrements to 1");
assert(document.body.style.position === "fixed", "body remains locked when one of multiple modals closes");

// First modal closes
unlockScroll();
assert(getActiveLockCount() === 0, "Active lock count reaches 0");
assert(document.body.style.position === "", "body.style.position restored to original");
assert(document.body.style.paddingRight === "", "body.style.paddingRight restored to original");
assert(!document.documentElement.classList.contains("modal-scroll-locked"), "modal-scroll-locked class removed");
assert(window.lastScrolledTo?.top === 450, "window.scrollTo restored original scroll position (450px)");

// ================================================================
// TEST 2: ToastManager Lifecycle & Exit Animation Support
// ================================================================
console.log("\n--- TEST 2: ToastManager Lifecycle & Animation States ---");
const { toast } = await import("./src/utils/toast.js");

toast.clear();
assert(toast.toasts.length === 0, "ToastManager starts empty");

// Trigger toast notifications of each type
const sId = toast.success("Customer saved successfully");
const eId = toast.error("Failed to connect to server");
const wId = toast.warning("Warning: check input details");
const iId = toast.info("New alert received");

assert(toast.toasts.length === 4, "All 4 toast types queued successfully");
assert(toast.toasts.find(t => t.id === sId)?.type === "success", "Success toast created with type success");
assert(toast.toasts.find(t => t.id === eId)?.type === "error", "Error toast created with type error");
assert(toast.toasts.find(t => t.id === wId)?.type === "warning", "Warning toast created with type warning");
assert(toast.toasts.find(t => t.id === iId)?.type === "info", "Info toast created with type info");

// Test dismissal with exit animation
toast.dismiss(sId);
const dismissingToast = toast.toasts.find(t => t.id === sId);
assert(dismissingToast?.isExiting === true, "Dismissing toast is marked isExiting: true during exit animation");

// Wait 280ms for timeout to remove it
await new Promise(r => setTimeout(r, 280));
assert(!toast.toasts.find(t => t.id === sId), "Toast removed from DOM after exit animation timer completes");

toast.clear();
assert(toast.toasts.length === 0, "toast.clear() empties list");

// ================================================================
// TEST 3: Static Analysis of All CRM Modal Dialogs
// ================================================================
console.log("\n--- TEST 3: Verification of All CRM Modal Dialog Implementations ---");

const filesToCheck = [
  "src/Components/ChangePasswordModal.jsx",
  "src/Components/CreateCustomerModel.jsx",
  "src/Components/CreateEmployeeModel.jsx",
  "src/Components/CreateInvoiceModel.jsx",
  "src/Components/CreateQuotationModel.jsx",
  "src/Components/CreateRenewalModal.jsx",
  "src/Components/CreateServiceModel.jsx",
  "src/Components/DocumentPreviewModal.jsx",
  "src/Components/EditCustomerModel.jsx",
  "src/Components/EditInvoiceModel.jsx",
  "src/Components/EditServiceModel.jsx",
  "src/Components/Modal.jsx",
  "src/Components/VerifyEmailModal.jsx",
  "src/Pages/JobNumberManagement.jsx",
  "src/Pages/ServiceDetails.jsx",
  "src/Pages/Settings.jsx",
  "src/Pages/Upload.jsx",
];

for (const relPath of filesToCheck) {
  const fullPath = path.resolve(__dirname, relPath);
  assert(fs.existsSync(fullPath), `Modal file exists: ${relPath}`);
  const content = fs.readFileSync(fullPath, "utf8");

  // Must use createPortal
  assert(content.includes("createPortal"), `${relPath} uses createPortal for viewport isolation`);

  // Must use scroll lock
  const hasScrollLock = content.includes("useScrollLock") || content.includes("useBodyScrollLock");
  assert(hasScrollLock, `${relPath} integrates scroll locking (useScrollLock / useBodyScrollLock)`);

  // Must have overflow-y-auto on backdrop overlay
  assert(content.includes("overflow-y-auto"), `${relPath} includes overflow-y-auto for viewport overflow protection`);
}

// ================================================================
// TEST 4: Toast Alignment & CSS Keyframes Inspection
// ================================================================
console.log("\n--- TEST 4: Toast Layout & CSS Verification ---");
const cssPath = path.resolve(__dirname, "src/index.css");
const cssContent = fs.readFileSync(cssPath, "utf8");

assert(cssContent.includes("modal-scroll-locked"), "index.css contains modal-scroll-locked rules");
assert(cssContent.includes("toastSlideIn"), "index.css contains toastSlideIn animation");
assert(cssContent.includes("toastSlideOut"), "index.css contains toastSlideOut animation");
assert(cssContent.includes("toast-enter"), "index.css contains .toast-enter class");
assert(cssContent.includes("toast-exit"), "index.css contains .toast-exit class");
assert(cssContent.includes("prefers-reduced-motion"), "index.css respects prefers-reduced-motion");

const toastContainerPath = path.resolve(__dirname, "src/Components/ToastContainer.jsx");
const toastContainerContent = fs.readFileSync(toastContainerPath, "utf8");
assert(toastContainerContent.includes("items-center"), "ToastContainer uses items-center for vertical centering");
assert(!toastContainerContent.includes("mt-0.5"), "ToastContainer does not use arbitrary mt-0.5 margin");
assert(toastContainerContent.includes("w-8 h-8 rounded-full"), "ToastContainer uses fixed 32x32 circular icon container");
assert(toastContainerContent.includes("toast-exit"), "ToastContainer applies toast-exit class during dismissal");

console.log("\n==================================================================");
console.log(`ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY (100%)!`);
console.log("==================================================================");
