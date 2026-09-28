import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("min-h-24 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate-400 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20", className)} {...props} />);
Textarea.displayName = "Textarea";
export { Textarea };
