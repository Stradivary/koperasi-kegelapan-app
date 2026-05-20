import * as React from "react";
import { cn } from "#/lib/utils.ts";

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("size-5", className)}
      aria-hidden="true"
    >
      <path d="M10 3C5.5 3 1.73 5.94 0 10c1.73 4.06 5.5 7 10 7s8.27-2.94 10-7c-1.73-4.06-5.5-7-10-7Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-7.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Z" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("size-5", className)}
      aria-hidden="true"
    >
      <path d="M2.2 1.1.8 2.5l2.8 2.8C1.8 6.9.5 8.9 0 10c1.73 4.06 5.5 7 10 7 1.6 0 3.1-.4 4.5-1l3 3 1.4-1.4-16.7-16.5ZM10 14.5a4.5 4.5 0 0 1-3.9-6.7l1.5 1.5a2.7 2.7 0 0 0 3.6 3.6l1.5 1.5c-.8.4-1.7.6-2.7.6Zm5.4-2.3-1.5-1.5a4.5 4.5 0 0 0-5.1-5.1L7.1 3.9c.9-.3 1.9-.4 2.9-.4 4.5 0 8.27 2.94 10 7a12.8 12.8 0 0 1-4.6 4.7Z" />
    </svg>
  );
}

const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          data-slot="input"
          ref={ref}
          className={cn(
            "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
            className,
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
