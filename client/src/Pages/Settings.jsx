import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import useBodyScrollLock from "../utils/useBodyScrollLock";
import {
  HiOutlineUser,
  HiOutlineBuildingOffice,
  HiOutlineHashtag,
  HiOutlineDocumentText,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineInformationCircle,
  HiOutlineArrowPath,
  HiOutlineShieldCheck,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineClock,
  HiOutlineArrowTopRightOnSquare,
} from "react-icons/hi2";
import {
  fetchTemplatesAPI,
  activateTemplateAPI,
  deleteTemplateAPI,
  uploadTemplateAPI,
} from "../API/templateAPI";
import {
  fetchUsersAPI,
  updateUserRoleAPI,
  toggleUserStatusAPI,
  fetchAuditLogsAPI,
} from "../API/authAPI";
import { HiOutlineUserGroup } from "react-icons/hi2";
import {
  fetchCompanySettingsAPI,
  updateCompanySettingsAPI,
} from "../API/companySettingAPI";
import {
  getJobNumberStats,
  syncJobNumberRegistryAPI,
} from "../API/jobNumberAPI";
import { toast } from "../utils/toast";
import { formatDateOnly, formatTimestamp } from "../utils/dateUtils";
import { getErrorMessage } from "../utils/errorHandler";
import ChangePasswordModal from "../Components/ChangePasswordModal";
import { refreshSession, logout } from "../slices/authSlice";

function Settings() {
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);

  // Helper to handle 401 token expiration gracefully
  const executeWithRefresh = async (apiCall) => {
    if (!token) return null;
    try {
      return await apiCall(token);
    } catch (err) {
      if (
        err.message === "Invalid or expired token" ||
        err.message?.toLowerCase().includes("unauthorized") ||
        err.message?.toLowerCase().includes("expired")
      ) {
        try {
          const refreshed = await dispatch(refreshSession()).unwrap();
          if (refreshed?.accessToken) {
            return await apiCall(refreshed.accessToken);
          }
        } catch (refreshErr) {
          dispatch(logout());
          throw new Error("Your session has expired. Please log in again.");
        }
      }
      throw err;
    }
  };

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
    upiId: "8356080548@okbizaxis",
    defaultHsnCode: "998531",
    defaultSacCode: "9985",
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

  // Lock background body scroll when Add Template modal or Edit Company modal is open
  useBodyScrollLock(showAddTemplateModal || showCompanyModal);

  // Load from localStorage on mount (for account settings & prefixes only)
  useEffect(() => {
    const savedAccount = localStorage.getItem("crm_settings_account");
    if (savedAccount) setAccountData(JSON.parse(savedAccount));

    const savedPrefixes = localStorage.getItem("crm_settings_prefixes");
    if (savedPrefixes) setPrefixData(JSON.parse(savedPrefixes));
  }, []);

  // 4. Job Numbers State
  const [jnStats, setJnStats] = useState({
    totalCount: 0,
    assignedCount: 0,
    availableCount: 0,
    legacyCount: 0,
    prefixBreakdown: [],
  });
  const [loadingJnStats, setLoadingJnStats] = useState(false);
  const [syncingRegistry, setSyncingRegistry] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  const loadJnStats = async () => {
    if (!token) return;
    setLoadingJnStats(true);
    try {
      const data = await executeWithRefresh((t) => getJobNumberStats(t));
      if (data) {
        setJnStats({
          totalCount: data.totalCount ?? data.metrics?.total ?? 0,
          assignedCount: data.assignedCount ?? data.metrics?.assigned ?? 0,
          availableCount: data.availableCount ?? data.metrics?.available ?? 0,
          legacyCount: data.legacyCount ?? data.metrics?.legacy ?? 0,
          prefixBreakdown: data.prefixBreakdown || data.alphabetBreakdown || [],
        });
      }
    } catch (err) {
      console.error("Failed to load Job Number statistics:", err);
    } finally {
      setLoadingJnStats(false);
    }
  };

  const handleSyncRegistry = async () => {
    if (!token || syncingRegistry) return;
    setSyncingRegistry(true);
    try {
      const data = await executeWithRefresh((t) => syncJobNumberRegistryAPI(t));
      if (data && data.success) {
        toast.success(data.message || "Job Number registry synchronized successfully!");
        setLastSyncResult(data.result);
        await loadJnStats();
      } else {
        toast.error(getErrorMessage(data?.message, "Failed to synchronize registry"));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to synchronize registry"));
    } finally {
      setSyncingRegistry(false);
    }
  };

  // 5. Users State
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const loadUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const data = await executeWithRefresh((t) => fetchUsersAPI(t));
      if (data?.users) {
        setUsersList(data.users);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRoleChange = async (targetId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole.toUpperCase()}?`)) {
      return;
    }
    try {
      setUpdatingUserId(targetId);
      const data = await executeWithRefresh((t) => updateUserRoleAPI(targetId, newRole, t));
      toast.success(data.message || "Role updated successfully");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Failed to update user role");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleStatusToggle = async (targetId, currentStatus) => {
    const newStatus = !currentStatus;
    const actionText = newStatus ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${actionText} this user's account?`)) {
      return;
    }
    try {
      setUpdatingUserId(targetId);
      const data = await executeWithRefresh((t) => toggleUserStatusAPI(targetId, newStatus, t));
      toast.success(data.message || `User account ${actionText}d successfully`);
      await loadUsers();
    } catch (err) {
      toast.error(err.message || `Failed to ${actionText} user account`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  // 6. Security & Audit State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadAuditLogs = async () => {
    if (!token) return;
    setLoadingAudit(true);
    try {
      const data = await executeWithRefresh((t) => fetchAuditLogsAPI(t));
      if (data?.logs) {
        setAuditLogs(data.logs);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load audit logs");
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === "jobNumbers") {
      loadJnStats();
    } else if (activeTab === "users") {
      loadUsers();
    } else if (activeTab === "audit") {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadCompanySettings = async () => {
    if (!token) return;
    try {
      const data = await executeWithRefresh((t) => fetchCompanySettingsAPI(t));
      if (data && data.success) {
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
            defaultHsnCode: s.defaultHsnCode !== undefined ? s.defaultHsnCode : (prev.defaultHsnCode || ""),
            defaultSacCode: s.defaultSacCode !== undefined ? s.defaultSacCode : (prev.defaultSacCode || ""),
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
      const data = await executeWithRefresh((t) => fetchTemplatesAPI(t));
      if (data && data.success) {
        setTemplates(data.templates);
      } else if (data) {
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

      const data = await executeWithRefresh((t) => updateCompanySettingsAPI(payload, t));
      if (data && data.success) {
        setAccountData(editCompanyData);
        localStorage.setItem("crm_settings_account", JSON.stringify(editCompanyData));
        toast.success("Account & Company profile updated successfully!");
        setShowCompanyModal(false);
      } else if (data) {
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
      toast.warning("Please enter a valid 4-digit year (e.g. 2026) or financial year (e.g. 2026-27).");
      return;
    }

    try {
      const payload = {
        numberingYear: trimmedYear,
      };

      const data = await executeWithRefresh((t) => updateCompanySettingsAPI(payload, t));
      if (data && data.success) {
        if (data.numberingConfig) {
          setNumberingConfig(data.numberingConfig);
        }
        toast.success("Numbering year updated successfully!");
        loadCompanySettings();
      } else if (data) {
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
      const data = await executeWithRefresh((t) => activateTemplateAPI(templateId, t));
      if (data && data.success) {
        toast.success("Template activated successfully!");
        loadTemplates();
      } else if (data) {
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
    if (extension !== 'docx' && extension !== 'pdf') {
      toast.warning("Only .docx and .pdf template files are allowed!");
      return;
    }

    setSubmittingTemplate(true);
    const formData = new FormData();
    formData.append("documentType", newTemplate.module);
    formData.append("templateName", newTemplate.name);
    formData.append("template", file);

    try {
      const data = await executeWithRefresh((t) => uploadTemplateAPI(formData, t));
      if (data && data.success) {
        toast.success("Template uploaded and activated successfully!");
        setShowAddTemplateModal(false);
        setNewTemplate({ module: "invoice", name: "", file: null });
        loadTemplates();
      } else if (data) {
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
      const data = await executeWithRefresh((t) => deleteTemplateAPI(id, t));
      if (data && data.success) {
        toast.success("Template deleted successfully!");
        loadTemplates();
      } else if (data) {
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
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${
              activeTab === "templates"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineDocumentText className="size-5" />
            Template Settings
          </button>
          <button
            onClick={() => setActiveTab("jobNumbers")}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${
              activeTab === "jobNumbers"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineHashtag className="size-5" />
            Job Numbers
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${
              activeTab === "users"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineUserGroup className="size-5" />
            User Management
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${
              activeTab === "audit"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HiOutlineShieldCheck className="size-5" />
            Security & Audit
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

                  {/* Tax & Invoice Defaults */}
                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">Tax & Invoice Defaults</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Default HSN Code</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.defaultHsnCode || "Not Set"}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Default SAC Code</span>
                        <span className="text-xs text-slate-700 font-mono block mt-1">{accountData.defaultSacCode || "Not Set"}</span>
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
                        Change your login password with secure email verification code delivered to your registered email
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
                      placeholder="e.g. 2026 or 2026-27"
                    />
                  </div>
                </div>

                {/* Read-Only Previews Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                    <HiOutlineInformationCircle className="size-5 text-blue-600" />
                    <span>Live Document Previews (Read-Only)</span>
                  </div>

                  {(() => {
                    const baseYearStr = String(numberingYear || new Date().getFullYear()).split("-")[0].trim();
                    const baseYearNum = Number(baseYearStr) || new Date().getFullYear();
                    const formattedFY = `${baseYearNum}-${String(baseYearNum + 1).slice(-2)}`;

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* 1. Non-GST Invoice */}
                        <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Invoice — Non-GST
                            </span>
                            <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                              Fixed: SPMJ/
                            </span>
                          </div>
                          <div className="font-mono text-sm font-bold text-blue-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                            {numberingConfig?.previews?.NON_GST_INVOICE?.sample ||
                              `SPMJ/01/${formattedFY}`}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Non-GST financial year sequential series (e.g. 2026-27)
                          </p>
                        </div>

                        {/* 2. Tax Invoice - GST */}
                        <div className="border border-slate-200/80 rounded-xl p-4 bg-white shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Tax Invoice — GST
                            </span>
                            <span className="text-[10px] bg-cyan-50 text-cyan-700 font-bold px-2 py-0.5 rounded-full">
                              Fixed: SPM/
                            </span>
                          </div>
                          <div className="font-mono text-sm font-bold text-cyan-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                            {numberingConfig?.previews?.GST_INVOICE?.sample ||
                              `SPM/01/${formattedFY}`}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            GST tax invoice financial year sequential series (e.g. 2026-27)
                          </p>
                        </div>

                        {/* 3. PC Quotation */}
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
                              `SPM/PC/${baseYearStr}/01`}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Pest Control quotation series
                          </p>
                        </div>

                        {/* 4. ATT Quotation */}
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
                              `SPM/ATT/${baseYearStr}/01`}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Anti-Termite Treatment quotation series
                          </p>
                        </div>

                        {/* 5. Contract Renewal */}
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
                              `SPM/CR/${baseYearStr}/01`}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Yearly contract renewal series
                          </p>
                        </div>

                        {/* 6. One Time Job */}
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
                              `Job No/${baseYearStr}/01`}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Single execution one-time job series
                          </p>
                        </div>
                      </div>
                    );
                  })()}
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
                          <p className="text-xs text-slate-500 mt-0.5">Select active template or upload new DOCX or PDF templates</p>
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
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-semibold text-slate-800">{tpl.templateName}</h4>
                                        <span
                                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            tpl.mimeType === "application/pdf" || tpl.fileName?.toLowerCase().endsWith(".pdf")
                                              ? "bg-red-50 text-red-700 border border-red-200"
                                              : "bg-blue-50 text-blue-700 border border-blue-200"
                                          }`}
                                        >
                                          {tpl.mimeType === "application/pdf" || tpl.fileName?.toLowerCase().endsWith(".pdf") ? "PDF" : "DOCX"}
                                        </span>
                                      </div>
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
                                        Uploaded: {formatDateOnly(tpl.createdAt)}
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

          {/* TAB 4: JOB NUMBERS SETTINGS & REGISTRY */}
          {activeTab === "jobNumbers" && (
            <div className="space-y-6">
              {/* CARD 1: ALLOCATION STRATEGY & BUSINESS RULES */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <HiOutlineHashtag className="text-blue-600 size-6" />
                      Job Number Allocation Strategy & System Architecture
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Rules, constraints, and operational mechanisms governing AMC customer code allocation
                    </p>
                  </div>
                  <Link
                    to="/job-numbers"
                    className="self-start sm:self-auto flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-3.5 py-2 rounded-xl transition"
                  >
                    <span>Open Full Management</span>
                    <HiOutlineArrowTopRightOnSquare className="size-4" />
                  </Link>
                </div>

                <div className="p-6 space-y-6">
                  {/* Core Rules Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                          <HiOutlineCheckCircle className="size-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Smallest-Available Gap Reuse</h4>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            The allocation engine searches for the lowest numeric vacant slot (e.g. A/03 before A/15) within the matching prefix. New sequential numbers are only created when no vacancies exist.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                          <HiOutlineShieldCheck className="size-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Alphabetical Prefix Isolation</h4>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            Prefixed dynamically from the first valid letter of the customer or company name (A-Z). Each prefix maintains its own isolated counter and vacancy registry to avoid collisions.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                          <HiOutlineExclamationTriangle className="size-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Legacy Format Protection</h4>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            Irregular existing codes (such as A/07X4, P/05A) are flagged as legacy. They are preserved intact with full historical fidelity and never recycled into automatic standard sequences.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                          <HiOutlineClock className="size-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Lifecycle: Release & Restore</h4>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            Soft-deleting or archiving a customer immediately releases their Job Number to the available pool. Restoring reclaims their original slot if still vacant, or safely assigns the next smallest gap.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Isolation Note Banner */}
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/60 flex items-start gap-3 text-xs text-blue-900">
                    <HiOutlineInformationCircle className="size-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <strong className="font-semibold text-blue-950">Strict Document Isolation:</strong> Customer Job Numbers (e.g. A/01) are immutable customer account codes and are completely independent from transactional document prefixes (Invoices: INV-, Quotations: QTN-, Renewals: REN-). Modifying document prefix settings will never alter or resequence customer Job Numbers.
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: SUMMARY METRICS & ALPHABETICAL COUNTERS (A-Z) */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <HiOutlineHashtag className="text-blue-600" />
                      Alphabetical Sequence Overview & Slot Occupancy (A-Z)
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Real-time status of atomic sequence counters, occupied accounts, and available slots across all 26 letters
                    </p>
                  </div>
                  <button
                    onClick={loadJnStats}
                    disabled={loadingJnStats}
                    className="self-start sm:self-auto flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
                  >
                    <HiOutlineArrowPath className={`size-4 ${loadingJnStats ? "animate-spin" : ""}`} />
                    <span>Refresh Overview</span>
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* KPI Mini Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase">Total Managed Slots</p>
                      <p className="text-2xl font-black text-slate-900 mt-1 font-mono">{jnStats.totalCount}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                      <p className="text-xs font-bold text-emerald-700 uppercase">Available for Reuse</p>
                      <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">{jnStats.availableCount}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                      <p className="text-xs font-bold text-blue-700 uppercase">Currently Assigned</p>
                      <p className="text-2xl font-black text-blue-600 mt-1 font-mono">{jnStats.assignedCount}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100">
                      <p className="text-xs font-bold text-amber-700 uppercase">Legacy Formats</p>
                      <p className="text-2xl font-black text-amber-600 mt-1 font-mono">{jnStats.legacyCount}</p>
                    </div>
                  </div>

                  {/* 26 Letters Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px] sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3">Prefix</th>
                            <th className="px-4 py-3">Assigned Slots</th>
                            <th className="px-4 py-3">Vacant Slots (Reuse)</th>
                            <th className="px-4 py-3">Legacy Formats</th>
                            <th className="px-4 py-3">Total Managed</th>
                            <th className="px-4 py-3 text-right">Registry Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {jnStats.prefixBreakdown.map((row) => (
                            <tr key={row.prefix} className="hover:bg-slate-50/80 transition">
                              <td className="px-4 py-2.5 font-bold font-mono text-slate-900 text-sm">
                                <span className="size-7 inline-flex items-center justify-center rounded-lg bg-blue-50 text-blue-700 border border-blue-200/50">
                                  {row.prefix}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-slate-700 font-bold">
                                {row.assigned}
                              </td>
                              <td className="px-4 py-2.5">
                                {row.available > 0 ? (
                                  <span className="inline-flex items-center gap-1 font-bold font-mono px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {row.available} ready
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono">0</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-amber-600">
                                {row.legacy > 0 ? `${row.legacy} legacy` : "—"}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-slate-600">
                                {row.total}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  <span className="size-1.5 rounded-full bg-emerald-500"></span>
                                  Synchronized
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 3: REGISTRY SYNCHRONIZATION & REPAIR */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <HiOutlineArrowPath className="text-blue-600" />
                    Registry & Sequence Synchronization
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Perform administrative reconciliation between customer records, slot occupancy, and atomic sequence counters
                  </p>
                </div>

                <div className="p-6 space-y-5">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">Synchronize Registry & Sequences</h4>
                      <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                        Scans all active and archived customer records, registers any unindexed Job Numbers into the registry, scans all sequences from 1 to maxSequence to identify and register vacant reusable slots, and aligns atomic sequence counters across all prefixes A-Z.
                      </p>
                    </div>

                    <button
                      onClick={handleSyncRegistry}
                      disabled={syncingRegistry}
                      className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs px-5 py-3 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <HiOutlineArrowPath className={`size-4 ${syncingRegistry ? "animate-spin" : ""}`} />
                      <span>{syncingRegistry ? "Synchronizing Registry..." : "Synchronize Registry & Sequences"}</span>
                    </button>
                  </div>

                  {lastSyncResult && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                      <HiOutlineCheckCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-emerald-950">Last Synchronization Succeeded</p>
                        <p className="mt-0.5 text-emerald-800">
                          Total managed slots: <strong className="font-mono">{lastSyncResult.totalManaged}</strong> ({lastSyncResult.assigned} assigned, {lastSyncResult.available} vacant ready for reuse, {lastSyncResult.legacy} legacy). All {lastSyncResult.sequencesSynced} prefix sequences verified.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: USER MANAGEMENT */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <HiOutlineUserGroup className="text-blue-600" />
                      CRM Users & Access Roles
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Manage registered CRM user roles, promote Employees to Admin, or toggle account status.
                    </p>
                  </div>
                  <button
                    onClick={loadUsers}
                    disabled={loadingUsers}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <HiOutlineArrowPath className={`size-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                <div className="p-6">
                  {loadingUsers ? (
                    <div className="py-12 text-center text-slate-500 text-sm">Loading users...</div>
                  ) : usersList.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">No registered users found</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">User</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-4">Phone</th>
                            <th className="py-3 px-4">Role</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Verified</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {usersList.map((u) => {
                            const isCurrentUser = user?._id === u.id || user?.id === u.id;
                            const isUserAdmin = u.role === "admin";
                            const isBusy = updatingUserId === u.id;

                            return (
                              <tr key={u.id} className="hover:bg-slate-50/70 transition">
                                <td className="py-3.5 px-4 font-semibold text-slate-900">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className={`size-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                                        isUserAdmin ? "bg-red-600" : "bg-blue-600"
                                      }`}
                                    >
                                      {u.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div>
                                      <span>{u.name}</span>
                                      {isCurrentUser && (
                                        <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                          You
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{u.email}</td>
                                <td className="py-3.5 px-4 text-slate-600">{u.phone || "—"}</td>
                                <td className="py-3.5 px-4">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border ${
                                      isUserAdmin
                                        ? "bg-red-50 text-red-700 border-red-200"
                                        : "bg-blue-50 text-blue-700 border-blue-200"
                                    }`}
                                  >
                                    {u.role}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      u.isActive !== false
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                    }`}
                                  >
                                    {u.isActive !== false ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span
                                    className={`text-xs font-medium ${
                                      u.isVerified ? "text-emerald-600" : "text-amber-600"
                                    }`}
                                  >
                                    {u.isVerified ? "✓ Verified" : "⏳ Pending OTP"}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => handleRoleChange(u.id, isUserAdmin ? "employee" : "admin")}
                                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                                        isUserAdmin
                                          ? "border-slate-300 text-slate-700 hover:bg-slate-100"
                                          : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                                      }`}
                                    >
                                      {isBusy
                                        ? "Updating..."
                                        : isUserAdmin
                                        ? "Demote to Employee"
                                        : "Promote to Admin"}
                                    </button>

                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => handleStatusToggle(u.id, u.isActive !== false)}
                                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                                        u.isActive !== false
                                          ? "border-red-200 text-red-600 hover:bg-red-50"
                                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                      }`}
                                    >
                                      {u.isActive !== false ? "Deactivate" : "Activate"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SECURITY & AUDIT LOGS */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                <div className="border-b border-slate-100 p-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <HiOutlineShieldCheck className="text-red-600" />
                      Security Audit Trail
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Chronological audit log recording logins, logouts, role updates, and privileged operations.
                    </p>
                  </div>
                  <button
                    onClick={loadAuditLogs}
                    disabled={loadingAudit}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <HiOutlineArrowPath className={`size-3.5 ${loadingAudit ? "animate-spin" : ""}`} />
                    Refresh Logs
                  </button>
                </div>

                <div className="p-6">
                  {loadingAudit ? (
                    <div className="py-12 text-center text-slate-500 text-sm">Loading audit logs...</div>
                  ) : auditLogs.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">No audit logs recorded yet</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="py-3 px-3">Timestamp</th>
                            <th className="py-3 px-3">Actor</th>
                            <th className="py-3 px-3">Action</th>
                            <th className="py-3 px-3">Module</th>
                            <th className="py-3 px-3">Status</th>
                            <th className="py-3 px-3">IP Address</th>
                            <th className="py-3 px-3">Metadata</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditLogs.map((log) => (
                            <tr key={log._id} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                                {formatTimestamp ? formatTimestamp(log.createdAt) : new Date(log.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-medium text-slate-900 block">{log.userEmail || "Anonymous"}</span>
                                <span className="text-[10px] text-slate-400 capitalize">{log.userRole}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{log.action}</td>
                              <td className="py-2.5 px-3 font-medium text-slate-600">{log.module}</td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    log.status === "SUCCESS"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : log.status === "BLOCKED"
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-red-50 text-red-700 border border-red-200"
                                  }`}
                                >
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">{log.ipAddress || "—"}</td>
                              <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                                {log.details ? JSON.stringify(log.details) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL FOR ADDING NEW TEMPLATES */}
      {showAddTemplateModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget && !submittingTemplate) {
                setShowAddTemplateModal(false);
              }
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col my-auto animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
                <h3 className="text-base font-bold text-slate-900">
                  Add New Document Template (DOCX or PDF)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddTemplateModal(false)}
                  disabled={submittingTemplate}
                  className="text-slate-400 hover:text-slate-600 text-sm font-medium disabled:opacity-50 cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>
              <form
                onSubmit={handleAddTemplate}
                className="p-6 space-y-4 overflow-y-auto flex-1"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Target Document Module
                    </label>
                    <select
                      value={newTemplate.module}
                      onChange={(e) =>
                        setNewTemplate({ ...newTemplate, module: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-600 text-sm"
                    >
                      <option value="invoice">Invoice (NON-GST)</option>
                      <option value="tax-invoice">Tax Invoice (GST)</option>
                      <option value="quotation">PC Quotation</option>
                      <option value="att-quotation">ATT Quotation</option>
                      <option value="contract-renewal">Contract Renewal</option>
                      <option value="one-time-job">
                        One Time Job Service Paper
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Template Label Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Samarth Invoice Modern"
                      value={newTemplate.name}
                      onChange={(e) =>
                        setNewTemplate({ ...newTemplate, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Template File (.docx or .pdf)
                  </label>
                  <input
                    type="file"
                    required
                    accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      setNewTemplate({ ...newTemplate, file });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-600 text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Upload a .docx or .pdf template file. Needs to contain placeholders like {"{companyName}"}, {"{customerName}"}, {"{totalAmount}"}, etc.
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
          </div>,
          document.body
        )}

      {/* MODAL FOR EDITING COMPANY DETAILS */}
      {showCompanyModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget && !savingCompany) {
                setShowCompanyModal(false);
              }
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col my-auto animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
                <h3 className="text-base font-bold text-slate-900">
                  Edit Company Profile Settings
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  disabled={savingCompany}
                  className="text-slate-400 hover:text-slate-600 text-sm font-medium disabled:opacity-50 cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              <form
                onSubmit={handleSaveAccount}
                className="overflow-y-auto p-6 space-y-5 flex-1"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Company Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.companyName || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          companyName: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Tax ID / GSTIN
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.companyTaxId || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          companyTaxId: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Company Email
                    </label>
                    <input
                      type="email"
                      required
                      value={editCompanyData.companyEmail || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          companyEmail: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Company Phone
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.companyPhone || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          companyPhone: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Company Website
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.companyWebsite || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          companyWebsite: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Register Office Address
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={editCompanyData.companyAddressReg || ""}
                    onChange={(e) =>
                      setEditCompanyData({
                        ...editCompanyData,
                        companyAddressReg: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Corporate Office Address
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={editCompanyData.companyAddress || ""}
                    onChange={(e) =>
                      setEditCompanyData({
                        ...editCompanyData,
                        companyAddress: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm resize-none"
                  />
                </div>

                <hr className="border-slate-100" />
                <h3 className="text-sm font-semibold text-slate-800">
                  GST Invoice Bank Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.gstBankName || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          gstBankName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.gstBankAccount || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          gstBankAccount: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.gstBankIfsc || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          gstBankIfsc: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                </div>

                <hr className="border-slate-100" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Non-GST Invoice Bank & Payment Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.nongstBankName || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          nongstBankName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.nongstBankAccount || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          nongstBankAccount: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.nongstBankIfsc || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          nongstBankIfsc: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      PAN Number
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.pan || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          pan: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      UPI ID (GPAY QR Code)
                    </label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.upiId || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          upiId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs"
                    />
                  </div>
                </div>

                <hr className="border-slate-100" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Tax & Invoice Defaults
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Default HSN Code
                    </label>
                    <input
                      type="text"
                      value={editCompanyData.defaultHsnCode || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          defaultHsnCode: e.target.value,
                        })
                      }
                      placeholder="e.g. 998531"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Default SAC Code
                    </label>
                    <input
                      type="text"
                      value={editCompanyData.defaultSacCode || ""}
                      onChange={(e) =>
                        setEditCompanyData({
                          ...editCompanyData,
                          defaultSacCode: e.target.value,
                        })
                      }
                      placeholder="e.g. 9985"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-xs font-mono"
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
          </div>,
          document.body
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

