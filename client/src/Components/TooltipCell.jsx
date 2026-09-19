import { useState, useRef } from "react";

/**
 * TooltipCell
 * Standardized cell presentation for CRM lists and tables.
 * Renders text with controlled truncation and displays a floating hover tooltip when content overflows.
 */
export default function TooltipCell({
  value,
  placeholder = "-",
  className = "",
  maxWidth = "max-w-[220px]",
  lineClamp = 1,
  showFullOnHover = true,
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const textRef = useRef(null);

  if (value === null || value === undefined || String(value).trim() === "") {
    return <span className="text-slate-400 font-normal">{placeholder}</span>;
  }

  const strValue = String(value).trim();

  const handleMouseEnter = () => {
    if (!showFullOnHover) return;
    if (textRef.current) {
      const isOverflowing =
        textRef.current.scrollWidth > textRef.current.clientWidth ||
        strValue.length > 28;
      if (isOverflowing) {
        setShowTooltip(true);
      }
    }
  };

  return (
    <div
      className="relative inline-flex items-center group max-w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        ref={textRef}
        className={`block ${maxWidth} ${
          lineClamp === 1 ? "truncate" : `line-clamp-${lineClamp}`
        } ${className}`}
        title={strValue}
      >
        {strValue}
      </span>

      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 max-w-xs sm:max-w-md bg-slate-900 text-white text-xs rounded-lg p-2.5 shadow-xl whitespace-normal break-words pointer-events-none border border-slate-700 font-normal">
          {strValue}
        </div>
      )}
    </div>
  );
}
