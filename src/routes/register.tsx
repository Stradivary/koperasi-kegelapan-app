/**
 * Member Self-Registration Portal
 *
 * Public-facing registration form for prospective members.
 * Includes Zod client-side validation and tenant branding.
 *
 * Requirements: 1.5, 2.1, 2.2
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { z } from 'zod'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { TenantBranding } from '#/components/TenantBranding.tsx'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

// Client-side validation schema matching server-side memberRegistrationInputSchema
const registrationSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  identityNumber: z.string().min(1, 'Identity number (KTP) is required'),
  phone: z
    .string()
    .regex(
      /^(\+62|62|0)8[1-9][0-9]{6,10}$/,
      'Must be a valid Indonesian phone number (e.g. +628123456789 or 08123456789)',
    ),
  email: z
    .string()
    .email('Must be a valid email address')
    .or(z.literal(''))
    .optional(),
  address: z.string().min(1, 'Address is required'),
})

type RegistrationForm = z.infer<typeof registrationSchema>

type FieldErrors = Partial<Record<keyof RegistrationForm, string>>

function RegisterPage() {
  const [form, setForm] = useState<RegistrationForm>({
    fullName: '',
    identityNumber: '',
    phone: '',
    email: '',
    address: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // TODO: Get from tenant context
  const tenant = {
    id: 'tenant-1',
    slug: 'koperasi-a',
    name: 'Koperasi Desa A',
    branding: {
      primaryColor: '#2563eb',
      logoUrl: null,
      displayName: 'Koperasi Desa A',
    },
  }

  const updateField = useCallback(
    (field: keyof RegistrationForm, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }))
      // Clear field error on change
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    },
    [],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)

      // Validate with Zod
      const result = registrationSchema.safeParse(form)
      if (!result.success) {
        const fieldErrors: FieldErrors = {}
        for (const issue of result.error.issues) {
          const field = issue.path[0] as keyof RegistrationForm
          if (!fieldErrors[field]) {
            fieldErrors[field] = issue.message
          }
        }
        setErrors(fieldErrors)
        return
      }

      setSubmitting(true)
      setErrors({})

      try {
        // TODO: Call server function to register member
        // await registerMember({ ...result.data, tenantId: tenant.id })
        await new Promise((resolve) => setTimeout(resolve, 1000))
        setSubmitted(true)
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Registration failed. Please try again.',
        )
      } finally {
        setSubmitting(false)
      }
    },
    [form],
  )

  if (submitted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <TenantBranding tenant={tenant} />
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <span className="mb-4 block text-5xl" aria-hidden="true">
            ✅
          </span>
          <h1 className="mb-2 text-2xl font-bold">Registration Submitted</h1>
          <p className="text-muted-foreground">
            Your application has been submitted and is pending approval by the
            cooperative administrator. You will be notified once your
            application is reviewed.
          </p>
          <div
            className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            role="status"
            aria-label="Application status: pending approval"
          >
            Status: <strong>Pending Approval</strong>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <TenantBranding tenant={tenant} />

      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">{tenant.branding.displayName}</h1>
          <p className="mt-1 text-muted-foreground">Member Registration</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-2xl border border-border bg-card p-6"
          aria-label="Member registration form"
        >
          {/* Full Name */}
          <div>
            <Label htmlFor="reg-fullname" className="mb-1">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reg-fullname"
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.fullName}
              aria-describedby={
                errors.fullName ? 'err-fullname' : undefined
              }
              className="min-h-[48px]"
              placeholder="Enter your full name"
            />
            {errors.fullName && (
              <p id="err-fullname" className="mt-1 text-sm text-red-600">
                {errors.fullName}
              </p>
            )}
          </div>

          {/* Identity Number */}
          <div>
            <Label htmlFor="reg-identity" className="mb-1">
              Identity Number (KTP) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reg-identity"
              value={form.identityNumber}
              onChange={(e) => updateField('identityNumber', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.identityNumber}
              aria-describedby={
                errors.identityNumber ? 'err-identity' : undefined
              }
              className="min-h-[48px]"
              placeholder="Enter your KTP number"
            />
            {errors.identityNumber && (
              <p id="err-identity" className="mt-1 text-sm text-red-600">
                {errors.identityNumber}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="reg-phone" className="mb-1">
              Phone Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reg-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.phone}
              aria-describedby="phone-desc"
              className="min-h-[48px]"
              placeholder="+628123456789"
            />
            <p id="phone-desc" className="mt-1 text-xs text-muted-foreground">
              Indonesian format: +62xxx or 08xxx
            </p>
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
            )}
          </div>

          {/* Email (optional) */}
          <div>
            <Label htmlFor="reg-email" className="mb-1">
              Email (optional)
            </Label>
            <Input
              id="reg-email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'err-email' : undefined}
              className="min-h-[48px]"
              placeholder="your@email.com"
            />
            {errors.email && (
              <p id="err-email" className="mt-1 text-sm text-red-600">
                {errors.email}
              </p>
            )}
          </div>

          {/* Address */}
          <div>
            <Label htmlFor="reg-address" className="mb-1">
              Address <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reg-address"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'err-address' : undefined}
              className="min-h-[48px]"
              placeholder="Enter your full address"
            />
            {errors.address && (
              <p id="err-address" className="mt-1 text-sm text-red-600">
                {errors.address}
              </p>
            )}
          </div>

          {/* Submit Error */}
          {submitError && (
            <div
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
              role="alert"
            >
              {submitError}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            aria-label="Submit registration"
            className="min-h-[48px] w-full text-lg"
          >
            {submitting ? 'Submitting...' : 'Register'}
          </Button>
        </form>
      </div>
    </main>
  )
}
