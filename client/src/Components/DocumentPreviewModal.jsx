import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * DocumentPreviewModal
 *
 * Renders a PDF or document preview modal using React Portal directly into document.body.
 * This ensures the modal is positioned relative to the browser viewport and never affected
 * by parent transforms, layout containers, or scroll offsets.
 *
 * Also manages background page scroll locking, preserving the user's scroll position and
 * restoring it seamlessly upon modal close without leftover overflow state.
 */
function DocumentPreviewModal({
  isOpen,
  onClose,
  title = "Preview",
  icon = null,
  onPrint = null,
  extraActions = null,
  iframeId = "document-preview-iframe",
  iframeSrc = null,
  iframeSrcDoc = null,
  iframeTitle = "Document PDF Preview",
  iframeClassName = "w-full h-full bg-[#525659] border-0",
  children = null,
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

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

    // 5. Close on Escape key press
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 6. Cleanup function to restore original scrolling state
    return () => {
      window.removeEventListener("keydown", handleKeyDown);

      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;

      // Restore scroll position instantly without triggering smooth scrolling
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(scrollX, scrollY);
      document.documentElement.style.scrollBehavior = prevScrollBehavior;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePrintClick = () => {
    if (onPrint) {
      onPrint();
      return;
    }

    if (iframeId) {
      const iframe = document.getElementById(iframeId);
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          return;
        } catch {
          // If cross-origin or printing fails, fall back to window.open
        }
      }
    }

    if (iframeSrc) {
      window.open(iframeSrc, "_blank");
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Document Preview"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-2 sm:p-4 overscroll-contain"
      onClick={(e) => {
        // Close if clicking directly on the backdrop outside the dialog
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="flex flex-col w-full max-w-5xl h-[92vh] bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {icon}
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 truncate">
              {title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            {onPrint !== false && (
              <button
                type="button"
                onClick={handlePrintClick}
                className="rounded-lg bg-blue-600 px-4 py-2 sm:px-5 sm:py-2 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
              >
                Print
              </button>
            )}

            {extraActions}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-2 sm:px-5 sm:py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 bg-[#525659] p-2 sm:p-4 overflow-auto flex justify-center">
          {children ? (
            children
          ) : (
            <iframe
              id={iframeId}
              src={iframeSrc || undefined}
              srcDoc={iframeSrcDoc || undefined}
              className={iframeClassName}
              title={iframeTitle}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default DocumentPreviewModal;
