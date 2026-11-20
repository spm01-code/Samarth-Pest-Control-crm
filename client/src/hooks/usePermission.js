import { useSelector } from "react-redux";

/**
 * Custom hook to get user role and permission capabilities.
 */
export const usePermission = () => {
  const { user, token } = useSelector((state) => state.auth);

  const rawRole = user?.role || (localStorage.getItem("admin") ? JSON.parse(localStorage.getItem("admin"))?.role : null);
  const role = String(rawRole || "employee").toLowerCase().trim();

  const isAuthenticated = Boolean(token && user);
  const isAdmin = isAuthenticated && role === "admin";
  const isEmployee = isAuthenticated && role === "employee";

  return {
    user,
    role,
    isAuthenticated,
    isAdmin,
    isEmployee,
    canView: isAuthenticated,
    canCreate: isAuthenticated,
    canEdit: isAdmin,
    canDelete: isAdmin,
    canAccessHR: isAdmin,
    canAccessSettings: isAdmin,
    canAccessUpload: isAdmin,
    canManageUsers: isAdmin,
  };
};

export default usePermission;
