/**
 * TanStack Start configuration with global middleware.
 * Registers the tenant-aware middleware to run on every request.
 */

import { createStart } from '@tanstack/react-start'
import { tenantMiddleware } from './lib/tenant-middleware.ts'

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [tenantMiddleware],
  }
})
