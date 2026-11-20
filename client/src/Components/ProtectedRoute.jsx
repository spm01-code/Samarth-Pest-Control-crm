import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";

/**
 * ProtectedRoute component
 * Validates authentication and ensures user has an authorized role.
 * Unauthorized role redirects to dashboard. Unauthenticated redirects to login.
 */
export const ProtectedRoute = ({
  allowedRoles = ["admin", "employee"],
  redirectTo = "/",
}) => {
  const { user, token } = useSelector((state) => state.auth);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = String(user.role || "employee").toLowerCase().trim();

  if (!allowedRoles.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
