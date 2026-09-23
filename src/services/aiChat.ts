import { getSupabaseSafe } from '@/lib/supabase';

export interface AiChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatResult {
  text: string;
  usingFallback: boolean;
  ok: boolean;
}

/**
 * Sends a message to the GaGa AI assistant.
 * Uses the Supabase Edge Function endpoint when available,
 * otherwise falls back to the smart local responder.
 */
export async function sendAiMessage(
  message: string,
  history: AiChatHistoryItem[] = [],
): Promise<AiChatResult> {
  const supabase = getSupabaseSafe();

  // If Supabase isn't available, use the client-side smart fallback
  if (!supabase) {
    return { text: generateLocalResponse(message), usingFallback: true, ok: true };
  }

  const session = await supabase.auth.getSession().catch(() => null);
  const token = session?.data?.session?.access_token;

  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        history: history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
      }),
    });

    if (!res.ok) {
      // Edge function not deployed → use the client-side smart fallback
      return { text: generateLocalResponse(message), usingFallback: true, ok: true };
    }

    const data = (await res.json()) as { text?: string; usingFallback?: boolean };
    if (!data.text) {
      return { text: generateLocalResponse(message), usingFallback: true, ok: true };
    }

    return {
      text: data.text,
      usingFallback: !!data.usingFallback,
      ok: true,
    };
  } catch {
    // Network failure → use the client-side smart fallback
    return { text: generateLocalResponse(message), usingFallback: true, ok: true };
  }
}

/**
 * Smart local fallback responder so the AI chat keeps working
 * even when the Edge Function or AI provider is unavailable.
 */
function generateLocalResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return `Hey there! \u{1F44B} I'm GaGa AI.\n\nI can help you with:\n\n\u{1F4AC} Messaging tips & chat features\n\u{1F465} Group chat best practices\n\u{1F4DE} Voice & video calling help\n\u{1F512} Privacy & security settings\n\nWhat can I do for you today?`;
  }

  if (lower.includes('message') || lower.includes('chat') || lower.includes('text')) {
    return `Here are some messaging tips on GaGa:\n\n1. **Send in Chat** \u2014 tap the compose button to start a conversation \u{1F4AC}\n2. **Reply & React** \u2014 long-press a message to reply or react \u{1F44D}\n3. **Share Media** \u2014 attach photos, videos, voice notes and files \u{1F4CE}\n4. **Group Chats** \u2014 create a group from the Chats screen \u{1F465}\n5. **Stay in sync** \u2014 messages update in real time across devices \u{1F504}`;
  }

  if (lower.includes('call') || lower.includes('voice') || lower.includes('video')) {
    return `GaGa supports high-quality voice and video calls \u{1F4DE}\n\n\u2022 Start a call from any 1:1 or group chat\n\u2022 Tap the phone icon for voice, camera icon for video\n\u2022 Grant microphone/camera permission when prompted\n\u2022 Calls use ZEGOCLOUD for reliable global connectivity \u{1F30D}`;
  }

  if (lower.includes('group')) {
    return `Group chats on GaGa:\n\n\u2022 Create a group from the Chats screen \u{1F465}\n\u2022 Add members, set a name and photo\n\u2022 Admins can manage members and settings\n\u2022 Everyone gets real-time updates \u{1F504}`;
  }

  if (lower.includes('privacy') || lower.includes('security') || lower.includes('block')) {
    return `Your privacy matters on GaGa \u{1F512}\n\n\u2022 Control who can message and call you\n\u2022 Block or report users from their profile\n\u2022 Manage read receipts and last-seen visibility\n\u2022 All data is protected with row-level security`;
  }

  if (lower.includes('friend') || lower.includes('contact') || lower.includes('people')) {
    return `Great question! Here are your best moves on GaGa:\n\n1. **Add Friends** \u2014 search by username or scan a QR code \u{1F50D}\n2. **Start a Chat** \u2014 message anyone from your contacts \u{1F4AC}\n3. **Create Groups** \u2014 bring people together \u{1F465}\n4. **Make Calls** \u2014 voice or video, one-to-one or group \u{1F4DE}\n5. **Stay connected** \u2014 real-time messaging everywhere \u{1F30D}`;
  }

  if (lower.includes('motivate') || lower.includes('quote') || lower.includes('inspire')) {
    const quotes = [
      'The best way to predict the future is to create it. \u2728',
      'Your vibe attracts your tribe. Keep shining! \u{1F4AB}',
      'Every day is a fresh start. Make it count! \u{1F305}',
      'Success is the sum of small efforts repeated daily. \u{1F4AA}',
    ];
    return `${quotes[Math.floor(Math.random() * quotes.length)]}\n\nYou've got this! Consistency wins. \u{1F525}`;
  }

  return `That's a great question! \u{1F914}\n\nI'd suggest trying:\n\n\u2022 Start a new chat from the Chats screen\n\u2022 Create a group to connect with several people\n\u2022 Try a voice or video call\n\nStick with it and you'll see results! \u{1F49A}`;
}
