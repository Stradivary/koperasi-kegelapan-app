/**
 * Maps a device role to its allowed operations.
 *
 * Shared between server-side session grant issuance (Node.js) and
 * client-side local session grant generation (Web Crypto).
 */
export function roleToOps(role: string): string[] {
  switch (role) {
    case "terminal":
      return ["read", "debit", "checkout"];
    case "gate":
      return ["read", "checkin"];
    case "scout":
      return ["read"];
    case "kiosk":
      return ["read", "debit"];
    case "station":
      return ["read", "credit", "checkin", "checkout", "admin"];
    case "admin":
      return ["read", "debit", "credit", "checkin", "checkout", "admin", "station"];
    default:
      return ["read"];
  }
}
