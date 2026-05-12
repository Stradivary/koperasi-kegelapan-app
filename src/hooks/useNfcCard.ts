import { useState, useCallback, useRef } from 'react'
import { readAndValidateCard, prepareWrite, commitWrite } from '../core/nfc/pipelineEngine'
import type { CardPayload, SessionGrant } from '../core/payload/types'
import { reconciliationOutbox, makeIdempotencyKey } from '../lib/indexeddb'

export type NfcCardPhase =
  | 'idle'
  | 'scanning'
  | 'validating'
  | 'ready'
  | 'writing'
  | 'success'
  | 'error'

export interface NfcCardState {
  phase: NfcCardPhase
  payload: CardPayload | null
  serialNumber: string | null
  error: string | null
  tamperDetected: boolean
}

export function useNfcCard(grant: SessionGrant | null, tenantId: string, terminalId: number) {
  const [state, setState] = useState<NfcCardState>({
    phase: 'idle',
    payload: null,
    serialNumber: null,
    error: null,
    tamperDetected: false,
  })
  const abortRef = useRef<AbortController | null>(null)

  const scan = useCallback(async () => {
    if (!grant) {
      setState((s) => ({ ...s, phase: 'error', error: 'No active session grant' }))
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setState({ phase: 'scanning', payload: null, serialNumber: null, error: null, tamperDetected: false })

    const result = await readAndValidateCard(abortRef.current.signal, grant)

    if (!result.ok) {
      setState({ phase: 'error', payload: null, serialNumber: null, error: result.error, tamperDetected: result.tamper ?? false })
      return
    }

    const cardIdHex = Array.from(result.payload.header.cardId).map((b) => b.toString(16).padStart(2, '0')).join('')
    void cardIdHex
    setState({
      phase: 'ready',
      payload: result.payload,
      serialNumber: result.serialNumber,
      error: null,
      tamperDetected: false,
    })
  }, [grant])

  const write = useCallback(
    async (updatedPayload: CardPayload): Promise<boolean> => {
      if (!grant || !state.payload) return false

      setState((s) => ({ ...s, phase: 'writing' }))
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const raw = await prepareWrite(state.payload, updatedPayload, grant)
        const result = await commitWrite(raw, abortRef.current.signal)

        if (!result.ok) {
          setState((s) => ({ ...s, phase: 'error', error: result.error }))
          return false
        }

        const cardIdHex = Array.from(updatedPayload.header.cardId)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

        await reconciliationOutbox.add({
          tenantId,
          terminalId,
          cardId: cardIdHex,
          counter: Number(updatedPayload.wallet.counter),
          type: 'debit',
          amount: state.payload.wallet.balance - updatedPayload.wallet.balance,
          balanceAfter: updatedPayload.wallet.balance,
          timestamp: updatedPayload.wallet.lastTimestamp,
          hash: Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
          idempotencyKey: makeIdempotencyKey(tenantId, cardIdHex, Number(updatedPayload.wallet.counter)),
        })

        setState({ phase: 'success', payload: result.payload, serialNumber: state.serialNumber, error: null, tamperDetected: false })
        return true
      } catch (e) {
        setState((s) => ({ ...s, phase: 'error', error: String(e) }))
        return false
      }
    },
    [grant, state.payload, state.serialNumber, tenantId, terminalId],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({ phase: 'idle', payload: null, serialNumber: null, error: null, tamperDetected: false })
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState((s) => ({ ...s, phase: 'idle' }))
  }, [])

  return { state, scan, write, reset, cancel }
}
