import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { localDb, type Card, type User } from '../../db/local-db'
import { StationCardsPanel, type StationCardRow, type StationUserRow } from '../block/StationCardsPanel'
import { StationMembersPanel } from '../block/StationMembersPanel'

interface StationSectionProps {
  tenantId: string
  role: string
}

type Tab = 'cards' | 'members'

async function getCardsWithUsers(tenantId: string): Promise<StationCardRow[]> {
  const [cardRows, userRows] = await Promise.all([
    localDb.cards.where('tenantId').equals(tenantId).toArray(),
    localDb.users.where('tenantId').equals(tenantId).toArray(),
  ])
  const userMap = new Map<number, string>(userRows.map((u) => [u.userId, u.name]))
  return cardRows.map((c) => ({
    cardId: c.cardId,
    userId: c.userId,
    userName: c.userId != null ? (userMap.get(c.userId) ?? null) : null,
    status: c.status,
    balance: c.balance,
    counter: c.counter,
    expiresAt: c.expiresAt != null ? new Date(c.expiresAt * 1000).toISOString().split('T')[0] : null,
  }))
}

export function StationSection({ tenantId }: StationSectionProps) {
  const [tab, setTab] = useState<Tab>('cards')
  const qc = useQueryClient()

  // Queries
  const cards = useQuery<StationCardRow[]>({
    queryKey: ['station-cards', tenantId],
    queryFn: () => getCardsWithUsers(tenantId),
  })

  const members = useQuery<StationUserRow[]>({
    queryKey: ['users', tenantId],
    queryFn: () =>
      localDb.users.where('tenantId').equals(tenantId).toArray() as Promise<StationUserRow[]>,
  })

  // Mutations
  const registerCard = useMutation({
    mutationFn: async ({ cardId, userId, balance, expiresAt }: {
      cardId: string; userId: number | null; balance: number; expiresAt: number | null
    }) => {
      const now = Math.floor(Date.now() / 1000)
      await localDb.cards.add({
        tenantId,
        cardId,
        userId,
        status: 'active',
        balance,
        counter: 0,
        keyVersion: 1,
        createdAt: now,
        lastActivityAt: null,
        expiresAt,
        notes: null,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['station-cards', tenantId] }),
  })

  const topupCard = useMutation({
    mutationFn: async ({ cardId, amount }: { cardId: string; amount: number }) => {
      const card = await localDb.cards.get([tenantId, cardId])
      if (!card) throw new Error('Kartu tidak ditemukan')
      await localDb.cards.update([tenantId, cardId], {
        balance: (card.balance ?? 0) + amount,
        lastActivityAt: Math.floor(Date.now() / 1000),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['station-cards', tenantId] }),
  })

  const updateCardStatus = useMutation({
    mutationFn: async ({ card, status }: { card: StationCardRow; status: string }) => {
      await localDb.cards.update([tenantId, card.cardId], { status: status as Card['status'] })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['station-cards', tenantId] }),
  })

  const createMember = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const existing = await localDb.users.where('tenantId').equals(tenantId).toArray()
      const nextId = existing.length > 0 ? Math.max(...existing.map((u) => u.userId)) + 1 : 1001
      const now = Math.floor(Date.now() / 1000)
      await localDb.users.add({
        tenantId,
        userId: nextId,
        name: name.trim(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', tenantId] }),
  })

  const toggleMemberStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: string }) => {
      await localDb.users.update([tenantId, userId], {
        status: status as User['status'],
        updatedAt: Math.floor(Date.now() / 1000),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', tenantId] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Station</h1>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setTab('cards')}
            className={cn(
              'px-4 py-1.5 text-sm transition-colors',
              tab === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            Kartu
          </button>
          <button
            onClick={() => setTab('members')}
            className={cn(
              'px-4 py-1.5 text-sm transition-colors border-l',
              tab === 'members' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            Anggota
          </button>
        </div>
      </div>

      {tab === 'cards' && (
        <StationCardsPanel
          cards={cards.data ?? []}
          members={members.data ?? []}
          isLoading={cards.isLoading}
          isRegistering={registerCard.isPending}
          isTopping={topupCard.isPending}
          isUpdatingStatus={updateCardStatus.isPending}
          onRegisterCard={(data) => registerCard.mutateAsync(data)}
          onTopupCard={(cardId, amount) => topupCard.mutateAsync({ cardId, amount })}
          onUpdateCardStatus={(card, newStatus) => updateCardStatus.mutate({ card, status: newStatus })}
        />
      )}
      {tab === 'members' && (
        <StationMembersPanel
          members={members.data ?? []}
          isLoading={members.isLoading}
          isCreating={createMember.isPending}
          isToggling={toggleMemberStatus.isPending}
          onCreateMember={(name) => createMember.mutateAsync({ name })}
          onToggleStatus={(userId, currentStatus) =>
            toggleMemberStatus.mutate({
              userId,
              status: currentStatus === 'active' ? 'suspended' : 'active',
            })
          }
        />
      )}
    </div>
  )
}
