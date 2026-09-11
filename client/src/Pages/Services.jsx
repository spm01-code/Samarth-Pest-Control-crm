import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchServices } from "../slices/serviceSlice";
import { useNavigate } from "react-router-dom";
import CreateServiceModal from "../Components/CreateServiceModel";
import { fetchCustomers } from "../slices/customerSlice";
import { fetchEmployees } from "../slices/employeeSlice";
import { FaPlus, FaSearch } from "react-icons/fa";
import {
  isMultiDateFrequency,
  calculateServiceDates,
} from "../utils/serviceDateCalculator";

function Services() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { services, loading, error } = useSelector((state) => state.services);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchCustomers());
    dispatch(fetchEmployees());
  }, [dispatch]);

  const serviceList = Array.isArray(services) ? services : [];

  const dueCount = serviceList.filter((service) => {
    return service.status === "due";
  }).length;

  const completedCount = serviceList.filter((service) => {
    return service.status === "completed";
  }).length;

  const filteredServices = serviceList.filter((service) => {
    const matchesSearch =
      (service.serviceName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (service.frequency?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (service.employee?.fullName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (service.operatorName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (service.customer?.fullName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (service.jobNo?.toLowerCase() || "").includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ? true : service.status === statusFilter;

    const matchesFrequency =
      frequencyFilter === "all"
        ? true
        : service.frequency?.toLowerCase() === frequencyFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesFrequency;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";

      case "due":
        return "bg-red-100 text-red-700";

      case "expired":
        return "bg-red-100 text-red-700";

      case "active":
        return "bg-blue-100 text-blue-700";

      case "pending":
        return "bg-yellow-100 text-yellow-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Services</h1>
          <p className="text-slate-500 mt-1">
            Manage and track services and schedules
          </p>
        </div>
        <button
          className="bg-blue-800/80 text-white hover:bg-blue-600 px-5 py-2.5 rounded-lg flex items-center gap-2 self-start sm:self-auto"
          onClick={() => setShowCreateModal(true)}
        >
          <FaPlus /> Add Service
        </button>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-8">
        {[
          {
            key: "all",
            label: "All Services",
            count: serviceList.length,
            color: "text-slate-900",
            background: "bg-slate-50 border-slate-100",
            onClick: () => setStatusFilter("all"),
          },
          {
            key: "due",
            label: "Due Services",
            count: dueCount,
            color: "text-red-700",
            background: "bg-red-50 border-red-100",
            onClick: () => setStatusFilter("due"),
          },
          {
            key: "completed",
            label: "Completed",
            count: completedCount,
            color: "text-green-700",
            background: "bg-green-50 border-green-100",
            onClick: () => setStatusFilter("completed"),
          },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            className={`border rounded-2xl p-6 text-left shadow-sm transition hover:shadow-md ${card.background}`}
          >
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className={`text-5xl font-bold mt-2 ${card.color}`}>
              {card.count}
            </p>
            <p className="text-xs text-slate-500 mt-2">Click to view</p>
          </button>
        ))}
      </div>

      {/* Search and Frequency Filter Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-6 space-y-3.5">
        {/* Search Bar - Full Dedicated Row */}
        <div className="relative w-full">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="search"
            placeholder="Search services by name, frequency, or employee..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm text-slate-800 placeholder-slate-400 transition"
          />
        </div>

        {/* Filters - Dedicated Full Line Under Search */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Frequency:
          </span>
          {[
            { value: "all", label: "All Frequencies" },
            { value: "one-time", label: "One Time" },
            { value: "weekly", label: "Weekly" },
            { value: "twice a week", label: "Twice a Week" },
            { value: "monthly", label: "Monthly" },
            { value: "fourth night", label: "Fourth Night" },
            { value: "Quarterly", label: "Quarterly" },
            { value: "3 Services Yearly", label: "3 Services Yearly" },
          ].map((frequency) => {
            const isActive = frequencyFilter === frequency.value;
            return (
              <button
                type="button"
                key={frequency.value}
                onClick={() => setFrequencyFilter(frequency.value)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900"
                }`}
              >
                {frequency.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Services List Table */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
            Loading...
          </div>
        ) : error ? (
          <div className="bg-red-100 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500">
            No Services Found
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-4">Customer</th>
                    <th className="text-left p-4">Service Name</th>
                    <th className="text-left p-4">Frequency</th>
                    <th className="text-left p-4">Assigned To</th>
                    <th className="text-left p-4">Service Date</th>
                    <th className="text-left p-4">Next Service Date</th>
                    <th className="text-left p-4">Amount</th>
                    <th className="text-left p-4">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredServices.map((service) => (
                    <tr
                      key={service._id}
                      className="border-t hover:bg-slate-50 cursor-pointer transition"
                      onClick={() => navigate(`/services/${service._id}`)}
                    >
                      <td className="p-4 font-medium">
                        {service.customer?.fullName || "N/A"}
                      </td>

                      <td className="p-4 font-medium text-slate-700">
                        {service.serviceName || "-"}
                      </td>

                      <td className="p-4 capitalize">
                        {service.frequency || "-"}
                      </td>

                      <td className="p-4">
                        {service.employee?.fullName || service.operatorName || "-"}
                      </td>

                      <td className="p-4">
                        {formatDate(service.serviceDate)}
                      </td>

                      <td className="p-4">
                        {isMultiDateFrequency(service.frequency) ? (
                          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                            {(Array.isArray(service.upcomingServiceDates) &&
                            service.upcomingServiceDates.length > 0
                              ? service.upcomingServiceDates
                              : calculateServiceDates(
                                  service.serviceDate,
                                  service.frequency
                                ).upcomingServiceDates
                            ).map((d, idx) => (
                              <span
                                key={idx}
                                className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md inline-block whitespace-nowrap"
                              >
                                {formatDate(d)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          formatDate(service.nextServiceDate)
                        )}
                      </td>

                      <td className="p-4">
                        Rs. {service.amount?.toLocaleString() || "0"}
                      </td>

                      <td className="p-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusColor(
                            service.status
                          )}`}
                        >
                          {service.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateServiceModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

export default Services;
