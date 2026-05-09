import { z } from 'zod'

// ─── Tenant Input ────────────────────────────────────────────────────────────

/**
 * Tenant slug: lowercase alphanumeric with hyphens, 3-50 chars.
 * Requirements 1.1, 1.2
 */
export const tenantSlugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(50, 'Slug must be at most 50 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)',
  )

export const tenantBrandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g. #ff0000)'),
  logoUrl: z.string().url().nullable(),
  displayName: z.string().min(1, 'Display name is required'),
})

export const createTenantInputSchema = z
  .object({
    slug: tenantSlugSchema,
    name: z.string().min(1, 'Tenant name is required'),
    tariffRatePerHour: z
      .number()
      .int('Tariff rate must be an integer')
      .positive('Tariff rate must be positive')
      .default(2000),
    maxBalance: z
      .number()
      .int('Max balance must be an integer')
      .min(100_000, 'Max balance must be at least 100,000')
      .max(100_000_000, 'Max balance must be at most 100,000,000')
      .default(10_000_000),
    minBalanceForEntry: z
      .number()
      .int('Min balance for entry must be an integer')
      .positive('Min balance for entry must be positive')
      .default(2000),
    branding: tenantBrandingSchema.optional(),
  })
  .refine((data) => data.minBalanceForEntry >= data.tariffRatePerHour, {
    message: 'Minimum balance for entry must be >= tariff rate per hour',
    path: ['minBalanceForEntry'],
  })

export type CreateTenantInput = z.infer<typeof createTenantInputSchema>

// ─── Member Registration Input ───────────────────────────────────────────────

/**
 * Indonesian phone format: +62xxx or 08xxx
 * Requirements 2.1, 2.2
 */
export const indonesianPhoneSchema = z
  .string()
  .regex(
    /^(\+62|62|0)8[1-9][0-9]{6,10}$/,
    'Must be a valid Indonesian phone number (e.g. +628123456789 or 08123456789)',
  )

export const memberRegistrationInputSchema = z.object({
  tenantId: z.string().uuid('Tenant ID must be a valid UUID'),
  fullName: z.string().min(1, 'Full name is required'),
  identityNumber: z.string().min(1, 'Identity number is required'),
  phone: indonesianPhoneSchema,
  email: z.string().email('Must be a valid email address').optional(),
  address: z.string().min(1, 'Address is required'),
})

export type MemberRegistrationInput = z.infer<
  typeof memberRegistrationInputSchema
>

// ─── Top-Up Input ────────────────────────────────────────────────────────────

/**
 * Top-up validation.
 * Requirements 6.1, 6.2
 */
export const topUpSourceSchema = z.enum([
  'cash',
  'bank_transfer',
  'e_wallet',
  'other',
])

export const topUpInputSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
  amount: z
    .number()
    .int('Amount must be an integer')
    .positive('Amount must be positive'),
  source: topUpSourceSchema,
})

export type TopUpInput = z.infer<typeof topUpInputSchema>

// ─── Terminal Registration Input ─────────────────────────────────────────────

/**
 * Terminal registration validation.
 * Requirement 10.1
 */
export const terminalTypeSchema = z.enum([
  'gate',
  'terminal',
  'station',
  'scout',
])

export const terminalRegistrationInputSchema = z.object({
  tenantId: z.string().uuid('Tenant ID must be a valid UUID'),
  name: z.string().min(1, 'Terminal name is required'),
  type: terminalTypeSchema,
  location: z.string().optional(),
})

export type TerminalRegistrationInput = z.infer<
  typeof terminalRegistrationInputSchema
>
