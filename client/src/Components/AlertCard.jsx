function AlertCard({ alert, onView }) {
  const typeStyles = {
    expired: {
      icon: "SE",
      iconClass: "bg-red-100 text-red-700",
      badgeClass: "bg-red-100 text-red-700",
    },
    payment: {
      icon: "PD",
      iconClass: "bg-amber-100 text-amber-700",
      badgeClass: "bg-amber-100 text-amber-700",
    },
    service: {
      icon: "SD",
      iconClass: "bg-blue-100 text-blue-700",
      badgeClass: "bg-blue-100 text-blue-700",
    },
  };

  const style = typeStyles[alert.type];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${style.iconClass}`}
        >
          {style.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-lg text-slate-900">
              {alert.customerName}
            </h2>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${style.badgeClass}`}
            >
              {alert.typeLabel}
            </span>
          </div>

          <p className="text-slate-700 mt-1">{alert.title}</p>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-slate-500">
            <span>{alert.reference}</span>
            <span>{alert.dateLabel}: {alert.formattedDate}</span>
            {alert.amount && <span>{alert.amount}</span>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span
            className={`text-sm font-medium ${
              alert.isOverdue ? "text-red-600" : "text-slate-600"
            }`}
          >
            {alert.relativeDate}
          </span>

          <button
            type="button"
            onClick={() => onView(alert)}
            className="bg-[#020d38] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-700 transition"
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlertCard;
