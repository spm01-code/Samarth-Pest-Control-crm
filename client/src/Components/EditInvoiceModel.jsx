import { useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch } from "react-redux";
import { updateInvoice } from "../slices/invoiceSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

const formatDateForInput = (date) => {
  if (!date) return "";

  return new Date(date).toISOString().slice(0, 10);
};

const getInitialFormData = (invoice) => {
  return {
    invoiceType: invoice?.invoiceType || "GST",
    dueDate: formatDateForInput(invoice?.dueDate),
    workOrderNumber: invoice?.workOrderNumber || "",
    workOrderDate: formatDateForInput(invoice?.workOrderDate),
    gstNumber: invoice?.gstNumber || "",
    particulars: invoice?.particulars || "",
    premisesTreated: invoice?.premisesTreated || "",
    treatmentType: invoice?.treatmentType || "",
    hsnCode: invoice?.hsnCode || "",
    sacCode: invoice?.sacCode || "",
    cgstPercentage: invoice?.tax?.cgstPercentage ?? 0,
    sgstPercentage: invoice?.tax?.sgstPercentage ?? 0,
    igstPercentage: invoice?.tax?.igstPercentage ?? 0,
    amountInWords: invoice?.amountInWords || "",
    paymentStatus: invoice?.paymentStatus || "Pending",
    paymentMethod: invoice?.paymentMethod || "",
    amountPaid: invoice?.amountPaid || 0,
    paymentDate: formatDateForInput(invoice?.paymentDate),
    transactionReference:
      invoice?.transactionReference || "",
    notes: invoice?.notes || "",
    pdfFileName: invoice?.pdfFileName || "",
    pdfPath: invoice?.pdfPath || "",
    status: invoice?.status || "Generated",
  };
};

function EditInvoiceModal({
  isOpen,
  onClose,
  invoice,
  onUpdated,
}) {
  const dispatch = useDispatch();

  const [formData, setFormData] = useState(
    getInitialFormData(invoice)
  );

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const amountPaid = Number(
      formData.amountPaid || 0
    );

    const invoiceData = {
      ...formData,
      amountPaid,
      balanceAmount:
        Number(invoice.totalAmount || 0) -
        amountPaid,
    };

    if (!invoiceData.paymentMethod) {
      delete invoiceData.paymentMethod;
    }

    try {
      const result = await dispatch(
        updateInvoice({
          id: invoice._id,
          invoiceData,
        })
      );

      if (updateInvoice.fulfilled.match(result)) {
        onUpdated?.();
        onClose();
        toast.success("Invoice updated successfully.");
      } else {
        toast.error(
          getErrorMessage(
            result.payload || result.error,
            "Failed to update invoice. Please try again."
          )
        );
      }
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to update invoice. Please try again."
        )
      );
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-start sm:items-center overflow-y-auto z-50 p-4 sm:p-6 md:p-10">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-5xl p-6 max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            Edit Invoice
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit invoice dialog"
            className="text-xl leading-none text-slate-500 hover:text-slate-800"
          >
            &times;
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <div>
            <label className="block mb-1 font-medium">Invoice Type</label>
            <select name="invoiceType" value={formData.invoiceType} onChange={handleChange} className="w-full max-w-xs border rounded-lg p-2">
              <option value="GST">GST Invoice</option>
              <option value="NON_GST">Without GST</option>
            </select>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block mb-1 font-medium">
                Due Date
              </label>

              <input
                type="date"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Work Order Number
              </label>

              <input
                type="text"
                name="workOrderNumber"
                value={formData.workOrderNumber}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Work Order Date
              </label>

              <input
                type="date"
                name="workOrderDate"
                value={formData.workOrderDate}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {formData.invoiceType === "GST" && <div>
              <label className="block mb-1 font-medium">
                Customer GST Number
              </label>

              <input
                type="text"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>}

            <div>
              <label className="block mb-1 font-medium">
                Premises Treated
              </label>

              <input
                type="text"
                name="premisesTreated"
                value={formData.premisesTreated}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Treatment Type
              </label>

              <input
                type="text"
                name="treatmentType"
                value={formData.treatmentType}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            {formData.invoiceType === "GST" && <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-medium">
                  HSN Code
                </label>

                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">
                  SAC Code
                </label>

                <input
                  type="text"
                  name="sacCode"
                  value={formData.sacCode}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-2"
                />
              </div>
            </div>}
          </div>

          <div>
            <label className="block mb-1 font-medium">
              Particulars
            </label>

            <textarea
              rows="3"
              name="particulars"
              value={formData.particulars}
              onChange={handleChange}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">
              Amount In Words
            </label>

            <input
              type="text"
              name="amountInWords"
              value={formData.amountInWords}
              onChange={handleChange}
              className="w-full border rounded-lg p-2"
            />
          </div>

          {formData.invoiceType === "GST" && (
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block mb-1 font-medium">CGST %</label>
                <input type="number" min="0" step="0.01" name="cgstPercentage" value={formData.cgstPercentage} onChange={handleChange} className="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block mb-1 font-medium">SGST %</label>
                <input type="number" min="0" step="0.01" name="sgstPercentage" value={formData.sgstPercentage} onChange={handleChange} className="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block mb-1 font-medium">IGST %</label>
                <input type="number" min="0" step="0.01" name="igstPercentage" value={formData.igstPercentage} onChange={handleChange} className="w-full border rounded-lg p-2" />
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block mb-1 font-medium">
                Payment Status
              </label>

              <select
                name="paymentStatus"
                value={formData.paymentStatus}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              >
                <option value="Pending">Pending</option>
                <option value="Partially Paid">
                  Partially Paid
                </option>
                <option value="Paid">Paid</option>
                <option value="Overdue">Overdue</option>
                <option value="Cancelled">
                  Cancelled
                </option>
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Payment Method
              </label>

              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              >
                <option value="">Select Method</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">
                  Bank Transfer
                </option>
                <option value="Cheque">Cheque</option>
                <option value="Card">Card</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Amount Paid
              </label>

              <input
                type="number"
                name="amountPaid"
                value={formData.amountPaid}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Payment Date
              </label>

              <input
                type="date"
                name="paymentDate"
                value={formData.paymentDate}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Transaction Reference
              </label>

              <input
                type="text"
                name="transactionReference"
                value={formData.transactionReference}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Invoice Status
              </label>

              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              >
                <option value="Draft">Draft</option>
                <option value="Generated">
                  Generated
                </option>
                <option value="Sent">Sent</option>
                <option value="Cancelled">
                  Cancelled
                </option>
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 font-medium">
                PDF File Name
              </label>

              <input
                type="text"
                name="pdfFileName"
                value={formData.pdfFileName}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                PDF Path
              </label>

              <input
                type="text"
                name="pdfPath"
                value={formData.pdfPath}
                onChange={handleChange}
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 font-medium">
              Notes
            </label>

            <textarea
              rows="4"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default EditInvoiceModal;
