// FNV-32a hash - deterministic, no async needed, sufficient for 4-byte binding
export function fnv32a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.codePointAt(i)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function encodeTenantBind(tenantId: string): number {
  return fnv32a(tenantId);
}

export function isTenantBindValid(tenantBind: number, tenantId: string): boolean {
  if (tenantBind === 0) return true; // legacy unbound card → allow
  return tenantBind === fnv32a(tenantId);
}
