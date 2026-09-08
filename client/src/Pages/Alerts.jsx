import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import AlertCard from "../Components/AlertCard";
import { fetchInvoices } from "../slices/invoiceSlice";
import { fetchServices } from "../slices/serviceSlice";
import {
  isMultiDateFrequency,
  calculateServiceDates,
} from "../utils/serviceDateCalculator";
import { FaSearch } from "react-icons/fa";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getStartOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { startOfMonth, endOfMonth };
};

const isDateInMonth = (date, startOfMonth, endOfMonth) => {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= startOfMonth.getTime() && d.getTime() <= endOfMonth.getTime();
};

const getCustomer = (record) => {
  if (record?.customer && typeof record.customer === "object") {
    return record.customer;
  }

  return {};
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getRelativeDate = (date, today) => {
  const days = Math.round((getStartOfDay(date) - today) / DAY_IN_MS);

  if (days < 0) {
    const elapsed = Math.abs(days);
    return `${elapsed} day${elapsed === 1 ? "" : "s"} overdue`;
  }

  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";

  return `Due in ${days} days`;
};

const isToday = (date) =>
  getStartOfDay(date).getTime() === getStartOfDay(new Date()).getTime();

function Alerts() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");

  const servicesState = useSelector((state) => state.services);
  const invoiceState = useSelector((state) => state.invoice);

  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchInvoices());
  }, [dispatch]);

  const alerts = useMemo(() => {
    const today = getStartOfDay(new Date());
    const upcomingLimit = new Date(today.getTime() + 7 * DAY_IN_MS);
    const { startOfMonth, endOfMonth } = getCurrentMonthRange();

    const services = Array.isArray(servicesState.services)
      ? servicesState.services
      : [];
    const invoices = Array.isArray(invoiceState.invoices)
      ? invoiceState.invoices
      : [];

    const serviceAlerts = services.flatMap((service) => {
      const serviceStatus = service.status?.toLowerCase();
      if (
        serviceStatus === "completed" ||
        serviceStatus === "cancelled"
      ) {
        return [];
      }

      const isMulti = isMultiDateFrequency(service.frequency);
      const multiDates = isMulti
        ? Array.isArray(service.upcomingServiceDates) &&
          service.upcomingServiceDates.length > 0
          ? service.upcomingServiceDates
          : service.serviceDate
            ? calculateServiceDates(service.serviceDate, service.frequency)
                .upcomingServiceDates
            : []
        : [];

      // Check if any service date falls in the current calendar month
      const datesInCurrentMonth = isMulti
        ? multiDates.filter((d) => isDateInMonth(d, startOfMonth, endOfMonth))
        : isDateInMonth(
              service.nextServiceDate || service.serviceDate,
              startOfMonth,
              endOfMonth
            )
          ? [service.nextServiceDate || service.serviceDate]
          : [];

      const isThisMonthServiceDue = datesInCurrentMonth.length > 0;

      // Select appropriate alert date:
      // If service is due in current month, pick the next applicable date in current month (or first)
      // Otherwise use service.nextServiceDate || service.serviceDate
      let alertDate = null;
      if (isThisMonthServiceDue) {
        alertDate =
          datesInCurrentMonth.find(
            (d) => getStartOfDay(d).getTime() >= today.getTime()
          ) || datesInCurrentMonth[0];
      } else {
        alertDate = service.nextServiceDate || service.serviceDate;
      }

      if (!alertDate) {
        return [];
      }

      const dueDate = getStartOfDay(alertDate);
      const customer = getCustomer(service);
      const commonAlert = {
        id: `service-${service._id}`,
        customerId: customer._id,
        customerName: customer.fullName || "Unknown Customer",
        title: service.serviceName || "Service",
        reference: `Status: ${service.status || "-"} | Frequency: ${
          service.frequency || "-"
        }`,
        date: dueDate,
        dateLabel: "Service date",
        formattedDate: formatDate(dueDate),
        relativeDate: getRelativeDate(dueDate, today),
        isThisMonthServiceDue,
      };

      if (serviceStatus === "due") {
        return [
          {
            ...commonAlert,
            type: "service",
            typeLabel: "Service Due",
            isOverdue: dueDate < today,
          },
        ];
      }

      if (dueDate < today) {
        return [
          {
            ...commonAlert,
            type: "expired",
            typeLabel: "Service Expired",
            isOverdue: true,
          },
        ];
      }

      if (dueDate <= upcomingLimit || isThisMonthServiceDue) {
        return [
          {
            ...commonAlert,
            type: "service",
            typeLabel: "Service Due",
            isOverdue: false,
          },
        ];
      }

      return [];
    });

    const paymentAlerts = invoices.flatMap((invoice) => {
      const closedStatuses = ["Paid", "Cancelled"];

      if (!invoice.dueDate || closedStatuses.includes(invoice.paymentStatus)) {
        return [];
      }

      const dueDate = getStartOfDay(invoice.dueDate);

      if (dueDate > upcomingLimit) return [];

      const customer = getCustomer(invoice);
      const balance = Number(
        invoice.balanceAmount ?? invoice.totalAmount ?? 0,
      );

      return [
        {
          id: `invoice-${invoice._id}`,
          type: "payment",
          typeLabel: "Payment Due",
          invoiceId: invoice._id,
          customerName: customer.fullName || "Unknown Customer",
          title: invoice.invoiceNumber || "Invoice",
          reference: `Status: ${invoice.paymentStatus || "Pending"}`,
          date: dueDate,
          dateLabel: "Payment date",
          formattedDate: formatDate(dueDate),
          relativeDate: getRelativeDate(dueDate, today),
          amount: `Balance: Rs. ${balance.toLocaleString("en-IN")}`,
          isOverdue: dueDate < today,
          isThisMonthServiceDue: false,
        },
      ];
    });

    return [...serviceAlerts, ...paymentAlerts].sort(
      (first, second) => first.date - second.date,
    );
  }, [invoiceState.invoices, servicesState.services]);

  const counts = {
    all: alerts.length,
    today: alerts.filter((alert) => isToday(alert.date)).length,
    "this-month": alerts.filter((alert) => alert.isThisMonthServiceDue).length,
    expired: alerts.filter((alert) => alert.type === "expired").length,
    payment: alerts.filter((alert) => alert.type === "payment").length,
    service: alerts.filter((alert) => alert.type === "service").length,
  };

  const filteredAlerts = alerts.filter((alert) => {
    let matchesType = false;
    if (activeFilter === "all") {
      matchesType = true;
    } else if (activeFilter === "today") {
      matchesType = isToday(alert.date);
    } else if (activeFilter === "this-month") {
      matchesType = Boolean(alert.isThisMonthServiceDue);
    } else {
      matchesType = alert.type === activeFilter;
    }

    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      alert.customerName.toLowerCase().includes(searchValue) ||
      alert.title.toLowerCase().includes(searchValue) ||
      alert.reference.toLowerCase().includes(searchValue);

    return matchesType && matchesSearch;
  });

  const filters = [
    { value: "all", label: "All Alerts" },
    { value: "today", label: "Today" },
    { value: "this-month", label: "This Month Service Due" },
    { value: "expired", label: "Service Expired" },
    { value: "payment", label: "Payment Due" },
    { value: "service", label: "Service Due" },
  ];

  const summaryCards = [
    {
      type: "expired",
      label: "Service Expired",
      count: counts.expired,
      color: "text-red-700",
      background: "bg-red-50 border-red-100",
    },
    {
      type: "payment",
      label: "Payment Due",
      count: counts.payment,
      color: "text-amber-700",
      background: "bg-amber-50 border-amber-100",
    },
    {
      type: "service",
      label: "Service Due",
      count: counts.service,
      color: "text-blue-700",
      background: "bg-blue-50 border-blue-100",
    },
  ];

  const handleView = (alert) => {
    if (alert.invoiceId) {
      navigate(`/invoices/${alert.invoiceId}`);
      return;
    }

    if (alert.customerId) {
      navigate(`/customers/${alert.customerId}?tab=services`);
    }
  };

  const loading = servicesState.loading || invoiceState.loading;
  const error = servicesState.error || invoiceState.error;

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-slate-900">Alerts</h1>
        <p className="text-slate-500 mt-1">
          Track expired services, upcoming services, and pending payments
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-7">
        {summaryCards.map((card) => (
          <button
            type="button"
            key={card.type}
            onClick={() => setActiveFilter(card.type)}
            className={`border rounded-2xl p-6 text-left shadow-sm transition hover:shadow-md ${card.background}`}
          >
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className={`text-4xl font-bold mt-2 ${card.color}`}>
              {card.count}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Click to view these alerts
            </p>
          </button>
        ))}
      </div>

      {/* Search and Alert Filters Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-6 space-y-3.5">
        {/* Search Bar - Full Dedicated Row */}
        <div className="relative w-full">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, service, or invoice..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm text-slate-800 placeholder-slate-400 transition"
          />
        </div>

        {/* Filter Pills - Dedicated Full Line Under Search */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Status:
          </span>
          {filters.map((filter) => {
            const isActive = activeFilter === filter.value;
            const count = counts[filter.value] ?? 0;
            return (
              <button
                type="button"
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={`inline-flex items-center gap-2 whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-500 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500 shadow-sm">
          Loading alerts...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-center">
          {error}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold mx-auto">
            OK
          </div>
          <h2 className="font-semibold text-xl text-slate-800 mt-4">
            No alerts found
          </h2>
          <p className="text-slate-500 mt-1">
            There are no alerts matching the selected filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onView={handleView} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Alerts;
