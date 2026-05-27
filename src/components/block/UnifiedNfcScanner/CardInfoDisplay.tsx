import type { CardPayload } from "#/core/payload/types";
import type { CardClassification } from "#/core/nfc/types";
import { CardStatusBadge } from "../CardStatusBadge";

/**
 * Format a number as Indonesian Rupiah currency.
 */
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Human-readable labels for non-payload card classifications.
 */
const DEFAULT_CLASSIFICATION_LABELS: Record<string, string> = {
  empty: "Kartu Kosong",
  foreign: "Kartu Tidak Dikenal",
  invalid_format: "Format Kartu Rusak",
  unknown: "Kartu Tidak Dikenal",
};

export interface CardInfoDisplayProps {
  /** Card classification from the Generic NFC Layer */
  classification: CardClassification | null;
  /** Decoded card payload (only for valid_payload cards) */
  payload: CardPayload | null;
  /** Card serial number (UID) */
  serialNumber?: string;
  /** Whether the card is currently checked in */
  isCheckedIn: boolean;
  /** Whether to show check-in status */
  showCheckInStatus?: boolean;
  /** Custom labels for display text */
  labels?: {
    empty?: string;
    foreign?: string;
    invalidFormat?: string;
    unknown?: string;
    checkedIn?: string;
    notCheckedIn?: string;
  };
}

/**
 * CardInfoDisplay shows card information after scanning.
 *
 * For valid_payload cards: displays cardholder name, status badge, wallet balance,
 * and optionally check-in status.
 *
 * For non-payload cards: displays serial number and classification type label.
 *
 * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */
export function CardInfoDisplay({
  classification,
  payload,
  serialNumber,
  isCheckedIn,
  showCheckInStatus,
  labels,
}: Readonly<CardInfoDisplayProps>) {
  // Valid payload card — show full card info
  if (classification === "valid_payload" && payload) {
    return (
      <div
        className="rounded-lg border p-4 space-y-3"
        role="region"
        aria-label={payload.identity.name}
      >
        {/* Cardholder name and status */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{payload.identity.name}</p>
          <CardStatusBadge status={payload.identity.status} />
        </div>

        {/* Wallet balance */}
        <p
          className="text-lg font-bold"
          aria-label={`Saldo: ${formatRupiah(payload.wallet.balance)}`}
        >
          {formatRupiah(payload.wallet.balance)}
        </p>

        {/* Check-in status */}
        {showCheckInStatus && (
          <p
            className={`text-xs font-medium ${
              isCheckedIn ? "text-green-600" : "text-muted-foreground"
            }`}
            aria-label={
              isCheckedIn
                ? (labels?.checkedIn ?? "Sudah Masuk")
                : (labels?.notCheckedIn ?? "Belum Masuk")
            }
          >
            {isCheckedIn
              ? (labels?.checkedIn ?? "Sudah Masuk")
              : (labels?.notCheckedIn ?? "Belum Masuk")}
          </p>
        )}
      </div>
    );
  }

  // Non-payload card — show serial and classification label
  const classificationKey = classification === "invalid_format" ? "invalidFormat" : classification;
  const classificationLabel = classification
    ? classificationKey && classificationKey in (labels ?? {})
      ? (labels as Record<string, string>)[classificationKey]
      : (DEFAULT_CLASSIFICATION_LABELS[classification] ?? classification)
    : "";

  return (
    <div
      className="rounded-lg border p-4 space-y-2"
      role="region"
      aria-label={classificationLabel || "Informasi kartu"}
    >
      <p className="text-sm font-medium">{classificationLabel}</p>
      {serialNumber && (
        <p className="text-xs text-muted-foreground font-mono truncate">{serialNumber}</p>
      )}
    </div>
  );
}
