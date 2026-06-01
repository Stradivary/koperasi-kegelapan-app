import { useQuery } from "@tanstack/react-query";
import { localDb } from "#/hooks/useLocalDb";
import { getCardsWithUsers } from "#/hooks/useStationData";
import type { StationCardRow, StationUserRow } from "#/components/block/StationCardsPanel";

export function useCardData(tenantId: string) {
  const cards = useQuery<StationCardRow[]>({
    queryKey: ["station-cards", tenantId],
    queryFn: () => getCardsWithUsers(tenantId),
  });

  const members = useQuery<StationUserRow[]>({
    queryKey: ["users", tenantId],
    queryFn: async () => {
      const all = await localDb.users.where("tenantId").equals(tenantId).toArray();
      return all.filter((u) => u.status !== "deleted") as StationUserRow[];
    },
  });

  return {
    cards,
    members,
  };
}
