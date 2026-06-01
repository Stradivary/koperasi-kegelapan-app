import * as React from "react";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";

export interface BaseDialogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Icon or media element displayed above the title */
  icon?: React.ReactNode;
  /** Main body content rendered between the header and footer */
  children?: React.ReactNode;
  /** Footer content (buttons, etc.) - rendered inside DrawerFooter / DialogFooter */
  footer?: React.ReactNode;
  /** Extra className applied to the Dialog content (desktop only) */
  dialogClassName?: string;
  /** Whether to show the Dialog close button (desktop only, default false) */
  showCloseButton?: boolean;
}

/**
 * BaseDialogDrawer
 *
 * A responsive shell that renders as a bottom Drawer on mobile and a Dialog on
 * desktop. Use this as the foundation for all dialog/drawer hybrids in the app.
 *
 * Compose higher-level components (ConfirmationDialogDrawer, PromptDialogDrawer,
 * etc.) on top of this rather than duplicating the mobile/desktop branching logic.
 */
export function BaseDialogDrawer({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  dialogClassName,
  showCloseButton = false,
}: BaseDialogDrawerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" repositionInputs={false}>
        <DrawerContent>
          <DrawerHeader>
            {icon && <div className="flex items-center justify-center mb-2">{icon}</div>}
            <DrawerTitle>{title}</DrawerTitle>
            {description && (
              <DrawerDescription asChild>
                <div>{description}</div>
              </DrawerDescription>
            )}
          </DrawerHeader>
          {children && <div className="px-4 pb-4">{children}</div>}
          {footer && <DrawerFooter>{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClassName} showCloseButton={showCloseButton}>
        <DialogHeader>
          {icon && (
            <div className="flex items-center justify-center sm:justify-start mb-2">{icon}</div>
          )}
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription asChild>
              <div>{description}</div>
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
