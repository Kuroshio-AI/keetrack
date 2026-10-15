// Which client this build is for. Next inlines NEXT_PUBLIC_ values at build time, so each Vercel project picks one.
// Unset (the Kee Safety demo) keeps every Kee page; "fls" builds the DXB FLS certificate tracker from the same code.
export const IS_FLS = process.env.NEXT_PUBLIC_CLIENT === "fls";

// The FLS sheet's Due Date is always 15 days before the certificate expires (=E-15).
export const FLS_DUE_LEAD_DAYS = 15;
