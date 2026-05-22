import { ChevronDown } from "lucide-react";

import { cn } from "#/presentation/lib/utils.ts";
import type { RawNfcResult } from "#/domain/nfc/types.ts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/presentation/components/ui/collapsible.tsx";

// ============================================================================
// Types
// ============================================================================

interface RawDataInspectorProps {
  /** Raw NFC scan result to display */
  rawResult: RawNfcResult | null;
  /** Custom labels */
  labels?: {
    viewRawData?: string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats a Uint8Array as a hex dump string with 16 bytes per row.
 *
 * Example output:
 * "4B 4F 50 57 02 00 01 00 00 00 00 00 00 00 00 00"
 * "01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10"
 */
function formatHexDump(bytes: Uint8Array): string[] {
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
    rows.push(hex);
  }
  return rows;
}

// ============================================================================
// Component
// ============================================================================

/**
 * RawDataInspector displays raw NFC data for debugging and support purposes.
 *
 * Shows serial number, byte count, hex dump of raw bytes, and NDEF record types
 * in a collapsible section that is collapsed by default.
 *
 * @see Requirements 25.1, 25.2, 25.3, 25.4
 */
function RawDataInspector({ rawResult, labels }: RawDataInspectorProps) {
  if (!rawResult) {
    return null;
  }

  const triggerLabel = labels?.viewRawData ?? "Lihat Data Mentah";
  const hexRows = rawResult.rawBytes ? formatHexDump(rawResult.rawBytes) : [];
  const recordTypes = rawResult.records.map((r) => r.recordType).filter((type) => type.length > 0);

  return (
    <Collapsible>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 rounded-md",
          "text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50",
          "transition-colors cursor-pointer",
          "[&[data-state=open]>svg]:rotate-180",
        )}
        aria-label={triggerLabel}
      >
        <ChevronDown className="h-4 w-4 transition-transform duration-200" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-3 text-sm">
          {/* Serial Number */}
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Serial Number
            </dt>
            <dd className="mt-0.5 font-mono text-foreground">{rawResult.serialNumber}</dd>
          </div>

          {/* Byte Count */}
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Byte Count
            </dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {rawResult.metadata.totalBytes} bytes
            </dd>
          </div>

          {/* Hex Dump */}
          {hexRows.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Hex Dump
              </dt>
              <dd className="mt-1">
                <pre className="font-mono text-xs leading-relaxed text-foreground overflow-x-auto whitespace-pre">
                  {hexRows.join("\n")}
                </pre>
              </dd>
            </div>
          )}

          {/* NDEF Record Types */}
          {recordTypes.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                NDEF Record Types
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {recordTypes.map((type, index) => (
                  <span
                    key={`${type}-${index}`}
                    className="inline-block px-2 py-0.5 rounded bg-muted text-xs font-mono text-foreground"
                  >
                    {type}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export { RawDataInspector, formatHexDump };
export type { RawDataInspectorProps };
