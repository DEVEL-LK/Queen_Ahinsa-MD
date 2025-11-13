// 🎬 SinhalaSub Plugin - Direct Quality Download (No "Reply 1")
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

module.exports = (conn) => {

  cmd({
    pattern: 'sinhalasub',
    react: '🎬',
    alias: ['cinesubz'],
    desc: 'Search SinhalaSub Movies or TV Series (Direct Download)',
    category: 'movie',
    filename: __filename
  }, async (client, m, mek, { from, q }) => {
    if (!q) return m.reply(
      '🎬 *SinhalaSub Search*\n\n📖 Usage: `.sinhalasub <movie name>`\n💡 Example: `.sinhalasub Breaking Bad`'
    );

    try {
      // 1️⃣ Search
      const key = `cine_${q.toLowerCase()}`;
      let res = cache.get(key);
      if (!res) {
        res = (await axios.get(SEARCH + encodeURIComponent(q))).data;
        if (!res?.data?.length) throw new Error('❌ No results found.');
        cache.set(key, res);
      }

      const selected = res.data[0]; // Pick first result directly
      const isTv = selected.type.includes('TV');
      const infoUrl = isTv ? TVSHOW + encodeURIComponent(selected.link) : DETAIL + encodeURIComponent(selected.link);
      
      // 2️⃣ Get details
      const info = (await axios.get(infoUrl)).data;

      let downloadLink = info.download || info.url;

      // 3️⃣ If TV, pick first episode automatically
      if (isTv && info.episodes?.length) {
        const ep = info.episodes[0];
        const epRes = await axios.get(EPISODE + encodeURIComponent(ep.url));
        downloadLink = epRes.data.download || ep.url;
      }

      // 4️⃣ Fetch download sources
      const down = await axios.get(DOWNLOAD + encodeURIComponent(downloadLink));
      const src = down.data.sources || down.data.download || [];
      if (!src.length) return m.reply('❌ No download links found.');

      // 5️⃣ Build message grouped by quality
      let cap = `🎬 *${info.title}* Download Links:\n\n`;
      ['480p', '720p', '1080p'].forEach(q => {
        const filtered = src.filter(s => (s.quality || '').includes(q));
        if (filtered.length) {
          cap += `*${q}*:\n`;
          filtered.forEach((s, i) => {
            cap += `${i + 1}. ${s.size || '?'} • ${s.url || s.direct_download}\n`;
          });
          cap += '\n';
        }
      });

      cap += BRAND;

      // 6️⃣ Send message
      const sent = await conn.sendMessage(from, { text: cap });
      await conn.sendMessage(from, { react: { text: '⬇️', key: sent.key } });

    } catch (err) {
      console.log(err);
      m.reply('❌ Error: ' + err.message);
    }
  });

};
