import { useEffect } from "react";

/**
 * Custom hook to lock the body/document scroll when a modal or dialog is open.
 *
 * - Locks background document scrolling on both body and documentElement.
 * - Compensates for scrollbar disappearance with paddingRight to prevent layout shifts.
 * - Preserves and restores exact scroll position when closed or unmounted.
 * - Restores styles safely on cleanup without lingering locks.
 *
 * @param {boolean} isLocked - Whether scrolling should currently be locked.
 */
export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return;

    // 1. Capture current scroll position
    const scrollY =
      window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const scrollX =
      window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;

    // 2. Measure scrollbar width to prevent horizontal layout shift
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    // 3. Save original inline styles
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyPaddingRight = document.body.style.paddingRight;
    const prevScrollBehavior = document.documentElement.style.scrollBehavior;

    // 4. Lock background page scroll
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    // 5. Cleanup function to restore original scrolling state on close or unmount
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;

      // Restore scroll position instantly without smooth scrolling transition
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(scrollX, scrollY);
      document.documentElement.style.scrollBehavior = prevScrollBehavior;
    };
  }, [isLocked]);
}

export default useBodyScrollLock;
