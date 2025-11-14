const axios = require('axios');
const NodeCache = require('node-cache');
const { cmd } = require('../command');

const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const BRAND = '🎬 CHATGPT MOVIE';

module.exports = (conn) => {
  const cache = new NodeCache({ stdTTL: 120 });
  const pendingReplies = new Map();

  cmd({
    pattern: 'cinesubz',
    react: '🍿',
    desc: 'Search Movies / TV Series from Cinesubz',
    category: 'Movie / TV',
    filename: __filename
  }, async (client, quoted, msg, { from, q }) => {
    if (!q) return client.sendMessage(from, { text: 'Usage: .cinesubz <movie name>' }, { quoted: msg });

    try {
      const cacheKey = `cine_${q.toLowerCase()}`;
      let searchData = cache.get(cacheKey);

      if (!searchData) {
        const { data } = await axios.get(`${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`, { timeout: 10000 });
        if (!data || !Array.isArray(data.data) || !data.data.length)
          throw new Error('❌ No movies or TV shows found.');

        searchData = data.data.map(item => ({
          title: item.title,
          year: item.year || 'N/A',
          imdb: item.rating || 'N/A',
          image: item.imageSrc,
          url: item.link,
          type: item.type
        }));
        cache.set(cacheKey, searchData);
      }

      let caption = '*🍿 Cinesubz Search Results*\n\n';
      searchData.forEach((r, i) => {
        caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
      });
      caption += '🪀 Reply with the number to select\n\n' + BRAND;

      const sent = await client.sendMessage(from, { image: { url: searchData[0]?.image }, caption }, { quoted: msg });

      // Store pending selection
      pendingReplies.set(from, { results: searchData });

    } catch (err) {
      console.error(err);
      client.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted: msg });
    }
  });

  // Listen for number reply
  conn.ev.on('messages.upsert', async ({ messages }) => {
    const mek = messages[0];
    if (!mek.message || mek.key.remoteJid === 'status@broadcast') return;

    const from = mek.key.remoteJid;
    const pending = pendingReplies.get(from);
    if (!pending) return;

    const textRaw = mek.message.conversation || (mek.message.extendedTextMessage?.text || '');
    const text = parseInt(textRaw.replace(/\D/g, ''));
    if (isNaN(text)) return;

    const selected = pending.results[text - 1];
    if (!selected) {
      return conn.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: mek });
    }

    // ✅ Emoji reaction when number is selected
    try {
      await conn.sendMessage(from, { react: { text: '🍿', key: mek.key } });
    } catch (e) {
      console.error('Reaction failed:', e);
    }

    pendingReplies.delete(from);

    try {
      const { data: downloadData } = await axios.get(`${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`);
      if (!downloadData || !Array.isArray(downloadData.links) || !downloadData.links.length)
        return conn.sendMessage(from, { text: '❌ No download links.' }, { quoted: mek });

      const chosen = downloadData.links[0];
      const sizeGB = parseSizeToGB(chosen.size);

      if (sizeGB > 2) {
        await conn.sendMessage(from, { text: `⚠️ File too large for WhatsApp.\nDirect link:\n${chosen.url}` }, { quoted: mek });
      } else {
        await conn.sendMessage(from, {
          document: { url: chosen.url },
          mimetype: 'video/mp4',
          fileName: `${selected.title} • ${chosen.quality}.mp4`,
          caption: `🎬 ${selected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n${BRAND}`
        }, { quoted: mek });
      }
    } catch (err) {
      console.error(err);
      conn.sendMessage(from, { text: '❌ Download failed: ' + (err.message || err) }, { quoted: mek });
    }
  });

  function parseSizeToGB(sizeStr) {
    if (!sizeStr) return 0;
    const s = sizeStr.trim().toUpperCase();
    if (s.endsWith('GB')) return parseFloat(s.replace('GB', '')) || 0;
    if (s.endsWith('MB')) return (parseFloat(s.replace('MB', '')) || 0) / 1024;
    if (s.endsWith('KB')) return (parseFloat(s.replace('KB', '')) || 0) / (1024 * 1024);
    return parseFloat(s) || 0;
  }
};
