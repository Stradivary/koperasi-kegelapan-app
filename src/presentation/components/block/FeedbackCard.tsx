import { useEffect, useRef } from "react";
import { Button } from "../ui/button";

export interface FeedbackCardAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "outline";
}

export interface FeedbackCardProps {
  variant: "success" | "error" | "warning" | "info" | "blocked";
  title: string;
  subtitle?: string;
  details?: Array<{ label: string; value: string }>;
  actions?: Array<FeedbackCardAction>;
  autoClose?: number;
  onClose?: () => void;
}

const variantStyles: Record<
  FeedbackCardProps["variant"],
  { border: string; bg: string; titleColor: string; icon: string }
> = {
  success: {
    border: "border-signal-valid/30",
    bg: "bg-signal-bg-valid",
    titleColor: "text-signal-valid",
    icon: "✓",
  },
  error: {
    border: "border-signal-error/30",
    bg: "bg-signal-bg-error",
    titleColor: "text-signal-error",
    icon: "✗",
  },
  warning: {
    border: "border-signal-warning/30",
    bg: "bg-signal-bg-warning",
    titleColor: "text-signal-warning",
    icon: "⚠",
  },
  info: {
    border: "border-signal-info/30",
    bg: "bg-signal-bg-info",
    titleColor: "text-signal-info",
    icon: "ℹ",
  },
  blocked: {
    border: "border-signal-error/30",
    bg: "bg-signal-bg-error",
    titleColor: "text-signal-error",
    icon: "⛔",
  },
};

export function FeedbackCard({
  variant,
  title,
  subtitle,
  details,
  actions,
  autoClose,
  onClose,
}: Readonly<FeedbackCardProps>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss timer with cleanup
  useEffect(() => {
    if (!autoClose || !onClose) return;

    timerRef.current = setTimeout(() => {
      onClose();
    }, autoClose);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoClose, onClose]);

  const styles = variantStyles[variant];

  return (
    <div
      aria-live="polite"
      className={[
        "rounded-2xl border p-4 space-y-3 text-center w-full",
        styles.bg,
        styles.border,
      ].join(" ")}
    >
      {/* Title */}
      <p className={["type-title-bold", styles.titleColor].join(" ")}>
        {styles.icon} {title}
      </p>

      {/* Subtitle */}
      {subtitle && <p className="type-body1 text-foreground">{subtitle}</p>}

      {/* Details (label/value pairs) */}
      {details && details.length > 0 && (
        <div className="space-y-1">
          {details.map((detail) => (
            <div key={detail.label} className="flex justify-between type-body2">
              <span className="text-muted-foreground">{detail.label}</span>
              <span className="text-foreground font-medium">{detail.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant === "primary" ? "default" : "outline"}
              onClick={action.onClick}
              className="w-full"
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
