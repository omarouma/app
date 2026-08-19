// @ts-nocheck - Supabase Edge Functions run on Deno runtime.
// GaGa AI assistant endpoint - real AI via OpenAI, fallback templates.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function authenticate(req) {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ?? null;
  } catch { return null; }
}

function fallback(msg) {
  const l = msg.toLowerCase();
  if (l.includes('caption') || l.includes('reel') || l.includes('post idea')) {
    return "Here's a caption idea:\n\n✨ Just vibing through life one reel at a time 🎵\n\nWant more? Just ask!";
  }
  if (l.includes('friend') || l.includes('meet') || l.includes('people')) {
    return 'Tips for friends on GaGa:\n\n1. Join Voice Rooms\n2. Share Stories\n3. Comment on posts\n4. Be consistent';
  }
  if (l.includes('trend') || l.includes('popular') || l.includes('topic')) {
    return 'Trending now: #GaGaChallenges, #ReelStar, #VoiceVibes. Create a reel!';
  }
  if (l.includes('motivate') || l.includes('quote') || l.includes('inspire')) {
    return 'The best way to predict the future is to create it. Keep going!';
  }
  if (l.includes('hi') || l.includes('hello') || l.includes('hey')) {
    return "Hey there! I'm GaGa AI. I can help with content ideas, friends tips, trends, and motivation. What do you need?";
  }
  return "That's interesting! Try Voice Rooms or share daily stories to grow. Consistency is key!";
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const userId = await authenticate(req);
  if (!userId) return json({ error: 'UNAUTHORIZED' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }

  const message = (body?.message ?? '').trim();
  if (!message) return json({ error: 'EMPTY_MESSAGE' }, 400);

  const aiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!aiKey) return json({ text: fallback(message), usingFallback: true });

  try {
    const system = Deno.env.get('AI_SYSTEM_PROMPT') ?? 'You are GaGa AI, a friendly assistant for the GaGa Chat app. Keep answers concise.';
    const history = Array.isArray(body?.history) ? body.history : [];
    const messages = [
      { role: 'system', content: system },
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 500 }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('Empty response');
    return json({ text, usingFallback: false });
  } catch (err) {
    console.error('[ai-chat] error:', err);
    return json({ text: fallback(message), usingFallback: true });
  }
});