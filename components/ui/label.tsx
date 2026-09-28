import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(({ className, ...props }, ref) => <label ref={ref} className={cn("text-xs font-bold uppercase tracking-[.08em] text-slate-600", className)} {...props} />);
Label.displayName = "Label";
export { Label };
