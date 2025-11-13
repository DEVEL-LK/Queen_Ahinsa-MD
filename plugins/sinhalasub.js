// 🎬 SinhalaSub Plugin v6 – Fully working in Queen_Ahinsa base
const axios = require('axios');
const NodeCache = require('node-cache');
const { cmd } = require('../command');
const config = require('../config');

const BRAND = config.MOVIE_FOOTER || '© SinhalaSub';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';

const BASE = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const SEARCH = `${BASE}/search?apiKey=${API_KEY}&q=`;
const DETAIL = `${BASE}/movie-details?apiKey=${API_KEY}&url=`;
const TVSHOW = `${BASE}/tvshow-details?apiKey=${API_KEY}&url=`;
const EPISODE = `${BASE}/episode-details?apiKey=${API_KEY}&url=`;
const DOWNLOAD = `${BASE}/downloadurl?apiKey=${API_KEY}&url=`;

const cache = new NodeCache({ stdTTL: 120 });
const replySession = new Map();

// 🟢 Main Command
cmd({
  pattern: 'sinhalasub',
  react: '🎬',
  alias: ['cinesubz'],
  desc: 'Search SinhalaSub Movies or TV Series',
  category: 'movie',
  filename: __filename
}, async (client, m, mek, { from, q }) => {
  if (!q) return m.reply('🎬 Usage: `.sinhalasub <movie name>`');

  try {
    const key = `cine_${q.toLowerCase()}`;
    let res = cache.get(key);
    if (!res) {
      res = (await axios.get(SEARCH + encodeURIComponent(q))).data;
      if (!res?.data?.length) throw new Error('❌ No results found.');
      cache.set(key, res);
    }

    const list = res.data.slice(0, 8);
    let caption = `🎬 *Results for:* ${q}\n\n`;
    list.forEach((r, i) => caption += `${i + 1}. ${r.title} (${r.year}) • ⭐ ${r.rating || 'N/A'}\n`);
    caption += `\n💬 Reply with *number* to view details.\n${BRAND}`;

    const sent = await client.sendMessage(from, {
      image: { url: list[0].imageSrc },
      caption
    }, { quoted: m });

    replySession.set(from, { step: 'search', list, msgId: sent.key.id });
  } catch (err) {
    console.log(err);
    m.reply('❌ Error: ' + err.message);
  }
});

// 🟣 Reply Handler
module.exports = (client) => {
  client.on('message', async (m) => {
    try {
      const text = m.body?.trim();
      if (!text || !/^\d+$/.test(text)) return;

      const session = replySession.get(m.chat);
      if (!session || !session.msgId) return;

      const quoted = m.quoted?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (!quoted || quoted !== session.msgId) return;

      const num = parseInt(text);

      // Step 1: Movie/TV selection
      if (session.step === 'search') {
        const selected = session.list[num - 1];
        if (!selected) return m.reply('❌ Invalid number.');

        const isTv = selected.type.includes('TV');
        const infoUrl = isTv ? TVSHOW + encodeURIComponent(selected.link) : DETAIL + encodeURIComponent(selected.link);
        const info = (await axios.get(infoUrl)).data;

        let caption = `🎬 *${info.title || selected.title}*\n\n`;
        caption += `📅 Year: ${info.year || 'N/A'}\n⭐ IMDb: ${info.imdb || selected.rating}\n📂 Type: ${isTv ? 'TV Series' : 'Movie'}\n\n`;

        if (isTv && info.episodes?.length) {
          caption += '*📺 Episodes:*\n';
          info.episodes.slice(0, 10).forEach((e, i) => caption += `${i + 1}. ${e.title}\n`);
          caption += '\n💬 Reply with episode number to get download links.';
        } else caption += '💬 Reply "1" to get download links.';

        const sent = await client.sendMessage(m.chat, {
          image: { url: info.thumbnail || selected.imageSrc },
          caption
        }, { quoted: m });

        replySession.set(m.chat, { step: 'detail', info, isTv, msgId: sent.key.id });
        return;
      }

      // Step 2: Download
      if (session.step === 'detail') {
        const { info, isTv } = session;
        let link = info.download || info.url;

        if (isTv) {
          const ep = info.episodes[num - 1];
          if (!ep) return m.reply('❌ Invalid episode.');
          const epRes = await axios.get(EPISODE + encodeURIComponent(ep.url));
          link = epRes.data.download || ep.url;
        }

        const down = await axios.get(DOWNLOAD + encodeURIComponent(link));
        const src = down.data.sources || [];
        if (!src.length) return m.reply('❌ No download links found.');

        let cap3 = `🎬 *${info.title}* Download Links:\n\n`;
        src.forEach((s, i) => cap3 += `${i + 1}. ${s.quality || '?'} • ${s.size || '?'}\n${s.direct_download}\n\n`);
        cap3 += BRAND;

        await m.reply(cap3);
        replySession.delete(m.chat);
      }

    } catch (err) {
      console.log('Reply Handler Error →', err.message);
    }
  });
};
