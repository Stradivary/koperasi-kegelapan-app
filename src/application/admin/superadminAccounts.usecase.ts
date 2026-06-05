import { getDb } from "#/infrastructure/persistence/drizzle";
import { accounts, tenants } from "#/infrastructure/persistence/drizzle/schema";
import { eq, sql, like, or, desc, count } from "drizzle-orm";
import { hashPassword, generateId } from "#/core/auth/authRules";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccountListItem {
  accountId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  username: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface AccountListResponse {
  accounts: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAccountRequest {
  tenantId: string;
  username: string;
  password: string;
  role: string;
}

export interface CreateAccountResult {
  status: 201 | 400 | 409;
  data:
    | { accountId: string; username: string }
    | { error: string; errors?: { field: string; message: string }[] };
}

export interface ChangePasswordRequest {
  accountId: string;
  newPassword: string;
}

export interface ChangePasswordResult {
  status: 200 | 400 | 404;
  data: { ok: true } | { error: string };
}

export interface UpdateAccountStatusRequest {
  accountId: string;
  status: "active" | "suspended";
}

export interface UpdateAccountStatusResult {
  status: 200 | 400 | 404;
  data: { ok: true; accountId: string; status: string } | { error: string };
}

// ─── List Accounts ───────────────────────────────────────────────────────────

export async function listAccounts(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<AccountListResponse> {
  const db = getDb();

  let pageSize = params.pageSize ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  let page = params.page ?? 1;
  if (!Number.isInteger(page) || page < 1) page = 1;

  const search = params.search?.trim() || undefined;

  const whereCondition = search
    ? or(
        like(sql`lower(${accounts.username})`, `%${search.toLowerCase()}%`),
        like(sql`lower(${tenants.name})`, `%${search.toLowerCase()}%`),
        like(sql`lower(${tenants.slug})`, `%${search.toLowerCase()}%`),
      )
    : undefined;

  // Get total count
  const totalResult = await db
    .select({ value: count() })
    .from(accounts)
    .leftJoin(tenants, eq(accounts.tenantId, tenants.tenantId))
    .where(whereCondition)
    .get();

  const total = totalResult?.value ?? 0;

  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      accountId: accounts.accountId,
      tenantId: accounts.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      username: accounts.username,
      role: accounts.role,
      status: accounts.status,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .leftJoin(tenants, eq(accounts.tenantId, tenants.tenantId))
    .where(whereCondition)
    .orderBy(desc(accounts.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

  const accountList: AccountListItem[] = rows.map((row) => ({
    accountId: row.accountId,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? "-",
    tenantSlug: row.tenantSlug ?? "-",
    username: row.username,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));

  return { accounts: accountList, total, page, pageSize };
}

// ─── Create Account ──────────────────────────────────────────────────────────

const VALID_ROLES = ["admin", "station", "gate", "terminal", "scout", "superadmin"];

export async function createAccount(body: unknown): Promise<CreateAccountResult> {
  if (!body || typeof body !== "object") {
    return { status: 400, data: { error: "Invalid request body" } };
  }

  const { tenantId, username, password, role } = body as CreateAccountRequest;

  const errors: { field: string; message: string }[] = [];

  if (!tenantId || typeof tenantId !== "string") {
    errors.push({ field: "tenantId", message: "Tenant ID is required" });
  }

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    errors.push({ field: "username", message: "Username must be at least 3 characters" });
  } else if (!/^[a-z0-9_-]+$/.test(username.trim())) {
    errors.push({
      field: "username",
      message: "Username must contain only lowercase letters, digits, underscores, and hyphens",
    });
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    errors.push({ field: "password", message: "Password must be at least 8 characters" });
  }

  if (!role || !VALID_ROLES.includes(role)) {
    errors.push({ field: "role", message: `Role must be one of: ${VALID_ROLES.join(", ")}` });
  }

  if (errors.length > 0) {
    return { status: 400, data: { error: "validation", errors } };
  }

  const db = getDb();

  // Verify tenant exists
  const tenant = await db
    .select({ tenantId: tenants.tenantId })
    .from(tenants)
    .where(eq(tenants.tenantId, tenantId))
    .get();

  if (!tenant) {
    return { status: 400, data: { error: "Tenant not found" } };
  }

  const accountId = generateId();
  const passwordHash = hashPassword(password);

  try {
    await db
      .insert(accounts)
      .values({
        accountId,
        tenantId,
        username: username.trim(),
        passwordHash,
        role: role as typeof accounts.$inferInsert.role,
        status: "active",
      })
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return { status: 409, data: { error: "Username already exists" } };
    }
    throw e;
  }

  return { status: 201, data: { accountId, username: username.trim() } };
}

// ─── Change Password ─────────────────────────────────────────────────────────

export async function changeAccountPassword(body: unknown): Promise<ChangePasswordResult> {
  if (!body || typeof body !== "object") {
    return { status: 400, data: { error: "Invalid request body" } };
  }

  const { accountId, newPassword } = body as ChangePasswordRequest;

  if (!accountId || typeof accountId !== "string") {
    return { status: 400, data: { error: "Account ID is required" } };
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return { status: 400, data: { error: "New password must be at least 8 characters" } };
  }

  if (newPassword.length > 128) {
    return { status: 400, data: { error: "Password must not exceed 128 characters" } };
  }

  const db = getDb();

  const account = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(eq(accounts.accountId, accountId))
    .get();

  if (!account) {
    return { status: 404, data: { error: "Account not found" } };
  }

  const passwordHash = hashPassword(newPassword);

  await db
    .update(accounts)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(accounts.accountId, accountId))
    .run();

  return { status: 200, data: { ok: true } };
}

// ─── Update Account Status ───────────────────────────────────────────────────

export async function updateAccountStatus(body: unknown): Promise<UpdateAccountStatusResult> {
  if (!body || typeof body !== "object") {
    return { status: 400, data: { error: "Invalid request body" } };
  }

  const { accountId, status } = body as UpdateAccountStatusRequest;

  if (!accountId || typeof accountId !== "string") {
    return { status: 400, data: { error: "Account ID is required" } };
  }

  if (!status || !["active", "suspended"].includes(status)) {
    return { status: 400, data: { error: "Status must be 'active' or 'suspended'" } };
  }

  const db = getDb();

  const account = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(eq(accounts.accountId, accountId))
    .get();

  if (!account) {
    return { status: 404, data: { error: "Account not found" } };
  }

  await db
    .update(accounts)
    .set({ status, updatedAt: new Date() })
    .where(eq(accounts.accountId, accountId))
    .run();

  return { status: 200, data: { ok: true, accountId, status } };
}
