import { refreshSession, logout } from "../slices/authSlice";

let activeRefreshPromise = null;

export const isExpiredTokenError = (error) => {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("invalid or expired token") ||
    msg.includes("access token expired") ||
    msg.includes("jwt expired") ||
    msg.includes("unauthorized")
  );
};

/**
 * Executes an authenticated API call with automatic token refresh on 401.
 * Prevents multiple concurrent refresh calls and avoids infinite loops.
 */
export const withFreshToken = async (thunkAPI, request) => {
  try {
    return await request(thunkAPI.getState().auth.token);
  } catch (error) {
    if (!isExpiredTokenError(error)) {
      throw error;
    }

    if (!activeRefreshPromise) {
      activeRefreshPromise = thunkAPI
        .dispatch(refreshSession())
        .unwrap()
        .finally(() => {
          activeRefreshPromise = null;
        });
    }

    try {
      const refreshedSession = await activeRefreshPromise;
      return await request(refreshedSession.accessToken);
    } catch (refreshErr) {
      thunkAPI.dispatch(logout());
      throw new Error("Your session has expired. Please log in again.");
    }
  }
};

export default withFreshToken;
