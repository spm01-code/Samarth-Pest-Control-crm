import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { createInvoice } from "../slices/invoiceSlice";
import { fetchCustomers } from "../slices/customerSlice";
import { fetchServices } from "../slices/serviceSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { fetchCompanySettingsAPI } from "../API/companySettingAPI";
import ServiceSelectDropdown from "./ServiceSelectDropdown";
import { useScrollLock } from "../hooks/useScrollLock";

function CreateInvoiceModal({
  isOpen,
  onClose,
  initialCustomer = null,
  initialService = null,
  onCreated,
}) {
  useScrollLock(isOpen);
  const dispatch = useDispatch();
  const [showCustomers, setShowCustomers] = useState(false);

  const activeCustomer = initialCustomer || initialService?.customer;
  const initialCustName =
    (typeof activeCustomer === "object" && (activeCustomer?.fullName || activeCustomer?.customerName)) ||
    initialService?.customerSnapshot?.fullName ||
    initialService?.customerSnapshot?.customerName ||
    initialService?.customerName ||
    "";
  const initialCustId = typeof activeCustomer === "object" ? activeCustomer?._id : activeCustomer || "";

  const [customerSearch, setCustomerSearch] = useState(initialCustName);

  const { customers = [] } = useSelector((state) => state.customer);
  const { services = [] } = useSelector((state) => state.services);
  const token = useSelector((state) => state.auth?.token);

  const [companyDefaults, setCompanyDefaults] = useState({
    hsn: "",
    sac: "",
  });

  const [formData, setFormData] = useState({
    invoiceType: "GST",
    customerId: initialCustId,
    services: initialService?._id ? [initialService._id] : [],
    customServices: [],
    workOrderNumber: "",
    workOrderDate: "",
    gstNumber: "",
    particulars:
      "Being Charges for pest management service rendered as details mentioned below.",
    billingPeriod: "",
    contractPeriod: "",
    premisesTreated: initialService?.address || "",
    treatmentType: initialService?.serviceName || "",
    hsnCode: "",
    sacCode: "",
    amountInWords: "",
    cgstPercentage: 9,
    sgstPercentage: 9,
    igstPercentage: 0,
    taxMode: "INTRA_STATE",
    dueDate: "",
    notes: "",
  });

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchCustomers());
      dispatch(fetchServices());

      const currentCustomer = initialCustomer || initialService?.customer;
      const custId = typeof currentCustomer === "object" ? currentCustomer?._id : currentCustomer || "";
      const custName =
        (typeof currentCustomer === "object" && (currentCustomer?.fullName || currentCustomer?.customerName)) ||
        initialService?.customerSnapshot?.fullName ||
        initialService?.customerSnapshot?.customerName ||
        initialService?.customerName ||
        "";

      if (custName) {
        setCustomerSearch(custName);
      }

      setFormData((prev) => {
        const currentServiceIds = Array.isArray(prev.services) ? [...prev.services] : [];
        if (initialService?._id && !currentServiceIds.includes(initialService._id)) {
          currentServiceIds.push(initialService._id);
        }
        return {
          ...prev,
          customerId: custId || prev.customerId,
          services: currentServiceIds,
          premisesTreated: prev.premisesTreated || initialService?.address || "",
          treatmentType: prev.treatmentType || initialService?.serviceName || "",
        };
      });

      if (token) {
        fetchCompanySettingsAPI(token)
          .then((data) => {
            if (data?.success && data?.settings) {
              const hsn = data.settings.defaultHsnCode || "998531";
              const sac = data.settings.defaultSacCode || "9985";
              setCompanyDefaults({ hsn, sac });
              setFormData((prev) => ({
                ...prev,
                hsnCode: prev.hsnCode || hsn,
                sacCode: prev.sacCode || sac,
              }));
            }
          })
          .catch((err) => {
            console.error("Failed to load company tax settings:", err);
          });
      }
    }
  }, [dispatch, isOpen, initialCustomer, initialService, token]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleInvoiceTypeChange = (invoiceType) => {
    setFormData((current) => ({
      ...current,
      invoiceType,
      ...(invoiceType === "NON_GST"
        ? { gstNumber: "", hsnCode: "", sacCode: "", cgstPercentage: 0, sgstPercentage: 0, igstPercentage: 0 }
        : current.taxMode === "INTER_STATE"
        ? { cgstPercentage: 0, sgstPercentage: 0, igstPercentage: 18 }
        : { cgstPercentage: 9, sgstPercentage: 9, igstPercentage: 0 }),
    }));
  };

  const handleTaxModeChange = (mode) => {
    if (mode === "INTER_STATE") {
      const combined =
        Number(formData.cgstPercentage || 0) + Number(formData.sgstPercentage || 0);
      setFormData((prev) => ({
        ...prev,
        taxMode: "INTER_STATE",
        igstPercentage: combined > 0 ? combined : 18,
        cgstPercentage: 0,
        sgstPercentage: 0,
      }));
    } else {
      const igst = Number(formData.igstPercentage || 0);
      const splitRate = igst > 0 ? Number((igst / 2).toFixed(2)) : 9;
      setFormData((prev) => ({
        ...prev,
        taxMode: "INTRA_STATE",
        cgstPercentage: splitRate,
        sgstPercentage: splitRate,
        igstPercentage: 0,
      }));
    }
  };

  const handleServiceToggle = (serviceId) => {
    const exists = formData.services.includes(serviceId);

    if (exists) {
      setFormData({
        ...formData,
        services: formData.services.filter((id) => id !== serviceId),
      });
    } else {
      setFormData({
        ...formData,
        services: [...formData.services, serviceId],
      });
    }
  };

  const selectedServices = services.filter((service) =>
    formData.services.includes(service._id),
  );

  const existingSubtotal = selectedServices.reduce(
    (sum, service) => sum + service.amount,
    0,
  );

  const customSubtotal = (formData.customServices || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  const subtotal = existingSubtotal + customSubtotal;

  const isGstInvoice = formData.invoiceType === "GST";
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const fyStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  const currentFY = `${fyStart}-${String(fyStart + 1).slice(-2)}`;
  const seriesPreview = isGstInvoice
    ? `SPM/01/${currentFY}`
    : `SPMJ/01/${currentFY}`;
  const isInterState = isGstInvoice && formData.taxMode === "INTER_STATE";
  const cgst = isGstInvoice && !isInterState ? (subtotal * Number(formData.cgstPercentage || 0)) / 100 : 0;
  const sgst = isGstInvoice && !isInterState ? (subtotal * Number(formData.sgstPercentage || 0)) / 100 : 0;
  const igst = isGstInvoice && isInterState ? (subtotal * Number(formData.igstPercentage || 0)) / 100 : 0;

  const total = subtotal + cgst + sgst + igst;

  const numberToWords = (amount) => {
    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertBelowHundred = (number) => {
      if (number < 20) return ones[number];

      const ten = Math.floor(number / 10);
      const one = number % 10;

      return `${tens[ten]} ${ones[one]}`.trim();
    };

    const convertBelowThousand = (number) => {
      const hundred = Math.floor(number / 100);
      const rest = number % 100;

      if (hundred && rest) {
        return `${ones[hundred]} Hundred ${convertBelowHundred(rest)}`;
      }

      if (hundred) {
        return `${ones[hundred]} Hundred`;
      }

      return convertBelowHundred(rest);
    };

    const rupees = Math.round(Number(amount || 0));

    if (rupees === 0) return "Zero";

    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const rest = rupees % 1000;

    let words = "";

    if (crore) words += `${convertBelowThousand(crore)} Crore `;
    if (lakh) words += `${convertBelowThousand(lakh)} Lakh `;
    if (thousand) words += `${convertBelowThousand(thousand)} Thousand `;
    if (rest) words += convertBelowThousand(rest);

    return words.trim();
  };

  const generatedAmountInWords = `Rupees ${numberToWords(total)} Only`;

  const displayAmountInWords =
    formData.amountInWords.trim() || generatedAmountInWords;

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const isNonGst = formData.invoiceType === "NON_GST";
      const payload = {
        ...formData,
        amountInWords: displayAmountInWords,
        ...(isNonGst
          ? { cgstPercentage: 0, sgstPercentage: 0, igstPercentage: 0 }
          : formData.taxMode === "INTER_STATE"
          ? { cgstPercentage: 0, sgstPercentage: 0, igstPercentage: Number(formData.igstPercentage || 0) }
          : { cgstPercentage: Number(formData.cgstPercentage || 0), sgstPercentage: Number(formData.sgstPercentage || 0), igstPercentage: 0 }),
      };
      delete payload.taxMode;

      const res = await dispatch(
        createInvoice(payload),
      ).unwrap();

      onCreated?.(res?.invoice || res);
      onClose();
      toast.success("Invoice created successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to create invoice. Please try again."
        )
      );
    }
  };

  if (!isOpen) return null;

  const availableServices = services.filter(
    (service) =>
      service.customer?._id?.toString() ===
        formData.customerId &&
      service.status !== "completed" &&
      service.status !== "cancelled"
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-start sm:items-center overflow-y-auto z-50 p-4 sm:p-6 md:p-10">
      <div className="bg-white rounded-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Create Invoice</h2>
            <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-full font-mono">
              Series: {seriesPreview}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close create invoice dialog"
            className="text-xl leading-none text-slate-500 hover:text-slate-800"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block mb-2 font-medium">Invoice Type</label>
            <div className="inline-flex rounded-lg border p-1" role="group" aria-label="Invoice type">
              <button type="button" onClick={() => handleInvoiceTypeChange("GST")} className={`rounded-md px-4 py-2 text-sm font-medium ${isGstInvoice ? "bg-blue-600 text-white" : "text-gray-700"}`}>GST Invoice</button>
              <button type="button" onClick={() => handleInvoiceTypeChange("NON_GST")} className={`rounded-md px-4 py-2 text-sm font-medium ${!isGstInvoice ? "bg-blue-600 text-white" : "text-gray-700"}`}>Without GST</button>
            </div>
          </div>
          {/* Customer */}

          <div className="relative">
            <label className="block mb-2 font-medium">Customer</label>

            <input
              type="text"
              placeholder="Search Customer..."
              value={customerSearch}
              onChange={(e) => {
                const value = e.target.value;

                setCustomerSearch(value);
                setShowCustomers(value.trim() !== "");
              }}
              className="w-full border rounded-xl p-3"
              disabled={Boolean(initialCustomer || (initialService && initialCustId))}
              required
            />

            {showCustomers && customerSearch.trim() !== "" && (
              <div className="absolute z-50 w-full bg-white border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg">
                {customers?.filter((customer) => {
                  const q = customerSearch.toLowerCase().trim();
                  return (
                    (customer.fullName?.toLowerCase() || "").includes(q) ||
                    (customer.jobNo?.toLowerCase() || "").includes(q) ||
                    (customer.phone?.toLowerCase() || "").includes(q) ||
                    (customer.alternatePhone?.toLowerCase() || "").includes(q) ||
                    (customer.companyName?.toLowerCase() || "").includes(q)
                  );
                }).length > 0 ? (
                  customers
                    .filter((customer) => {
                      const q = customerSearch.toLowerCase().trim();
                      return (
                        (customer.fullName?.toLowerCase() || "").includes(q) ||
                        (customer.jobNo?.toLowerCase() || "").includes(q) ||
                        (customer.phone?.toLowerCase() || "").includes(q) ||
                        (customer.alternatePhone?.toLowerCase() || "").includes(q) ||
                        (customer.companyName?.toLowerCase() || "").includes(q)
                      );
                    })
                    .map((customer) => (
                      <div
                        key={customer._id}
                        onClick={() => {
                          const custGst = customer.gstNumber?.trim();
                          let autoMode = "INTRA_STATE";
                          if (custGst && custGst.length >= 2) {
                            const stateCode = custGst.substring(0, 2);
                            if (/^\d{2}$/.test(stateCode) && stateCode !== "27") {
                              autoMode = "INTER_STATE";
                            }
                          }
                          setFormData((prev) => ({
                            ...prev,
                            customerId: customer._id,
                            services: [],
                            customServices: [],
                            gstNumber: customer.gstNumber || prev.gstNumber || "",
                            taxMode: autoMode,
                            ...(autoMode === "INTER_STATE"
                              ? { igstPercentage: 18, cgstPercentage: 0, sgstPercentage: 0 }
                              : { cgstPercentage: 9, sgstPercentage: 9, igstPercentage: 0 }),
                          }));

                          setCustomerSearch(customer.fullName);
                          setShowCustomers(false);
                        }}
                        className="p-3 hover:bg-slate-100 cursor-pointer"
                      >
                        <div className="font-medium flex justify-between">
                          <span>{customer.fullName}</span>
                          {customer.jobNo && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-700">Job: {customer.jobNo}</span>}
                        </div>

                        <div className="text-sm text-gray-500">
                          {customer.phone || customer.alternatePhone || ""}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-3 text-gray-500">No customer found</div>
                )}
              </div>
            )}
          </div>

          {/* Services */}

          <ServiceSelectDropdown
            customerId={formData.customerId}
            customerServices={availableServices}
            selectedServiceIds={formData.services}
            onServiceToggle={handleServiceToggle}
            customServices={formData.customServices || []}
            onAddCustomService={(customItem) => {
              setFormData((prev) => ({
                ...prev,
                customServices: [...(prev.customServices || []), customItem],
              }));
            }}
            onRemoveCustomService={(customId) => {
              setFormData((prev) => ({
                ...prev,
                customServices: (prev.customServices || []).filter(
                  (item) => item.id !== customId
                ),
              }));
            }}
          />

          {/* Work Order */}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2">Work Order Number</label>

              <input
                type="text"
                name="workOrderNumber"
                value={formData.workOrderNumber}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>

            <div>
              <label className="block mb-2">Work Order Date</label>

              <input
                type="date"
                name="workOrderDate"
                value={formData.workOrderDate}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>
          </div>

          {/* Invoice Content */}

          <div className="grid md:grid-cols-2 gap-4">
            {isGstInvoice && <div>
              <label className="block mb-2">Customer GST Number</label>

              <input
                type="text"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>}

            <div>
              <label className="block mb-2">Premises Treated</label>

              <input
                type="text"
                name="premisesTreated"
                value={formData.premisesTreated}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>

            <div>
              <label className="block mb-2">Treatment Type</label>

              <input
                type="text"
                name="treatmentType"
                value={formData.treatmentType}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>

            <div>
              <label className="block mb-2">Billing Period</label>

              <input
                type="text"
                name="billingPeriod"
                value={formData.billingPeriod}
                onChange={handleChange}
                placeholder="e.g. 01/09/2026 to 30/09/2026"
                className="w-full border rounded-lg p-3"
              />
            </div>

            <div>
              <label className="block mb-2">Contract Period</label>

              <input
                type="text"
                name="contractPeriod"
                value={formData.contractPeriod}
                onChange={handleChange}
                placeholder="e.g. 01/09/2026 to 31/08/2027"
                className="w-full border rounded-lg p-3"
              />
            </div>

            {isGstInvoice && (
              <div className="md:col-span-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Tax Codes (from Company Settings):
                  </span>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-600 font-mono">
                    <span>
                      Default HSN:{" "}
                      <strong>
                        {companyDefaults.hsn || formData.hsnCode || "998531"}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Default SAC:{" "}
                      <strong>
                        {companyDefaults.sac || formData.sacCode || "9985"}
                      </strong>
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">
                  Applied automatically from Company Settings
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block mb-2">Particulars</label>

            <textarea
              rows="3"
              name="particulars"
              value={formData.particulars}
              onChange={handleChange}
              className="w-full border rounded-lg p-3"
            />
          </div>

          <div>
            <label className="block mb-2">Amount In Words</label>

            <input
              type="text"
              name="amountInWords"
              value={formData.amountInWords}
              onChange={handleChange}
              placeholder={generatedAmountInWords}
              className="w-full border rounded-lg p-3"
            />
          </div>

          {/* GST */}

          {isGstInvoice && (
            <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="font-semibold text-slate-800 text-sm">Tax Mode</label>
                <div className="inline-flex rounded-lg border bg-white p-1" role="group" aria-label="Tax mode">
                  <button
                    type="button"
                    onClick={() => handleTaxModeChange("INTRA_STATE")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      formData.taxMode !== "INTER_STATE"
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Intra-State (CGST + SGST)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTaxModeChange("INTER_STATE")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      formData.taxMode === "INTER_STATE"
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Inter-State (IGST)
                  </button>
                </div>
              </div>

              {formData.taxMode === "INTER_STATE" ? (
                <div>
                  <label className="block mb-1 text-xs font-medium text-slate-700">IGST %</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="igstPercentage"
                    value={formData.igstPercentage}
                    onChange={handleChange}
                    className="w-full max-w-xs border rounded-lg p-2.5 bg-white"
                  />
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-slate-700">CGST %</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="cgstPercentage"
                      value={formData.cgstPercentage}
                      onChange={handleChange}
                      className="w-full border rounded-lg p-2.5 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-slate-700">SGST %</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="sgstPercentage"
                      value={formData.sgstPercentage}
                      onChange={handleChange}
                      className="w-full border rounded-lg p-2.5 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Due Date */}

          <div>
            <label className="block mb-2">Due Date</label>

            <input
              type="date"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              className="w-full border rounded-lg p-3"
            />
          </div>

          {/* Notes */}

          <div>
            <label className="block mb-2">Notes</label>

            <textarea
              rows="4"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full border rounded-lg p-3"
            />
          </div>

          {/* Invoice Preview */}

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-4">Invoice Preview</h3>

            <div className="space-y-2">
              <div>Subtotal: ₹{subtotal}</div>

              {isGstInvoice && (
                formData.taxMode === "INTER_STATE" ? (
                  <div>IGST ({formData.igstPercentage}%): ₹{igst.toFixed(2)}</div>
                ) : (
                  <>
                    <div>CGST ({formData.cgstPercentage}%): ₹{cgst.toFixed(2)}</div>
                    <div>SGST ({formData.sgstPercentage}%): ₹{sgst.toFixed(2)}</div>
                  </>
                )
              )}

              <hr />

              <div className="font-bold text-lg">
                Total: ₹{total.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Create Invoice
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default CreateInvoiceModal;
