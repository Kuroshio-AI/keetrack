import {
  handleWhatsAppDelete,
  handleWhatsAppGet,
  handleWhatsAppPost,
  handleWhatsAppSetup,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleWhatsAppGet(request);
}

export function PATCH(request: Request) {
  return handleWhatsAppSetup(request);
}

export function DELETE(request: Request) {
  return handleWhatsAppDelete(request);
}

export async function POST(request: Request) {
  return handleWhatsAppPost(request);
}
