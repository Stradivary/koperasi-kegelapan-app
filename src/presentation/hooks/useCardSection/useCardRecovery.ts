import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isNfcSupported } from "#/presentation/hooks/domain";
import type { CardPayload, SessionGrant } from "#/presentation/hooks/types";
import { executeRecovery } from "#/presentation/components/section/CardSection.utils";

export interface UseCardRecoveryOptions {
  tenantId: string;
  grant: SessionGrant | null;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
}

export function useCardRecovery({
  tenantId,
  grant,
  onOpenDrawer,
  onCloseDrawer,
}: UseCardRecoveryOptions) {
  const [recoveryPhase, setRecoveryPhase] = useState<
    "idle" | "scanning" | "writing" | "done" | "error"
  >("idle");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryPayload, setRecoveryPayload] = useState<CardPayload | null>(null);
  const [recoverySerial, setRecoverySerial] = useState<string | null>(null);
  const [recoveryTargetCardId, setRecoveryTargetCardId] = useState<string | null>(null);

  const qc = useQueryClient();

  const recoverCard = useMutation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      if (!grant) throw new Error("Sesi tidak aktif untuk memulihkan kartu");
      if (!isNfcSupported()) throw new Error("NFC tidak didukung di perangkat ini");

      onOpenDrawer();
      setRecoveryPhase("scanning");
      setRecoveryError(null);
      setRecoveryPayload(null);
      setRecoverySerial(null);

      await executeRecovery({
        cardId,
        tenantId,
        grant,
        setRecoveryPhase,
        setRecoveryError,
        setRecoveryPayload,
        setRecoverySerial,
        qc,
      });
    },
    onSuccess: () => {
      toast.success("Kartu berhasil dipulihkan dari data server terbaru");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal memulihkan kartu");
    },
  });

  const handleRecoveryDrawerClose = useCallback(() => {
    onCloseDrawer();
    setRecoveryPhase("idle");
    setRecoveryError(null);
    setRecoveryPayload(null);
    setRecoverySerial(null);
    setRecoveryTargetCardId(null);
  }, [onCloseDrawer]);

  const startCardRecovery = useCallback(
    (cardId: string) => {
      setRecoveryTargetCardId(cardId);
      recoverCard.mutate({ cardId });
    },
    [recoverCard],
  );

  const handleRetryRecovery = useCallback(() => {
    if (!recoveryTargetCardId) return;
    recoverCard.mutate({ cardId: recoveryTargetCardId });
  }, [recoveryTargetCardId, recoverCard]);

  return {
    recoveryPhase,
    recoveryError,
    recoveryPayload,
    recoverySerial,
    recoveryTargetCardId,
    isRecovering: recoverCard.isPending,
    startCardRecovery,
    handleRecoveryDrawerClose,
    handleRetryRecovery,
  };
}
