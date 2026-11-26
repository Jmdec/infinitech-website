// File: components/ui/select.tsx
"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * Scroll-jump fix
 *
 * Inside a scrollable dialog, opening/closing a Radix Select moves focus
 * (content on open, trigger on close) and can make the dialog scroll back to
 * the top. Two things stop that for EVERY Select in the app:
 *
 * 1. On close, we don't let Radix re-focus the trigger itself; we re-focus it
 *    with { preventScroll: true }.
 * 2. We remember the scroll position of every scrollable ancestor when the
 *    Select opens/closes and put it back right after.
 * -------------------------------------------------------------------------- */

const TriggerRefContext = React.createContext<
  React.MutableRefObject<HTMLButtonElement | null>
>({ current: null });

type ScrollSnapshot = Array<[HTMLElement, number]>;

function snapshotScrollParents(el: HTMLElement | null): ScrollSnapshot {
  const snapshot: ScrollSnapshot = [];
  let node = el?.parentElement ?? null;

  while (node) {
    const { overflowY } = getComputedStyle(node);

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      snapshot.push([node, node.scrollTop]);
    }
    node = node.parentElement;
  }

  return snapshot;
}

function restoreScroll(snapshot: ScrollSnapshot) {
  if (snapshot.length === 0) return;
  const apply = () => {
    snapshot.forEach(([node, top]) => {
      if (node.scrollTop !== top) node.scrollTop = top;
    });
  };

  requestAnimationFrame(apply);
  [0, 50, 150].forEach((ms) => setTimeout(apply, ms));
}

const Select = ({
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>) => {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <TriggerRefContext.Provider value={triggerRef}>
      <SelectPrimitive.Root
        {...props}
        onOpenChange={(open) => {
          restoreScroll(snapshotScrollParents(triggerRef.current));
          onOpenChange?.(open);
        }}
      />
    </TriggerRefContext.Provider>
  );
};
Select.displayName = "Select";

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const triggerRef = React.useContext(TriggerRefContext);

  return (
    <SelectPrimitive.Trigger
      ref={(node) => {
        triggerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLButtonElement | null>).current =
            node;
      }}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus:ring-slate-800",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(
  (
    { className, children, position = "popper", onCloseAutoFocus, ...props },
    ref,
  ) => {
    const triggerRef = React.useContext(TriggerRefContext);

    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={ref}
          // "popper" (forced by the default above) anchors the panel below the
          // trigger like a normal popover instead of Radix's default
          // "item-aligned" behavior, which tries to overlay the selected item
          // directly on top of the trigger and breaks down inside scrollable
          // dialogs/modals.
          position={position}
          // Keep focus return to the trigger (good for keyboard users), but do
          // it without scrolling the dialog back to the top.
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className={cn(
            // Solid, opaque background set directly (not via a --popover CSS
            // variable) so the panel is always fully readable, plus a border,
            // shadow, and high z-index so it always sits above other fields.
            "relative z-[100] max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white text-slate-950 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className,
          )}
          sideOffset={4}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport
            className={cn(
              "p-1",
              position === "popper" &&
                "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-slate-100 focus:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-slate-800 dark:focus:text-slate-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-800", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
