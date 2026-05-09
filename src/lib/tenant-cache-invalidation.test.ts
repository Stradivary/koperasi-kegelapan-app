import { describe, it, expect, vi } from 'vitest'
import { invalidateTenantCache } from './tenant-cache-invalidation.ts'
import type { KVCache } from './kv-cache.ts'

describe('invalidateTenantCache', () => {
  it('deletes the correct KV key for the given slug', async () => {
    const mockCache: KVCache = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }

    await invalidateTenantCache('koperasi-a', mockCache)

    expect(mockCache.delete).toHaveBeenCalledWith('tenant:config:koperasi-a')
    expect(mockCache.delete).toHaveBeenCalledTimes(1)
  })

  it('handles different slugs correctly', async () => {
    const mockCache: KVCache = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }

    await invalidateTenantCache('koperasi-desa-b', mockCache)

    expect(mockCache.delete).toHaveBeenCalledWith(
      'tenant:config:koperasi-desa-b',
    )
  })
})
