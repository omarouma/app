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

  if (lower.includes('caption') || lower.includes('reel') || lower.includes('post idea')) {
    const captions = [
      'When the coffee hits just right ☕✨ #MorningVibes',
      "Plot twist: I'm the protagonist 🎬✨",
      'Just vibing through life one reel at a time 🎵',
      'Caption this: [insert your amazing moment here] 🌟',
      'Living my best life, no filter needed 😎',
      'POV: You found your people 💚',
      "Monday mood: Let's make it legendary 🔥",
    ];
    return `Here's a caption idea for you:\n\n${captions[Math.floor(Math.random() * captions.length)]}\n\nWant more options? Just ask! 😊`;
  }

  if (lower.includes('friend') || lower.includes('meet') || lower.includes('people')) {
    return `Great question! Here are your best moves on GaGa Chat:\n\n1. **Join Voice Rooms** — the easiest way to find your people 🎙️\n2. **Share Stories** — show your personality daily 📸\n3. **React & Comment** — start conversations on others' posts 💬\n4. **Use Nearby** — meet people close by 📍\n5. **Stay consistent** — show up every day 🔥`;
  }

  if (lower.includes('trend') || lower.includes('popular') || lower.includes('topic')) {
    return `Here's what's hot on GaGa right now:\n\n🔥 #GaGaChallenges\n🎵 #ReelStar\n💚 #VoiceRoomVibes\n📸 #StoryOfTheDay\n\nPick a trending hashtag for your next reel! 🚀`;
  }

  if (lower.includes('motivate') || lower.includes('quote') || lower.includes('inspire')) {
    const quotes = [
      'The best way to predict the future is to create it. ✨',
      'Your vibe attracts your tribe. Keep shining! 💫',
      'Every day is a fresh start. Make it count! 🌅',
      'Success is the sum of small efforts repeated daily. 💪',
    ];
    return `${quotes[Math.floor(Math.random() * quotes.length)]}\n\nYou've got this! Consistency wins. 🔥`;
  }

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return `Hey there! 👋 I'm GaGa AI.\n\nI can help you with:\n\n💡 Content ideas & captions\n🤝 Tips for making friends\n📈 Trending topics & strategies\n✨ Motivation & inspiration\n\nWhat can I do for you today?`;
  }

  return `That's a great question! 🤔\n\nI'd suggest trying:\n\n• Pick a trending topic in the Feed\n• Jump into a Voice Room to connect live\n• Share a creative caption for your next reel\n\nStick with it and you'll see results! 💚`;
}