/**
 * Bottarga Brothers — Cloudflare Worker
 * Routes:
 *   POST /chat  → Gemini 2.0 Flash AI fallback for chatbot
 *   OPTIONS     → CORS preflight
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const SYSTEM_PROMPT = `You are the expert assistant for Bottarga Brothers, the finest bottarga company in North America. You know everything about bottarga — its history, preparation, uses, and the Bottarga Brothers product range.

STYLE RULES — MANDATORY:
- Never use filler phrases like "Great question!" or "Certainly!"
- Keep answers concise: 2–4 sentences unless a detailed question requires more
- Use **bold** for product names and prices
- Respond in the same language the user writes in (English default)
- Warm, knowledgeable, expert tone — like a passionate food specialist
- Never make up prices or products not listed below

ABOUT BOTTARGA BROTHERS:
Founded by brothers Herbert and Jean Madar. Their father Roger Madar owned Comosa, a sardine fishing and canning company in Safi, Morocco in the 1950s. Roger cured Grey Mullet roe the traditional way. When the family emigrated to Montreal in the mid-1960s, the craft came with them. Every Friday night, bottarga was served as an aperitif — a family ritual. Herbert and Jean built Bottarga Brothers to share this with North America. They do one thing: bottarga. They do it perfectly.

WHAT IS BOTTARGA:
Cured, salted fish roe — typically from Grey Mullet. The roe sac is cleaned, salted, and pressed for weeks until it becomes a firm amber block of concentrated umami. 3,000+ year old Mediterranean tradition. Tastes rich, briny, oceanic — not "fishy." Similar to the sea itself.

CONTACT:
- Phone: 1-844-MAD-BROS (1-844-623-2767)
- Address: Montreal, Canada H4C 2P4
- Website: bottargabrothers.com
- Also on Amazon and eBay with 100% positive feedback

PRODUCTS AND PRICES:
1. Sardinian Gold (🇮🇹 Sardinia) — $24.99 — On sale. Wild Grey Mullet roe. Rich, complex, traditional. Shrink-wrapped. Can slice or grate.
2. Boutargue Classique (🇫🇷 France) — $33.99–$91.99 — Paraffin-waxed. 7 sizes: S 3.7oz $33.99 / M 4.4oz $45.99 / L 6.0oz $47.99 / XL 6.2oz $49.99 / Jumbo 7.7oz $58.99 / Mega 8.5oz $62.99 / Giant 13oz $91.99. Kosher for Passover — certified by Grand-Rabbinat de Paris.
3. Boutargue Impériale (🇫🇷 France, premium) — From $22.99 — Top selection from France's finest producers. Exceptional depth of flavor.
4. Boutargue Impériale Aged (🇫🇷 France, aged reserve) — From $22.99 — Extended cure, sharper flavor, deeper color. Limited availability.
5. Greek Avgotaraho (🇬🇷 Greece) — $28.50–$34.99 — "Caviar of the Mediterranean." Delicate, nutty, long oceanic finish.
6. Ouro do Brasil (🇧🇷 Brazil, full lobe) — $22.99–$33.99 — Mild, slightly sweet. Best entry point for first-timers.
7. Ouro do Brasil Half Lobe (🇧🇷 Brazil) — $22.99–$33.99 — Same as above, smaller format.
8. Egyptian Royale (🇪🇬 Egypt) — $24.00–$39.99 — Currently SOLD OUT. Check back or contact for waitlist.
9. Grated Gold (🇮🇹 Sardinia, grated) — $20.00–$54.00 — Ready to use. Sprinkle over pasta, eggs, toast.
10. Grated Bottarga Pouch (🇮🇹 Sardinia) — 50g resealable pouch. Convenient kitchen format.
11. Aged Ouro do Brasil (🇧🇷 Brazil, limited) — From $22.99 — Extended aging, more complex. Limited stock.

SHIPPING:
- USA: Free USPS on all orders
- Canada: Ships from Montreal office — contact for pricing
- International: Available — contact for rates

HOW TO EAT BOTTARGA:
- Slice thin as aperitif with Arak, Scotch, or dry white wine
- Grate over pasta (spaghetti + olive oil + garlic + lemon — never heat the bottarga)
- On toast with olive oil and lemon
- Over scrambled eggs — add at the very end
- On arugula salad shaved thin
- KEY RULE: Never cook bottarga with direct heat — always add raw at the end

STORAGE:
- Refrigerate whole lobe once received
- Unopened: several months refrigerated, up to 12 months frozen
- After cutting: use within 2–3 weeks refrigerated, wrapped tightly
- Grated: refrigerate after opening, use within 4–6 weeks

WHOLESALE & CHEF PROGRAM:
Available for chefs, restaurants, specialty retailers. Contact via phone or website for professional pricing.

If you don't know something or the user asks outside your knowledge, direct them to call 1-844-MAD-BROS or visit the contact page.`;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const path = new URL(request.url).pathname;

    // ── Stripe Checkout ──
    if (request.method === 'POST' && path === '/checkout') {
      try {
        const { items, successUrl, cancelUrl } = await request.json();
        if (!items || !items.length) return Response.json({ error: 'No items' }, { status: 400, headers: CORS });

        const params = new URLSearchParams({
          mode: 'payment',
          'payment_method_types[0]': 'card',
          success_url: successUrl || 'https://bottargabrothers.github.io/success.html',
          cancel_url: cancelUrl || 'https://bottargabrothers.github.io/shop-usa.html',
          'shipping_address_collection[allowed_countries][0]': 'US',
          'shipping_address_collection[allowed_countries][1]': 'CA',
        });
        items.forEach((item, i) => {
          params.set(`line_items[${i}][price]`, item.priceId);
          params.set(`line_items[${i}][quantity]`, String(item.quantity || 1));
        });

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        const session = await stripeRes.json();
        if (!session.url) return Response.json({ error: session.error || 'Stripe error' }, { status: 500, headers: CORS });
        return Response.json({ url: session.url }, { headers: CORS });
      } catch (e) {
        return Response.json({ error: 'Server error' }, { status: 500, headers: CORS });
      }
    }

    if (request.method === 'POST' && path === '/chat') {
      try {
        const body = await request.json();
        const messages = body.messages || [];
        if (!messages.length) {
          return Response.json({ reply: 'How can I help you with bottarga today?' }, { headers: CORS });
        }

        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return Response.json({ reply: 'Service temporarily unavailable. Please call 1-844-MAD-BROS.' }, { status: 503, headers: CORS });
        }

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              })),
              generationConfig: { temperature: 0.65, maxOutputTokens: 500 },
            }),
          }
        );

        const data = await geminiRes.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
          || 'Sorry, I could not process that. Please call us at 1-844-MAD-BROS.';

        return Response.json({ reply }, { headers: CORS });
      } catch (e) {
        return Response.json(
          { reply: 'Something went wrong. Please call us at 1-844-MAD-BROS.' },
          { status: 500, headers: CORS }
        );
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: CORS });
  },
};
