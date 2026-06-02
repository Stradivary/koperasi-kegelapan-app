import type React from "react";

export interface MobileNavItem<T extends string = string> {
  id: T;
  icon: React.ElementType;
  label: string;
  /** Render as a raised CTA button (centered, red circle) */
  cta?: boolean;
}

interface MobileBottomNavProps<T extends string = string> {
  readonly items: MobileNavItem<T>[];
  readonly activeId: T;
  readonly onSelect: (id: T) => void;
}

export function MobileBottomNav<T extends string = string>({
  items,
  activeId,
  onSelect,
}: Readonly<MobileBottomNavProps<T>>) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg flex items-stretch z-20">
      {items.map(({ id, icon: Icon, label, cta }) =>
        cta ? (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="flex-1 flex flex-col items-center gap-1 py-2 text-xs text-brand font-semibold"
          >
            <span className="flex items-center justify-center size-12 -mt-6 rounded-full bg-brand text-white shadow-lg">
              <Icon size={24} />
            </span>
            <span>{label}</span>
          </button>
        ) : (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={[
              "flex-1 flex flex-col items-center gap-1 py-3 text-xs",
              activeId === id ? "text-brand font-semibold" : "text-muted-foreground",
            ].join(" ")}
          >
            <span
              className={[
                "flex items-center justify-center size-9 w-14 rounded-full",
                activeId === id ? "bg-brand/10" : "",
              ].join(" ")}
            >
              <Icon size={20} />
            </span>
            <span>{label}</span>
          </button>
        ),
      )}
    </nav>
  );
}
