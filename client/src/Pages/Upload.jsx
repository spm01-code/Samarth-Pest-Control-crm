import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineCloudArrowUp,
  HiOutlineDocumentText,
  HiOutlineTableCells,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXCircle,
  HiOutlineArrowPath,
  HiOutlineFunnel,
  HiOutlineUserPlus,
  HiOutlineUser,
  HiOutlineShieldCheck,
  HiOutlineInformationCircle,
  HiOutlineMagnifyingGlass,
  HiOutlineChevronDown,
  HiOutlineXMark,
} from "react-icons/hi2";
import {
  uploadImportFile,
  selectImportSheet,
  getImportHelpers,
  validateImportSession,
  commitImportSession,
} from "../API/importAPI";

// Searchable Select Dropdown with search filter
function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "-- Choose --",
  searchPlaceholder = "Search...",
  theme = "cyan",
  getItemLabel = (item) => item.fullName || item.name || "",
  getItemSubtext = (item) => item.phone || item.role || "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedItem = options.find((opt) => String(opt.id || opt._id) === String(value));

  const filtered = options.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const nameMatch = (item.fullName || item.name || "").toLowerCase().includes(q);
    const phoneMatch = (item.phone || "").toLowerCase().includes(q);
    const roleMatch = (item.role || "").toLowerCase().includes(q);
    const emailMatch = (item.email || "").toLowerCase().includes(q);
    return nameMatch || phoneMatch || roleMatch || emailMatch;
  });

  const borderColor =
    theme === "amber"
      ? "border-amber-500/40 text-amber-200"
      : "border-cyan-500/50 text-cyan-300";

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setQuery("");
        }}
        className={`bg-slate-950 border ${borderColor} rounded-lg px-2.5 py-1 text-[11px] outline-none w-full flex items-center justify-between gap-1.5 cursor-pointer hover:bg-slate-900 transition text-left`}
      >
        <span className="truncate flex items-center gap-1.5">
          <HiOutlineMagnifyingGlass className="size-3 shrink-0 opacity-70" />
          <span className="truncate">
            {selectedItem ? getItemLabel(selectedItem) : placeholder}
          </span>
        </span>
        <HiOutlineChevronDown
          className={`size-3 shrink-0 opacity-70 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 max-w-[280px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs">
          <div className="relative mb-2">
            <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500/70"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5"
              >
                <HiOutlineXMark className="size-3" />
              </button>
            )}
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1 divide-y divide-slate-800">
            <div
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className="px-2 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 cursor-pointer text-[11px] italic"
            >
              -- None / Clear Selection --
            </div>

            {filtered.length > 0 ? (
              filtered.map((item) => {
                const isSelected = String(item.id || item._id) === String(value);
                const subtext = getItemSubtext(item);
                return (
                  <div
                    key={item.id || item._id}
                    onClick={() => {
                      onChange(item.id || item._id);
                      setIsOpen(false);
                    }}
                    className={`px-2 py-1.5 rounded-lg cursor-pointer transition text-[11px] flex flex-col ${
                      isSelected
                        ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                        : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <span className="truncate font-medium">{item.fullName || item.name}</span>
                    {subtext && (
                      <span className="text-[10px] text-slate-400 truncate">
                        {subtext}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-2 py-3 text-center text-slate-500 text-[11px]">
                No matching records found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Upload() {
  const token = useSelector((state) => state.auth.token);
  const navigate = useNavigate();

  // Wizard Steps: 1: Upload, 2: Sheet/Entity, 3: Column Mapping, 4: Preview/Resolution, 5: Summary
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1 Data
  const [selectedFile, setSelectedFile] = useState(null);
  const [importSessionId, setImportSessionId] = useState("");
  const [sheetNames, setSheetNames] = useState([]);

  // Step 2 Data
  const [selectedSheet, setSelectedSheet] = useState("");
  const [targetEntity, setTargetEntity] = useState("Customer");
  const [availableEntities, setAvailableEntities] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columns, setColumns] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);

  // Step 3 Data
  const [mappings, setMappings] = useState({});
  const [entityFields, setEntityFields] = useState({});

  // Helper Data
  const [helperCustomers, setHelperCustomers] = useState([]);
  const [helperEmployees, setHelperEmployees] = useState([]);

  // Step 4 Data
  const [validationSummary, setValidationSummary] = useState(null);
  const [reconciliationReport, setReconciliationReport] = useState([]);
  const [rows, setRows] = useState([]);
  const [unmappedHeaders, setUnmappedHeaders] = useState([]);
  const [paymentHeaders, setPaymentHeaders] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");

  // Step 5 Data
  const [commitSummary, setCommitSummary] = useState(null);
  const [errorReport, setErrorReport] = useState([]);

  // Load Helpers when stepping into mapping/preview
  useEffect(() => {
    if (token && step >= 2) {
      getImportHelpers(token)
        .then((res) => {
          setHelperCustomers(res.customers || []);
          setHelperEmployees(res.employees || []);
        })
        .catch((err) => console.error("Failed to load helpers:", err));
    }
  }, [token, step]);

  // Keep body and html background dark while on Upload to prevent white overscroll or bottom gaps
  useEffect(() => {
    const origBodyBg = document.body.style.backgroundColor;
    const origHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "#0f172a";
    document.documentElement.style.backgroundColor = "#0f172a";
    return () => {
      document.body.style.backgroundColor = origBodyBg;
      document.documentElement.style.backgroundColor = origHtmlBg;
    };
  }, []);

  // Handle File Upload
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg("Please select an Excel (.xlsx, .xls) or CSV file");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await uploadImportFile(selectedFile, token);
      setImportSessionId(res.importSessionId);
      setSheetNames(res.sheetNames || []);
      if (res.sheetNames && res.sheetNames.length > 0) {
        setSelectedSheet(res.sheetNames[0]);
      }
      setStep(2);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Sheet / Entity Selection
  const handleSheetSelect = async () => {
    if (!importSessionId || !selectedSheet) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await selectImportSheet(importSessionId, selectedSheet, token);
      setHeaders(res.headers || []);
      setColumns(res.columns || []);
      setSampleRows(res.sampleRows || []);
      setTargetEntity(res.detectedEntity || "Customer");
      setMappings(res.defaultMappings || {});
      setAvailableEntities(res.availableEntities || []);
      setEntityFields(res.entityFields || {});
      setStep(3);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Mapping Change
  const handleMappingChange = (columnKey, targetFieldKey, altHeader) => {
    setMappings((prev) => {
      const updated = {
        ...prev,
        [columnKey]: targetFieldKey,
      };
      if (altHeader) {
        updated[altHeader] = targetFieldKey;
      }
      return updated;
    });
  };

  // Run Validation
  const handleRunValidation = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await validateImportSession(
        {
          importSessionId,
          selectedSheet,
          targetEntity,
          mappings,
        },
        token
      );
      setValidationSummary(res.summary);
      setReconciliationReport(res.reconciliationReport || []);
      setRows(res.rows || []);
      setUnmappedHeaders(res.unmappedHeaders || []);
      setPaymentHeaders(res.paymentHeaders || []);
      setStep(4);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update Specific Row Action/Choices
  const handleRowChoiceChange = (rowNumber, key, value) => {
    setRows((prevRows) =>
      prevRows.map((r) => {
        if (r.rowNumber === rowNumber) {
          return { ...r, [key]: value };
        }
        return r;
      })
    );
  };

  // Execute Commit
  const handleCommit = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const choices = rows.map((r) => ({
        rowNumber: r.rowNumber,
        action: r.action,
        customerAction: r.customerAction,
        selectedCustomerId: r.selectedCustomerId,
        selectedEmployeeId: r.selectedEmployeeId,
      }));

      const res = await commitImportSession(
        {
          importSessionId,
          choices,
        },
        token
      );
      setCommitSummary(res.summary);
      setErrorReport(res.errorReport || []);
      setStep(5);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter Rows for Table View
  const filteredRows = rows.filter((r) => {
    if (activeFilter === "ALL") return true;
    if (activeFilter === "VALID") return r.status === "VALID";
    if (activeFilter === "WARNING") return r.status === "WARNING";
    if (activeFilter === "ERROR") return r.status === "ERROR";
    if (activeFilter === "DUPLICATE") return r.status === "DUPLICATE";
    return true;
  });

  return (
    <div className="flex-1 w-full min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col">
      {/* Header */}
      <div className="max-w-7xl mx-auto w-full mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <HiOutlineCloudArrowUp className="text-cyan-400 size-9" />
            Client Data Importer
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload, validate, resolve, and commit client Excel data into Samarth Pest Management CRM.
          </p>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-2xl border border-slate-700/50">
          {[
            { s: 1, label: "Upload" },
            { s: 2, label: "Sheet" },
            { s: 3, label: "Mapping" },
            { s: 4, label: "Preview" },
            { s: 5, label: "Done" },
          ].map((item) => (
            <div
              key={item.s}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                step === item.s
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : step > item.s
                  ? "bg-slate-700 text-cyan-300"
                  : "text-slate-500"
              }`}
            >
              <span>{item.s}</span>
              <span className="hidden md:inline">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="max-w-7xl mx-auto w-full mb-6 p-4 bg-red-900/40 border border-red-500/50 rounded-xl text-red-200 flex items-center gap-3">
          <HiOutlineXCircle className="size-6 text-red-400 shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Main Content Body */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        {/* STEP 1: UPLOAD FILE */}
        {step === 1 && (
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-8 max-w-2xl mx-auto shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <HiOutlineDocumentText className="text-cyan-400 size-6" />
              Select Excel or CSV File
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Supported client formats: ONE TIME JOB, AMC-PC, INVOICE PC, GST ALL INVOICE, QTN-PC, ATT QTN LIST, PERFORMA BILL.
            </p>

            <form onSubmit={handleFileUpload} className="space-y-6">
              <div className="border-2 border-dashed border-slate-600 hover:border-cyan-400 transition-colors rounded-2xl p-8 text-center bg-slate-900/50 cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center justify-center gap-3">
                  <HiOutlineCloudArrowUp className="size-12 text-cyan-400 animate-bounce" />
                  {selectedFile ? (
                    <div>
                      <p className="text-cyan-300 font-semibold text-base">{selectedFile.name}</p>
                      <p className="text-slate-400 text-xs mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-slate-200 font-medium text-sm">Drag and drop your file here, or click to browse</p>
                      <p className="text-slate-500 text-xs mt-1">Supports .xlsx, .xls, and .csv files up to 25MB</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedFile || loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <HiOutlineArrowPath className="animate-spin size-5" /> : "Upload and Continue"}
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: WORKSHEET & ENTITY SELECTION */}
        {step === 2 && (
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-8 max-w-2xl mx-auto shadow-2xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <HiOutlineTableCells className="text-cyan-400 size-6" />
                Worksheet & Entity Selection
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Choose which sheet to process and verify the target CRM model type.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Select Worksheet
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 font-medium focus:ring-2 focus:ring-cyan-400 outline-none"
                >
                  {sheetNames.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSheetSelect}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? <HiOutlineArrowPath className="animate-spin size-5" /> : "Proceed to Column Mapping"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: COLUMN MAPPING */}
        {step === 3 && (
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-8 shadow-2xl space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-white">Column Mapping</h2>
                  <span className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs font-bold px-3 py-1 rounded-full uppercase">
                    Format: {targetEntity}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  Map Excel headers from sheet <strong className="text-slate-200">[{selectedSheet}]</strong> to CRM fields.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-300 uppercase">Target Entity:</label>
                <select
                  value={targetEntity}
                  onChange={(e) => setTargetEntity(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-cyan-300 font-semibold outline-none"
                >
                  {availableEntities.map((ent) => (
                    <option key={ent} value={ent}>
                      {ent}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mapping Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(columns && columns.length > 0
                ? columns
                : headers.map((h, i) => ({ colIdx: i, header: h, columnKey: `col_${i}_${h}` }))
              ).map((col) => {
                const header = col.header;
                const columnKey = col.columnKey || `col_${col.colIdx}_${header}`;
                const currentMappedField = mappings[columnKey] || mappings[header] || "UNMAPPED";
                const isUnmapped = currentMappedField === "UNMAPPED";

                return (
                  <div
                    key={columnKey}
                    className={`p-4 rounded-xl border transition ${
                      isUnmapped
                        ? "bg-slate-900/60 border-slate-700/80"
                        : "bg-slate-900/90 border-cyan-500/40 shadow-sm shadow-cyan-500/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-300 truncate max-w-[200px]" title={header}>
                        <span className="text-cyan-400 font-mono text-[10px] mr-1.5">#{col.colIdx + 1}</span>
                        {header}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          isUnmapped ? "bg-slate-800 text-slate-400" : "bg-cyan-400/20 text-cyan-300"
                        }`}
                      >
                        {isUnmapped ? "UNMAPPED" : "MAPPED"}
                      </span>
                    </div>

                    <select
                      value={currentMappedField}
                      onChange={(e) => handleMappingChange(columnKey, e.target.value, header)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                    >
                      <option value="UNMAPPED">-- Do Not Import (Unmapped) --</option>
                      {(entityFields[targetEntity] || []).map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} {f.required ? "*" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center border-t border-slate-700/60 pt-6">
              <button
                onClick={() => setStep(2)}
                className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-6 py-3 rounded-xl transition text-sm cursor-pointer"
              >
                Back to Sheet Selection
              </button>

              <button
                onClick={handleRunValidation}
                disabled={loading}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2 cursor-pointer"
              >
                {loading ? <HiOutlineArrowPath className="animate-spin size-5" /> : "Validate Data & Preview"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: INTERACTIVE PREVIEW & MANUAL RESOLUTION */}
        {step === 4 && validationSummary && (
          <div className="space-y-6">
            {/* Metrics Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-2xl">
                <p className="text-slate-400 text-xs font-bold uppercase">Total Rows</p>
                <p className="text-3xl font-extrabold text-white mt-1">{validationSummary.totalRows}</p>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-5 rounded-2xl">
                <p className="text-emerald-400 text-xs font-bold uppercase flex items-center gap-1">
                  <HiOutlineCheckCircle className="size-4" /> Valid
                </p>
                <p className="text-3xl font-extrabold text-emerald-300 mt-1">{validationSummary.validCount}</p>
              </div>
              <div className="bg-amber-950/40 border border-amber-500/30 p-5 rounded-2xl">
                <p className="text-amber-400 text-xs font-bold uppercase flex items-center gap-1">
                  <HiOutlineExclamationTriangle className="size-4" /> Warnings
                </p>
                <p className="text-3xl font-extrabold text-amber-300 mt-1">{validationSummary.warningCount}</p>
              </div>
              <div className="bg-red-950/40 border border-red-500/30 p-5 rounded-2xl">
                <p className="text-red-400 text-xs font-bold uppercase flex items-center gap-1">
                  <HiOutlineXCircle className="size-4" /> Errors
                </p>
                <p className="text-3xl font-extrabold text-red-300 mt-1">{validationSummary.errorCount}</p>
              </div>
              <div className="bg-blue-950/40 border border-blue-500/30 p-5 rounded-2xl">
                <p className="text-blue-400 text-xs font-bold uppercase flex items-center gap-1">
                  <HiOutlineShieldCheck className="size-4" /> Duplicates
                </p>
                <p className="text-3xl font-extrabold text-blue-300 mt-1">{validationSummary.duplicateCount}</p>
              </div>
            </div>

            {/* Field Reconciliation & Data Integrity Report */}
            {reconciliationReport && reconciliationReport.length > 0 && (
              <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <HiOutlineShieldCheck className="text-cyan-400 size-5" />
                    Field Reconciliation & Data Loss Safeguard Report
                  </h3>
                  <span className="text-xs text-slate-400">
                    {reconciliationReport.filter((r) => r.status === "PASS").length} Mapped / {reconciliationReport.length} Total Columns
                  </span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-700/50 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">Col #</th>
                        <th className="p-2.5">Excel Header</th>
                        <th className="p-2.5">Target CRM Field</th>
                        <th className="p-2.5">Populated Rows</th>
                        <th className="p-2.5">Sample Values</th>
                        <th className="p-2.5">Safeguard Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40 text-slate-300 bg-slate-900/30">
                      {reconciliationReport.map((col) => {
                        const isRisk = col.status === "DATA_LOSS_RISK";
                        const isWarn = col.status === "WARNING";
                        const isPass = col.status === "PASS";
                        return (
                          <tr key={col.columnKey || col.colIdx} className="hover:bg-slate-700/30 transition">
                            <td className="p-2.5 font-mono text-slate-500">#{col.colIdx + 1}</td>
                            <td className="p-2.5 font-semibold text-slate-200">{col.header}</td>
                            <td className="p-2.5">
                              {col.targetField !== "UNMAPPED" ? (
                                <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-mono text-[11px]">
                                  {col.targetField}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">Do Not Import</span>
                              )}
                            </td>
                            <td className="p-2.5">{col.totalValues}</td>
                            <td className="p-2.5 max-w-[200px] truncate text-slate-400" title={col.sampleValues.join(", ")}>
                              {col.sampleValues.length > 0 ? col.sampleValues.join(", ") : "-"}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isRisk
                                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                                    : isWarn
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    : isPass
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {col.status.replace(/_/g, " ")}
                              </span>
                              {col.riskReason && (
                                <p className={`text-[10px] mt-0.5 ${isRisk ? "text-red-300" : isWarn ? "text-amber-300" : "text-slate-400"}`}>
                                  {col.riskReason}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Unmapped & Payment Headers Banner */}
            {(unmappedHeaders.length > 0 || paymentHeaders.length > 0) && (
              <div className="bg-slate-800/90 border border-slate-700 p-4 rounded-xl flex items-start gap-3">
                <HiOutlineInformationCircle className="size-6 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  {unmappedHeaders.length > 0 && (
                    <p>
                      <strong className="text-cyan-300">Unmapped Headers ({unmappedHeaders.length}):</strong>{" "}
                      {unmappedHeaders.join(", ")}
                    </p>
                  )}
                  {paymentHeaders.length > 0 && (
                    <p>
                      <strong className="text-amber-300">Preserved Payment Columns ({paymentHeaders.length}):</strong>{" "}
                      {paymentHeaders.join(", ")} (Logged safely in import details).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Filter Tabs & Commit Action Bar */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
                <HiOutlineFunnel className="text-slate-400 size-5 shrink-0" />
                {["ALL", "VALID", "WARNING", "ERROR", "DUPLICATE"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveFilter(tab)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      activeFilter === tab
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-slate-900 text-slate-400 hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <button
                  onClick={() => setStep(3)}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  Edit Mappings
                </button>

                <button
                  onClick={handleCommit}
                  disabled={loading}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
                >
                  {loading ? <HiOutlineArrowPath className="animate-spin size-5" /> : "Commit Import"}
                </button>
              </div>
            </div>

            {/* Data Rows Preview Table */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto min-h-[320px] pb-24">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-300 font-bold uppercase tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="p-3.5">Row</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Key Data</th>
                      <th className="p-3.5">Customer Matching</th>
                      <th className="p-3.5">Employee / Operator</th>
                      <th className="p-3.5">Action Choice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {filteredRows.map((row) => {
                      const isErr = row.status === "ERROR";
                      const isWarn = row.status === "WARNING";
                      const isDup = row.status === "DUPLICATE";

                      return (
                        <tr key={row.rowNumber} className="hover:bg-slate-900/40 transition">
                          <td className="p-3.5 font-bold text-slate-400">#{row.rowNumber}</td>
                          <td className="p-3.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                isErr
                                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                  : isDup
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  : isWarn
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}
                            >
                              {row.status}
                            </span>
                            {row.warnings.map((w, i) => (
                              <p key={i} className="text-[10px] text-amber-300 mt-1">
                                {w}
                              </p>
                            ))}
                            {row.errors.map((e, i) => (
                              <p key={i} className="text-[10px] text-red-400 mt-1">
                                {e}
                              </p>
                            ))}
                          </td>

                          {/* Key Original Data */}
                          <td className="p-3.5 max-w-[220px]">
                            <p className="font-semibold text-slate-200 truncate">
                              {row.originalData.customerName || row.originalData.fullName || row.originalData.invoiceNumber || row.originalData.quotationNumber || row.originalData.renewalNumber}
                            </p>
                            <p className="text-slate-400 text-[11px] truncate">
                              {row.originalData.serviceName || row.originalData.treatmentType || row.originalData.phone || row.originalData.address}
                            </p>
                          </td>

                          {/* Customer Resolution */}
                          <td className="p-3.5">
                            {row.matchedCustomer ? (
                              <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                                <HiOutlineUser className="size-4 shrink-0" />
                                <span className="truncate max-w-[150px]">{row.matchedCustomer.fullName}</span>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <select
                                  value={row.customerAction || "CREATE_NEW"}
                                  onChange={(e) => handleRowChoiceChange(row.rowNumber, "customerAction", e.target.value)}
                                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none w-full"
                                >
                                  <option value="CREATE_NEW">➕ Create New Customer</option>
                                  <option value="SELECT_EXISTING">🔍 Select Existing Customer</option>
                                  <option value="SKIP">🚫 Skip Customer Creation</option>
                                </select>

                                {row.customerAction === "SELECT_EXISTING" && (
                                  <SearchableSelect
                                    value={row.selectedCustomerId || ""}
                                    onChange={(val) => {
                                      handleRowChoiceChange(row.rowNumber, "selectedCustomerId", val);
                                      handleRowChoiceChange(row.rowNumber, "customerAction", "SELECT_EXISTING");
                                    }}
                                    options={helperCustomers}
                                    placeholder="-- Choose Customer --"
                                    searchPlaceholder="Search customer by name, phone..."
                                    theme="cyan"
                                    getItemLabel={(c) => `${c.fullName} (${c.phone || "No phone"})`}
                                    getItemSubtext={(c) => c.address ? `${c.phone || "No phone"} • ${c.address}` : (c.phone || "")}
                                  />
                                )}
                              </div>
                            )}
                          </td>

                          {/* Employee Resolution */}
                          <td className="p-3.5">
                            {row.matchedEmployee ? (
                              <span className="text-slate-300 font-medium">{row.matchedEmployee.fullName}</span>
                            ) : (
                              <SearchableSelect
                                value={row.selectedEmployeeId || ""}
                                onChange={(val) => handleRowChoiceChange(row.rowNumber, "selectedEmployeeId", val)}
                                options={helperEmployees}
                                placeholder="-- Assign Employee (Manual) --"
                                searchPlaceholder="Search employee by name, role..."
                                theme="amber"
                                getItemLabel={(e) => `${e.fullName} (${e.role})`}
                                getItemSubtext={(e) => `${e.phone ? e.phone + " • " : ""}${e.role}`}
                              />
                            )}
                          </td>

                          {/* Row Import Action Choice */}
                          <td className="p-3.5">
                            <select
                              value={row.action || "IMPORT"}
                              onChange={(e) => handleRowChoiceChange(row.rowNumber, "action", e.target.value)}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none border ${
                                row.action === "SKIP"
                                  ? "bg-slate-900 border-slate-700 text-slate-400"
                                  : row.action === "UPDATE"
                                  ? "bg-amber-950 border-amber-500 text-amber-300"
                                  : "bg-emerald-950 border-emerald-500 text-emerald-300"
                              }`}
                            >
                              <option value="IMPORT">IMPORT ROW</option>
                              {isDup && <option value="UPDATE">UPDATE EXISTING RECORD</option>}
                              <option value="SKIP">SKIP ROW</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: IMPORT SUMMARY & ERROR REPORT */}
        {step === 5 && commitSummary && (
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-8 max-w-3xl mx-auto shadow-2xl space-y-8">
            <div className="text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-4 border border-emerald-500/30">
                <HiOutlineCheckCircle className="size-10" />
              </div>
              <h2 className="text-3xl font-extrabold text-white">Import Complete!</h2>
              <p className="text-slate-400 text-sm mt-1">
                Data was successfully committed to the database.
              </p>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-emerald-500/30 p-4 rounded-xl text-center">
                <p className="text-emerald-400 text-xs font-bold uppercase">Created</p>
                <p className="text-3xl font-extrabold text-emerald-300 mt-1">{commitSummary.created}</p>
              </div>
              <div className="bg-slate-900/80 border border-amber-500/30 p-4 rounded-xl text-center">
                <p className="text-amber-400 text-xs font-bold uppercase">Updated</p>
                <p className="text-3xl font-extrabold text-amber-300 mt-1">{commitSummary.updated}</p>
              </div>
              <div className="bg-slate-900/80 border border-slate-700 p-4 rounded-xl text-center">
                <p className="text-slate-400 text-xs font-bold uppercase">Skipped</p>
                <p className="text-3xl font-extrabold text-slate-300 mt-1">{commitSummary.skipped}</p>
              </div>
              <div className="bg-slate-900/80 border border-red-500/30 p-4 rounded-xl text-center">
                <p className="text-red-400 text-xs font-bold uppercase">Failed</p>
                <p className="text-3xl font-extrabold text-red-300 mt-1">{commitSummary.failed}</p>
              </div>
            </div>

            {/* Error Report if any failures */}
            {errorReport.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                  Failed Rows Error Report ({errorReport.length})
                </h3>
                <div className="bg-slate-900 border border-red-500/30 rounded-xl p-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-2">Row #</th>
                        <th className="pb-2">Problem</th>
                        <th className="pb-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {errorReport.map((err, idx) => (
                        <tr key={idx}>
                          <td className="py-2 text-slate-300">#{err.rowNumber}</td>
                          <td className="py-2 text-red-300">{err.problem}</td>
                          <td className="py-2 text-slate-400">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedFile(null);
                  setCommitSummary(null);
                  setErrorReport([]);
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3.5 rounded-xl transition cursor-pointer"
              >
                Import Another File
              </button>

              <button
                onClick={() => navigate("/")}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold py-3.5 rounded-xl shadow-lg shadow-cyan-500/20 transition cursor-pointer"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Upload;
