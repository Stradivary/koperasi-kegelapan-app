---
name: shadcn-ui
description: >
  Reference for using shadcn/ui components in this project. Use when: adding
  or replacing UI primitives, picking Button variants/sizes, wiring up any form
  input, displaying data in tables/cards/lists, building navigation, showing
  modals/sheets/drawers/toasts, or ensuring UI layer components are shadcn-based
  as per the atomic-ui-split skill.
argument-hint: 'component name or migration task (e.g. "replace native buttons", "add toast", "build data table")'
---

# shadcn/ui Component Reference

All primitives live in `src/components/ui/`. Import alias: `#/components/ui/<file>`.

> **Rule**: All UI atoms in `src/components/layout/` and `src/components/block/` must use these shadcn components — never raw HTML elements like `<button>`, `<select>`, or `<input>`. (atomic-ui-split skill, UI layer.)

---

## Quick Reference

| File | Key Exports | Notes |
|------|-------------|-------|
| `accordion.tsx` | `Accordion` `AccordionItem` `AccordionTrigger` `AccordionContent` | Animated expand/collapse sections |
| `alert-dialog.tsx` | `AlertDialog` `AlertDialogTrigger` `AlertDialogContent` `AlertDialogHeader` `AlertDialogFooter` `AlertDialogTitle` `AlertDialogDescription` `AlertDialogAction` `AlertDialogCancel` | Critical confirmation modal; supports optional icon/media |
| `alert.tsx` | `Alert` `AlertTitle` `AlertDescription` | Inline banner; variants: `default` `destructive` |
| `aspect-ratio.tsx` | `AspectRatio` | Maintain aspect ratio for containers |
| `avatar.tsx` | `Avatar` `AvatarImage` `AvatarFallback` `AvatarBadge` `AvatarGroup` `AvatarGroupCount` | Avatar with fallback initials; sizes: `sm` `default` `lg`; group stacking |
| `badge.tsx` | `Badge` `badgeVariants` | Small label pill; variants: `default` `secondary` `destructive` `outline` `ghost` `link` |
| `breadcrumb.tsx` | `Breadcrumb` `BreadcrumbList` `BreadcrumbItem` `BreadcrumbLink` `BreadcrumbPage` `BreadcrumbSeparator` `BreadcrumbEllipsis` | Page path navigation |
| `button-group.tsx` | `ButtonGroup` `ButtonGroupSeparator` `ButtonGroupText` `buttonGroupVariants` | Adjacent buttons with merged borders; `orientation` h/v |
| `button.tsx` | `Button` | See full section below |
| `calendar.tsx` | `Calendar` `CalendarDayButton` | DayPicker calendar; month/year dropdowns; week numbers |
| `card.tsx` | `Card` `CardHeader` `CardTitle` `CardDescription` `CardContent` `CardFooter` `CardAction` | Content container; `CardAction` for top-right slot |
| `checkbox.tsx` | `Checkbox` | Styled checkbox with focus ring and aria-invalid support |
| `collapsible.tsx` | `Collapsible` `CollapsibleTrigger` `CollapsibleContent` | Uncontrolled collapsible; minimal styling |
| `combobox.tsx` | `Combobox` `ComboboxInput` `ComboboxContent` `ComboboxList` `ComboboxItem` `ComboboxGroup` `ComboboxLabel` `ComboboxEmpty` `ComboboxSeparator` `ComboboxChips` `ComboboxChip` `ComboboxChipsInput` `ComboboxTrigger` `ComboboxValue` `useComboboxAnchor` | Searchable select with multi-chip support |
| `context-menu.tsx` | `ContextMenu` `ContextMenuTrigger` `ContextMenuContent` `ContextMenuItem` `ContextMenuCheckboxItem` `ContextMenuRadioItem` `ContextMenuLabel` `ContextMenuSeparator` `ContextMenuShortcut` `ContextMenuSub` `ContextMenuSubTrigger` `ContextMenuSubContent` `ContextMenuRadioGroup` | Right-click menu with submenus, shortcuts |
| `dialog.tsx` | `Dialog` `DialogTrigger` `DialogContent` `DialogHeader` `DialogFooter` `DialogTitle` `DialogDescription` `DialogClose` | Centered modal; `max-w-lg` default |
| `direction.tsx` | `DirectionProvider` `useDirection` | RTL/LTR context; wrap app or subtree |
| `drawer.tsx` | `Drawer` `DrawerTrigger` `DrawerContent` `DrawerHeader` `DrawerFooter` `DrawerTitle` `DrawerDescription` `DrawerClose` | Slide-in from any side; `80vh` default |
| `dropdown-menu.tsx` | `DropdownMenu` `DropdownMenuTrigger` `DropdownMenuContent` `DropdownMenuItem` `DropdownMenuCheckboxItem` `DropdownMenuRadioItem` `DropdownMenuRadioGroup` `DropdownMenuLabel` `DropdownMenuSeparator` `DropdownMenuShortcut` `DropdownMenuSub` `DropdownMenuSubTrigger` `DropdownMenuSubContent` | Drop-down with radio/checkbox items and submenus |
| `empty.tsx` | `Empty` `EmptyHeader` `EmptyTitle` `EmptyDescription` `EmptyContent` `EmptyMedia` | Empty-state container with icon, title, description, action slots |
| `field.tsx` | `Field` `FieldLabel` `FieldDescription` `FieldError` `FieldGroup` `FieldLegend` `FieldSeparator` `FieldSet` `FieldContent` `FieldTitle` | Form field layout; `orientation`: `vertical` `horizontal` `responsive` |
| `form.tsx` | `Form` `FormField` `FormItem` `FormLabel` `FormControl` `FormDescription` `FormMessage` `useFormField` | React Hook Form integration; auto error display |
| `hover-card.tsx` | `HoverCard` `HoverCardTrigger` `HoverCardContent` | On-hover popover; `w-64` default |
| `input-group.tsx` | `InputGroup` `InputGroupAddon` `InputGroupButton` `InputGroupText` `InputGroupInput` `InputGroupTextarea` | Input with prefix/suffix addons; merged borders |
| `input-otp.tsx` | `InputOTP` `InputOTPGroup` `InputOTPSlot` `InputOTPSeparator` | OTP input with individual character slots |
| `input.tsx` | `Input` | Styled `<input>` |
| `item.tsx` | `Item` `ItemMedia` `ItemContent` `ItemActions` `ItemGroup` `ItemSeparator` `ItemTitle` `ItemDescription` `ItemHeader` `ItemFooter` | Rich list item; variants: `default` `outline` `muted`; sizes: `default` `sm` |
| `kbd.tsx` | `Kbd` `KbdGroup` | Keyboard shortcut key display |
| `label.tsx` | `Label` | Radix Label primitive |
| `menubar.tsx` | `Menubar` `MenubarMenu` `MenubarTrigger` `MenubarContent` `MenubarItem` `MenubarCheckboxItem` `MenubarRadioItem` `MenubarRadioGroup` `MenubarSeparator` `MenubarLabel` `MenubarShortcut` `MenubarSub` `MenubarSubTrigger` `MenubarSubContent` | Top app menu bar; `h-9` default |
| `native-select.tsx` | `NativeSelect` `NativeSelectOptGroup` `NativeSelectOption` | Native `<select>` with chevron overlay; sizes: `sm` `default` |
| `navigation-menu.tsx` | `NavigationMenu` `NavigationMenuList` `NavigationMenuItem` `NavigationMenuContent` `NavigationMenuTrigger` `NavigationMenuLink` `NavigationMenuViewport` `navigationMenuTriggerStyle` | Horizontal nav with viewport flyout; RTL support |
| `pagination.tsx` | `Pagination` `PaginationContent` `PaginationItem` `PaginationLink` `PaginationPrevious` `PaginationNext` `PaginationEllipsis` | Page navigation with active state |
| `popover.tsx` | `Popover` `PopoverTrigger` `PopoverContent` `PopoverAnchor` `PopoverHeader` `PopoverTitle` `PopoverDescription` | Floating popover; `w-72` default |
| `progress.tsx` | `Progress` | Progress bar with `value` prop (0–100) |
| `radio-group.tsx` | `RadioGroup` `RadioGroupItem` | Radio buttons with circular indicator |
| `resizable.tsx` | `ResizablePanelGroup` `ResizablePanel` `ResizableHandle` | Draggable resizable panels |
| `scroll-area.tsx` | `ScrollArea` `ScrollBar` | Scrollable container with custom scrollbar |
| `select.tsx` | `Select` `SelectTrigger` `SelectContent` `SelectItem` `SelectValue` `SelectGroup` `SelectLabel` `SelectSeparator` | Radix Select; prefer over `NativeSelect` unless in a form |
| `separator.tsx` | `Separator` | Horizontal/vertical divider; `decorative` prop |
| `sheet.tsx` | `Sheet` `SheetTrigger` `SheetContent` `SheetHeader` `SheetFooter` `SheetTitle` `SheetDescription` `SheetClose` | Side panel from 4 directions |
| `sidebar.tsx` | `SidebarProvider` `Sidebar` `SidebarHeader` `SidebarContent` `SidebarFooter` `SidebarGroup` `SidebarGroupLabel` `SidebarGroupAction` `SidebarGroupContent` `SidebarMenu` `SidebarMenuItem` `SidebarMenuButton` `SidebarMenuAction` `SidebarMenuBadge` `SidebarMenuSub` `SidebarMenuSubItem` `SidebarMenuSubButton` `SidebarMenuSkeleton` `SidebarInput` `SidebarInset` `SidebarRail` `SidebarSeparator` `SidebarTrigger` `useSidebar` | Full sidebar system; variants: `sidebar` `floating` `inset`; mobile sheet fallback |
| `skeleton.tsx` | `Skeleton` | Pulse loading placeholder |
| `slider.tsx` | `Slider` | Range slider; Radix primitive |
| `sonner.tsx` | `Toaster` | Toast notifications; place once in root; call `toast()` from `sonner` |
| `spinner.tsx` | `Spinner` | Animated loading spinner; `size-4` default |
| `switch.tsx` | `Switch` | Toggle on/off switch; Radix primitive |
| `table.tsx` | `Table` `TableHeader` `TableBody` `TableFooter` `TableHead` `TableRow` `TableCell` `TableCaption` | Semantic table with scroll wrapper |
| `tabs.tsx` | `Tabs` `TabsList` `TabsTrigger` `TabsContent` `tabsListVariants` | Tab navigation; `TabsList` variants: `default` `line`; orientation: `horizontal` `vertical` |
| `textarea.tsx` | `Textarea` | Styled `<textarea>` |
| `toggle-group.tsx` | `ToggleGroup` `ToggleGroupItem` | Group of toggle buttons with shared variant/size context |
| `toggle.tsx` | `Toggle` `toggleVariants` | On/off toggle button; variants: `default` `outline`; sizes: `default` `sm` `lg` |
| `tooltip.tsx` | `Tooltip` `TooltipTrigger` `TooltipContent` `TooltipProvider` | Hover tooltip; **requires `<TooltipProvider>` ancestor** |

---

## Button

```tsx
import { Button } from '#/components/ui/button'
```

### Variants
| variant | Use case |
|---------|----------|
| `default` | Primary action |
| `destructive` | Delete / danger |
| `outline` | Secondary bordered |
| `secondary` | Muted action |
| `ghost` | No background, hover-only |
| `link` | Underlined text button |

### Sizes
| size | Dimensions | Use case |
|------|-----------|----------|
| `default` | h-9, px-4 | Standard |
| `sm` | h-8, px-3 | Compact row actions |
| `lg` | h-10, px-6 | Hero / CTA |
| `xs` | h-6, px-2 | Tight inline |
| `icon` | size-9 | Square icon button |
| `icon-sm` | size-8 | Small square icon button |
| `icon-xs` | size-6 | Tiny square icon button |
| `icon-lg` | size-10 | Large square icon button |

### Common patterns

```tsx
// Icon-only toggle button
<Button variant="ghost" size="icon-sm" onClick={toggle}>
  <ChevronLeft />
</Button>

// Ghost button on dark background (sidebar)
<Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white">
  Label
</Button>

// Full-width sidebar nav item
<Button variant="ghost" className="w-full h-auto justify-start px-3 py-2.5 rounded-lg">
  <Icon size={18} />
  Label
</Button>

// Destructive text action
<Button variant="ghost" className="text-muted-foreground hover:text-destructive">
  <LogOut size={16} /> Keluar
</Button>
```

---

## Common Patterns

### Confirmation dialog
```tsx
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogAction, AlertDialogCancel } from '#/components/ui/alert-dialog'

<AlertDialog>
  <AlertDialogTrigger asChild><Button variant="destructive">Hapus</Button></AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Yakin menghapus?</AlertDialogTitle>
      <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Batal</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Hapus</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Toast notifications
```tsx
// In root layout (once):
import { Toaster } from '#/components/ui/sonner'
<Toaster />

// Anywhere:
import { toast } from 'sonner'
toast.success('Berhasil disimpan')
toast.error('Gagal memuat data')
```

### Data table
```tsx
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '#/components/ui/table'

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Nama</TableHead>
      <TableHead className="text-right">Saldo</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {rows.map(row => (
      <TableRow key={row.id}>
        <TableCell>{row.name}</TableCell>
        <TableCell className="text-right">Rp {row.balance.toLocaleString('id-ID')}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Card with header action
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '#/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Kartu Aktif</CardTitle>
    <CardDescription>Total kartu terdaftar</CardDescription>
    <CardAction><Button size="sm">Tambah</Button></CardAction>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### Form field with React Hook Form
```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '#/components/ui/form'
import { useForm } from 'react-hook-form'

const form = useForm<{ name: string }>()

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField control={form.control} name="name" render={({ field }) => (
      <FormItem>
        <FormLabel>Nama</FormLabel>
        <FormControl><Input {...field} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
    <Button type="submit">Simpan</Button>
  </form>
</Form>
```

### Empty state
```tsx
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '#/components/ui/empty'
import { Users } from 'lucide-react'

<Empty>
  <EmptyMedia><Users className="text-muted-foreground/40" /></EmptyMedia>
  <EmptyHeader>
    <EmptyTitle>Belum ada anggota</EmptyTitle>
    <EmptyDescription>Tambahkan anggota pertama untuk memulai.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent><Button size="sm">Tambah Anggota</Button></EmptyContent>
</Empty>
```

### Tabs
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/ui/tabs'

<Tabs defaultValue="cards">
  <TabsList>
    <TabsTrigger value="cards">Kartu</TabsTrigger>
    <TabsTrigger value="audit">Audit</TabsTrigger>
  </TabsList>
  <TabsContent value="cards">...</TabsContent>
  <TabsContent value="audit">...</TabsContent>
</Tabs>
```

### Input with addon
```tsx
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupInput } from '#/components/ui/input-group'

<InputGroup>
  <InputGroupAddon><InputGroupText>Rp</InputGroupText></InputGroupAddon>
  <InputGroupInput placeholder="0" type="number" />
</InputGroup>
```

---

## Migration: native → shadcn

| Native | shadcn equivalent |
|--------|-------------------|
| `<button>` | `<Button>` |
| `<select>` | `<Select>` (Radix) or `<NativeSelect>` (simple forms) |
| `<input>` | `<Input>` |
| `<textarea>` | `<Textarea>` |
| Custom loading div | `<Skeleton>` or `<Spinner>` |
| Custom empty div | `<Empty>` |
| `<div role="alert">` | `<Alert>` |
| Custom tooltip | `<Tooltip>` + `<TooltipProvider>` |
| Custom modal | `<Dialog>` or `<AlertDialog>` for confirmations |
| Custom side panel | `<Sheet>` |

**Button className → prop mapping:**
| Native pattern | Button equivalent |
|----------------|-------------------|
| `p-1.5 rounded-md` icon button | `size="icon-sm"` |
| `hover:bg-muted` | `variant="ghost"` |
| `w-full text-left` | `className="w-full justify-start"` |
| variable height | `className="h-auto"` |
