import { useEffect } from "react";
import { lockScroll, unlockScroll } from "../utils/scrollLock";

/**
 * React hook to lock background scrolling while a modal/dialog is active.
 * Automatically restores background scroll when the dialog is closed or unmounted.
 *
 * @param {boolean} isOpen - Whether the modal/dialog is currently active
 */
export function useScrollLock(isOpen = true) {
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return () => {
        unlockScroll();
      };
    }
  }, [isOpen]);
}

export default useScrollLock;
