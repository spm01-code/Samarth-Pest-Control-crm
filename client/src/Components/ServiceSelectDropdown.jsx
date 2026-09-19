import { useState, useEffect, useRef } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineChevronDown, HiOutlineXMark, HiOutlinePlus } from "react-icons/hi2";

/**
 * ServiceSelectDropdown
 * Searchable customer-specific service selector for Invoice creation/editing.
 * Displays customer services formatted as: "Service Name • ₹Amount • Status"
 * Supports multi-selection chips with remove buttons, "+ Other Service" custom inputs,
 * customer switching reset, loading, empty, and error states.
 */
export default function ServiceSelectDropdown({
  customerId,
  customerServices = [],
  selectedServiceIds = [],
  onServiceToggle,
  customServices = [],
  onAddCustomService,
  onRemoveCustomService,
  loading = false,
  error = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Custom service input state
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customDesc, setCustomDesc] = useState("");

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Reset dropdown search and form when customer changes
  useEffect(() => {
    setSearch("");
    setShowCustomForm(false);
    setCustomName("");
    setCustomAmount("");
    setCustomDesc("");
  }, [customerId]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Filter available customer services by search query
  const filteredServices = customerServices.filter((service) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const nameMatch = (service.serviceName || "").toLowerCase().includes(q);
    const amountMatch = String(service.amount || "").includes(q);
    const statusMatch = (service.status || "").toLowerCase().includes(q);
    const freqMatch = (service.frequency || "").toLowerCase().includes(q);
    return nameMatch || amountMatch || statusMatch || freqMatch;
  });

  const selectedServiceObjects = customerServices.filter((s) =>
    selectedServiceIds.includes(s._id)
  );

  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-blue-100 text-blue-700";
      case "completed":
        return "bg-green-100 text-green-700";
      case "due":
      case "expired":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!customName.trim() || !customAmount || Number(customAmount) <= 0) {
      return;
    }
    onAddCustomService({
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serviceName: customName.trim(),
      amount: Number(customAmount),
      desc: customDesc.trim(),
    });
    setCustomName("");
    setCustomAmount("");
    setCustomDesc("");
    setShowCustomForm(false);
  };

  return (
    <div className="space-y-3" ref={dropdownRef}>
      <label className="block font-medium text-slate-800 text-sm">
        Service(s) <span className="text-red-500">*</span>
      </label>

      {/* Selected Services Tags / Chips Container */}
      {(selectedServiceObjects.length > 0 || customServices.length > 0) && (
        <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[44px]">
          {selectedServiceObjects.map((service) => (
            <span
              key={service._id}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-200 text-blue-800 rounded-lg text-xs font-medium shadow-xs"
            >
              <span>{service.serviceName}</span>
              <span className="text-slate-400">•</span>
              <span className="font-semibold">₹{service.amount?.toLocaleString()}</span>
              <span className="text-slate-400">•</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] uppercase font-bold ${getStatusBadgeClass(service.status)}`}>
                {service.status || "active"}
              </span>
              <button
                type="button"
                onClick={() => onServiceToggle(service._id)}
                className="ml-1 text-slate-400 hover:text-red-600 transition cursor-pointer p-0.5"
                title="Remove service"
              >
                <HiOutlineXMark className="size-3.5" />
              </button>
            </span>
          ))}

          {customServices.map((custom) => (
            <span
              key={custom.id}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs font-medium shadow-xs"
            >
              <span className="font-bold text-amber-700">[Custom]</span>
              <span>{custom.serviceName}</span>
              <span className="text-amber-400">•</span>
              <span className="font-semibold">₹{custom.amount?.toLocaleString()}</span>
              <button
                type="button"
                onClick={() => onRemoveCustomService(custom.id)}
                className="ml-1 text-amber-500 hover:text-red-600 transition cursor-pointer p-0.5"
                title="Remove custom service"
              >
                <HiOutlineXMark className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Main Searchable Dropdown Button */}
      <div className="relative">
        <button
          type="button"
          disabled={!customerId || loading}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-white border ${
            isOpen ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-300 hover:border-slate-400"
          } rounded-xl px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 shadow-xs transition disabled:bg-slate-100 disabled:cursor-not-allowed`}
        >
          <span className="text-slate-600 truncate">
            {!customerId
              ? "Select a customer first..."
              : loading
              ? "Loading customer services..."
              : "Select customer service..."}
          </span>
          <HiOutlineChevronDown className={`size-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Floating Dropdown Options Panel */}
        {isOpen && customerId && (
          <div className="absolute left-0 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 z-50 animate-fadeIn">
            {/* Search Input inside Dropdown */}
            <div className="relative mb-2">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services by name, amount, or status..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <HiOutlineXMark className="size-3.5" />
                </button>
              )}
            </div>

            {/* Error state */}
            {error && (
              <div className="p-3 text-xs text-red-600 bg-red-50 rounded-lg mb-2">
                {error}
              </div>
            )}

            {/* Services Options List */}
            <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-slate-100 pr-1 scrollbar-thin">
              {filteredServices.length > 0 ? (
                filteredServices.map((service) => {
                  const isSelected = selectedServiceIds.includes(service._id);
                  return (
                    <div
                      key={service._id}
                      onClick={() => onServiceToggle(service._id)}
                      className={`p-2.5 rounded-lg cursor-pointer transition text-xs flex items-center justify-between ${
                        isSelected
                          ? "bg-blue-50 text-blue-900 font-semibold"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                        />
                        <span className="truncate font-medium">{service.serviceName}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="font-semibold text-slate-900">₹{service.amount?.toLocaleString()}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${getStatusBadgeClass(service.status)}`}>
                          {service.status || "active"}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 text-xs text-slate-400 text-center italic">
                  No existing services found
                </div>
              )}

              {/* "+ Other Service" Option */}
              <div
                onClick={() => {
                  setShowCustomForm(true);
                  setIsOpen(false);
                }}
                className="p-2.5 rounded-lg text-blue-700 bg-blue-50/60 hover:bg-blue-100/80 cursor-pointer font-semibold text-xs flex items-center gap-2 mt-1 transition"
              >
                <HiOutlinePlus className="size-4 shrink-0" />
                <span>+ Other Service (Add Custom Service)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline Form for "+ Other Service" */}
      {showCustomForm && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 space-y-3.5 animate-fadeIn">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <HiOutlinePlus className="size-3.5 text-amber-700" />
              Add Custom Service for Invoice
            </h4>
            <button
              type="button"
              onClick={() => setShowCustomForm(false)}
              className="text-amber-700 hover:text-amber-950 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                Service Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Disinfection Service"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-300"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                placeholder="e.g. 1500"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-300"
                min="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-amber-900 mb-1">
              Description / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. One-time sanitization treatment"
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-300"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={!customName.trim() || !customAmount}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              Add Custom Service
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
