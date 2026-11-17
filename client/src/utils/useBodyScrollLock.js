import { useScrollLock } from "../hooks/useScrollLock";

/**
 * Backwards-compatible alias for useScrollLock.
 * Uses centralized reference-counted scroll lock manager with position restoration
 * and layout shift prevention.
 */
export function useBodyScrollLock(isLocked = true) {
  useScrollLock(isLocked);
}

export default useBodyScrollLock;
