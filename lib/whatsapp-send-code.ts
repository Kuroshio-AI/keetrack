// The operator's WhatsApp send code, saved once in Demo Controls and remembered by this browser for Alerts.
const STORAGE_KEY = "keetrack:whatsapp-send-code";

export function readSendCode(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeSendCode(code: string): boolean {
  try {
    if (code) window.localStorage.setItem(STORAGE_KEY, code);
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
