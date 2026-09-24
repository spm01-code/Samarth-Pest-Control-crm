import { useEffect, useRef, useState } from "react";
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

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

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

  useEffect(() => {
    let isMounted = true;
    let activeObjectUrl = null;

    if (isOpen && iframeSrc) {
      setIsLoading(true);
      setError(null);
      setPdfBlobUrl(null);

      fetch(iframeSrc)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }
          return response.blob();
        })
        .then((blob) => {
          if (!isMounted) return;
          const objectUrl = URL.createObjectURL(blob);
          activeObjectUrl = objectUrl;
          setPdfBlobUrl(objectUrl);
          setIsLoading(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("PDF preview fetch error:", err);
          setError("Unable to load PDF preview. Please try again.");
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
      setError(null);
      setPdfBlobUrl(null);
    }

    return () => {
      isMounted = false;
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [isOpen, iframeSrc]);

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

    const printTarget = pdfBlobUrl || iframeSrc;
    if (printTarget) {
      window.open(printTarget, "_blank");
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
        <div className="flex-1 bg-[#525659] p-2 sm:p-4 overflow-auto flex items-center justify-center relative">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center text-white space-y-3 p-6">
              <svg
                className="animate-spin h-8 w-8 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-sm font-medium text-slate-200">
                Loading PDF preview...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center text-white space-y-3 p-6 text-center">
              <div className="rounded-full bg-red-500/20 p-3 text-red-400">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-200">{error}</p>
            </div>
          ) : children ? (
            children
          ) : (
            <iframe
              id={iframeId}
              src={pdfBlobUrl || iframeSrc || undefined}
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
