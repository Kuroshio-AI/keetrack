import { handleWhatsAppTokenPost } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleWhatsAppTokenPost(request);
}
