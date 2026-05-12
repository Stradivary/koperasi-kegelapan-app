import { useQuery } from '@tanstack/react-query'

interface AdminSectionProps {
  tenantId: string
  role: string
}

async function fetchCards(tenantId: string) {
  const res = await fetch(`/api/cards?tenantId=${tenantId}`)
  if (!res.ok) throw new Error('Failed to fetch cards')
  return res.json()
}

async function fetchAuditLog(tenantId: string) {
  const res = await fetch(`/api/audit?tenantId=${tenantId}&limit=50`)
  if (!res.ok) throw new Error('Failed to fetch audit log')
  return res.json()
}

export function AdminSection({ tenantId, role }: AdminSectionProps) {
  const cards = useQuery({ queryKey: ['cards', tenantId], queryFn: () => fetchCards(tenantId) })
  const audit = useQuery({ queryKey: ['audit', tenantId], queryFn: () => fetchAuditLog(tenantId) })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{role}</span>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium text-sm">Cards</h2>
        {cards.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {cards.error && <p className="text-sm text-destructive">{String(cards.error)}</p>}
        {cards.data && (
          <div className="rounded-lg border divide-y">
            {cards.data.map((card: { cardId: string; status: string; balance: number; userId: number }) => (
              <div key={card.cardId} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{card.cardId}</p>
                  <p className="text-xs text-muted-foreground">User #{card.userId}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">Rp {card.balance?.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{card.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-sm">Recent Audit Log</h2>
        {audit.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {audit.error && <p className="text-sm text-destructive">{String(audit.error)}</p>}
        {audit.data && (
          <div className="rounded-lg border divide-y text-sm">
            {audit.data.map((entry: { id: number; type: string; amount: number; balanceAfter: number; timestamp: number; flagged: boolean }) => (
              <div key={entry.id} className="px-4 py-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">{entry.type}</span>
                  {entry.flagged && <span className="ml-2 text-xs text-destructive">flagged</span>}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Rp {entry.amount?.toLocaleString()}</p>
                  <p>{new Date(entry.timestamp * 1000).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
