import { cn } from "#/lib/utils.ts";
import { Spinner } from "../ui/spinner";

interface LoadingStateProps {
  /** Text to display next to the spinner. Defaults to "Memuat..." */
  text?: string;
  /** Layout variant */
  variant?: "inline" | "section" | "page";
  className?: string;
}

/**
 * Standardized loading indicator with spinner + text.
 *
 * Variants:
 * - `inline` — small spinner + text, for use inside lists or panels
 * - `section` — centered within a section/card
 * - `page` — full-screen centered loading
 */
function LoadingState({ text = "Memuat...", variant = "section", className }: LoadingStateProps) {
  if (variant === "page") {
    return (
      <div
        className={cn("min-h-screen flex items-center justify-center bg-signal-disable", className)}
      >
        <div className="flex items-center gap-2">
          <Spinner size="lg" className="text-muted-foreground" />
          <p className="type-body1 text-muted-foreground">{text}</p>
        </div>
      </div>
    );
  }

  if (variant === "section") {
    return (
      <div className={cn("py-8 flex items-center justify-center gap-2", className)}>
        <Spinner className="text-muted-foreground" />
        <p className="type-body2 text-muted-foreground">{text}</p>
      </div>
    );
  }

  // inline
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Spinner size="sm" className="text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </span>
  );
}

export { LoadingState };
