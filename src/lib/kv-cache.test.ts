import { describe, it, expect, vi } from 'vitest'
import {
  tenantCacheKey,
  createKVCache,
  TENANT_CACHE_TTL,
  type CloudflareKVNamespace,
} from './kv-cache.ts'

describe('tenantCacheKey', () => {
  it('builds a prefixed key from slug', () => {
    expect(tenantCacheKey('koperasi-a')).toBe('tenant:config:koperasi-a')
  })

  it('handles simple slugs', () => {
    expect(tenantCacheKey('demo')).toBe('tenant:config:demo')
  })
})

describe('TENANT_CACHE_TTL', () => {
  it('is 300 seconds (5 minutes)', () => {
    expect(TENANT_CACHE_TTL).toBe(300)
  })
})

describe('createKVCache', () => {
  function createMockKV(): CloudflareKVNamespace {
    const store = new Map<string, string>()
    return {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value)
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key)
      }),
    }
  }

  it('get returns parsed JSON from KV', async () => {
    const mockKV = createMockKV()
    const cache = createKVCache(mockKV)

    await mockKV.put('test-key', JSON.stringify({ name: 'test' }))
    const result = await cache.get<{ name: string }>('test-key')

    expect(result).toEqual({ name: 'test' })
  })

  it('get returns null for missing keys', async () => {
    const mockKV = createMockKV()
    const cache = createKVCache(mockKV)

    const result = await cache.get('nonexistent')
    expect(result).toBeNull()
  })

  it('get returns null for invalid JSON', async () => {
    const mockKV = createMockKV()
    const cache = createKVCache(mockKV)

    await mockKV.put('bad-json', 'not-json{')
    const result = await cache.get('bad-json')
    expect(result).toBeNull()
  })

  it('put serializes value as JSON with TTL', async () => {
    const mockKV = createMockKV()
    const cache = createKVCache(mockKV)

    await cache.put('key', { data: 42 }, 600)

    expect(mockKV.put).toHaveBeenCalledWith(
      'key',
      JSON.stringify({ data: 42 }),
      { expirationTtl: 600 },
    )
  })

  it('put uses default TTL when not specified', async () => {
    const mockKV = createMockKV()
    const cache = createKVCache(mockKV)

    await cache.put('key', { data: 42 })

    expect(mockKV.put).toHaveBeenCalledWith(
      'key',
      JSON.stringify({ data: 42 }),
      { expirationTtl: 300 },
    )
  })

  it('delete removes the key', async () => {
    const mockKV = createMockKV()
    const cache = createKVCache(mockKV)

    await cache.delete('key')

    expect(mockKV.delete).toHaveBeenCalledWith('key')
  })
})
