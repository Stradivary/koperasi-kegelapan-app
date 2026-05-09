import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  adminLogin,
  validateSession,
  checkTenantAccess,
  checkRoleLevel,
  requireAccess,
  createAdminUser,
  updateAdminUser,
  getAdminUser,
  listAdminUsers,
  sessionKey,
  generateSessionToken,
} from './admin-auth-service.ts'
import type { SessionData } from './admin-auth-service.ts'
import type { KVCache } from '#/lib/kv-cache.ts'

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

function createMockDb(options: {
  selectResults?: Record<string, unknown>[][]
  insertReturning?: Record<string, unknown>[][]
  updateReturning?: Record<string, unknown>[][]
  updateVoid?: boolean
} = {}) {
  let selectCallIndex = 0
  let insertCallIndex = 0
  let updateCallIndex = 0

  const selectResults = options.selectResults ?? [[]]
  const insertReturning = options.insertReturning ?? [[]]
  const updateReturning = options.updateReturning ?? [[]]

  const db = {
    select: vi.fn().mockImplementation(() => {
      const idx = selectCallIndex++
      const results = selectResults[idx] ?? []
      const fromMock = vi.fn().mockImplementation(() => {
        const chainObj = {
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => ({
              then: (resolve: (v: unknown) => void) => resolve(results),
            })),
            orderBy: vi.fn().mockResolvedValue(results),
            then: (resolve: (v: unknown) => void) => resolve(results),
          })),
          orderBy: vi.fn().mockResolvedValue(results),
          then: (resolve: (v: unknown) => void) => resolve(results),
        }
        return chainObj
      })
      return { from: fromMock }
    }),
    insert: vi.fn().mockImplementation(() => {
      const idx = insertCallIndex++
      const results = insertReturning[idx] ?? []
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(results),
        }),
      }
    }),
    update: vi.fn().mockImplementation(() => {
      const idx = updateCallIndex++
      const results = updateReturning[idx] ?? []
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockResolvedValue(results),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          })),
        }),
      }
    }),
  }

  return db as unknown as Parameters<typeof adminLogin>[1]
}

function createMockKVCache(stored: Record<string, unknown> = {}): KVCache {
  const store = new Map(Object.entries(stored))
  return {
    get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null) as KVCache['get'],
    put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key)
    }),
  }
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const tenantId = '123e4567-e89b-12d3-a456-426614174000'
const adminId = 'admin-uuid-001'

const sampleAdminRow = {
  id: adminId,
  tenantId,
  email: 'admin@koperasi.id',
  name: 'Admin User',
  role: 'tenant_admin' as const,
  status: 'active' as const,
  createdAt: new Date('2024-01-01'),
  lastLoginAt: null,
}

const superAdminSession: SessionData = {
  adminId: 'super-admin-001',
  tenantId,
  email: 'super@mbc.id',
  name: 'Super Admin',
  role: 'super_admin',
}

const tenantAdminSession: SessionData = {
  adminId,
  tenantId,
  email: 'admin@koperasi.id',
  name: 'Admin User',
  role: 'tenant_admin',
}

const operatorSession: SessionData = {
  adminId: 'operator-001',
  tenantId,
  email: 'operator@koperasi.id',
  name: 'Operator',
  role: 'operator',
}

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn().mockReturnValue('mock-session-token'),
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sessionKey', () => {
  it('builds correct KV key', () => {
    expect(sessionKey('abc123')).toBe('admin:session:abc123')
  })
})

describe('generateSessionToken', () => {
  it('returns a UUID string', () => {
    const token = generateSessionToken()
    expect(token).toBe('mock-session-token')
  })
})

describe('adminLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates session and returns token for valid admin', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
    })
    const kvCache = createMockKVCache()

    const result = await adminLogin('admin@koperasi.id', mockDb, kvCache)

    expect(result.token).toBe('mock-session-token')
    expect(result.admin.email).toBe('admin@koperasi.id')
    expect(kvCache.put).toHaveBeenCalledWith(
      'admin:session:mock-session-token',
      expect.objectContaining({ adminId, email: 'admin@koperasi.id' }),
      86400,
    )
    expect(mockDb.update).toHaveBeenCalledTimes(1) // lastLoginAt update
  })

  it('uses custom TTL when provided', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
    })
    const kvCache = createMockKVCache()

    await adminLogin('admin@koperasi.id', mockDb, kvCache, 3600)

    expect(kvCache.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      3600,
    )
  })

  it('throws when admin not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })
    const kvCache = createMockKVCache()

    await expect(
      adminLogin('unknown@example.com', mockDb, kvCache),
    ).rejects.toThrow('Invalid credentials')
  })

  it('throws when admin is suspended', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ ...sampleAdminRow, status: 'suspended' }]],
    })
    const kvCache = createMockKVCache()

    await expect(
      adminLogin('admin@koperasi.id', mockDb, kvCache),
    ).rejects.toThrow('Account is suspended')
  })
})

describe('validateSession', () => {
  it('returns session data for valid token', async () => {
    const kvCache = createMockKVCache({
      'admin:session:valid-token': tenantAdminSession,
    })

    const result = await validateSession('valid-token', kvCache)

    expect(result).toEqual(tenantAdminSession)
  })

  it('returns null for invalid/expired token', async () => {
    const kvCache = createMockKVCache()

    const result = await validateSession('invalid-token', kvCache)

    expect(result).toBeNull()
  })
})

describe('checkTenantAccess', () => {
  it('super_admin can access any tenant', () => {
    expect(checkTenantAccess(superAdminSession, 'any-tenant-id')).toBe(true)
  })

  it('tenant_admin can access own tenant', () => {
    expect(checkTenantAccess(tenantAdminSession, tenantId)).toBe(true)
  })

  it('tenant_admin cannot access other tenant', () => {
    expect(checkTenantAccess(tenantAdminSession, 'other-tenant-id')).toBe(false)
  })

  it('operator can access own tenant', () => {
    expect(checkTenantAccess(operatorSession, tenantId)).toBe(true)
  })

  it('operator cannot access other tenant', () => {
    expect(checkTenantAccess(operatorSession, 'other-tenant-id')).toBe(false)
  })
})

describe('checkRoleLevel', () => {
  it('super_admin meets all role requirements', () => {
    expect(checkRoleLevel(superAdminSession, 'operator')).toBe(true)
    expect(checkRoleLevel(superAdminSession, 'tenant_admin')).toBe(true)
    expect(checkRoleLevel(superAdminSession, 'super_admin')).toBe(true)
  })

  it('tenant_admin meets operator and tenant_admin requirements', () => {
    expect(checkRoleLevel(tenantAdminSession, 'operator')).toBe(true)
    expect(checkRoleLevel(tenantAdminSession, 'tenant_admin')).toBe(true)
    expect(checkRoleLevel(tenantAdminSession, 'super_admin')).toBe(false)
  })

  it('operator only meets operator requirement', () => {
    expect(checkRoleLevel(operatorSession, 'operator')).toBe(true)
    expect(checkRoleLevel(operatorSession, 'tenant_admin')).toBe(false)
    expect(checkRoleLevel(operatorSession, 'super_admin')).toBe(false)
  })
})

describe('requireAccess', () => {
  it('allows super_admin access to any tenant with any role', () => {
    expect(() => requireAccess(superAdminSession, 'any-tenant', 'operator')).not.toThrow()
    expect(() => requireAccess(superAdminSession, 'any-tenant', 'tenant_admin')).not.toThrow()
    expect(() => requireAccess(superAdminSession, 'any-tenant', 'super_admin')).not.toThrow()
  })

  it('allows tenant_admin access to own tenant with tenant_admin role', () => {
    expect(() => requireAccess(tenantAdminSession, tenantId, 'tenant_admin')).not.toThrow()
  })

  it('throws when tenant_admin accesses other tenant', () => {
    expect(() => requireAccess(tenantAdminSession, 'other-tenant', 'operator')).toThrow(
      'do not have access to this tenant',
    )
  })

  it('throws when operator requires tenant_admin role', () => {
    expect(() => requireAccess(operatorSession, tenantId, 'tenant_admin')).toThrow(
      'requires tenant_admin role or higher',
    )
  })
})

describe('createAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates admin user with valid input', async () => {
    const newAdmin = {
      ...sampleAdminRow,
      id: 'new-admin-id',
      email: 'new@koperasi.id',
      role: 'operator' as const,
    }
    const mockDb = createMockDb({
      selectResults: [
        [], // email uniqueness check — not found
      ],
      insertReturning: [[newAdmin]],
    })

    const result = await createAdminUser(
      { tenantId, email: 'new@koperasi.id', name: 'New Admin', role: 'operator' },
      tenantAdminSession,
      mockDb,
    )

    expect(result.email).toBe('new@koperasi.id')
    expect(result.role).toBe('operator')
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('throws when email already exists', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ id: 'existing-id' }]],
    })

    await expect(
      createAdminUser(
        { tenantId, email: 'existing@koperasi.id', name: 'Test', role: 'operator' },
        tenantAdminSession,
        mockDb,
      ),
    ).rejects.toThrow('already in use')
  })

  it('throws when operator tries to create admin', async () => {
    const mockDb = createMockDb()

    await expect(
      createAdminUser(
        { tenantId, email: 'new@koperasi.id', name: 'Test', role: 'operator' },
        operatorSession,
        mockDb,
      ),
    ).rejects.toThrow('Only tenant_admin or super_admin')
  })

  it('throws when tenant_admin tries to assign super_admin role', async () => {
    const mockDb = createMockDb()

    await expect(
      createAdminUser(
        { tenantId, email: 'new@koperasi.id', name: 'Test', role: 'super_admin' },
        tenantAdminSession,
        mockDb,
      ),
    ).rejects.toThrow('Only super_admin can assign super_admin role')
  })

  it('super_admin can assign super_admin role', async () => {
    const newSuperAdmin = {
      ...sampleAdminRow,
      id: 'new-super-id',
      email: 'newsuperadmin@mbc.id',
      role: 'super_admin' as const,
    }
    const mockDb = createMockDb({
      selectResults: [[]],
      insertReturning: [[newSuperAdmin]],
    })

    const result = await createAdminUser(
      { tenantId, email: 'newsuperadmin@mbc.id', name: 'New Super', role: 'super_admin' },
      superAdminSession,
      mockDb,
    )

    expect(result.role).toBe('super_admin')
  })

  it('tenant_admin cannot create users for other tenants', async () => {
    const mockDb = createMockDb()

    await expect(
      createAdminUser(
        { tenantId: 'other-tenant-id', email: 'new@other.id', name: 'Test', role: 'tenant_admin' },
        tenantAdminSession,
        mockDb,
      ),
    ).rejects.toThrow('can only create users for their own tenant')
  })
})

describe('updateAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates admin user name', async () => {
    const updatedAdmin = { ...sampleAdminRow, name: 'Updated Name' }
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
      updateReturning: [[updatedAdmin]],
    })

    const result = await updateAdminUser(
      adminId,
      { name: 'Updated Name' },
      superAdminSession,
      mockDb,
    )

    expect(result.name).toBe('Updated Name')
  })

  it('suspends admin user', async () => {
    const suspendedAdmin = { ...sampleAdminRow, status: 'suspended' as const }
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
      updateReturning: [[suspendedAdmin]],
    })

    const result = await updateAdminUser(
      adminId,
      { status: 'suspended' },
      superAdminSession,
      mockDb,
    )

    expect(result.status).toBe('suspended')
  })

  it('throws when admin not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      updateAdminUser('nonexistent', { name: 'Test' }, superAdminSession, mockDb),
    ).rejects.toThrow('not found')
  })

  it('throws when operator tries to update', async () => {
    const mockDb = createMockDb()

    await expect(
      updateAdminUser(adminId, { name: 'Test' }, operatorSession, mockDb),
    ).rejects.toThrow('Only tenant_admin or super_admin')
  })

  it('throws when tenant_admin tries to assign super_admin role', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
    })

    await expect(
      updateAdminUser(adminId, { role: 'super_admin' }, tenantAdminSession, mockDb),
    ).rejects.toThrow('Only super_admin can assign super_admin role')
  })

  it('throws when tenant_admin updates user in other tenant', async () => {
    const otherTenantAdmin = { ...sampleAdminRow, tenantId: 'other-tenant-id' }
    const mockDb = createMockDb({
      selectResults: [[otherTenantAdmin]],
    })

    await expect(
      updateAdminUser(adminId, { name: 'Test' }, tenantAdminSession, mockDb),
    ).rejects.toThrow('can only update users in their own tenant')
  })

  it('returns unchanged record when no updates provided', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
    })

    const result = await updateAdminUser(adminId, {}, superAdminSession, mockDb)

    expect(result).toEqual(sampleAdminRow)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe('getAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns admin when found', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow]],
    })

    const result = await getAdminUser(adminId, mockDb)

    expect(result).toEqual(sampleAdminRow)
  })

  it('returns null when not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getAdminUser('nonexistent', mockDb)

    expect(result).toBeNull()
  })
})

describe('listAdminUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns admin users for a tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleAdminRow, { ...sampleAdminRow, id: 'admin-002', email: 'admin2@koperasi.id' }]],
    })

    const result = await listAdminUsers(tenantId, mockDb)

    expect(result).toHaveLength(2)
  })

  it('returns empty array when no admins exist', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await listAdminUsers(tenantId, mockDb)

    expect(result).toEqual([])
  })
})
