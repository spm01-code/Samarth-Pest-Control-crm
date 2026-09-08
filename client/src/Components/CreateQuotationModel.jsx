import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCustomers } from "../slices/customerSlice";
import {
  createQuotation,
  updateQuotation,
  fetchQuotations,
} from "../slices/quotationSlice";
import { fetchCompanySettingsAPI } from "../API/companySettingAPI";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

const today = () => new Date().toLocaleDateString("en-CA");

const emptyService = () => ({
  serviceName: "",
  frequency: "",
  cost: "",
});

const emptyTreatment = () => ({
  typeOfTreatment: "Anti Termite Pre-construction Treatment",
  warrantyPeriod: "10 Years",
  chemicalUsed: "",
  serviceCharges: "",
});

const getInitialFormData = (
  initialCustomer,
  initialQuotation = null,
  initialType = "PC",
) => {
  if (initialQuotation) {
    const custId =
      typeof initialQuotation.customer === "object"
        ? initialQuotation.customer?._id
        : initialQuotation.customer;

    const isAtt = initialQuotation.quotationType === "ATT";

    return {
      quotationType: initialQuotation.quotationType || "PC",
      quotationNumber: initialQuotation.quotationNumber || "",
      quotationDate: initialQuotation.quotationDate
        ? new Date(initialQuotation.quotationDate).toISOString().slice(0, 10)
        : today(),
      customer: custId || initialCustomer?._id || "",
      premises: initialQuotation.premises || "",
      services:
        Array.isArray(initialQuotation.services) &&
        initialQuotation.services.length > 0
          ? initialQuotation.services.map((s) => ({
              serviceName: s.serviceName || "",
              frequency: s.frequency || "",
              cost: s.cost ?? "",
            }))
          : [emptyService()],
      paymentTerm:
        initialQuotation.paymentTerm ??
        (isAtt
          ? "Within 10 Days From The Date Of Submission Of invoice"
          : "Within 10 days from invoice submission."),
      billingTerm: initialQuotation.billingTerm || "Monthly",
      notes: initialQuotation.notes || "",
      status: initialQuotation.status || "Draft",
      subject:
        initialQuotation.subject ||
        (isAtt
          ? "Quotation for Anti-termite treatment with 10 Years Warranty for Proposed Construction"
          : ""),
      specification:
        initialQuotation.specification ||
        (isAtt
          ? "Specification: The work shall be carried out in accordance with IS 6313 (Part II)"
          : ""),
      equipment:
        initialQuotation.equipment ||
        (isAtt
          ? "All the equipment, spray pumps, etc., are in working condition and ready for the execution of the work."
          : ""),
      treatments:
        Array.isArray(initialQuotation.treatments) &&
        initialQuotation.treatments.length > 0
          ? initialQuotation.treatments.map((t) => ({
              typeOfTreatment:
                t.typeOfTreatment || "Anti Termite Pre-construction Treatment",
              warrantyPeriod: t.warrantyPeriod || "10 Years",
              chemicalUsed: t.chemicalUsed || "",
              serviceCharges: t.serviceCharges || "",
            }))
          : [emptyTreatment()],
    };
  }

  const isAtt = initialType === "ATT";

  return {
    quotationType: isAtt ? "ATT" : "PC",
    quotationNumber: "",
    quotationDate: today(),
    customer: initialCustomer?._id || "",
    premises: "",
    services: isAtt ? [] : [emptyService()],
    paymentTerm: isAtt
      ? "Within 10 Days From The Date Of Submission Of invoice"
      : "Within 10 days from invoice submission.",
    billingTerm: "Monthly",
    notes: "",
    status: "Draft",
    subject: isAtt
      ? "Quotation for Anti-termite treatment with 10 Years Warranty for Proposed Construction"
      : "",
    specification: isAtt
      ? "Specification: The work shall be carried out in accordance with IS 6313 (Part II)"
      : "",
    equipment: isAtt
      ? "All the equipment, spray pumps, etc., are in working condition and ready for the execution of the work."
      : "",
    treatments: [emptyTreatment()],
  };
};

function CreateQuotationModal({
  isOpen,
  onClose,
  initialCustomer = null,
  initialQuotation = null,
  initialType = "PC",
  onCreated,
  onUpdated,
}) {
  const dispatch = useDispatch();
  const { customers = [] } = useSelector((state) => state.customer);

  const [formData, setFormData] = useState(() =>
    getInitialFormData(initialCustomer, initialQuotation, initialType),
  );
  const [customerSearch, setCustomerSearch] = useState(() => {
    if (initialQuotation?.customer) {
      return (
        initialQuotation.customer?.fullName ||
        initialQuotation.customer?.companyName ||
        ""
      );
    }
    return initialCustomer?.fullName || "";
  });
  const [showCustomers, setShowCustomers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const token = useSelector((state) => state.auth.token);
  const { quotations = [] } = useSelector((state) => state.quotation);

  useEffect(() => {
    if (!isOpen) return;

    dispatch(fetchCustomers());
    dispatch(fetchQuotations());

    if (initialQuotation) {
      setFormData(getInitialFormData(initialCustomer, initialQuotation, initialType));
      const cust = initialQuotation.customer;
      setCustomerSearch(
        typeof cust === "object"
          ? cust?.fullName || cust?.companyName || ""
          : "",
      );
      return;
    }

    setFormData(getInitialFormData(initialCustomer, null, initialType));
    setCustomerSearch(initialCustomer?.fullName || "");
  }, [dispatch, isOpen, initialQuotation, initialCustomer, initialType]);

  const handleClose = () => {
    setFormData(getInitialFormData(initialCustomer, initialQuotation));
    setCustomerSearch(
      initialQuotation?.customer?.fullName || initialCustomer?.fullName || "",
    );
    setShowCustomers(false);
    setSubmitError("");
    onClose();
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "quotationType") {
      setFormData((current) => {
        if (value === "ATT") {
          return {
            ...current,
            quotationType: "ATT",
            paymentTerm:
              current.paymentTerm === "Within 10 days from invoice submission."
                ? "Within 10 Days From The Date Of Submission Of invoice"
                : current.paymentTerm,
            subject:
              current.subject ||
              "Anti Termite Pre-construction Treatment at your site.",
            specification:
              current.specification ||
              "Providing Material and Labour For Injecting Chemical Emulsion For Pre-Constructional Anti Termite Treatment. As Per 6313 (Part II) 2013",
            equipment:
              current.equipment ||
              "Sprayers & Sprinklers Will Be Used To Ensure Proper Penetration Of Chemicals Into the Earth.",
            treatments:
              current.treatments && current.treatments.length > 0
                ? current.treatments
                : [emptyTreatment()],
          };
        }
        return {
          ...current,
          quotationType: "PC",
          paymentTerm:
            current.paymentTerm === "Within 10 Days From The Date Of Submission Of invoice"
              ? "Within 10 days from invoice submission."
              : current.paymentTerm,
          billingTerm: current.billingTerm || "Monthly",
          services:
            current.services && current.services.length > 0
              ? current.services
              : [emptyService()],
        };
      });
      return;
    }
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleServiceChange = (index, event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) =>
        serviceIndex === index ? { ...service, [name]: value } : service,
      ),
    }));
  };

  const addService = () => {
    setFormData((current) => ({
      ...current,
      services: [...current.services, emptyService()],
    }));
  };

  const removeService = (index) => {
    setFormData((current) => ({
      ...current,
      services: current.services.filter(
        (_, serviceIndex) => serviceIndex !== index,
      ),
    }));
  };

  const handleTreatmentChange = (index, event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      treatments: current.treatments.map((treatment, treatmentIndex) =>
        treatmentIndex === index
          ? { ...treatment, [name]: value }
          : treatment,
      ),
    }));
  };

  const addTreatment = () => {
    setFormData((current) => ({
      ...current,
      treatments: [...current.treatments, emptyTreatment()],
    }));
  };

  const removeTreatment = (index) => {
    setFormData((current) => ({
      ...current,
      treatments: current.treatments.filter(
        (_, treatmentIndex) => treatmentIndex !== index,
      ),
    }));
  };

  const totalCost = formData.services.reduce(
    (sum, service) => sum + Number(service.cost || 0),
    0,
  );

  const filteredCustomers = customers.filter((customer) =>
    customer.fullName
      ?.toLowerCase()
      .includes(customerSearch.trim().toLowerCase()),
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitting(true);

    const isAtt = formData.quotationType === "ATT";

    const quotationData = {
      ...formData,
      services: isAtt
        ? []
        : formData.services.map((service) => ({
            ...service,
            cost: Number(service.cost),
          })),
      treatments: isAtt
        ? formData.treatments.map((t) => ({
            typeOfTreatment:
              t.typeOfTreatment || "Anti Termite Pre-construction Treatment",
            warrantyPeriod: t.warrantyPeriod || "",
            chemicalUsed: t.chemicalUsed || "",
            serviceCharges: t.serviceCharges || "",
          }))
        : [],
    };

    try {
      if (initialQuotation?._id) {
        const updated = await dispatch(
          updateQuotation({
            id: initialQuotation._id,
            quotationData,
          }),
        ).unwrap();

        onUpdated?.(updated);
        handleClose();
        toast.success("Quotation updated successfully.");
      } else {
        const quotation = await dispatch(
          createQuotation(quotationData),
        ).unwrap();

        onCreated?.(quotation);
        handleClose();
        toast.success("Quotation created successfully.");
      }
    } catch (error) {
      const fallback = initialQuotation?._id
        ? "Failed to update quotation. Please try again."
        : "Failed to create quotation. Please try again.";
      const cleanMsg = getErrorMessage(error, fallback);
      setSubmitError(cleanMsg);
      toast.error(cleanMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center items-start sm:items-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-10">
      <div className="bg-white rounded-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto my-auto shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {initialQuotation ? "Edit Quotation" : "Create Quotation"}
          </h2>

          <button
            type="button"
            onClick={handleClose}
            className="text-xl text-gray-500 hover:text-gray-800"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block font-medium text-sm">
                Quotation Type
              </label>
              <select
                name="quotationType"
                value={formData.quotationType || "PC"}
                onChange={handleChange}
                disabled={Boolean(initialQuotation)}
                className="w-full rounded-lg border p-3 bg-white outline-none focus:border-blue-600 text-sm"
              >
                <option value="PC">PC Quotation (Pest Control)</option>
                <option value="ATT">ATT Quotation (Anti-Termite)</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block font-medium text-sm">
                Quotation Number
              </label>
              <input
                type="text"
                name="quotationNumber"
                value={
                  initialQuotation
                    ? formData.quotationNumber
                    : "Auto-generated on creation"
                }
                readOnly
                className="w-full rounded-lg border p-3 bg-slate-50 text-slate-500 font-mono text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="mb-2 block font-medium text-sm">
                Quotation Date
              </label>
              <input
                type="date"
                name="quotationDate"
                value={formData.quotationDate}
                onChange={handleChange}
                className="w-full rounded-lg border p-3 text-sm"
                required
              />
            </div>
          </div>

          <div className="relative">
            <label className="mb-2 block font-medium">Customer</label>
            <input
              type="text"
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setFormData((current) => ({ ...current, customer: "" }));
                setShowCustomers(true);
              }}
              onFocus={() => {
                if (!initialCustomer && !initialQuotation) setShowCustomers(true);
              }}
              className="w-full rounded-lg border p-3"
              placeholder="Search customer..."
              disabled={Boolean(initialCustomer || initialQuotation)}
              autoComplete="off"
              required
            />

            {showCustomers && !initialCustomer && !initialQuotation && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <button
                      type="button"
                      key={customer._id}
                      onClick={() => {
                        setFormData((current) => ({
                          ...current,
                          customer: customer._id,
                          premises: current.premises || customer.address || "",
                        }));
                        setCustomerSearch(customer.fullName);
                        setShowCustomers(false);
                      }}
                      className="block w-full p-3 text-left hover:bg-slate-100"
                    >
                      <span className="block font-medium">
                        {customer.fullName}
                      </span>
                      <span className="text-sm text-gray-500">
                        {customer.phone}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-gray-500">No customer found</div>
                )}
              </div>
            )}
          </div>

          {formData.quotationType === "ATT" && (
            <div>
              <label className="mb-2 block font-medium">Subject</label>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
                placeholder="Subject line of quotation"
                required
              />
            </div>
          )}

          <div>
            <label className="mb-2 block font-medium">
              {formData.quotationType === "ATT"
                ? "Premise To Be Treated"
                : "Premises"}
            </label>
            <textarea
              rows="3"
              name="premises"
              value={formData.premises}
              onChange={handleChange}
              className="w-full rounded-lg border p-3"
              placeholder={
                formData.quotationType === "ATT"
                  ? "e.g. Maanicare System (India) Private Limited, JSW - Alibaugh - Raigad"
                  : "Address or description of the premises"
              }
              required
            />
          </div>

          {formData.quotationType === "ATT" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block font-medium">Specification</label>
                <textarea
                  rows="3"
                  name="specification"
                  value={formData.specification}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-3 text-sm"
                  placeholder="Specification of Anti-Termite Treatment"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block font-medium">Equipment</label>
                <textarea
                  rows="3"
                  name="equipment"
                  value={formData.equipment}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-3 text-sm"
                  placeholder="Equipment to be used"
                  required
                />
              </div>
            </div>
          )}

          {formData.quotationType === "ATT" ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <label className="font-medium">Treatments & Chemicals</label>
                  <p className="text-xs text-gray-500">
                    Add chemical options and service charges for Anti-Termite treatment
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addTreatment}
                  className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  + Add Treatment Row
                </button>
              </div>

              <div className="space-y-3">
                {formData.treatments.map((treatment, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border p-4 bg-slate-50/50 md:grid-cols-[1.5fr_1fr_1.5fr_1fr_auto]"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Type Of Treatment
                      </label>
                      <input
                        type="text"
                        name="typeOfTreatment"
                        value={treatment.typeOfTreatment}
                        onChange={(event) =>
                          handleTreatmentChange(index, event)
                        }
                        className="w-full rounded-lg border p-2 bg-white text-sm"
                        placeholder="e.g. Anti Termite Pre-construction Treatment"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Period of Warranty
                      </label>
                      <input
                        type="text"
                        name="warrantyPeriod"
                        value={treatment.warrantyPeriod}
                        onChange={(event) =>
                          handleTreatmentChange(index, event)
                        }
                        className="w-full rounded-lg border p-2 bg-white text-sm"
                        placeholder="e.g. 10 Years"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Chemical Used
                      </label>
                      <input
                        type="text"
                        name="chemicalUsed"
                        value={treatment.chemicalUsed}
                        onChange={(event) =>
                          handleTreatmentChange(index, event)
                        }
                        className="w-full rounded-lg border p-2 bg-white text-sm"
                        placeholder="e.g. Imidacloprid 30.5 % SC"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Service Charges
                      </label>
                      <input
                        type="text"
                        name="serviceCharges"
                        value={treatment.serviceCharges}
                        onChange={(event) =>
                          handleTreatmentChange(index, event)
                        }
                        className="w-full rounded-lg border p-2 bg-white text-sm"
                        placeholder="e.g. Rs. 65/-- Per Sq. Mtr."
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeTreatment(index)}
                      className="self-end rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={formData.treatments.length === 1}
                      aria-label={`Remove treatment ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="font-medium">Services</label>
                <button
                  type="button"
                  onClick={addService}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium hover:bg-slate-200"
                >
                  + Add Service
                </button>
              </div>

              <div className="space-y-3">
                {formData.services.map((service, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
                  >
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">
                        Service Name
                      </label>
                      <input
                        type="text"
                        name="serviceName"
                        value={service.serviceName}
                        onChange={(event) =>
                          handleServiceChange(index, event)
                        }
                        className="w-full rounded-lg border p-2"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-600">
                        Frequency
                      </label>
                      <input
                        type="text"
                        name="frequency"
                        value={service.frequency}
                        onChange={(event) =>
                          handleServiceChange(index, event)
                        }
                        className="w-full rounded-lg border p-2"
                        placeholder="e.g. Monthly"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-600">
                        Cost
                      </label>
                      <input
                        type="number"
                        name="cost"
                        value={service.cost}
                        onChange={(event) =>
                          handleServiceChange(index, event)
                        }
                        className="w-full rounded-lg border p-2"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeService(index)}
                      className="self-end rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={formData.services.length === 1}
                      aria-label={`Remove service ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            className={`grid gap-4 ${formData.quotationType === "ATT" ? "md:grid-cols-2" : "md:grid-cols-3"}`}
          >
            <div>
              <label className="mb-2 block font-medium">Payment Term</label>
              <input
                type="text"
                name="paymentTerm"
                value={formData.paymentTerm}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              />
            </div>

            {formData.quotationType === "PC" && (
              <div>
                <label className="mb-2 block font-medium">Billing Term</label>
                <input
                  type="text"
                  name="billingTerm"
                  value={formData.billingTerm}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-3"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block font-medium">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full rounded-lg border p-3"
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Accepted">Accepted</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block font-medium">Notes</label>
            <textarea
              rows="4"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full rounded-lg border p-3"
            />
          </div>

          {formData.quotationType === "PC" ? (
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-sm text-gray-500">
                {formData.services.length} service
                {formData.services.length === 1 ? "" : "s"}
              </div>
              <div className="mt-1 text-lg font-bold">
                Total Cost: ₹{totalCost.toFixed(2)}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-4">
              <div className="text-sm font-semibold text-blue-900">
                Anti-Termite Quotation Summary
              </div>
              <div className="mt-1 text-xs text-blue-700">
                {formData.treatments.length} treatment option
                {formData.treatments.length === 1 ? "" : "s"} configured. Rates are exclusive of GST.
              </div>
            </div>
          )}

          {submitError && (
            <div className="rounded-lg bg-red-50 p-3 text-red-700">
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border px-4 py-2"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || !formData.customer}
            >
              {submitting
                ? initialQuotation
                  ? "Saving..."
                  : "Creating..."
                : initialQuotation
                  ? "Save Changes"
                  : "Create Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default CreateQuotationModal;
