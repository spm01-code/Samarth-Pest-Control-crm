import usePermission from "../hooks/usePermission";

/**
 * PermissionGuard component
 * Conditionally renders children only if current user possesses the required permission.
 */
export const PermissionGuard = ({
  children,
  require = "admin", // 'admin' | 'edit' | 'delete' | 'hr' | 'settings' | 'upload'
  fallback = null,
}) => {
  const permissions = usePermission();

  let isAllowed = false;

  switch (require) {
    case "admin":
    case "hr":
    case "settings":
    case "upload":
    case "manageUsers":
      isAllowed = permissions.isAdmin;
      break;
    case "edit":
      isAllowed = permissions.canEdit;
      break;
    case "delete":
      isAllowed = permissions.canDelete;
      break;
    case "create":
      isAllowed = permissions.canCreate;
      break;
    case "view":
      isAllowed = permissions.canView;
      break;
    default:
      isAllowed = false;
  }

  if (!isAllowed) {
    return fallback;
  }

  return children;
};

export default PermissionGuard;
