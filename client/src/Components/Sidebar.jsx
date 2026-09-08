import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../slices/authSlice";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineBellAlert,
  HiOutlineBriefcase,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineDocumentText,
  HiOutlineHomeModern,
  HiOutlineUserGroup,
  HiOutlineUsers,
  HiOutlineWrenchScrewdriver,
  HiOutlineArrowRightOnRectangle,
  HiOutlineCog6Tooth,
  HiOutlineArrowUpTray,
} from "react-icons/hi2";
import logo from "/logo.png";

const sections = [
  {
    label: "CRM",
    icon: HiOutlineHomeModern,
    items: [
      { name: "Customers", path: "/", icon: HiOutlineUsers, end: true },
      { name: "Services", path: "/services", icon: HiOutlineWrenchScrewdriver },
    ],
  },
  {
    label: "Sales",
    icon: HiOutlineBriefcase,
    items: [
      { name: "Quotations", path: "/quotation", icon: HiOutlineDocumentText },
      { name: "Invoices", path: "/invoices", icon: HiOutlineDocumentText },
      { name: "Contract Renewals", path: "/renewals", icon: HiOutlineDocumentText },
    ],
  },
  {
    label: "HR",
    icon: HiOutlineUserGroup,
    items: [
      { name: "Employees", path: "/employees", icon: HiOutlineUsers },
      { name: "Attendance", path: "/attendance", icon: HiOutlineDocumentText },
    ],
  },
];

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const [expanded, setExpanded] = useState(() =>
    Object.fromEntries(
      sections.map((section) => [
        section.label,
        true,
      ]),
    ),
  );

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  const toggleSection = (label) => {
    setExpanded((current) => ({ ...current, [label]: !current[label] }));
  };

  return (
    <aside className="z-20 w-full border-b border-slate-800 bg-[#071526] text-white shadow-xl shadow-slate-950/20 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 lg:min-h-25 lg:px-6 lg:py-5">
        <div className="flex h-12 items-center rounded-lg bg-white px-3 shadow-sm shadow-black/15">
          <img src={logo} alt="SPM CRM" className="h-8 w-auto object-contain" />
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-white/8 hover:text-white lg:hidden"
          aria-label="Log out"
        >
          <HiOutlineArrowRightOnRectangle className="size-5" />
        </button>
      </div>

      <nav className="sidebar-scroll flex gap-2 overflow-x-auto px-3 py-3 lg:block lg:flex-1 lg:overflow-y-auto lg:px-4 lg:py-5" aria-label="Main navigation">
        <NavLink
          to="/alerts"
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition active:translate-y-[2px] active:shadow-none lg:mb-2 ${
              isActive
                ? "bg-cyan-400/12 text-cyan-200 ring-1 ring-inset ring-cyan-300/20 shadow-[0_3px_0_0_rgba(34,211,238,0.2)]"
                : "text-slate-300 hover:bg-white/6 hover:text-white hover:shadow-[0_3px_0_0_rgba(255,255,255,0.05)]"
            }`
          }
        >
          <HiOutlineBellAlert className="size-5" />
          Alerts
        </NavLink>

        <NavLink
          to="/upload"
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition active:translate-y-[2px] active:shadow-none lg:mb-2 ${
              isActive
                ? "bg-cyan-400/12 text-cyan-200 ring-1 ring-inset ring-cyan-300/20 shadow-[0_3px_0_0_rgba(34,211,238,0.2)]"
                : "text-slate-300 hover:bg-white/6 hover:text-white hover:shadow-[0_3px_0_0_rgba(255,255,255,0.05)]"
            }`
          }
        >
          <HiOutlineArrowUpTray className="size-5" />
          Upload
        </NavLink>

        {sections.map((section) => {
          const SectionIcon = section.icon;
          const isExpanded = expanded[section.label];
          const hasActiveItem = section.items.some((item) =>
            item.end ? location.pathname === item.path : location.pathname.startsWith(item.path),
          );

          return (
            <div key={section.label} className="shrink-0 lg:mb-2">
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition active:translate-y-[2px] active:shadow-none ${
                  hasActiveItem
                    ? "text-white hover:bg-white/6 hover:shadow-[0_3px_0_0_rgba(255,255,255,0.05)]"
                    : "text-slate-400 hover:bg-white/6 hover:text-slate-200 hover:shadow-[0_3px_0_0_rgba(255,255,255,0.05)]"
                }`}
                aria-expanded={isExpanded}
              >
                <SectionIcon className="size-5" />
                <span>{section.label}</span>
                {isExpanded ? <HiOutlineChevronDown className="ml-auto size-4" /> : <HiOutlineChevronRight className="ml-auto size-4" />}
              </button>

              {isExpanded && (
                <div className="ml-5 mt-1 border-l border-slate-700/80 pl-3 lg:mb-3">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.end}
                        className={({ isActive }) =>
                          `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition active:translate-y-[2px] active:shadow-none ${
                            isActive
                              ? "bg-cyan-400/12 font-semibold text-cyan-200 shadow-[0_3px_0_0_rgba(34,211,238,0.2)]"
                              : "text-slate-400 hover:bg-white/6 hover:text-slate-100 hover:shadow-[0_3px_0_0_rgba(255,255,255,0.05)]"
                          }`
                        }
                      >
                        <ItemIcon className="size-4" />
                        {item.name}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/8 p-4 lg:block">
        <button onClick={() => navigate("/settings")} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/6 hover:shadow-[0_3px_0_0_rgba(255,255,255,0.05)] active:translate-y-[2px] active:shadow-none">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800/80 text-sm font-bold text-white shadow-lg shadow-cyan-950/30">
            {user?.name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">{user?.name || "Admin"}</p>
            <p className="truncate text-xs text-slate-500">{user?.email || "Administrator"}</p>
          </div>
          <HiOutlineCog6Tooth className="size-5 text-slate-500" />
        </button>
        <button onClick={handleLogout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/70 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 hover:shadow-[0_3px_0_0_rgba(239,68,68,0.15)] active:translate-y-[2px] active:shadow-none">
          <HiOutlineArrowRightOnRectangle className="size-5" />
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
