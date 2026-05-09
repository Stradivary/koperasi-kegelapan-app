import type { CloudflareKVNamespace } from './kv-cache.ts'

export const D1_BINDING_NAME = 'MBC_D1'
export const TENANT_CONFIG_KV_BINDING_NAME = 'TENANT_CONFIG_KV'

export function getCloudflareEnv():
  | {
      [TENANT_CONFIG_KV_BINDING_NAME]?: CloudflareKVNamespace
      [D1_BINDING_NAME]?: unknown
    }
  | undefined {
  return (globalThis as any).__env as any
}

export function getD1Binding<T = unknown>(): T | undefined {
  return getCloudflareEnv()?.[D1_BINDING_NAME] as T | undefined
}
