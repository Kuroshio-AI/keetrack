import * as React from "react";
import { cn } from "@/lib/utils";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, children, ...props }, ref) => <select ref={ref} className={cn("h-10 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20", className)} {...props}>{children}</select>);
Select.displayName = "Select";
export { Select };
