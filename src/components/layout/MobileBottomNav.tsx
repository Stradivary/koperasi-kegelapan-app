import type React from "react";

export interface MobileNavItem<T extends string = string> {
  id: T;
  icon: React.ElementType;
  label: string;
}

interface MobileBottomNavProps<T extends string = string> {
  items: MobileNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
}

export function MobileBottomNav<T extends string = string>({
  items,
  activeId,
  onSelect,
}: MobileBottomNavProps<T>) {
  return (
    <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t shadow-lg flex items-stretch z-20">
      {items.map(({ id, icon: Icon, label }) => (
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
              "flex items-center justify-center size-9 rounded-full",
              activeId === id ? "bg-brand/10" : "",
            ].join(" ")}
          >
            <Icon size={20} />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
