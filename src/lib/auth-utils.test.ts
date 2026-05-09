/**
 * Property-based tests for auth-utils redirect URL validation.
 * Feature: better-auth-login, Property 1: Redirect URL validation safety
 *
 * **Validates: Requirements 8.2, 8.3**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { isValidRedirectPath } from './auth-utils.ts'

/**
 * Reference predicate: a redirect path is valid if and only if:
 * 1. It is a non-empty string
 * 2. It starts with '/'
 * 3. It does NOT start with '//'
 * 4. It does NOT contain '://'
 */
function expectedValid(s: string): boolean {
  if (!s || typeof s !== 'string') return false
  if (!s.startsWith('/')) return false
  if (s.startsWith('//')) return false
  if (s.includes('://')) return false
  return true
}

describe('Feature: better-auth-login, Property 1: Redirect URL validation safety', () => {
  /**
   * Property: For any arbitrary string, isValidRedirectPath agrees with the reference predicate.
   * **Validates: Requirements 8.2, 8.3**
   */
  it('isValidRedirectPath matches the safety predicate for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(isValidRedirectPath(s)).toBe(expectedValid(s))
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: For any web URL, isValidRedirectPath returns false (external URLs are never valid).
   * **Validates: Requirements 8.2, 8.3**
   */
  it('isValidRedirectPath rejects all web URLs', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(isValidRedirectPath(url)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: For any valid-looking local path (starts with '/', no '//' prefix, no '://'),
   * isValidRedirectPath returns true.
   * **Validates: Requirements 8.2, 8.3**
   */
  it('isValidRedirectPath accepts valid local paths', () => {
    // Custom arbitrary: generates paths like /foo, /bar/baz, /admin?tab=1
    const localPathArb = fc
      .tuple(
        fc.stringMatching(/^[a-zA-Z0-9._~:@!$&'()*+,;=-]+$/),
        fc.array(
          fc.stringMatching(/^[a-zA-Z0-9._~:@!$&'()*+,;=-]+$/),
          { minLength: 0, maxLength: 5 },
        ),
      )
      .map(([first, rest]) => '/' + [first, ...rest].join('/'))
      .filter((p) => !p.includes('://') && !p.startsWith('//'))

    fc.assert(
      fc.property(localPathArb, (path) => {
        expect(isValidRedirectPath(path)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Protocol-relative URLs (starting with '//') are always rejected.
   * **Validates: Requirements 8.2, 8.3**
   */
  it('isValidRedirectPath rejects protocol-relative URLs', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        // Strip the scheme to create a protocol-relative URL
        const protocolRelative = '//' + url.replace(/^https?:\/\//, '')
        expect(isValidRedirectPath(protocolRelative)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Strings containing '://' are always rejected, regardless of prefix.
   * **Validates: Requirements 8.2, 8.3**
   */
  it('isValidRedirectPath rejects any string containing a scheme separator', () => {
    // Generate strings that contain '://' somewhere
    const schemeStringArb = fc
      .tuple(fc.string(), fc.string())
      .map(([prefix, suffix]) => prefix + '://' + suffix)

    fc.assert(
      fc.property(schemeStringArb, (s) => {
        expect(isValidRedirectPath(s)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})

/**
 * Unit tests (example-based) for isValidRedirectPath.
 * Feature: better-auth-login, Task 2.3
 *
 * **Validates: Requirements 8.2, 8.3**
 */
describe('isValidRedirectPath – unit tests', () => {
  describe('valid paths', () => {
    it('accepts /admin', () => {
      expect(isValidRedirectPath('/admin')).toBe(true)
    })

    it('accepts /terminal/gate', () => {
      expect(isValidRedirectPath('/terminal/gate')).toBe(true)
    })

    it('accepts /admin/users?tab=1', () => {
      expect(isValidRedirectPath('/admin/users?tab=1')).toBe(true)
    })
  })

  describe('invalid paths', () => {
    it('rejects an absolute URL with https scheme', () => {
      expect(isValidRedirectPath('https://evil.com')).toBe(false)
    })

    it('rejects a protocol-relative URL (//evil.com)', () => {
      expect(isValidRedirectPath('//evil.com')).toBe(false)
    })

    it('rejects an empty string', () => {
      expect(isValidRedirectPath('')).toBe(false)
    })

    it('rejects undefined (cast as any)', () => {
      expect(isValidRedirectPath(undefined as any)).toBe(false)
    })

    it('rejects null (cast as any)', () => {
      expect(isValidRedirectPath(null as any)).toBe(false)
    })

    it('rejects a path containing ://', () => {
      expect(isValidRedirectPath('/foo://bar')).toBe(false)
    })

    it('rejects an http URL', () => {
      expect(isValidRedirectPath('http://evil.com')).toBe(false)
    })

    it('rejects a bare domain without scheme', () => {
      expect(isValidRedirectPath('evil.com')).toBe(false)
    })
  })
})
