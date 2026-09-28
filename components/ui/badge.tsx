import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em]", {
  variants: { variant: { default: "border-transparent bg-accent text-white", secondary: "border-transparent bg-[#e9f1f7] text-navy", outline: "border-line bg-white text-slate-600", warning: "border-transparent bg-[#fff2d7] text-[#8a5d00]", danger: "border-transparent bg-[#fde8e8] text-danger", success: "border-transparent bg-[#e7f4ed] text-[#187348]" } },
  defaultVariants: { variant: "default" },
});
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
function Badge({ className, variant, ...props }: BadgeProps) { return <div className={cn(badgeVariants({ variant }), className)} {...props} />; }
export { Badge, badgeVariants };
