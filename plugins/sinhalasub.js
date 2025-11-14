// 🎬 SinhalaSub (Cinesubz) Fixed Plugin for Baileys v5
const axios = require('axios');
const NodeCache = require('node-cache');
const { cmd } = require('../command');

const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const BRAND = '🎬 CHATGPT MOVIE';

const cache = new NodeCache({ stdTTL: 120, checkperiod: 240 });
const pendingReplies = new Map();

module.exports = (conn) => {
  cmd({
    pattern: 'cinesubz',
    react: '🍿',
    desc: 'Search Movies / TV Series from Cinesubz',
    category: 'Movie / TV',
    filename: __filename
  }, async (client, quoted, mek, { from, q }) => {
    if (!q) return await client.sendMessage(from, { text: '*Usage: .cinesubz <movie or TV show name>*' }, { quoted: mek });

    try {
      const cacheKey = `cine_${q.toLowerCase()}`;
      let searchData = cache.get(cacheKey);

      if (!searchData) {
        const { data } = await axios.get(`${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`);
        if (!data || !Array.isArray(data.data) || !data.data.length) throw new Error('❌ No movies or TV shows found.');

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

      const perPage = 20;
      let page = 1;
      const totalPages = Math.ceil(searchData.length / perPage);

      const sendPage = async (p) => {
        const start = (p - 1) * perPage;
        const results = searchData.slice(start, start + perPage);

        let caption = `*🍿 Cinesubz Search Results (Page ${p}/${totalPages})*\n\n`;
        results.forEach((r, i) => {
          caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
        });
        if (p < totalPages) caption += `${results.length + 1}. ➡️ *Next Page*\n\n`;
        caption += '🪀 _Reply with number to select_\n\n' + BRAND;

        const quotedMsg = mek || { key: { remoteJid: from, fromMe: false, id: '0' }, message: { conversation: '' } };
        const sent = await client.sendMessage(from, {
          image: { url: results[0]?.image },
          caption
        }, { quoted: quotedMsg });

        pendingReplies.set(sent.key.id, { type: 'page', results, page });
      };

      await sendPage(page);

    } catch (err) {
      console.error(err);
      await client.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted: mek });
    }
  });

  // Handle number replies
  conn.ev.on('messages.upsert', async ({ messages }) => {
    const incoming = messages[0];
    if (!incoming?.message?.conversation) return;

    const textRaw = incoming.message.conversation.trim();
    const text = parseInt(textRaw.replace(/\D/g, ''));
    if (isNaN(text)) return;

    const stanzaId = incoming.key.id;
    if (!pendingReplies.has(stanzaId)) return;

    const pending = pendingReplies.get(stanzaId);

    if (pending.type === 'page') {
      const { results, page } = pending;
      const perPage = 20;
      const totalPages = Math.ceil(results.length / perPage);

      // Next Page
      if (text === results.length + 1 && page < totalPages) {
        pendingReplies.delete(stanzaId);
        const nextResults = results.slice(page * perPage, page * perPage + perPage);
        if (nextResults.length > 0) {
          let caption = `*🍿 Cinesubz Search Results (Page ${page + 1}/${totalPages})*\n\n`;
          nextResults.forEach((r, i) => {
            caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
          });
          if (page + 1 < totalPages) caption += `${nextResults.length + 1}. ➡️ *Next Page*\n\n`;
          caption += '🪀 _Reply with number to select_\n\n' + BRAND;

          const quotedMsg = incoming || { key: { remoteJid: incoming.key.remoteJid, fromMe: false, id: '0' }, message: { conversation: '' } };
          const sent = await conn.sendMessage(incoming.key.remoteJid, {
            image: { url: nextResults[0]?.image },
            caption
          }, { quoted: quotedMsg });
          pendingReplies.set(sent.key.id, { type: 'page', results: nextResults, page: page + 1 });
        }
        return;
      }

      const selected = results[text - 1];
      if (!selected) {
        await conn.sendMessage(incoming.key.remoteJid, { text: '❌ Invalid number.' }, { quoted: incoming });
        return;
      }

      pendingReplies.delete(stanzaId);

      // Fetch download links
      const { data: downloadData } = await axios.get(`${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`);
      if (!downloadData || !Array.isArray(downloadData.links) || !downloadData.links.length) {
        await conn.sendMessage(incoming.key.remoteJid, { text: '❌ No download links.' }, { quoted: incoming });
        return;
      }

      const chosen = downloadData.links[0];
      const sizeInGB = parseSizeToGB(chosen.size || '0');

      const quotedMsg = incoming || { key: { remoteJid: incoming.key.remoteJid, fromMe: false, id: '0' }, message: { conversation: '' } };

      if (sizeInGB > 2) {
        await conn.sendMessage(incoming.key.remoteJid, {
          text: `⚠️ File too large for WhatsApp.\nDirect link:\n${chosen.url}`
        }, { quoted: quotedMsg });
      } else {
        await conn.sendMessage(incoming.key.remoteJid, {
          document: { url: chosen.url },
          mimetype: 'video/mp4',
          fileName: `${selected.title} • ${chosen.quality}.mp4`,
          caption: `🎬 ${selected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n${BRAND}`
        }, { quoted: quotedMsg });
      }
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
