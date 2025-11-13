// 🎬 SinhalaSub Plugin (Cinesubz API Integration v4 - Full Reply Chain Fixed)
// 🧠 by Wasantha X GPT

const { cmd } = require('../command');
const axios = require('axios');
const NodeCache = require('node-cache');
const config = require('../config');

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const BRAND = config.MOVIE_FOOTER || '© SinhalaSub';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';

const BASE = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const SEARCH = `${BASE}/search?apiKey=${API_KEY}&q=`;
const DETAIL = `${BASE}/movie-details?apiKey=${API_KEY}&url=`;
const TVSHOW = `${BASE}/tvshow-details?apiKey=${API_KEY}&url=`;
const EPISODE = `${BASE}/episode-details?apiKey=${API_KEY}&url=`;
const DOWNLOAD = `${BASE}/downloadurl?apiKey=${API_KEY}&url=`;

cmd({
  pattern: 'sinhalasub',
  react: '🎬',
  desc: 'Search SinhalaSub Movies & TV Shows',
  category: 'movie',
  filename: __filename
}, async (client, m, mek, { from, q }) => {
  if (!q) {
    return client.sendMessage(from, {
      text: `🎬 *SinhalaSub Search*\n\n📌 Usage: .sinhalasub <movie name>\n\nExample:\n.sinhalasub The Boys`
    }, { quoted: m });
  }

  try {
    const key = `search_${q.toLowerCase()}`;
    let result = cache.get(key);
    if (!result) {
      const res = await axios.get(SEARCH + encodeURIComponent(q));
      result = res.data;
      if (!result || !result.data?.length) throw new Error('❌ No results found.');
      cache.set(key, result);
    }

    const items = result.data.slice(0, 10);
    let caption = `🎬 *SinhalaSub Search Results*\n\n`;
    for (let i = 0; i < items.length; i++) {
      caption += `${i + 1}. ${items[i].title} (${items[i].year}) • ⭐ ${items[i].rating || 'N/A'}\n`;
    }
    caption += `\n💬 Reply with *number* to view details.\n\n${BRAND}`;

    const sent = await client.sendMessage(from, {
      image: { url: items[0].imageSrc },
      caption
    }, { quoted: m });

    // Store pending selections
    const pending = new Map();
    pending.set(sent.key.id, { step: 'search', data: items });

    client.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message) return;

      const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!body) return;

      const ctx = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
      if (!ctx) return;

      const selected = pending.get(ctx);
      if (!selected) return;

      // --- Step 1: Movie/TV show selected ---
      if (selected.step === 'search') {
        const num = parseInt(body.trim());
        const pick = selected.data[num - 1];
        if (!pick) return client.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: msg });

        const isTv = pick.type.includes('TV');
        const link = encodeURIComponent(pick.link);
        const infoUrl = isTv ? `${TVSHOW}${link}` : `${DETAIL}${link}`;
        const info = (await axios.get(infoUrl)).data;

        let cap = `🎬 *${info.title || pick.title}*\n\n🗓️ Year: ${info.year}\n⭐ IMDb: ${info.imdb || pick.rating}\n📄 Type: ${isTv ? 'TV Series' : 'Movie'}\n\n`;

        if (isTv && info.episodes?.length) {
          cap += '*📺 Episodes:*\n';
          info.episodes.slice(0, 10).forEach((e, i) => {
            cap += `${i + 1}. ${e.title}\n`;
          });
          cap += '\n💬 Reply with episode number to get download links.';
        } else {
          cap += '💬 Reply with "1" to get download links.';
        }

        const sent2 = await client.sendMessage(from, {
          image: { url: info.thumbnail || pick.imageSrc },
          caption: cap
        }, { quoted: msg });

        pending.set(sent2.key.id, { step: 'detail', info, isTv });
        return;
      }

      // --- Step 2: Episode or Movie download ---
      if (selected.step === 'detail') {
        const { info, isTv } = selected;
        const num = parseInt(body.trim());
        let link = info.download || info.url;

        if (isTv) {
          const ep = info.episodes[num - 1];
          if (!ep) return client.sendMessage(from, { text: '❌ Invalid episode.' }, { quoted: msg });
          const epRes = await axios.get(EPISODE + encodeURIComponent(ep.url));
          link = epRes.data.download || ep.url;
        }

        const downRes = await axios.get(DOWNLOAD + encodeURIComponent(link));
        const sources = downRes.data.sources || [];
        if (!sources.length)
          return client.sendMessage(from, { text: '❌ No download links found.' }, { quoted: msg });

        let cap3 = `🎬 *${info.title}* Download Links:\n\n`;
        sources.forEach((s, i) => {
          cap3 += `${i + 1}. ${s.quality || 'Unknown'} • ${s.size || '?'}\n${s.direct_download}\n\n`;
        });
        cap3 += `${BRAND}`;

        await client.sendMessage(from, { text: cap3 }, { quoted: msg });
      }
    });

  } catch (err) {
    console.error(err);
    return client.sendMessage(from, {
      text: `❌ Error: ${err.message || err}`
    }, { quoted: m });
  }
});
