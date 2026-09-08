import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { createInvoice } from "../slices/invoiceSlice";
import { fetchCustomers } from "../slices/customerSlice";
import { fetchServices } from "../slices/serviceSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function CreateInvoiceModal({
  isOpen,
  onClose,
  initialCustomer = null,
  onCreated,
}) {
  const dispatch = useDispatch();
  const [showCustomers, setShowCustomers] = useState(false);

  const [customerSearch, setCustomerSearch] = useState(
    initialCustomer?.fullName || "",
  );

  const { customers = [] } = useSelector((state) => state.customer);

  const { services = [] } = useSelector((state) => state.services);

  const [formData, setFormData] = useState({
    invoiceType: "GST",
    customerId: initialCustomer?._id || "",
    services: [],
    workOrderNumber: "",
    workOrderDate: "",
    gstNumber: "",
    particulars:
      "Being Charges for pest management service rendered as details mentioned below.",
    premisesTreated: "",
    treatmentType: "",
    hsnCode: "",
    sacCode: "",
    amountInWords: "",
    cgstPercentage: 9,
    sgstPercentage: 9,
    igstPercentage: 0,
    dueDate: "",
    notes: "",
  });

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchCustomers());
      dispatch(fetchServices());
    }
  }, [dispatch, isOpen]);

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
        : { cgstPercentage: 9, sgstPercentage: 9, igstPercentage: 0 }),
    }));
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

  const subtotal = selectedServices.reduce(
    (sum, service) => sum + service.amount,
    0,
  );

  const isGstInvoice = formData.invoiceType === "GST";
  const cgst = isGstInvoice ? (subtotal * Number(formData.cgstPercentage)) / 100 : 0;

  const sgst = isGstInvoice ? (subtotal * Number(formData.sgstPercentage)) / 100 : 0;

  const igst = isGstInvoice ? (subtotal * Number(formData.igstPercentage)) / 100 : 0;

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
      await dispatch(
        createInvoice({
          ...formData,
          amountInWords: displayAmountInWords,
        }),
      ).unwrap();

      onCreated?.();
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
          <h2 className="text-2xl font-bold">Create Invoice</h2>

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
              disabled={Boolean(initialCustomer)}
              required
            />

            {showCustomers && customerSearch.trim() !== "" && (
              <div className="absolute z-50 w-full bg-white border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg">
                {customers?.filter((customer) =>
                  customer.fullName
                    .toLowerCase()
                    .includes(customerSearch.toLowerCase()),
                ).length > 0 ? (
                  customers
                    .filter((customer) =>
                      customer.fullName
                        .toLowerCase()
                        .includes(customerSearch.toLowerCase()),
                    )
                    .map((customer) => (
                      <div
                        key={customer._id}
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            customerId: customer._id,
                          }));

                          setCustomerSearch(customer.fullName);
                          setShowCustomers(false);
                        }}
                        className="p-3 hover:bg-slate-100 cursor-pointer"
                      >
                        <div className="font-medium">{customer.fullName}</div>

                        <div className="text-sm text-gray-500">
                          {customer.phone}
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

          {formData.customerId && (
            <div>
              <label className="block font-medium mb-2">Services</label>

              <div className="grid md:grid-cols-2 gap-3 border rounded-lg p-4">
                {availableServices.map((service) => (
                  <label key={service._id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.services.includes(service._id)}
                      onChange={() => handleServiceToggle(service._id)}
                    />

                    <span>
                      {service.serviceName}
                      {" • "}₹{service.amount}
                      {" • "}
                      {service.status}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

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

            {isGstInvoice && <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-2">HSN Code</label>

                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3"
                />
              </div>

              <div>
                <label className="block mb-2">SAC Code</label>

                <input
                  type="text"
                  name="sacCode"
                  value={formData.sacCode}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3"
                />
              </div>
            </div>}
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

          {isGstInvoice && <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block mb-2">CGST %</label>

              <input
                type="number"
                name="cgstPercentage"
                value={formData.cgstPercentage}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>

            <div>
              <label className="block mb-2">SGST %</label>

              <input
                type="number"
                name="sgstPercentage"
                value={formData.sgstPercentage}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>

            <div>
              <label className="block mb-2">IGST %</label>

              <input
                type="number"
                name="igstPercentage"
                value={formData.igstPercentage}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>
          </div>}

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

              {isGstInvoice && <>
                <div>CGST: ₹{cgst.toFixed(2)}</div>
                <div>SGST: ₹{sgst.toFixed(2)}</div>
                <div>IGST: ₹{igst.toFixed(2)}</div>
              </>}

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
