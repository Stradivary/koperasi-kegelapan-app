import { describe, it, expect } from 'vitest'
import {
  extractTenantSlugFromHostname,
  extractTenantSlugFromPath,
  extractTenantSlug,
} from './tenant-context.ts'

describe('extractTenantSlugFromHostname', () => {
  it('extracts subdomain from a 3-part hostname', () => {
    expect(extractTenantSlugFromHostname('koperasi-a.mbc.id')).toBe(
      'koperasi-a',
    )
  })

  it('extracts subdomain from a 4-part hostname', () => {
    expect(extractTenantSlugFromHostname('koperasi-b.app.mbc.id')).toBe(
      'koperasi-b',
    )
  })

  it('returns null for localhost', () => {
    expect(extractTenantSlugFromHostname('localhost')).toBeNull()
  })

  it('returns null for localhost with port', () => {
    expect(extractTenantSlugFromHostname('localhost:3000')).toBeNull()
  })

  it('returns null for IP addresses', () => {
    expect(extractTenantSlugFromHostname('192.168.1.1')).toBeNull()
  })

  it('returns null for bare domain (2 parts)', () => {
    expect(extractTenantSlugFromHostname('mbc.id')).toBeNull()
  })

  it('ignores www subdomain', () => {
    expect(extractTenantSlugFromHostname('www.mbc.id')).toBeNull()
  })

  it('ignores api subdomain', () => {
    expect(extractTenantSlugFromHostname('api.mbc.id')).toBeNull()
  })

  it('ignores admin subdomain', () => {
    expect(extractTenantSlugFromHostname('admin.mbc.id')).toBeNull()
  })

  it('strips port before extracting', () => {
    expect(extractTenantSlugFromHostname('koperasi-a.mbc.id:8080')).toBe(
      'koperasi-a',
    )
  })
})

describe('extractTenantSlugFromPath', () => {
  it('extracts slug from /t/{slug}/ path', () => {
    expect(extractTenantSlugFromPath('/t/koperasi-a/dashboard')).toBe(
      'koperasi-a',
    )
  })

  it('extracts slug from /t/{slug} without trailing slash', () => {
    expect(extractTenantSlugFromPath('/t/koperasi-a')).toBe('koperasi-a')
  })

  it('handles simple slugs', () => {
    expect(extractTenantSlugFromPath('/t/demo/members')).toBe('demo')
  })

  it('returns null for non-matching paths', () => {
    expect(extractTenantSlugFromPath('/dashboard')).toBeNull()
  })

  it('returns null for empty path', () => {
    expect(extractTenantSlugFromPath('/')).toBeNull()
  })

  it('returns null for /t/ without slug', () => {
    expect(extractTenantSlugFromPath('/t/')).toBeNull()
  })
})

describe('extractTenantSlug', () => {
  it('prefers subdomain over path prefix', () => {
    const request = new Request(
      'https://koperasi-a.mbc.id/t/koperasi-b/dashboard',
    )
    expect(extractTenantSlug(request)).toBe('koperasi-a')
  })

  it('falls back to path prefix when no subdomain', () => {
    const request = new Request('https://mbc.id/t/koperasi-b/dashboard')
    expect(extractTenantSlug(request)).toBe('koperasi-b')
  })

  it('returns null when neither subdomain nor path prefix', () => {
    const request = new Request('https://mbc.id/dashboard')
    expect(extractTenantSlug(request)).toBeNull()
  })

  it('returns null for localhost without path prefix', () => {
    const request = new Request('http://localhost:3000/dashboard')
    expect(extractTenantSlug(request)).toBeNull()
  })

  it('extracts from path prefix on localhost', () => {
    const request = new Request('http://localhost:3000/t/koperasi-a/dashboard')
    expect(extractTenantSlug(request)).toBe('koperasi-a')
  })
})
