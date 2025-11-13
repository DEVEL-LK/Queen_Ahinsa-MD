// 🎬 SinhalaSub Plugin (Baileys v5 Fully Fixed)
// 🧠 Developer: Wasantha X GPT

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

module.exports = (conn) => {

  // 🟢 Main Command
  cmd({
    pattern: 'sinhalasub',
    react: '🎬',
    alias: ['cinesubz'],
    desc: 'Search SinhalaSub Movies or TV Series',
    category: 'movie',
    filename: __filename
  }, async (client, m, mek, { from, q }) => {
    if (!q) return m.reply(
      '🎬 *SinhalaSub Search*\n\n📖 Usage: `.sinhalasub <movie name>`\n💡 Example: `.sinhalasub Breaking Bad`'
    );

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
      list.forEach((r, i) => {
        caption += `${i + 1}. ${r.title} (${r.year}) • ⭐ ${r.rating || 'N/A'}\n`;
      });
      caption += `\n💬 Reply with *number* to view details.\n${BRAND}`;

      const sent = await conn.sendMessage(from, {
        image: { url: list[0].imageSrc },
        caption
      }, { quoted: m });

      replySession.set(from, {
        step: 'search',
        list,
        msgId: sent.key.id
      });
    } catch (err) {
      console.log(err);
      m.reply('❌ Error: ' + err.message);
    }
  });

  // 🟣 Global Reply Listener (Fixed)
  conn.ev.on('messages.upsert', async (meks) => {
    try {
      const mek = meks.messages[0];
      if (!mek.message) return;

      const from = mek.key.remoteJid;
      const session = replySession.get(from);
      if (!session) return;

      // Allow both quoted reply or simple number reply
      const quotedId = mek.message.extendedTextMessage?.contextInfo?.stanzaId;
      const text = mek.message.conversation || mek.message.extendedTextMessage?.text;
      if (!text || !/^\d+$/.test(text)) return;
      const num = parseInt(text);

      // ---- Step 1: Movie / TV selection ----
      if (session.step === 'search') {
        const selected = session.list[num - 1];
        if (!selected) return conn.sendMessage(from, { text: '❌ Invalid number.' });

        const isTv = selected.type.includes('TV');
        const infoUrl = isTv ? TVSHOW + encodeURIComponent(selected.link) : DETAIL + encodeURIComponent(selected.link);
        const info = (await axios.get(infoUrl)).data;

        let caption = `🎬 *${info.title || selected.title}*\n\n`;
        caption += `📅 Year: ${info.year || 'N/A'}\n⭐ IMDb: ${info.imdb || selected.rating}\n📂 Type: ${isTv ? 'TV Series' : 'Movie'}\n\n`;

        if (isTv && info.episodes?.length) {
          caption += '*📺 Episodes:*\n';
          info.episodes.slice(0, 10).forEach((e, i) => {
            caption += `${i + 1}. ${e.title}\n`;
          });
          caption += '\n💬 Reply with episode number to get download links.';
        } else {
          caption += '💬 Reply "1" to get download links.';
        }

        const sent = await conn.sendMessage(from, {
          image: { url: info.thumbnail || selected.imageSrc },
          caption
        }, { quoted: mek });

        // React to user's reply
        await conn.sendMessage(from, { react: { text: '🔎', key: sent.key } });

        replySession.set(from, {
          step: 'detail',
          info,
          isTv,
          msgId: sent.key.id
        });
        return;
      }

      // ---- Step 2: Download ----
      if (session.step === 'detail') {
        const { info, isTv } = session;
        let link = info.download || info.url;

        if (isTv) {
          const ep = info.episodes[num - 1];
          if (!ep) return conn.sendMessage(from, { text: '❌ Invalid episode.' });
          const epRes = await axios.get(EPISODE + encodeURIComponent(ep.url));
          link = epRes.data.download || ep.url;
        }

        const down = await axios.get(DOWNLOAD + encodeURIComponent(link));
        const src = down.data.sources || down.data.download || [];
        if (!src.length) return conn.sendMessage(from, { text: '❌ No download links found.' });

        let cap3 = `🎬 *${info.title}* Download Links:\n\n`;

        const qualities = ['480p', '720p', '1080p'];
        qualities.forEach(q => {
          const filtered = src.filter(s => (s.quality || '').includes(q));
          if (filtered.length) {
            cap3 += `*${q}*:\n`;
            filtered.forEach((s, i) => {
              cap3 += `${i + 1}. ${s.size || '?'} • ${s.url || s.direct_download}\n`;
            });
            cap3 += '\n';
          }
        });

        cap3 += BRAND;

        await conn.sendMessage(from, { text: cap3 });

        // React with download emoji
        await conn.sendMessage(from, { react: { text: '⬇️', key: mek.key } });

        // Clear session
        replySession.delete(from);
      }

    } catch (err) {
      console.log('SinhalaSub Reply Error →', err.message);
    }
  });

};
