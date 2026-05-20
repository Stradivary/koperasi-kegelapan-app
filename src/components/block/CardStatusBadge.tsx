import { CardStatus } from "../../core/payload/types";

const STATUS_LABELS: Record<number, string> = {
  [CardStatus.ACTIVE]: "Active",
  [CardStatus.BLOCKED_TAMPER]: "Tamper",
  [CardStatus.BLOCKED_FRAUD]: "Fraud",
  [CardStatus.BLOCKED_EXPIRED]: "Expired",
  [CardStatus.BLOCKED_ADMIN]: "Blocked",
};

const STATUS_CLASSES: Record<number, string> = {
  [CardStatus.ACTIVE]: "bg-green-100 text-green-700",
  [CardStatus.BLOCKED_TAMPER]: "bg-red-100 text-red-700",
  [CardStatus.BLOCKED_FRAUD]: "bg-red-100 text-red-700",
  [CardStatus.BLOCKED_EXPIRED]: "bg-yellow-100 text-yellow-700",
  [CardStatus.BLOCKED_ADMIN]: "bg-gray-100 text-gray-700",
};

interface CardStatusBadgeProps {
  status: number;
  localBlockedReason?: string | null;
}

export function CardStatusBadge({ status, localBlockedReason }: CardStatusBadgeProps) {
  if (localBlockedReason) {
    return (
      <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">
        Blocked
      </span>
    );
  }

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_CLASSES[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {STATUS_LABELS[status] ?? `Status ${status}`}
    </span>
  );
}
