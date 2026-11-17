import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import useBodyScrollLock from "../utils/useBodyScrollLock";
import {
  HiOutlineHashtag,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineMagnifyingGlass,
  HiOutlineUser,
  HiOutlineXMark,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import { getJobNumberStats, getAllJobNumbers } from "../API/jobNumberAPI";

const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function JobNumberManagement() {
  const token = useSelector((state) => state.auth.token);

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalCount: 0,
    assignedCount: 0,
    availableCount: 0,
    legacyCount: 0,
    prefixBreakdown: [],
  });

  const [selectedPrefix, setSelectedPrefix] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [jobNumbers, setJobNumbers] = useState([]);

  // History modal
  const [selectedJobNoForHistory, setSelectedJobNoForHistory] = useState(null);

  // Lock background scroll when history dialog is open
  useBodyScrollLock(Boolean(selectedJobNoForHistory));

  // Load KPI Stats
  const loadStats = async () => {
    try {
      const res = await getJobNumberStats(token);
      setStats({
        totalCount: res.totalCount ?? res.metrics?.total ?? 0,
        assignedCount: res.assignedCount ?? res.metrics?.assigned ?? 0,
        availableCount: res.availableCount ?? res.metrics?.available ?? 0,
        legacyCount: res.legacyCount ?? res.metrics?.legacy ?? 0,
        prefixBreakdown: res.prefixBreakdown || res.alphabetBreakdown || [],
      });
    } catch (err) {
      console.error("Failed to load Job Number stats:", err);
    }
  };

  // Load Job Numbers Table
  const loadJobNumbers = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
      };
      if (selectedPrefix !== "ALL") params.prefix = selectedPrefix;
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getAllJobNumbers(params, token);
      setJobNumbers(res.jobNumbers || res.data || []);
      setTotalRecords(res.pagination?.total || 0);
    } catch (err) {
      console.error("Failed to load Job Numbers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const origBodyBg = document.body.style.backgroundColor;
    const origHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "#0f172a";
    document.documentElement.style.backgroundColor = "#0f172a";
    return () => {
      document.body.style.backgroundColor = origBodyBg;
      document.documentElement.style.backgroundColor = origHtmlBg;
    };
  }, []);

  useEffect(() => {
    if (token) {
      loadStats();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadJobNumbers();
    }
  }, [token, selectedPrefix, statusFilter, page]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadJobNumbers();
  };

  const getAvailableCountForPrefix = (letter) => {
    const item = stats.prefixBreakdown.find((b) => b.prefix === letter);
    return item ? item.available : 0;
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[#0f172a] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col">
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                to="/settings"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 font-semibold transition"
              >
                <span>← Back to Settings</span>
              </Link>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <HiOutlineHashtag className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">
                  Job Number Management
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Alphabetical smallest-number allocation, reuse registry, and slot occupancy
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              loadStats();
              loadJobNumbers();
            }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer self-start sm:self-auto shadow-sm"
          >
            <HiOutlineArrowPath className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-lg">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              Total Managed Slots
            </p>
            <p className="text-2xl sm:text-3xl font-black text-white mt-1.5 font-mono">
              {stats.totalCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Across all 26 letter sequences</p>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 sm:p-5 rounded-2xl shadow-lg">
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <HiOutlineCheckCircle className="size-4" /> Available for Reuse
            </p>
            <p className="text-2xl sm:text-3xl font-black text-emerald-300 mt-1.5 font-mono">
              {stats.availableCount}
            </p>
            <p className="text-[11px] text-emerald-500/80 mt-1">Vacant slots ready for assignment</p>
          </div>

          <div className="bg-cyan-950/20 border border-cyan-500/30 p-4 sm:p-5 rounded-2xl shadow-lg">
            <p className="text-cyan-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <HiOutlineUser className="size-4" /> Currently Assigned
            </p>
            <p className="text-2xl sm:text-3xl font-black text-cyan-300 mt-1.5 font-mono">
              {stats.assignedCount}
            </p>
            <p className="text-[11px] text-cyan-500/80 mt-1">Occupied by active CRM customers</p>
          </div>

          <div className="bg-amber-950/20 border border-amber-500/30 p-4 sm:p-5 rounded-2xl shadow-lg">
            <p className="text-amber-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <HiOutlineExclamationTriangle className="size-4" /> Legacy Formats
            </p>
            <p className="text-2xl sm:text-3xl font-black text-amber-300 mt-1.5 font-mono">
              {stats.legacyCount}
            </p>
            <p className="text-[11px] text-amber-500/80 mt-1">Irregular codes preserved intact</p>
          </div>
        </div>

        {/* Alphabet Quick Filter Tabs */}
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 sm:p-4 rounded-2xl mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Filter by Letter Sequence (A-Z)
            </span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Badges show available vacant slots per letter
            </span>
          </div>

          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            <button
              onClick={() => {
                setSelectedPrefix("ALL");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedPrefix === "ALL"
                  ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              ALL
            </button>

            {ALPHABETS.map((letter) => {
              const avail = getAvailableCountForPrefix(letter);
              const isSelected = selectedPrefix === letter;
              return (
                <button
                  key={letter}
                  onClick={() => {
                    setSelectedPrefix(letter);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span>{letter}</span>
                  {avail > 0 && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold ${
                        isSelected
                          ? "bg-slate-950 text-cyan-300"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {avail}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search and Status Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
            <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 size-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Job No or Customer..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition"
            />
          </form>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none focus:border-cyan-500 w-full sm:w-auto"
            >
              <option value="ALL">All Statuses</option>
              <option value="available">Available (Vacant)</option>
              <option value="assigned">Assigned (Occupied)</option>
            </select>
          </div>
        </div>

        {/* Job Numbers Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-4 flex-1 flex flex-col justify-between">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Job Number</th>
                  <th className="px-4 py-3.5">Prefix</th>
                  <th className="px-4 py-3.5">Sequence</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Assigned Customer</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-slate-500">
                      <HiOutlineArrowPath className="animate-spin size-6 mx-auto mb-2 text-cyan-400" />
                      Loading Job Numbers...
                    </td>
                  </tr>
                ) : jobNumbers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-slate-500">
                      No Job Numbers match the current filters.
                    </td>
                  </tr>
                ) : (
                  jobNumbers.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 font-mono font-bold text-white text-sm">
                        <span className="bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60">
                          {item.jobNo}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-cyan-400 font-bold">
                        {item.prefix}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-400">
                        {item.sequence !== null ? item.sequence : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.status === "available" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <span className="size-1.5 rounded-full bg-emerald-400"></span>
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            <span className="size-1.5 rounded-full bg-cyan-400"></span>
                            Assigned
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-200">
                        {item.customerId ? (
                          <Link
                            to={`/customers/${item.customerId._id || item.customerId}`}
                            className="hover:text-cyan-400 transition underline underline-offset-2 flex items-center gap-1"
                          >
                            <HiOutlineUser className="size-3.5 shrink-0 opacity-60" />
                            <span>
                              {item.customerId.fullName ||
                                item.assignmentHistory?.[item.assignmentHistory.length - 1]?.customerName ||
                                "View Customer"}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-slate-500 italic">— Vacant Slot —</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.isLegacy ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            Legacy
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Standard</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedJobNoForHistory(item)}
                          className="text-cyan-400 hover:text-cyan-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          History ({item.assignmentHistory?.length || 0})
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-slate-950/50 text-xs text-slate-400">
            <span>
              Showing {jobNumbers.length} of {totalRecords} records
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-bold cursor-pointer"
              >
                Previous
              </button>
              <span className="px-3 py-1 font-mono font-bold text-slate-200">
                Page {page} of {Math.ceil(totalRecords / limit) || 1}
              </span>
              <button
                disabled={page * limit >= totalRecords}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-bold cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Assignment History Modal Portal */}
      {selectedJobNoForHistory &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedJobNoForHistory(null);
              }
            }}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 flex flex-col max-h-[85vh] my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-black text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                    {selectedJobNoForHistory.jobNo}
                  </span>
                  <span className="text-xs text-slate-400">Assignment History</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedJobNoForHistory(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Close dialog"
                >
                  <HiOutlineXMark className="size-5" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
                {(!selectedJobNoForHistory.assignmentHistory ||
                  selectedJobNoForHistory.assignmentHistory.length === 0) ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No historical assignments recorded yet.
                  </p>
                ) : (
                  selectedJobNoForHistory.assignmentHistory
                    .slice()
                    .reverse()
                    .map((hist, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              hist.action === "assigned"
                                ? "bg-cyan-500/20 text-cyan-400"
                                : hist.action === "released"
                                ? "bg-amber-500/20 text-amber-400"
                                : hist.action === "restored"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : hist.action === "vacant_registered"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {hist.action}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {hist.timestamp ? new Date(hist.timestamp).toLocaleString() : ""}
                          </span>
                        </div>
                        {hist.customerName && (
                          <p className="text-slate-200 font-semibold pt-1">
                            Customer: {hist.customerName}
                          </p>
                        )}
                        {hist.reason && (
                          <p className="text-slate-400 text-[11px]">{hist.reason}</p>
                        )}
                      </div>
                    ))
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 mt-4 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedJobNoForHistory(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
