import { useEffect, useState, useRef } from "react";
import {
  HiCheckCircle,
  HiXCircle,
  HiExclamationTriangle,
  HiInformationCircle,
  HiXMark,
} from "react-icons/hi2";
import { toast } from "../utils/toast";

function ToastItemView({ item, onDismiss }) {
  const [remainingTime, setRemainingTime] = useState(item.duration);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  const isExiting = Boolean(item.isExiting);

  useEffect(() => {
    if (item.duration <= 0 || isExiting) return;

    if (!isPaused) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(item.id);
      }, remainingTime);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPaused, remainingTime, item.id, item.duration, isExiting, onDismiss]);

  const handleMouseEnter = () => {
    if (item.duration <= 0 || isExiting) return;
    const elapsed = Date.now() - startTimeRef.current;
    setRemainingTime((prev) => Math.max(prev - elapsed, 500));
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    if (item.duration <= 0 || isExiting) return;
    setIsPaused(false);
  };

  const iconConfig = {
    success: {
      Icon: HiCheckCircle,
      iconClass: "text-emerald-400",
      borderClass: "border-emerald-500/30",
      accentBg: "bg-emerald-500/15",
      label: "Success",
    },
    error: {
      Icon: HiXCircle,
      iconClass: "text-rose-400",
      borderClass: "border-rose-500/30",
      accentBg: "bg-rose-500/15",
      label: "Error",
    },
    warning: {
      Icon: HiExclamationTriangle,
      iconClass: "text-amber-400",
      borderClass: "border-amber-500/30",
      accentBg: "bg-amber-500/15",
      label: "Warning",
    },
    info: {
      Icon: HiInformationCircle,
      iconClass: "text-sky-400",
      borderClass: "border-sky-500/30",
      accentBg: "bg-sky-500/15",
      label: "Information",
    },
  };

  const config = iconConfig[item.type] || iconConfig.info;
  const { Icon } = config;
  const isAlert = item.type === "error" || item.type === "warning";

  return (
    <div
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`pointer-events-auto flex items-center gap-3 w-full bg-slate-900/95 text-white border ${
        config.borderClass
      } rounded-2xl px-4 py-3.5 shadow-2xl backdrop-blur-md transition-colors hover:border-slate-500/50 ${
        isExiting ? "toast-exit" : "toast-enter"
      }`}
    >
      {/* Icon Container: Fixed dimensions (32x32), perfectly centered */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.accentBg}`}
        aria-hidden="true"
      >
        <Icon className={`size-5 ${config.iconClass}`} />
      </div>

      {/* Message Container: Flexible width, vertical center aligned on same horizontal axis */}
      <div className="flex-1 min-w-0 pr-1">
        <span className="sr-only">{config.label}: </span>
        <p className="text-sm font-medium text-slate-100 leading-snug break-words">
          {item.message}
        </p>
      </div>

      {/* Close Button: Fixed dimensions (28x28), vertically centered */}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Close notification"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 cursor-pointer"
      >
        <HiXMark className="size-4" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((updatedToasts) => {
      setToasts(updatedToasts);
    });
    return unsubscribe;
  }, []);

  if (!toasts.length) return null;

  return (
    <div
      className="fixed top-5 right-5 z-[9999] pointer-events-none flex flex-col gap-2.5 max-w-sm w-full sm:max-w-md"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <ToastItemView
          key={t.id}
          item={t}
          onDismiss={(id) => toast.dismiss(id)}
        />
      ))}
    </div>
  );
}
