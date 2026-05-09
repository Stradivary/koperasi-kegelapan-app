/**
 * Auth utility functions for redirect URL validation.
 * Prevents open redirect attacks by ensuring redirect paths are local.
 */

/**
 * Validates that a redirect path is a safe, local application path.
 *
 * Returns `true` only if the path:
 * - Is a non-empty string
 * - Starts with `/`
 * - Does not start with `//` (protocol-relative URL)
 * - Does not contain `://` (absolute URL with scheme)
 *
 * @param path - The redirect path to validate
 * @returns `true` if the path is a valid local redirect, `false` otherwise
 */
export function isValidRedirectPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  if (path.includes('://')) return false
  return true
}
