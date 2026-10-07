import {
  handleWhatsAppWebhookGet,
  handleWhatsAppWebhookPost,
} from "@/lib/whatsapp-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleWhatsAppWebhookGet(request);
}

export async function POST(request: Request) {
  return handleWhatsAppWebhookPost(request);
}
