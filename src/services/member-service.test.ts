import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerMember,
  approveMember,
  rejectMember,
  issueCard,
  deactivateCard,
  listMembers,
  reissueCard,
  generateMemberId,
} from './member-service.ts'

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

/**
 * Creates a mock Drizzle database that simulates the chained query API.
 * Supports select (with where/limit and where/limit/offset/orderBy chains),
 * insert (with values/returning), and update (with set/where/returning).
 */
function createMockDb(options: {
  selectResults?: Record<string, unknown>[][]
  insertReturning?: Record<string, unknown>[][]
  updateReturning?: Record<string, unknown>[][]
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
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(results),
              }),
              then: (resolve: (v: unknown) => void) => resolve(results),
            })),
            then: (resolve: (v: unknown) => void) => resolve(results),
          })),
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(results),
            }),
          }),
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
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(results),
          }),
        }),
      }
    }),
  }

  return db as unknown as Parameters<typeof registerMember>[1]
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const tenantId = '123e4567-e89b-12d3-a456-426614174000'
const applicationId = 'app-uuid-001'
const memberId = 'member-uuid-001'
const reviewerId = 'admin-uuid-001'

const sampleApplicationRow = {
  id: applicationId,
  tenantId,
  fullName: 'John Doe',
  identityNumber: '3201234567890001',
  phone: '+628123456789',
  email: null,
  address: 'Jl. Merdeka No. 1',
  status: 'pending' as const,
  rejectionReason: null,
  submittedAt: new Date('2024-01-01'),
  reviewedAt: null,
  reviewedBy: null,
}

const sampleMemberRow = {
  id: memberId,
  tenantId,
  memberId: 'MBC-8829',
  applicationId,
  fullName: 'John Doe',
  identityNumber: '3201234567890001',
  phone: '+628123456789',
  email: null,
  cardUid: null,
  cardStatus: 'unissued' as const,
  registeredAt: new Date('2024-01-01'),
  lastActivityAt: null,
}

const validRegistrationInput = {
  tenantId,
  fullName: 'John Doe',
  identityNumber: '3201234567890001',
  phone: '+628123456789',
  address: 'Jl. Merdeka No. 1',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateMemberId', () => {
  it('returns a string in format MBC-XXXX', () => {
    const id = generateMemberId()
    expect(id).toMatch(/^MBC-\d{4}$/)
  })

  it('generates 4-digit numbers (1000-9999)', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateMemberId()
      const num = parseInt(id.split('-')[1]!, 10)
      expect(num).toBeGreaterThanOrEqual(1000)
      expect(num).toBeLessThanOrEqual(9999)
    }
  })
})

describe('registerMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a member application with status pending', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [], // identity number uniqueness check — no existing
      ],
      insertReturning: [
        [sampleApplicationRow], // application insert
      ],
    })

    const result = await registerMember(validRegistrationInput, mockDb)

    expect(result.fullName).toBe('John Doe')
    expect(result.status).toBe('pending')
    expect(result.tenantId).toBe(tenantId)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('throws when identity number already exists for tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ id: 'existing-app-id' }], // identity number found
      ],
    })

    await expect(
      registerMember(validRegistrationInput, mockDb),
    ).rejects.toThrow(
      'Identity number "3201234567890001" is already registered for this tenant',
    )
  })

  it('throws on invalid phone format', async () => {
    const mockDb = createMockDb()

    await expect(
      registerMember(
        { ...validRegistrationInput, phone: '12345' },
        mockDb,
      ),
    ).rejects.toThrow()
  })

  it('throws on missing fullName', async () => {
    const mockDb = createMockDb()

    await expect(
      registerMember(
        { ...validRegistrationInput, fullName: '' },
        mockDb,
      ),
    ).rejects.toThrow()
  })

  it('throws on missing address', async () => {
    const mockDb = createMockDb()

    await expect(
      registerMember(
        { ...validRegistrationInput, address: '' },
        mockDb,
      ),
    ).rejects.toThrow()
  })

  it('throws on invalid tenantId format', async () => {
    const mockDb = createMockDb()

    await expect(
      registerMember(
        { ...validRegistrationInput, tenantId: 'not-a-uuid' },
        mockDb,
      ),
    ).rejects.toThrow()
  })

  it('accepts optional email', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
      insertReturning: [
        [{ ...sampleApplicationRow, email: 'john@example.com' }],
      ],
    })

    const result = await registerMember(
      { ...validRegistrationInput, email: 'john@example.com' },
      mockDb,
    )

    expect(result.email).toBe('john@example.com')
  })

  it('accepts phone format starting with 08', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
      insertReturning: [
        [{ ...sampleApplicationRow, phone: '08123456789' }],
      ],
    })

    const result = await registerMember(
      { ...validRegistrationInput, phone: '08123456789' },
      mockDb,
    )

    expect(result.phone).toBe('08123456789')
  })
})

describe('approveMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a member record and updates application to approved', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleApplicationRow], // application lookup
      ],
      insertReturning: [
        [sampleMemberRow], // member insert
      ],
      updateReturning: [
        [{ ...sampleApplicationRow, status: 'approved', reviewedBy: reviewerId }], // application update
      ],
    })

    const result = await approveMember(tenantId, applicationId, reviewerId, mockDb)

    expect(result.memberId).toMatch(/^MBC-\d{4}$/)
    expect(result.cardStatus).toBe('unissued')
    expect(result.applicationId).toBe(applicationId)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('throws when application not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      approveMember(tenantId, 'nonexistent', reviewerId, mockDb),
    ).rejects.toThrow('Application "nonexistent" not found')
  })

  it('throws when application is not pending', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ ...sampleApplicationRow, status: 'approved' }],
      ],
    })

    await expect(
      approveMember(tenantId, applicationId, reviewerId, mockDb),
    ).rejects.toThrow('is not pending')
  })
})

describe('rejectMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates application to rejected with reason and reviewer', async () => {
    const rejectedRow = {
      ...sampleApplicationRow,
      status: 'rejected' as const,
      rejectionReason: 'Incomplete documents',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    }
    const mockDb = createMockDb({
      selectResults: [
        [sampleApplicationRow], // application lookup
      ],
      updateReturning: [
        [rejectedRow], // application update
      ],
    })

    const result = await rejectMember(
      tenantId,
      applicationId,
      'Incomplete documents',
      reviewerId,
      mockDb,
    )

    expect(result.status).toBe('rejected')
    expect(result.rejectionReason).toBe('Incomplete documents')
    expect(result.reviewedBy).toBe(reviewerId)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('throws when application not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      rejectMember(tenantId, 'nonexistent', 'reason', reviewerId, mockDb),
    ).rejects.toThrow('Application "nonexistent" not found')
  })

  it('throws when application is already rejected', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ ...sampleApplicationRow, status: 'rejected' }],
      ],
    })

    await expect(
      rejectMember(tenantId, applicationId, 'reason', reviewerId, mockDb),
    ).rejects.toThrow('is not pending')
  })
})

describe('issueCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links card UID to member and sets status to active', async () => {
    const updatedMember = {
      ...sampleMemberRow,
      cardUid: 'CARD-UID-001',
      cardStatus: 'active' as const,
    }
    const mockDb = createMockDb({
      selectResults: [
        [sampleMemberRow],  // member lookup
        [],                  // card UID uniqueness check — not assigned
      ],
      updateReturning: [
        [updatedMember],     // member update
      ],
    })

    const result = await issueCard(tenantId, memberId, 'CARD-UID-001', mockDb)

    expect(result.cardUid).toBe('CARD-UID-001')
    expect(result.cardStatus).toBe('active')
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('throws when member not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      issueCard(tenantId, 'nonexistent', 'CARD-UID-001', mockDb),
    ).rejects.toThrow('Member "nonexistent" not found')
  })

  it('throws when card is not unissued', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ ...sampleMemberRow, cardStatus: 'active' }],
      ],
    })

    await expect(
      issueCard(tenantId, memberId, 'CARD-UID-001', mockDb),
    ).rejects.toThrow('card is not unissued')
  })

  it('throws when card UID is already assigned', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleMemberRow],           // member lookup
        [{ id: 'other-member-id' }], // card UID already assigned
      ],
    })

    await expect(
      issueCard(tenantId, memberId, 'CARD-UID-001', mockDb),
    ).rejects.toThrow('This card is already assigned to another member.')
  })
})

describe('deactivateCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets card status to suspended', async () => {
    const activeMember = {
      ...sampleMemberRow,
      cardUid: 'CARD-UID-001',
      cardStatus: 'active' as const,
    }
    const suspendedMember = {
      ...activeMember,
      cardStatus: 'suspended' as const,
    }
    const mockDb = createMockDb({
      selectResults: [[activeMember]],
      updateReturning: [[suspendedMember]],
    })

    const result = await deactivateCard(tenantId, memberId, 'suspended', mockDb)

    expect(result.cardStatus).toBe('suspended')
  })

  it('sets card status to revoked', async () => {
    const activeMember = {
      ...sampleMemberRow,
      cardUid: 'CARD-UID-001',
      cardStatus: 'active' as const,
    }
    const revokedMember = {
      ...activeMember,
      cardStatus: 'revoked' as const,
    }
    const mockDb = createMockDb({
      selectResults: [[activeMember]],
      updateReturning: [[revokedMember]],
    })

    const result = await deactivateCard(tenantId, memberId, 'revoked', mockDb)

    expect(result.cardStatus).toBe('revoked')
  })

  it('throws when member not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      deactivateCard(tenantId, 'nonexistent', 'suspended', mockDb),
    ).rejects.toThrow('Member "nonexistent" not found')
  })

  it('throws when card is not active', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleMemberRow]], // cardStatus is 'unissued'
    })

    await expect(
      deactivateCard(tenantId, memberId, 'suspended', mockDb),
    ).rejects.toThrow('card is not active')
  })
})

describe('listMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated members with total count', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleMemberRow], // data query
        [{ count: 5 }],    // count query
      ],
    })

    const result = await listMembers(tenantId, {}, 1, 10, mockDb)

    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(10)
  })

  it('clamps page to minimum of 1', async () => {
    const mockDb = createMockDb({
      selectResults: [[], [{ count: 0 }]],
    })

    const result = await listMembers(tenantId, {}, -1, 10, mockDb)

    expect(result.page).toBe(1)
  })

  it('clamps pageSize to maximum of 100', async () => {
    const mockDb = createMockDb({
      selectResults: [[], [{ count: 0 }]],
    })

    const result = await listMembers(tenantId, {}, 1, 200, mockDb)

    expect(result.pageSize).toBe(100)
  })

  it('supports search filter', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleMemberRow],
        [{ count: 1 }],
      ],
    })

    const result = await listMembers(
      tenantId,
      { search: 'John' },
      1,
      10,
      mockDb,
    )

    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(1)
  })
})

describe('reissueCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unlinks old card and links new card UID', async () => {
    const suspendedMember = {
      ...sampleMemberRow,
      cardUid: 'OLD-CARD-UID',
      cardStatus: 'suspended' as const,
    }
    const unlinkedMember = {
      ...suspendedMember,
      cardUid: null,
      cardStatus: 'unissued' as const,
    }
    const reissuedMember = {
      ...suspendedMember,
      cardUid: 'NEW-CARD-UID',
      cardStatus: 'active' as const,
    }
    const mockDb = createMockDb({
      selectResults: [
        [suspendedMember], // member lookup
        [],                 // new card UID uniqueness check — not assigned
      ],
      updateReturning: [
        [unlinkedMember],  // unlink old card
        [reissuedMember],  // link new card
      ],
    })

    const result = await reissueCard(tenantId, memberId, 'NEW-CARD-UID', mockDb)

    expect(result.cardUid).toBe('NEW-CARD-UID')
    expect(result.cardStatus).toBe('active')
    expect(mockDb.update).toHaveBeenCalledTimes(2)
  })

  it('works with revoked card status', async () => {
    const revokedMember = {
      ...sampleMemberRow,
      cardUid: 'OLD-CARD-UID',
      cardStatus: 'revoked' as const,
    }
    const unlinkedMember = {
      ...revokedMember,
      cardUid: null,
      cardStatus: 'unissued' as const,
    }
    const reissuedMember = {
      ...revokedMember,
      cardUid: 'NEW-CARD-UID',
      cardStatus: 'active' as const,
    }
    const mockDb = createMockDb({
      selectResults: [
        [revokedMember],
        [],
      ],
      updateReturning: [
        [unlinkedMember],
        [reissuedMember],
      ],
    })

    const result = await reissueCard(tenantId, memberId, 'NEW-CARD-UID', mockDb)

    expect(result.cardUid).toBe('NEW-CARD-UID')
    expect(result.cardStatus).toBe('active')
  })

  it('throws when member not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      reissueCard(tenantId, 'nonexistent', 'NEW-CARD-UID', mockDb),
    ).rejects.toThrow('Member "nonexistent" not found')
  })

  it('throws when card is not deactivated', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ ...sampleMemberRow, cardStatus: 'active' }],
      ],
    })

    await expect(
      reissueCard(tenantId, memberId, 'NEW-CARD-UID', mockDb),
    ).rejects.toThrow('must be suspended or revoked')
  })

  it('throws when new card UID is already assigned', async () => {
    const suspendedMember = {
      ...sampleMemberRow,
      cardUid: 'OLD-CARD-UID',
      cardStatus: 'suspended' as const,
    }
    const unlinkedMember = {
      ...suspendedMember,
      cardUid: null,
      cardStatus: 'unissued' as const,
    }
    const mockDb = createMockDb({
      selectResults: [
        [suspendedMember],           // member lookup
        [{ id: 'other-member-id' }], // new card UID already assigned
      ],
      updateReturning: [
        [unlinkedMember],            // unlink old card
      ],
    })

    await expect(
      reissueCard(tenantId, memberId, 'NEW-CARD-UID', mockDb),
    ).rejects.toThrow('This card is already assigned to another member.')
  })
})
