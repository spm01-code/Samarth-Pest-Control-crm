import React, { useState, useEffect } from "react";

function ServerWakingUpLoader() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f5f7fb] p-6 text-center select-none animate-wake-fade-in">
      <div className="relative flex flex-col items-center max-w-md w-full bg-white rounded-3xl p-8 shadow-[0_10px_35px_-5px_rgba(15,23,42,0.08)] border border-slate-100/80">
        
        {/* Pulsing Logo Ring */}
        <div className="relative mb-6">
          <div 
            className="absolute inset-[-8px] rounded-full bg-blue-50/70 animate-ping opacity-60" 
            style={{ animationDuration: "2.5s" }}
          ></div>
          <div className="relative w-24 h-24 rounded-full bg-white flex items-center justify-center p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-slate-100">
            <img 
              src="/logo.png" 
              alt="SPM Logo" 
              className="w-16 h-16 object-contain" 
            />
          </div>
        </div>

        {/* Text Details */}
        <h2 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">
          Connecting to Dashboard
        </h2>
        <p className="text-[13px] text-slate-500 mb-6 leading-relaxed px-1">
          Welcome to the <strong className="text-slate-800 font-semibold">SPM Operational Dashboard (Beta)</strong>.
          We are initiating a secure connection with our cloud services. Since this environment is deployed on a free-tier hosting server, the server spins down after period of inactivity and may take up to a minute to wake up. Thank you for your patience.
        </p>

        {/* Indeterminate Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3 overflow-hidden relative">
          <div className="bg-blue-800/80 h-full rounded-full w-1/3 animate-shimmer-progress absolute left-0 top-0"></div>
        </div>

        {/* Status / Elapsed Time */}
        <div className="flex items-center justify-between w-full px-0.5 text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Waking up server...
          </span>
          <span>{elapsed}s elapsed</span>
        </div>
      </div>
    </div>
  );
}

export default ServerWakingUpLoader;
