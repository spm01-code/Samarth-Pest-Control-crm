import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import {
  HiOutlineUser,
  HiOutlineBuildingOffice,
  HiOutlineHashtag,
  HiOutlineDocumentText,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import {
  fetchTemplatesAPI,
  activateTemplateAPI,
  deleteTemplateAPI,
  uploadTemplateAPI,
} from "../API/templateAPI";
import {
  fetchCompanySettingsAPI,
  updateCompanySettingsAPI,
} from "../API/companySettingAPI";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import ChangePasswordModal from "../Components/ChangePasswordModal";

function Settings() {
  const { user } = useSelector((state) => state.auth);

  // Tabs state: 'account' | 'prefixes' | 'templates'
  const [activeTab, setActiveTab] = useState("account");

  // 1. Account & Company State
  const [accountData, setAccountData] = useState({
    name: user?.name || "Admin",
    email: user?.email || "admin@spmservices.com",
    phone: user?.phone || "+91 99999 88888",
    companyName: "SAMARTH PEST MANAGEMENT",
    companyAddress: "Office No. B - 221, Bhaskar Commercial Complex, Near Platform No. 1, Virar (w)-401303",
    companyAddressReg: "Office No. 102, Balaji, New Vijay CHSL, Near Datta Mandir, Nallasopara (E) - 401209",
    companyEmail: "samarthpest2022@gmail.com",
    companyPhone: "8356080548",
    companyWebsite: "samarthpest.com",
    companyTaxId: "27BDMPM1204J1ZL",
    gstBankName: "HDFC BANK",
    gstBankAccount: "50200095291619",
    gstBankIfsc: "HDFC0000051",
    nongstBankName: "HDFC BANK",
    nongstBankAccount: "50200102548611",
    nongstBankIfsc: "HDFC0000051",
    pan: "JCHPM5440Q",
    upiId: "8356080548@okbizaxis"
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);


  // 2. Prefixes & Numbering State
  const [numberingYear, setNumberingYear] = useState(new Date().getFullYear());
  const [numberingConfig, setNumberingConfig] = useState(null);
  const [prefixData, setPrefixData] = useState({
    quotation: "QTN-",
    invoice: "INV-",
    renewal: "REN-",
  });

  // 3. Templates State
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [submittingTemplate, setSubmittingTemplate] = useState(false);

  // Modal State for adding new template
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    module: "invoice",
    name: "",
    file: null,
  });

  // Modal State for editing company settings
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editCompanyData, setEditCompanyData] = useState({});
  const [savingCompany, setSavingCompany] = useState(false);

  const token = useSelector((state) => state.auth.token);

  // Load from localStorage on mount (for account settings & prefixes only)
  useEffect(() => {
    const savedAccount = localStorage.getItem("crm_settings_account");
    if (savedAccount) setAccountData(JSON.parse(savedAccount));

    const savedPrefixes = localStorage.getItem("crm_settings_prefixes");
    if (savedPrefixes) setPrefixData(JSON.parse(savedPrefixes));
  }, []);

  const loadCompanySettings = async () => {
    if (!token) return;
    try {
      const data = await fetchCompanySettingsAPI(token);
      if (data.success) {
        if (data.numberingConfig) {
          setNumberingConfig(data.numberingConfig);
        }
        if (data.settings) {
          const s = data.settings;
          setAccountData((prev) => ({
            ...prev,
            companyName: s.companyName || prev.companyName,
            companyAddressReg: s.companyAddressReg || prev.companyAddressReg,
            companyAddress: s.companyAddress || prev.companyAddress,
            companyEmail: s.companyEmail || prev.companyEmail,
            companyPhone: s.companyPhone || prev.companyPhone,
            companyWebsite: s.companyWebsite || prev.companyWebsite,
            companyTaxId: s.companyTaxId || prev.companyTaxId,
            gstBankName: s.gstBankName || prev.gstBankName,
            gstBankAccount: s.gstBankAccount || prev.gstBankAccount,
            gstBankIfsc: s.gstBankIfsc || prev.gstBankIfsc,
            nongstBankName: s.nongstBankName || prev.nongstBankName,
            nongstBankAccount: s.nongstBankAccount || prev.nongstBankAccount,
            nongstBankIfsc: s.nongstBankIfsc || prev.nongstBankIfsc,
            pan: s.pan || prev.pan,
            upiId: s.upiId || prev.upiId,
          }));
          
          if (s.numberingYear) {
            setNumberingYear(s.numberingYear);
          }
          
          setPrefixData((prev) => ({
            ...prev,
            quotation: s.quotationPrefix || prev.quotation,
            invoice: s.invoicePrefix || prev.invoice,
            renewal: s.renewalPrefix || prev.renewal,
          }));
        }
      }
    } catch (err) {
      console.error("Failed to load company settings:", err);
    }
  };

  useEffect(() => {
    if (token) {
      loadCompanySettings();
    }
  }, [token]);

  const loadTemplates = async () => {
    if (!token) return;
    setLoadingTemplates(true);
    setTemplateError("");
    try {
      const data = await fetchTemplatesAPI(token);
      if (data.success) {
        setTemplates(data.templates);
      } else {
        setTemplateError(data.message || "Failed to load templates");
      }
    } catch (err) {
      setTemplateError(err.message || "Failed to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (activeTab === "templates") {
      loadTemplates();
    }
  }, [activeTab, token]);

  const getPreviewNumber = (prefix, defaultPrefix, countStr) => {
    const cleanPrefix = prefix || defaultPrefix;
    const year = new Date().getFullYear();
    if (cleanPrefix.includes(String(year))) {
      const separator = cleanPrefix.endsWith("-") ? "" : "-";
      return `${cleanPrefix}${separator}${countStr}`;
    } else {
      const separator = cleanPrefix.endsWith("-") ? "" : "-";
      return `${cleanPrefix}${separator}${year}-${countStr}`;
    }
  };

  // Handlers
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setSavingCompany(true);
    
    try {
      const payload = {
        companyName: editCompanyData.companyName,
        registerOffice: editCompanyData.companyAddressReg,
        corporateOffice: editCompanyData.companyAddress,
        phone: editCompanyData.companyPhone,
        email: editCompanyData.companyEmail,
        website: editCompanyData.companyWebsite,
        bankName: editCompanyData.gstBankName,
        gstAccountNumber: editCompanyData.gstBankAccount,
        nonGstAccountNumber: editCompanyData.nongstBankAccount,
        ifsc: editCompanyData.gstBankIfsc,
        pan: editCompanyData.pan,
        upiId: editCompanyData.upiId,
        
        ...editCompanyData,
        
        quotationPrefix: prefixData.quotation,
        invoicePrefix: prefixData.invoice,
        renewalPrefix: prefixData.renewal,
      };

      const data = await updateCompanySettingsAPI(payload, token);
      if (data.success) {
        setAccountData(editCompanyData);
        localStorage.setItem("crm_settings_account", JSON.stringify(editCompanyData));
        toast.success("Account & Company profile updated successfully!");
        setShowCompanyModal(false);
      } else {
        toast.error(getErrorMessage(data.message, "Failed to save company settings on backend"));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save company settings"));
    } finally {
      setSavingCompany(false);
    }
  };

  const handleSavePrefixes = async (e) => {
    e.preventDefault();

    const trimmedYear = String(numberingYear).trim();
    const isSingleYear = /^\d{4}$/.test(trimmedYear) && Number(trimmedYear) >= 2000 && Number(trimmedYear) <= 2099;
    const isFinancialYear = /^\d{4}[-/]\d{2,4}$/.test(trimmedYear);
    if (!isSingleYear && !isFinancialYear) {
      toast.warning("Please enter a valid 4-digit year (e.g. 2026) or financial year (e.g. 2026-2027).");
      return;
    }

    try {
      const payload = {
        numberingYear: trimmedYear,
      };

      const data = await updateCompanySettingsAPI(payload, token);
      if (data.success) {
        if (data.numberingConfig) {
          setNumberingConfig(data.numberingConfig);
        }
        toast.success("Numbering year updated successfully!");
        loadCompanySettings();
      } else {
        toast.error(getErrorMessage(data.message, "Failed to save numbering settings on backend"));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save numbering settings"));
    }
  };

  const getDocumentTypeLabel = (docType) => {
    switch (docType) {
      case "invoice":
        return "Invoice (NON-GST)";
      case "tax-invoice":
        return "Tax Invoice (GST)";
      case "quotation":
        return "PC Quotation";
      case "att-quotation":
        return "ATT Quotation";
      case "contract-renewal":
        return "Contract Renewal";
      case "one-time-job":
        return "One Time Job Service Paper";
      default:
        return docType;
    }
  };

  const handleSelectTemplate = async (templateId) => {
    setLoadingTemplates(true);
    try {
      const data = await activateTemplateAPI(templateId, token);
      if (data.success) {
        toast.success("Template activated successfully!");
        loadTemplates();
      } else {
        toast.error(getErrorMessage(data.message, "Failed to activate template"));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to activate template"));
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleAddTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.file) {
      toast.warning("Please fill out all fields and select a file!");
      return;
    }

    const file = newTemplate.file;
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension !== 'docx') {
      toast.warning("Only .docx files are allowed!");
      return;
    }

    setSubmittingTemplate(true);
    const formData = new FormData();
    formData.append("documentType", newTemplate.module);
    formData.append("templateName", newTemplate.name);
    formData.append("template", file);

    try {
      const data = await uploadTemplateAPI(formData, token);
      if (data.success) {
        toast.success("Template uploaded and activated successfully!");
        setShowAddTemplateModal(false);
        setNewTemplate({ module: "invoice", name: "", file: null });
        loadTemplates();
      } else {
        toast.error(getErrorMessage(data.message, "Failed to upload template"));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to upload template"));
    } finally {
      setSubmittingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id, templateName, docType, e) => {
    e.stopPropagation(); // Avoid selecting/activating the deleted template
    const displayLabel = getDocumentTypeLabel(docType);
    if (!window.confirm(`Are you sure you want to delete template "${templateName}" (${displayLabel})?`)) {
      return;
    }

    setLoadingTemplates(true);
    try {
      const data = await deleteTemplateAPI(id, token);
      if (data.success) {
        toast.success("Template deleted successfully!");
        loadTemplates();
      } else {
        toast.error(getErrorMessage(data.message, "Failed to delete template"));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete template"));
    } finally {
      setLoadingTemplates(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">System Settings</h1>
        <p className="text-slate-500 mt-1">Configure company profiles, numbering systems, and document layouts</p>
      </div>

      <div className="space-y-6">
        {/* Horizontal Navigation at the Top */}
        <div className="bg-white rounded-2xl shadow-sm p-3 border border-slate-200/50 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("account")}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "account"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineBuildingOffice className="size-5" />
            Account & Company
          </button>
          <button
            onClick={() => setActiveTab("prefixes")}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "prefixes"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineHashtag className="size-5" />
            Prefix Settings
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "templates"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineDocumentText className="size-5" />
            Template Settings
          </button>
        </div>

        {/* Content Pane */}
        <div className="w-full">
          {/* TAB 1: ACCOUNT & COMPANY PROFILE */}
          {activeTab === "account" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <HiOutlineBuildingOffice className="text-blue-600" />
                      Company Settings
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">This information will be displayed on all generated PDFs</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditCompanyData({ ...accountData });
                      setShowCompanyModal(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition"
                  >
                    Edit Profile
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Company Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Company Name</span>
                      <span className="text-sm font-semibold text-slate-800 block mt-1">{accountData.companyName || "N/A"}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Tax ID / GSTIN</span>
                      <span className="text-sm font-semibold text-slate-800 block mt-1">{accountData.companyTaxId || "N/A"}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Company Email</span>
                      <span className="text-sm font-semibold text-slate-800 block mt-1">{accountData.companyEmail || "N/A"}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Company Phone</span>
                      <span className="text-sm font-semibold text-slate-800 block mt-1">{accountData.companyPhone || "N/A"}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Company Website</span>
                      <span className="text-sm font-semibold text-slate-800 block mt-1">{accountData.companyWebsite || "N/A"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Register Office Address</span>
                      <span className="text-xs text-slate-700 block mt-1 leading-relaxed whitespace-pre-line">{accountData.companyAddressReg || "N/A"}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Corporate Office Address</span>
                      <span className="text-xs text-slate-700 block mt-1 leading-relaxed whitespace-pre-line">{accountData.companyAddress || "N/A"}</span>
                    </div>
                  </div>

                  {/* GST Bank Grid */}
                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">GST Bank Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Bank Name</span>
                        <span className="text-xs text-slate-700 block mt-1">{accountData.gstBankName || "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Account Number</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.gstBankAccount || "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">IFSC Code</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.gstBankIfsc || "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Non-GST Bank Grid */}
                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">Non-GST Bank & UPI Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Bank Name</span>
                        <span className="text-xs text-slate-700 block mt-1">{accountData.nongstBankName || "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Account Number</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.nongstBankAccount || "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">IFSC Code</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.nongstBankIfsc || "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">PAN Number</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.pan || "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">UPI ID (GPAY QR Code)</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.upiId || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Credentials Settings */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <HiOutlineUser className="text-blue-600" />
                    Admin Login Details
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Manage display profile details</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin Name</p>
                      <p className="text-slate-800 font-medium text-sm mt-1">{accountData.name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</p>
                      <p className="text-slate-800 font-medium text-sm mt-1">{accountData.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Number</p>
                      <p className="text-slate-800 font-medium text-sm mt-1">{accountData.phone}</p>
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Password Reset Section */}
                  <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <span>Account Password</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                          OTP Protected
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Change your login password with secure email verification code delivered via Resend
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(true)}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      Change Password
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PREFIX & NUMBERING CONFIGURATION */}
          {activeTab === "prefixes" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="border-b border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <HiOutlineHashtag className="text-blue-600" />
                  Document Numbering Settings
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Configure the active numbering year. Fixed prefixes and dynamic sequences are centrally governed by the backend.
                </p>
              </div>

              <form onSubmit={handleSavePrefixes} className="p-6 space-y-6">
                {/* Numbering Year Input */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-800">
                      Numbering Year
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      The 4-digit calendar year embedded into all newly generated document numbers
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      required
                      value={numberingYear}
                      onChange={(e) => setNumberingYear(e.target.value)}
                      className="w-40 px-4 py-2.5 rounded-xl border border-slate-300 bg-white font-mono text-center font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-sm shadow-sm transition"
                      placeholder="e.g. 2026 or 2026-2027"
                    />
                  </div>
                </div>

                {/* Read-Only Previews Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                    <HiOutlineInformationCircle className="size-5 text-blue-600" />
                    <span>Live Document Previews (Read-Only)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 1. Invoice */}
                    <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Invoice
                        </span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                          Fixed: SPM/INV/
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-blue-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        {numberingConfig?.previews?.INVOICE?.sample ||
                          (numberingYear
                            ? `SPM/INV/${
                                String(numberingYear).includes("-")
                                  ? numberingYear
                                  : `${numberingYear}-${Number(numberingYear) + 1}`
                              }/0001`
                            : "SPM/INV/2026-2027/0001")}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Financial year sequential series (e.g. 2026-2027)
                      </p>
                    </div>

                    {/* 2. PC Quotation */}
                    <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          PC Quotation
                        </span>
                        <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                          Fixed: SPM/PC/
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-purple-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        {numberingConfig?.previews?.PC_QUOTATION?.sample ||
                          `SPM/PC/${String(numberingYear || "YYYY").split("-")[0]}/0001`}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Pest Control quotation series
                      </p>
                    </div>

                    {/* 3. ATT Quotation */}
                    <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          ATT Quotation
                        </span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                          Fixed: SPM/ATT/
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-indigo-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        {numberingConfig?.previews?.ATT_QUOTATION?.sample ||
                          `SPM/ATT/${String(numberingYear || "YYYY").split("-")[0]}/0001`}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Anti-Termite Treatment quotation series
                      </p>
                    </div>

                    {/* 4. Contract Renewal */}
                    <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Contract Renewal
                        </span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                          Fixed: SPM/CR/
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-emerald-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        {numberingConfig?.previews?.CONTRACT_RENEWAL?.sample ||
                          `SPM/CR/${String(numberingYear || "YYYY").split("-")[0]}/0001`}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Yearly contract renewal series
                      </p>
                    </div>

                    {/* 5. One Time Job */}
                    <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          One Time Job
                        </span>
                        <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full">
                          Fixed: Job No/
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-amber-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        {numberingConfig?.previews?.ONE_TIME_JOB?.sample ||
                          `Job No/${String(numberingYear || "YYYY").split("-")[0]}/0001`}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Single execution one-time job series
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-6 py-2.5 rounded-xl shadow-sm transition"
                  >
                    Save Numbering Settings
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: TEMPLATE SETTINGS */}
          {activeTab === "templates" && (
            <div className="space-y-8">
              {templateError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  {templateError}
                </div>
              )}

              {loadingTemplates && templates.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-sm text-slate-500 mt-2">Loading templates...</p>
                </div>
              ) : (
                [
                  { key: "invoice", label: "Invoice (NON-GST) Templates", dbType: "invoice" },
                  { key: "tax-invoice", label: "Tax Invoice (GST) Templates", dbType: "tax-invoice" },
                  { key: "quotation", label: "PC Quotation Templates", dbType: "quotation" },
                  { key: "att-quotation", label: "ATT Quotation Templates", dbType: "att-quotation" },
                  { key: "contract-renewal", label: "Contract Renewal Templates", dbType: "contract-renewal" },
                  { key: "one-time-job", label: "One Time Job Service Paper Templates", dbType: "one-time-job" }
                ].map((mod) => {
                  const moduleTemplates = templates.filter((t) => t.documentType === mod.dbType);
                  return (
                    <div
                      key={mod.key}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden"
                    >
                      <div className="border-b border-slate-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">{mod.label}</h2>
                          <p className="text-xs text-slate-500 mt-0.5">Select active template or upload new DOCX templates</p>
                        </div>
                        <button
                          onClick={() => {
                            setNewTemplate({ ...newTemplate, module: mod.dbType, file: null, name: "" });
                            setShowAddTemplateModal(true);
                          }}
                          className="self-start sm:self-auto bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition"
                        >
                          <HiOutlinePlus /> Add New Template
                        </button>
                      </div>

                      <div className="p-6">
                        {moduleTemplates.length === 0 ? (
                          <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                            <p className="text-sm text-slate-500">No template uploaded yet for {getDocumentTypeLabel(mod.dbType)}.</p>
                            <button
                              onClick={() => {
                                setNewTemplate({ ...newTemplate, module: mod.dbType, file: null, name: "" });
                                setShowAddTemplateModal(true);
                              }}
                              className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                            >
                              <HiOutlinePlus className="size-3" /> Upload first template
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {moduleTemplates.map((tpl) => {
                              const isActive = tpl.isActive;
                              return (
                                <div
                                  key={tpl._id}
                                  onClick={() => !isActive && handleSelectTemplate(tpl._id)}
                                  className={`border rounded-xl p-4 cursor-pointer transition select-none flex flex-col justify-between ${
                                    isActive
                                      ? "border-blue-600 bg-blue-50/20 ring-1 ring-blue-600 shadow-sm"
                                      : "border-slate-200 hover:border-slate-300 bg-white"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-sm font-semibold text-slate-800">{tpl.templateName}</h4>
                                      <div className="flex items-center gap-1.5">
                                        {isActive ? (
                                          <span className="flex items-center justify-center size-5 rounded-full bg-blue-600 text-white">
                                            <HiOutlineCheck className="size-3" />
                                          </span>
                                        ) : (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSelectTemplate(tpl._id);
                                            }}
                                            className="text-xs font-semibold text-blue-600 hover:underline hover:text-blue-700"
                                          >
                                            Activate
                                          </button>
                                        )}
                                        <button
                                          onClick={(e) => handleDeleteTemplate(tpl._id, tpl.templateName, tpl.documentType, e)}
                                          className="size-7 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition border border-transparent hover:border-red-100"
                                          title="Delete template"
                                        >
                                          <HiOutlineTrash className="size-4" />
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 font-mono truncate bg-slate-50 p-1.5 rounded" title={tpl.fileName}>
                                      {tpl.fileName}
                                    </p>
                                    {tpl.createdAt && (
                                      <p className="text-[10px] text-slate-400 mt-2">
                                        Uploaded: {new Date(tpl.createdAt).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                                        {tpl.uploadedBy?.name ? ` by ${tpl.uploadedBy.name}` : ""}
                                      </p>
                                    )}
                                  </div>
                                  <span className={`text-[10px] uppercase font-bold tracking-wider mt-4 ${isActive ? "text-blue-600" : "text-slate-400"}`}>
                                    {isActive ? "Active Template" : "Inactive"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL FOR ADDING NEW TEMPLATES */}
      {showAddTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add New Document DOCX Template</h3>
              <button
                onClick={() => setShowAddTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium"
              >
                ✕ Close
              </button>
            </div>
            <form onSubmit={handleAddTemplate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Target Document Module</label>
                  <select
                    value={newTemplate.module}
                    onChange={(e) => setNewTemplate({ ...newTemplate, module: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-600 text-sm"
                  >
                    <option value="invoice">Invoice (NON-GST)</option>
                    <option value="tax-invoice">Tax Invoice (GST)</option>
                    <option value="quotation">PC Quotation</option>
                    <option value="att-quotation">ATT Quotation</option>
                    <option value="contract-renewal">Contract Renewal</option>
                    <option value="one-time-job">One Time Job Service Paper</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Template Label Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Samarth Invoice Modern"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-600 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Template DOCX File</label>
                <input
                  type="file"
                  required
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    setNewTemplate({ ...newTemplate, file });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-600 text-sm"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Only .docx template files are supported. Needs to contain tags like {"{{companyName}}"}, {"{{customerName}}"}, {"{{totalAmount}}"}, etc.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTemplateModal(false)}
                  disabled={submittingTemplate}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTemplate}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingTemplate ? "Uploading..." : "Upload Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FOR EDITING COMPANY DETAILS */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Edit Company Profile Settings</h3>
              <button
                onClick={() => setShowCompanyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium"
              >
                ✕ Close
              </button>
            </div>
            
            <form onSubmit={handleSaveAccount} className="overflow-y-auto p-6 space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.companyName || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, companyName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.companyTaxId || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, companyTaxId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Email</label>
                  <input
                    type="email"
                    required
                    value={editCompanyData.companyEmail || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, companyEmail: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Phone</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.companyPhone || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, companyPhone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Website</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.companyWebsite || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, companyWebsite: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Register Office Address</label>
                <textarea
                  required
                  rows={2}
                  value={editCompanyData.companyAddressReg || ""}
                  onChange={(e) => setEditCompanyData({ ...editCompanyData, companyAddressReg: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Corporate Office Address</label>
                <textarea
                  required
                  rows={2}
                  value={editCompanyData.companyAddress || ""}
                  onChange={(e) => setEditCompanyData({ ...editCompanyData, companyAddress: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm resize-none"
                />
              </div>

              <hr className="border-slate-100" />
              <h3 className="text-sm font-semibold text-slate-800">GST Invoice Bank Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.gstBankName || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, gstBankName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.gstBankAccount || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, gstBankAccount: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.gstBankIfsc || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, gstBankIfsc: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
              </div>

              <hr className="border-slate-100" />
              <h3 className="text-sm font-semibold text-slate-800">Non-GST Invoice Bank & Payment Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.nongstBankName || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, nongstBankName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.nongstBankAccount || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, nongstBankAccount: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.nongstBankIfsc || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, nongstBankIfsc: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">PAN Number</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.pan || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, pan: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">UPI ID (GPAY QR Code)</label>
                  <input
                    type="text"
                    required
                    value={editCompanyData.upiId || ""}
                    onChange={(e) => setEditCompanyData({ ...editCompanyData, upiId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  disabled={savingCompany}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCompany}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {savingCompany ? "Saving..." : "Save Details"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
}

export default Settings;

