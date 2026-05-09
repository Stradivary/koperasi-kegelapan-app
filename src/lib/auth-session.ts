import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from './auth.ts'
import { db } from '#/db/index.ts'
import { adminUsers } from '#/db/schema.ts'
import { eq } from 'drizzle-orm'

export const getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) return { session: null, adminUser: null }

    const [adminUser] = await db
      .select({ id: adminUsers.id, tenantId: adminUsers.tenantId, role: adminUsers.role, status: adminUsers.status })
      .from(adminUsers)
      .where(eq(adminUsers.email, session.user.email))
      .limit(1)

    return { session, adminUser: adminUser ?? null }
  } catch (error) {
    console.error('Session resolution failed:', error)
    return { session: null, adminUser: null }
  }
})
