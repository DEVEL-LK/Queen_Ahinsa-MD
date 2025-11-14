const axios = require('axios');
const NodeCache = require('node-cache');
const { cmd } = require('../command');

const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const BRAND = '☫ 𝙳𝚎𝚟𝚎𝚕𝚘𝚙𝚎𝚍 𝙱𝚢 𝙳𝚒𝚕𝚒𝚜𝚑𝚊𝚃𝚎𝚌𝚑 ㋡';

module.exports = (conn) => {
  const cache = new NodeCache({ stdTTL: 120 });
  const pendingReplies = new Map();

  //━━━━━━━━━━━━━━━━━━━━━━
  // SEARCH COMMAND
  //━━━━━━━━━━━━━━━━━━━━━━
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
        const { data } = await axios.get(`${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`, {
          timeout: 15000
        });

        if (!data?.data?.length) throw new Error('❌ No movies or TV shows found.');

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

      // Build caption
      let caption = '*🍿 Cinesubz Search Results*\n\n';
      searchData.forEach((r, i) => {
        caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
      });

      caption += '🪀 Reply with the number to select\n\n' + BRAND;

      const sent = await client.sendMessage(from, {
        image: { url: searchData[0].image },
        caption
      }, { quoted: msg });

      pendingReplies.set(from, { results: searchData });

    } catch (err) {
      console.log(err);
      client.sendMessage(from, { text: `❌ Error: ${err.message}` }, { quoted: msg });
    }
  });


  //━━━━━━━━━━━━━━━━━━━━━━
  // MESSAGE LISTENER FOR NUMBER REPLY
  //━━━━━━━━━━━━━━━━━━━━━━
  conn.ev.on('messages.upsert', async ({ messages }) => {
    const mek = messages[0];
    if (!mek.message || mek.key.fromMe) return;

    const from = mek.key.remoteJid;
    const pending = pendingReplies.get(from);
    if (!pending) return;

    const raw = mek.message.conversation || mek.message.extendedTextMessage?.text || '';
    const num = parseInt(raw.trim());

    if (isNaN(num)) return;

    // Reaction to confirm number selection
    try {
      await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });
    } catch { }

    const selected = pending.results[num - 1];
    if (!selected) {
      return conn.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: mek });
    }

    pendingReplies.delete(from);

    //━━━━━━━━━━━━━━━━━━━━━━
    // AUTO DOWNLOAD FUNCTION WITH RETRY
    //━━━━━━━━━━━━━━━━━━━━━━
    async function fetchDownload(url, retries = 2) {
      try {
        return await axios.get(url, { timeout: 25000 });
      } catch (err) {
        if (retries > 0) return await fetchDownload(url, retries - 1);
        throw err;
      }
    }

    try {
      const dl = await fetchDownload(`${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`);

      if (!dl.data?.links?.length)
        return conn.sendMessage(from, { text: '❌ No download links.' }, { quoted: mek });

      const file = dl.data.links[0];
      const sizeGB = parseSizeToGB(file.size);

      await conn.sendMessage(from, { react: { text: '📥', key: mek.key } });

      if (sizeGB > 2) {
        return conn.sendMessage(from, {
          text: `⚠️ File too large for WhatsApp.\n\n🔗 Direct download:\n${file.url}`
        }, { quoted: mek });
      }

      await conn.sendMessage(from, {
        document: { url: file.url },
        mimetype: 'video/mp4',
        fileName: `${selected.title} • ${file.quality}.mp4`,
        caption: `🎬 ${selected.title}\n📥 Quality: ${file.quality}\n💾 Size: ${file.size}\n\n${BRAND}`
      }, { quoted: mek });

    } catch (err) {
      conn.sendMessage(from, {
        text: `❌ Download failed: ${err.message}`
      }, { quoted: mek });
    }
  });


  //━━━━━━━━━━━━━━━━━━━━━━
  // SIZE PARSER
  //━━━━━━━━━━━━━━━━━━━━━━
  function parseSizeToGB(sizeStr) {
    if (!sizeStr) return 0;
    const s = sizeStr.toUpperCase();
    if (s.endsWith('GB')) return parseFloat(s) || 0;
    if (s.endsWith('MB')) return (parseFloat(s) || 0) / 1024;
    return 0;
  }

};
