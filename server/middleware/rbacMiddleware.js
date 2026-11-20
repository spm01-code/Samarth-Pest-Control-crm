import logAuditEvent from "../utils/auditLogger.js";

/**
 * Middleware: requireAdmin
 * Allows only users with role === 'admin'.
 */
export const requireAdmin = (req, res, next) => {
  const user = req.user || req.admin;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Authentication required",
    });
  }

  if (user.role !== "admin") {
    logAuditEvent({
      req,
      action: "ACCESS_DENIED_ADMIN_REQUIRED",
      module: req.baseUrl || "RBAC",
      details: { path: req.originalUrl, method: req.method },
      status: "BLOCKED",
    });

    return res.status(403).json({
      success: false,
      message: "Forbidden: Admin access required",
    });
  }

  next();
};

/**
 * Middleware: requireEmployee
 * Allows users with role === 'employee' or role === 'admin'.
 */
export const requireEmployee = (req, res, next) => {
  const user = req.user || req.admin;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Authentication required",
    });
  }

  if (user.role !== "employee" && user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Insufficient permissions",
    });
  }

  next();
};

/**
 * Middleware: allowRoles
 * Allows only specific specified roles.
 */
export const allowRoles = (...allowed) => {
  return (req, res, next) => {
    const user = req.user || req.admin;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Authentication required",
      });
    }

    if (!allowed.includes(user.role)) {
      logAuditEvent({
        req,
        action: "ACCESS_DENIED_ROLE_RESTRICTED",
        module: req.baseUrl || "RBAC",
        details: { path: req.originalUrl, method: req.method, userRole: user.role, allowed },
        status: "BLOCKED",
      });

      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to roles: ${allowed.join(", ")}`,
      });
    }

    next();
  };
};

/**
 * Middleware: blockEmployeeMutations
 * Blocks PUT, PATCH, and DELETE requests from Employee users across general CRUD modules.
 * Employees are not allowed to edit existing records or delete existing records.
 */
export const blockEmployeeMutations = (req, res, next) => {
  const user = req.user || req.admin;

  if (user && user.role === "employee") {
    const mutationMethods = ["PUT", "PATCH", "DELETE"];
    if (mutationMethods.includes(req.method.toUpperCase())) {
      logAuditEvent({
        req,
        action: "EMPLOYEE_MUTATION_BLOCKED",
        module: req.baseUrl || "GENERAL",
        details: {
          path: req.originalUrl,
          method: req.method,
          params: req.params,
        },
        status: "BLOCKED",
      });

      return res.status(403).json({
        success: false,
        message: "Forbidden: Employees are not permitted to modify or delete existing records",
      });
    }
  }

  next();
};

/**
 * Middleware: blockEmployeeHR
 * Complete blockage of any HR endpoints for Employees.
 */
export const blockEmployeeHR = (req, res, next) => {
  const user = req.user || req.admin;

  if (user && user.role !== "admin") {
    logAuditEvent({
      req,
      action: "EMPLOYEE_HR_ACCESS_BLOCKED",
      module: "HR",
      details: {
        path: req.originalUrl,
        method: req.method,
      },
      status: "BLOCKED",
    });

    return res.status(403).json({
      success: false,
      message: "Forbidden: Employees do not have access to the HR module",
    });
  }

  next();
};
