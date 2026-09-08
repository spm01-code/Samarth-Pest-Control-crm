// Centralized Toast Notification System for CRM
// Provides consistent toast.success, toast.error, toast.warning, toast.info, toast.dismiss

class ToastManager {
  constructor() {
    this.listeners = new Set();
    this.toasts = [];
    this.recentDedupeMap = new Map();
    this.DEDUPE_WINDOW_MS = 1000;

    // Default durations according to UX specification
    this.defaultDurations = {
      success: 3000,
      info: 3500,
      warning: 4000,
      error: 5000,
    };
  }


  subscribe(listener) {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const list = [...this.toasts];
    this.listeners.forEach((listener) => {
      try {
        listener(list);
      } catch (err) {
        console.error("Toast listener error:", err);
      }
    });
  }

  shouldDeduplicate(type, message) {
    const now = Date.now();
    const key = `${type}:${String(message).trim().toLowerCase()}`;
    const lastSeen = this.recentDedupeMap.get(key);

    if (lastSeen && now - lastSeen < this.DEDUPE_WINDOW_MS) {
      return true;
    }

    this.recentDedupeMap.set(key, now);

    // Prune old entries from map periodically
    if (this.recentDedupeMap.size > 50) {
      for (const [k, time] of this.recentDedupeMap.entries()) {
        if (now - time > 5000) {
          this.recentDedupeMap.delete(k);
        }
      }
    }

    return false;
  }

  show(type, message, options = {}) {
    if (!message) return "";

    const strMessage = String(message).trim();

    // Prevent duplicate toasts within deduplication window
    if (this.shouldDeduplicate(type, strMessage)) {
      return "";
    }

    const id = options.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const duration = options.duration ?? this.defaultDurations[type] ?? 3500;

    const newToast = {
      id,
      type,
      message: strMessage,
      duration,
      createdAt: Date.now(),
    };

    // Keep maximum 5 active toasts to avoid screen clutter
    if (this.toasts.length >= 5) {
      this.toasts = this.toasts.slice(-4);
    }

    this.toasts = [...this.toasts, newToast];
    this.notify();

    return id;
  }

  success(message, options) {
    return this.show("success", message, options);
  }

  error(message, options) {
    return this.show("error", message, options);
  }

  warning(message, options) {
    return this.show("warning", message, options);
  }

  info(message, options) {
    return this.show("info", message, options);
  }

  dismiss(id) {
    const initialLen = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.id !== id);
    if (this.toasts.length !== initialLen) {
      this.notify();
    }
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toast = new ToastManager();
