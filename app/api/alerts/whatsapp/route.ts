import {
  handleWhatsAppGet,
  handleWhatsAppPost,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleWhatsAppGet();
}

export async function POST(request: Request) {
  return handleWhatsAppPost(request);
}
