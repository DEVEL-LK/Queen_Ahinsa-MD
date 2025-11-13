// 🎬 SinhalaSub (Cinesubz API Integrated v2 - Fixed Data Field)
// by Wasantha X GPT

const consoleLog = console.log;
const config = require('../config');
const { cmd } = require('../command');
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache setup
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const BRAND = '' + config.MOVIE_FOOTER;

// Your API key
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';

// Base URLs
const API_BASE = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const SEARCH_API = `${API_BASE}/search?apiKey=${API_KEY}&q=`;
const DETAIL_API = `${API_BASE}/movie-details?apiKey=${API_KEY}&url=`;
const TVSHOW_API = `${API_BASE}/tvshow-details?apiKey=${API_KEY}&url=`;
const EPISODE_API = `${API_BASE}/episode-details?apiKey=${API_KEY}&url=`;
const DOWNLOAD_API = `${API_BASE}/downloadurl?apiKey=${API_KEY}&url=`;

// Command Registration
cmd({
  pattern: 'sinhalasub',
  react: '🎬',
  desc: 'Search and download SinhalaSub Movies / TV Series',
  category: 'Movie / TV',
  filename: __filename
}, async (client, quotedMsg, msg, { from, q }) => {

  const USAGE =
    '*🎬 SinhalaSub Movie / TV Search*\n\n' +
    '📋 Usage: .sinhalasub <movie name>\n\n' +
    '📝 Example: .sinhalasub Breaking Bad\n\n' +
    '*💡 Type your movie or series name.*';

  if (!q)
    return client.sendMessage(from, { text: USAGE }, { quoted: quotedMsg });

  try {
    const cacheKey = `cine_${q.toLowerCase()}`;
    let data = cache.get(cacheKey);

    if (!data) {
      const res = await axios.get(SEARCH_API + encodeURIComponent(q));
      data = res.data;

      if (!data || !data.data || !Array.isArray(data.data) || !data.data.length)
        throw new Error('❌ No results found.');

      cache.set(cacheKey, data);
    }

    // Map results
    const results = data.data.slice(0, 10).map((r, i) => ({
      n: i + 1,
      title: r.title,
      year: r.year,
      link: r.link,
      imdb: r.rating || 'N/A',
      image: r.imageSrc,
      type: r.type
    }));

    let caption = `*🎬 SinhalaSub Search Results*\n\n`;
    results.forEach(r => {
      caption += `${r.n}. ${r.title} (${r.year}) • ${r.imdb}\n`;
    });
    caption += '\n🪀 Reply with number to get details.\n\n*~https://whatsapp.com/channel/0029Vb5xFPHGE56jTnm4ZD2k~*';

    const sentMsg = await client.sendMessage(from, {
      image: { url: results[0].image },
      caption
    }, { quoted: quotedMsg });

    const pending = new Map();

    const handler = async ({ messages }) => {
      const incoming = messages?.[0];
      const text = incoming?.message?.conversation?.trim();
      if (!text) return;

      // Step 1: Pick movie or tv show
      if (incoming.message?.contextInfo?.stanzaId === sentMsg.key.id) {
        const sel = parseInt(text, 10);
        const selected = results.find(r => r.n === sel);
        if (!selected) return client.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: incoming });

        const isTv = selected.type.includes('TV');
        const infoURL = (isTv ? TVSHOW_API : DETAIL_API) + encodeURIComponent(selected.link);

        const detailRes = await axios.get(infoURL);
        const info = detailRes.data;
        const img = info.thumbnail || selected.image;

        let caption2 = `🎬 *${info.title || selected.title}*\n\n🗓️ Year: ${info.year}\n⭐ IMDb: ${info.imdb || selected.imdb}\n📄 Type: ${isTv ? 'TV Series' : 'Movie'}\n\n`;

        if (isTv && info.episodes?.length) {
          caption2 += '*📺 Episodes:*\n';
          info.episodes.slice(0, 10).forEach((e, i) => {
            caption2 += `${i + 1}. ${e.title}\n`;
          });
          caption2 += '\n🔢 Reply with episode number to download.';
        } else {
          caption2 += '*📥 Reply "1" to get download links.*';
        }

        const msg2 = await client.sendMessage(from, { image: { url: img }, caption: caption2 }, { quoted: incoming });
        pending.set(msg2.key.id, { info, isTv });
        return;
      }

      // Step 2: Episode or movie download
      if (pending.has(incoming.message?.contextInfo?.stanzaId)) {
        const { info, isTv } = pending.get(incoming.message.contextInfo.stanzaId);
        const pick = parseInt(text, 10);

        let downloadURL;
        if (isTv) {
          const ep = info.episodes[pick - 1];
          if (!ep) return client.sendMessage(from, { text: '❌ Invalid episode.' }, { quoted: incoming });
          const epRes = await axios.get(EPISODE_API + encodeURIComponent(ep.url));
          downloadURL = epRes.data.download || ep.url;
        } else {
          downloadURL = info.download || info.url;
        }

        const downRes = await axios.get(DOWNLOAD_API + encodeURIComponent(downloadURL));
        const sources = downRes.data.sources || [];

        if (!sources.length)
          return client.sendMessage(from, { text: '❌ No download links found.' }, { quoted: incoming });

        let caption3 = `🎬 *${info.title}* Download Links:\n\n`;
        sources.forEach((s, i) => {
          caption3 += `${i + 1}. ${s.quality} • ${s.size}\n${s.direct_download}\n\n`;
        });
        caption3 += `${BRAND}`;

        await client.sendMessage(from, { text: caption3 }, { quoted: incoming });
      }
    };

    client.ev.on('messages.upsert', handler);

  } catch (e) {
    consoleLog(e);
    client.sendMessage(from, { text: '❌ Error: ' + (e.message || e) }, { quoted: quotedMsg });
  }
});
