/**
 * Member Management Service
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4
 *
 * Handles member self-registration, admin approval/rejection workflow,
 * card issuance, card deactivation, card re-issuance, and member listing.
 */

import { eq, and, or, sql, count, ilike, isNull } from 'drizzle-orm'
import { memberApplications, members } from '#/db/schema.ts'
import { memberRegistrationInputSchema } from '#/db/validations.ts'
import type { MemberRegistrationInput } from '#/db/validations.ts'
import type { db as DbType } from '#/db/index.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemberApplicationRecord {
  id: string
  tenantId: string
  fullName: string
  identityNumber: string
  phone: string
  email: string | null
  address: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason: string | null
  submittedAt: Date
  reviewedAt: Date | null
  reviewedBy: string | null
}

export interface MemberRecord {
  id: string
  tenantId: string
  memberId: string
  applicationId: string
  fullName: string
  identityNumber: string
  phone: string
  email: string | null
  cardUid: string | null
  cardStatus: 'unissued' | 'active' | 'suspended' | 'revoked'
  registeredAt: Date
  lastActivityAt: Date | null
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface MemberFilters {
  search?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a member ID in the format "MBC-XXXX" with 4 random digits.
 */
export function generateMemberId(): string {
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `MBC-${digits}`
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Register a new member application with Zod validation.
 * Requirements: 2.1, 2.2
 *
 * @param input - Member registration input (validated with memberRegistrationInputSchema)
 * @param database - Drizzle database instance
 * @returns The created member application record
 * @throws Error if identity number already exists for the tenant or validation fails
 */
export async function registerMember(
  input: MemberRegistrationInput,
  database: typeof DbType,
): Promise<MemberApplicationRecord> {
  // 1. Validate input with Zod schema
  const parsed = memberRegistrationInputSchema.parse(input)

  // 2. Check identityNumber uniqueness within the tenant
  const [existing] = await database
    .select({ id: memberApplications.id })
    .from(memberApplications)
    .where(
      and(
        eq(memberApplications.tenantId, parsed.tenantId),
        eq(memberApplications.identityNumber, parsed.identityNumber),
      ),
    )
    .limit(1)

  if (existing) {
    throw new Error(
      `Identity number "${parsed.identityNumber}" is already registered for this tenant`,
    )
  }

  // 3. Create MemberApplication with status "pending"
  const [application] = await database
    .insert(memberApplications)
    .values({
      tenantId: parsed.tenantId,
      fullName: parsed.fullName,
      identityNumber: parsed.identityNumber,
      phone: parsed.phone,
      email: parsed.email ?? null,
      address: parsed.address,
      status: 'pending',
    })
    .returning()

  if (!application) {
    throw new Error('Failed to create member application')
  }

  return application as MemberApplicationRecord
}

/**
 * Approve a pending member application.
 * Requirements: 2.3
 *
 * @param tenantId - UUID of the tenant
 * @param applicationId - UUID of the application to approve
 * @param reviewerId - ID of the admin performing the approval
 * @param database - Drizzle database instance
 * @returns The created member record
 * @throws Error if application not found, not pending, or member creation fails
 */
export async function approveMember(
  tenantId: string,
  applicationId: string,
  reviewerId: string,
  database: typeof DbType,
): Promise<MemberRecord> {
  // 1. Verify application exists and is "pending"
  const [application] = await database
    .select()
    .from(memberApplications)
    .where(
      and(
        eq(memberApplications.id, applicationId),
        eq(memberApplications.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!application) {
    throw new Error(`Application "${applicationId}" not found`)
  }

  if (application.status !== 'pending') {
    throw new Error(
      `Application "${applicationId}" is not pending (current status: ${application.status})`,
    )
  }

  // 2. Generate memberId like "MBC-XXXX"
  const memberId = generateMemberId()

  // 3. Create Member record linked to application
  const [member] = await database
    .insert(members)
    .values({
      tenantId,
      memberId,
      applicationId,
      fullName: application.fullName,
      identityNumber: application.identityNumber,
      phone: application.phone,
      email: application.email,
      cardStatus: 'unissued',
    })
    .returning()

  if (!member) {
    throw new Error('Failed to create member record')
  }

  // 4. Update application status to "approved"
  const [updatedApplication] = await database
    .update(memberApplications)
    .set({
      status: 'approved',
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
    })
    .where(eq(memberApplications.id, applicationId))
    .returning()

  if (!updatedApplication) {
    throw new Error('Failed to update application status')
  }

  return member as MemberRecord
}

/**
 * Reject a pending member application.
 * Requirements: 2.4
 *
 * @param tenantId - UUID of the tenant
 * @param applicationId - UUID of the application to reject
 * @param reason - Rejection reason
 * @param reviewerId - ID of the admin performing the rejection
 * @param database - Drizzle database instance
 * @returns The updated application record
 * @throws Error if application not found or not pending
 */
export async function rejectMember(
  tenantId: string,
  applicationId: string,
  reason: string,
  reviewerId: string,
  database: typeof DbType,
): Promise<MemberApplicationRecord> {
  // 1. Verify application exists and is "pending"
  const [application] = await database
    .select()
    .from(memberApplications)
    .where(
      and(
        eq(memberApplications.id, applicationId),
        eq(memberApplications.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!application) {
    throw new Error(`Application "${applicationId}" not found`)
  }

  if (application.status !== 'pending') {
    throw new Error(
      `Application "${applicationId}" is not pending (current status: ${application.status})`,
    )
  }

  // 2. Update status to "rejected", record reason, reviewer, timestamp
  const [updated] = await database
    .update(memberApplications)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
    })
    .where(eq(memberApplications.id, applicationId))
    .returning()

  if (!updated) {
    throw new Error('Failed to update application status')
  }

  return updated as MemberApplicationRecord
}

/**
 * Issue a card to a member by linking a card UID.
 * Requirements: 3.1, 3.2
 *
 * @param tenantId - UUID of the tenant
 * @param memberId - UUID of the member (internal id, not the MBC-XXXX id)
 * @param cardUid - Physical NFC card UID
 * @param database - Drizzle database instance
 * @returns The updated member record
 * @throws Error if member not found, card not unissued, or UID already assigned
 */
export async function issueCard(
  tenantId: string,
  memberId: string,
  cardUid: string,
  database: typeof DbType,
): Promise<MemberRecord> {
  // 1. Verify member exists and cardStatus is "unissued"
  const [member] = await database
    .select()
    .from(members)
    .where(
      and(
        eq(members.id, memberId),
        eq(members.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!member) {
    throw new Error(`Member "${memberId}" not found`)
  }

  if (member.cardStatus !== 'unissued') {
    throw new Error(
      `Member "${memberId}" card is not unissued (current status: ${member.cardStatus})`,
    )
  }

  // 2. Check card UID is not already assigned to any member (globally)
  const [existingCard] = await database
    .select({ id: members.id })
    .from(members)
    .where(eq(members.cardUid, cardUid))
    .limit(1)

  if (existingCard) {
    throw new Error('This card is already assigned to another member.')
  }

  // 3. Update member's cardUid and cardStatus to "active"
  const [updated] = await database
    .update(members)
    .set({
      cardUid,
      cardStatus: 'active',
    })
    .where(eq(members.id, memberId))
    .returning()

  if (!updated) {
    throw new Error('Failed to update member card')
  }

  return updated as MemberRecord
}

/**
 * Deactivate a member's card (suspend or revoke).
 * Requirements: 3.3
 *
 * @param tenantId - UUID of the tenant
 * @param memberId - UUID of the member (internal id)
 * @param status - Target status: "suspended" or "revoked"
 * @param database - Drizzle database instance
 * @returns The updated member record
 * @throws Error if member not found or card is not active
 */
export async function deactivateCard(
  tenantId: string,
  memberId: string,
  status: 'suspended' | 'revoked',
  database: typeof DbType,
): Promise<MemberRecord> {
  // 1. Verify member exists and card is "active"
  const [member] = await database
    .select()
    .from(members)
    .where(
      and(
        eq(members.id, memberId),
        eq(members.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!member) {
    throw new Error(`Member "${memberId}" not found`)
  }

  if (member.cardStatus !== 'active') {
    throw new Error(
      `Member "${memberId}" card is not active (current status: ${member.cardStatus})`,
    )
  }

  // 2. Set cardStatus to "suspended" or "revoked"
  const [updated] = await database
    .update(members)
    .set({
      cardStatus: status,
    })
    .where(eq(members.id, memberId))
    .returning()

  if (!updated) {
    throw new Error('Failed to deactivate card')
  }

  return updated as MemberRecord
}

/**
 * List members with search and pagination.
 * Requirements: 2.5
 *
 * @param tenantId - UUID of the tenant
 * @param filters - Search filters (search across fullName, memberId, identityNumber, phone)
 * @param page - Page number (1-based)
 * @param pageSize - Number of items per page
 * @param database - Drizzle database instance
 * @returns Paginated list of members with total count
 */
export async function listMembers(
  tenantId: string,
  filters: MemberFilters,
  page: number,
  pageSize: number,
  database: typeof DbType,
): Promise<PaginatedResult<MemberRecord>> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)))
  const offset = (safePage - 1) * safePageSize

  // Build where conditions
  const tenantCondition = eq(members.tenantId, tenantId)

  let whereCondition = tenantCondition
  if (filters.search) {
    const searchPattern = `%${filters.search}%`
    const searchCondition = or(
      ilike(members.fullName, searchPattern),
      ilike(members.memberId, searchPattern),
      ilike(members.identityNumber, searchPattern),
      ilike(members.phone, searchPattern),
    )
    whereCondition = and(tenantCondition, searchCondition)!
  }

  const [data, totalResult] = await Promise.all([
    database
      .select()
      .from(members)
      .where(whereCondition)
      .limit(safePageSize)
      .offset(offset)
      .orderBy(members.registeredAt),
    database
      .select({ count: count() })
      .from(members)
      .where(whereCondition),
  ])

  const total = totalResult[0]?.count ?? 0

  return {
    data: data as MemberRecord[],
    total,
    page: safePage,
    pageSize: safePageSize,
  }
}

/**
 * Re-issue a card to a member whose card has been deactivated.
 * Requirements: 3.4
 *
 * @param tenantId - UUID of the tenant
 * @param memberId - UUID of the member (internal id)
 * @param newCardUid - New physical NFC card UID
 * @param database - Drizzle database instance
 * @returns The updated member record
 * @throws Error if member not found, card not deactivated, or new UID already assigned
 */
export async function reissueCard(
  tenantId: string,
  memberId: string,
  newCardUid: string,
  database: typeof DbType,
): Promise<MemberRecord> {
  // 1. Verify member exists and card is deactivated (suspended/revoked)
  const [member] = await database
    .select()
    .from(members)
    .where(
      and(
        eq(members.id, memberId),
        eq(members.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!member) {
    throw new Error(`Member "${memberId}" not found`)
  }

  if (member.cardStatus !== 'suspended' && member.cardStatus !== 'revoked') {
    throw new Error(
      `Member "${memberId}" card must be suspended or revoked for re-issuance (current status: ${member.cardStatus})`,
    )
  }

  // 2. Unlink old cardUid (set to null)
  const [unlinked] = await database
    .update(members)
    .set({
      cardUid: null,
      cardStatus: 'unissued',
    })
    .where(eq(members.id, memberId))
    .returning()

  if (!unlinked) {
    throw new Error('Failed to unlink old card')
  }

  // 3. Verify new card UID is globally unique
  const [existingCard] = await database
    .select({ id: members.id })
    .from(members)
    .where(eq(members.cardUid, newCardUid))
    .limit(1)

  if (existingCard) {
    throw new Error('This card is already assigned to another member.')
  }

  // 4. Link new UID, set cardStatus to "active"
  const [updated] = await database
    .update(members)
    .set({
      cardUid: newCardUid,
      cardStatus: 'active',
    })
    .where(eq(members.id, memberId))
    .returning()

  if (!updated) {
    throw new Error('Failed to link new card')
  }

  return updated as MemberRecord
}
