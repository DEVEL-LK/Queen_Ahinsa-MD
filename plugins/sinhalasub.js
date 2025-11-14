// 🎬 SinhalaSub Plugin for Queen_Ahinsa-MD
const axios = require('axios');
const NodeCache = require('node-cache');

module.exports = (client) => {
  const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
  const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
  const BRAND = '🎬 CHATGPT MOVIE';
  const cache = new NodeCache({ stdTTL: 120, checkperiod: 240 });
  const pendingReplies = new Map();

  // Register command
  const { cmd } = require('../command');
  cmd({
    pattern: 'cinesubz',
    react: '🍿',
    desc: 'Search Movies / TV Series from Cinesubz',
    category: 'Movie / TV',
    filename: __filename
  }, async (conn, mek, m, { from, q, quoted }) => {
    if (!q) return conn.sendMessage(from, { text: '*Usage:* .cinesubz <movie name>' }, { quoted });

    try {
      const cacheKey = `cine_${q.toLowerCase()}`;
      let searchData = cache.get(cacheKey);

      if (!searchData) {
        const { data } = await axios.get(`${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`);
        if (!data || !Array.isArray(data.data) || data.data.length === 0) throw new Error('❌ No movies found.');

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

      const sendPage = async (page = 1) => {
        const perPage = 20;
        const totalPages = Math.ceil(searchData.length / perPage);
        const start = (page - 1) * perPage;
        const results = searchData.slice(start, start + perPage);

        let caption = `*🍿 Cinesubz Search Results (Page ${page}/${totalPages})*\n\n`;
        results.forEach((r, i) => {
          caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
        });
        if (page < totalPages) caption += `${results.length + 1}. ➡️ *Next Page*\n\n`;
        caption += '🪀 _Reply with number to select_\n\n' + BRAND;

        const sent = await conn.sendMessage(from, { image: { url: results[0]?.image }, caption }, { quoted });
        pendingReplies.set(sent.key.id, { type: 'page', results, page });
      };

      await sendPage();

    } catch (err) {
      console.error(err);
      await conn.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted });
    }
  });

  // Handle number reply
  client.ev.on('messages.upsert', async ({ messages }) => {
    const incoming = messages[0];
    if (!incoming?.message?.conversation) return;

    const textRaw = incoming.message.conversation.trim();
    const text = parseInt(textRaw.replace(/\D/g, ''));
    if (isNaN(text)) return;

    const stanzaId = incoming.key.id;
    if (!pendingReplies.has(stanzaId)) return;

    const pending = pendingReplies.get(stanzaId);
    if (pending.type !== 'page') return;

    const { results, page } = pending;
    const perPage = 20;
    const totalPages = Math.ceil(results.length / perPage);

    // Next page
    if (text === results.length + 1 && page < totalPages) {
      pendingReplies.delete(stanzaId);
      const startIndex = page * perPage;
      const nextResults = results.slice(startIndex, startIndex + perPage);
      if (nextResults.length > 0) {
        let caption = `*🍿 Cinesubz Search Results (Page ${page + 1}/${totalPages})*\n\n`;
        nextResults.forEach((r, i) => {
          caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
        });
        if (page + 1 < totalPages) caption += `${nextResults.length + 1}. ➡️ *Next Page*\n\n`;
        caption += '🪀 _Reply with number to select_\n\n' + BRAND;

        const sent = await client.sendMessage(incoming.key.remoteJid, { image: { url: nextResults[0]?.image }, caption }, { quoted: incoming });
        pendingReplies.set(sent.key.id, { type: 'page', results: nextResults, page: page + 1 });
      }
      return;
    }

    // Selected movie
    const selected = results[text - 1];
    if (!selected) return conn.sendMessage(incoming.key.remoteJid, { text: '❌ Invalid number.' }, { quoted: incoming });
    pendingReplies.delete(stanzaId);

    try {
      const { data: downloadData } = await axios.get(`${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`);
      if (!downloadData || !Array.isArray(downloadData.links) || downloadData.links.length === 0) return conn.sendMessage(incoming.key.remoteJid, { text: '❌ No download links.' }, { quoted: incoming });

      const chosen = downloadData.links[0];
      const sizeInGB = parseSizeToGB(chosen.size || '0');

      if (sizeInGB > 2) {
        await conn.sendMessage(incoming.key.remoteJid, { text: `⚠️ File too large for WhatsApp.\nDirect link:\n${chosen.url}` }, { quoted: incoming });
      } else {
        await conn.sendMessage(incoming.key.remoteJid, {
          document: { url: chosen.url },
          mimetype: 'video/mp4',
          fileName: `${selected.title} • ${chosen.quality}.mp4`,
          caption: `🎬 ${selected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n${BRAND}`
        }, { quoted: incoming });
      }

    } catch (e) {
      console.error(e);
      conn.sendMessage(incoming.key.remoteJid, { text: '❌ Failed to fetch download link.' }, { quoted: incoming });
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
