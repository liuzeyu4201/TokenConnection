import * as React from "react";
import { cn } from "cn";

/**
 * A plainly styled native <select>. Native controls work best on phones and
 * inside GET forms, which is why the filter bars use this instead of a popup.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23737373%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px_16px] bg-[right_0.6rem_center] bg-no-repeat",
        className,
      )}
      {...props}
    />
  );
}
