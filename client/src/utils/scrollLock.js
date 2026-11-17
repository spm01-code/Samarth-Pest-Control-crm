// Centralized Scroll Lock Utility for CRM Modals and Dialogs
// Prevents background page scrolling (wheel, touch, keyboard) while modal is open,
// preserves scroll position, handles nested dialogs via reference counting,
// and compensates for scrollbar disappearance to prevent layout shifts.

let lockCount = 0;
let savedScrollY = 0;
let originalStyles = null;

/**
 * Returns the width of the browser scrollbar in pixels.
 */
export const getScrollbarWidth = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return window.innerWidth - document.documentElement.clientWidth;
};

/**
 * Locks background document scrolling.
 * Safe to call multiple times for nested or simultaneous modals.
 */
export const lockScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  lockCount++;

  if (lockCount === 1) {
    savedScrollY =
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const scrollbarWidth = getScrollbarWidth();

    originalStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      paddingRight: document.body.style.paddingRight,
    };

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Fixed position body ensures touch, wheel, and keyboard events
    // cannot scroll the underlying page on mobile/desktop.
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    document.documentElement.classList.add("modal-scroll-locked");
  }
};

/**
 * Unlocks background document scrolling when all modals are closed.
 */
export const unlockScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (lockCount <= 0) return;

  lockCount--;

  if (lockCount === 0) {
    if (originalStyles) {
      document.body.style.overflow = originalStyles.overflow;
      document.body.style.position = originalStyles.position;
      document.body.style.top = originalStyles.top;
      document.body.style.left = originalStyles.left;
      document.body.style.right = originalStyles.right;
      document.body.style.width = originalStyles.width;
      document.body.style.paddingRight = originalStyles.paddingRight;
      originalStyles = null;
    }

    document.documentElement.classList.remove("modal-scroll-locked");

    // Restore exact previous scroll position without smooth scrolling delay
    window.scrollTo({
      top: savedScrollY,
      left: 0,
      behavior: "instant",
    });
  }
};

/**
 * Gets current active modal lock count.
 */
export const getActiveLockCount = () => lockCount;
