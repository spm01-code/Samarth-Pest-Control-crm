import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCustomers } from "../slices/customerSlice";
import { createRenewal, updateRenewal, fetchRenewals } from "../slices/renewalSlice";
import { fetchCompanySettingsAPI } from "../API/companySettingAPI";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

const today = () => new Date().toLocaleDateString("en-CA");

const emptyService = () => ({
  serviceName: "",
  frequency: "",
  address: "",
  amount: "",
  desc: "",
});

function CreateRenewalModal({ isOpen, onClose, initialRenewal = null, onUpdated }) {
  const dispatch = useDispatch();
  const { customers = [] } = useSelector((state) => state.customer);

  const [form, setForm] = useState({
    renewalNumber: "",
    renewalDate: today(),
    customer: "",
    status: "Draft",
    services: [emptyService()],
    paymentTerm: "Quarterly.",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const [showCustomers, setShowCustomers] = useState(false);
  const [error, setError] = useState("");

  const token = useSelector((state) => state.auth.token);
  const { renewals = [] } = useSelector((state) => state.renewal);

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchCustomers());
      dispatch(fetchRenewals());

      const loadPrefix = async () => {
        try {
          const data = await fetchCompanySettingsAPI(token);
          if (data.success && data.settings) {
            const prefix = data.settings.renewalPrefix || "REN-";
            const count = renewals.length;
            const year = new Date().getFullYear();
            const countStr = String(count + 1).padStart(4, "0");
            
            let generatedNumber = prefix;
            if (prefix.includes(String(year))) {
              const separator = prefix.endsWith("-") ? "" : "-";
              generatedNumber = `${prefix}${separator}${countStr}`;
            } else {
              const separator = prefix.endsWith("-") ? "" : "-";
              generatedNumber = `${prefix}${separator}${year}-${countStr}`;
            }

            setForm((current) => ({
              ...current,
              renewalNumber: current.renewalNumber || generatedNumber,
            }));
          }
        } catch (error) {
          console.error("Failed to load prefix settings:", error);
        }
      };

      if (token && !initialRenewal) {
        loadPrefix();
      }
    }
  }, [dispatch, isOpen, token, renewals.length, initialRenewal]);

  useEffect(() => {
    if (initialRenewal) {
      setForm({
        renewalNumber: initialRenewal.renewalNumber || "",
        renewalDate: initialRenewal.renewalDate
          ? new Date(initialRenewal.renewalDate).toLocaleDateString("en-CA")
          : today(),
        customer:
          initialRenewal.customer?._id ||
          initialRenewal.customer ||
          "",
        status: initialRenewal.status || "Draft",
        services:
          Array.isArray(initialRenewal.services) &&
          initialRenewal.services.length > 0
            ? initialRenewal.services.map((s) => ({
                serviceName: s.serviceName || "",
                frequency: s.frequency || "",
                address: s.address || "",
                amount: s.amount || "",
                desc: s.desc || "",
              }))
            : [emptyService()],
        paymentTerm: initialRenewal.paymentTerm || "Quarterly.",
        notes: initialRenewal.notes || "",
      });

      if (initialRenewal.customer) {
        setSearch(
          initialRenewal.customer?.fullName ||
            initialRenewal.customer?.companyName ||
            ""
        );
      }
    }
  }, [initialRenewal, isOpen]);

  const close = () => {
    setForm({
      renewalNumber: "",
      renewalDate: today(),
      customer: "",
      status: "Draft",
      services: [emptyService()],
      paymentTerm: "Quarterly.",
      notes: "",
    });
    setSearch("");
    setError("");
    onClose();
  };

  const handleServiceChange = (index, event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) =>
        serviceIndex === index ? { ...service, [name]: value } : service,
      ),
    }));
  };

  const addService = () => {
    setForm((current) => ({
      ...current,
      services: [...current.services, emptyService()],
    }));
  };

  const removeService = (index) => {
    setForm((current) => ({
      ...current,
      services: current.services.filter(
        (_, serviceIndex) => serviceIndex !== index,
      ),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    const renewalData = {
      ...form,
      services: form.services.map((service) => ({
        ...service,
        amount: Number(service.amount),
      })),
    };

    try {
      if (initialRenewal?._id) {
        await dispatch(
          updateRenewal({ id: initialRenewal._id, data: renewalData })
        ).unwrap();
        onUpdated?.();
        close();
        toast.success("Contract renewal updated successfully.");
      } else {
        await dispatch(createRenewal(renewalData)).unwrap();
        close();
        toast.success("Contract renewal created successfully.");
      }
    } catch (message) {
      const fallback = initialRenewal?._id
        ? "Failed to update contract renewal. Please try again."
        : "Failed to create contract renewal. Please try again.";
      const cleanMsg = getErrorMessage(message, fallback);
      setError(cleanMsg);
      toast.error(cleanMsg);
    }
  };

  const matches = customers.filter((customer) =>
    customer.fullName?.toLowerCase().includes(search.toLowerCase()),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {initialRenewal ? "Edit Contract Renewal" : "Create Contract Renewal"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close create renewal dialog"
            className="text-2xl text-gray-500 hover:text-gray-800"
          >
            &times;
          </button>
        </div>
        <p className="mb-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          Create a customer contract renewal by selecting a customer and entering the service and pricing details.
        </p>
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>
        )}
        <form onSubmit={submit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-medium">
              Renewal No
              <input
                value={form.renewalNumber}
                onChange={(e) =>
                  setForm({ ...form, renewalNumber: e.target.value })
                }
                className="mt-2 w-full rounded-lg border p-3 bg-white"
                placeholder="e.g. CR-2026-001 (Optional)"
              />
            </label>
            <label className="font-medium">
              Renewal Date
              <input
                required
                type="date"
                value={form.renewalDate}
                onChange={(e) =>
                  setForm({ ...form, renewalDate: e.target.value })
                }
                className="mt-2 w-full rounded-lg border p-3 bg-white"
              />
            </label>
          </div>
          <div className="relative">
            <label className="font-medium">Customer</label>
            <input
              required
              value={search}
              onFocus={() => setShowCustomers(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setForm({ ...form, customer: "" });
                setShowCustomers(true);
              }}
              className="mt-2 w-full rounded-lg border p-3 bg-white"
              placeholder="Search customer..."
              autoComplete="off"
            />
            {showCustomers && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                {matches.map((customer) => (
                  <button
                    key={customer._id}
                    type="button"
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        customer: customer._id,
                        services: current.services.map((s) => ({
                          ...s,
                          address: s.address || customer.address || "",
                        })),
                      }));
                      setSearch(customer.fullName);
                      setShowCustomers(false);
                    }}
                    className="block w-full p-3 text-left hover:bg-slate-100"
                  >
                    <span className="block font-medium">{customer.fullName}</span>
                    <span className="text-sm text-gray-500">{customer.address}</span>
                  </button>
                ))}
                {matches.length === 0 && (
                  <p className="p-3 text-gray-500">No customer found</p>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="font-semibold block">Services</label>
              <button
                type="button"
                onClick={addService}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200"
              >
                + Add Service
              </button>
            </div>

            <div className="space-y-4">
              {form.services.map((service, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border p-4 bg-slate-50 md:grid-cols-[1.5fr_1.5fr_2fr_1fr_auto]"
                >
                  <div>
                    <label className="mb-1 block text-xs text-gray-600 font-medium">
                      Service Name
                    </label>
                    <input
                      type="text"
                      name="serviceName"
                      value={service.serviceName}
                      onChange={(event) => handleServiceChange(index, event)}
                      className="w-full rounded-lg border bg-white p-2 text-sm"
                      placeholder="e.g. Termite"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-600 font-medium">
                      Frequency
                    </label>
                    <input
                      type="text"
                      name="frequency"
                      value={service.frequency}
                      onChange={(event) => handleServiceChange(index, event)}
                      className="w-full rounded-lg border bg-white p-2 text-sm"
                      placeholder="e.g. Quarterly"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-600 font-medium">
                      Location to be Treated
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={service.address}
                      onChange={(event) => handleServiceChange(index, event)}
                      className="w-full rounded-lg border bg-white p-2 text-sm"
                      placeholder="Address or Premises"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-600 font-medium">
                      Price (Rs.)
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={service.amount}
                      onChange={(event) => handleServiceChange(index, event)}
                      className="w-full rounded-lg border bg-white p-2 text-sm"
                      min="0"
                      step="0.01"
                      placeholder="Cost"
                      required
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeService(index)}
                    className="self-end rounded-lg px-2 py-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 text-sm font-semibold mb-0.5"
                    disabled={form.services.length === 1}
                    aria-label={`Remove service ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-medium">
              Payment Term
              <input
                value={form.paymentTerm}
                onChange={(e) =>
                  setForm({ ...form, paymentTerm: e.target.value })
                }
                className="mt-2 w-full rounded-lg border p-3 bg-white"
                placeholder="e.g. Quarterly."
              />
            </label>
            <label className="font-medium">
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-2 w-full rounded-lg border p-3 bg-white"
              >
                <option>Draft</option>
                <option>Sent</option>
                <option>Completed</option>
              </select>
            </label>
          </div>

          <label className="font-medium block">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-2 w-full rounded-lg border p-3 h-20 resize-none bg-white"
              placeholder="Any additional notes..."
            />
          </label>

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border px-5 py-2.5 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button className="rounded-lg bg-blue-800/80 px-5 py-2.5 text-white hover:bg-blue-800">
              Create Renewal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateRenewalModal;
