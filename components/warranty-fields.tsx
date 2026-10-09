import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMonthsClamped, isDateString, parseWarranty, warrantyProduct } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

// Text as typed; product stays undefined until typed over, so it follows the asset type.
export type WarrantyForm = { number: string; product?: string; warrantyDate: string; years: string; contractNo: string; project: string; scope: string; mainContractor: string };
export const blankWarranty: WarrantyForm = { number: "", warrantyDate: "", years: "5", contractNo: "", project: "", scope: "", mainContractor: "" };

const wholeYears = (years: string) => /^\d+$/.test(years.trim()) ? Number(years) : NaN;

export function readWarranty(form: WarrantyForm, assetType: string) {
  return parseWarranty({ ...form, product: form.product ?? warrantyProduct(assetType), years: wholeYears(form.years) });
}

// Shared by the Warranties page and the Register's new-record form; renders cells for a two-column grid.
export function WarrantyFields({ value, onChange, assetType, demoDate }: { value: WarrantyForm; onChange: (next: WarrantyForm) => void; assetType: string; demoDate: string }) {
  const years = wholeYears(value.years);
  const validUntil = isDateString(value.warrantyDate) && years >= 1 && years <= 25 ? addMonthsClamped(value.warrantyDate, years * 12) : undefined;
  const field = (key: keyof WarrantyForm, label: string, props: ComponentProps<typeof Input> = {}) => <div><Label htmlFor={`warranty-${key}`}>{label}</Label><Input id={`warranty-${key}`} className="mt-1.5" value={value[key] ?? ""} onChange={(event) => onChange({ ...value, [key]: event.target.value })} {...props} /></div>;
  return <>
    {field("number", "Warranty number *", { placeholder: "As printed on the original" })}
    {field("product", "Product *", { value: value.product ?? warrantyProduct(assetType) })}
    {field("warrantyDate", "Date of warranty *", { type: "date" })}
    {field("years", "Duration (years) *", { type: "number", min: 1, max: 25, step: 1 })}
    {field("contractNo", "Contract #")}
    {field("project", "Project")}
    {field("mainContractor", "Main contractor")}
    {field("scope", "Scope")}
    <p className="text-sm text-slate-500 sm:col-span-2" aria-live="polite">{validUntil ? <>Valid until <span className="font-semibold text-navy">{formatDate(validUntil)}</span> · {demoDate > validUntil ? "Expired" : "Valid"} on {formatDate(demoDate)}</> : "Enter the date and duration to see when it ends."}</p>
  </>;
}
