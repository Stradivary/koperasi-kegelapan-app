import { Loader2Icon } from "lucide-react";

import { cn } from "#/presentation/lib/utils.ts";

interface SpinnerProps extends React.ComponentProps<"svg"> {
  /** Size variant for the spinner icon */
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

/**
 * Standalone spinning icon.
 */
function Spinner({ className, size = "md", ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn(sizeClasses[size], "animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
