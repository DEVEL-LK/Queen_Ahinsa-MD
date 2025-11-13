// 🎬 Cinesubz Movie/TV Command with WhatsApp Document Send + Reply Fix
const axios = require('axios');
const { cmd } = require('../command');
const NodeCache = require('node-cache');
const config = require('../config');

const BRAND = config.MOVIE_FOOTER || '🎬 CHATGPT MOVIE';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';

const cache = new NodeCache({ stdTTL: 120, checkperiod: 240 });

// Pending replies Map
const pendingReplies = new Map();

cmd({
  pattern: 'cinesubz',
  react: '🍿',
  desc: 'Search Movies / TV Series from Cinesubz',
  category: 'Movie / TV',
  filename: __filename
}, async (client, quoted, msg, { from, q }) => {
  const usage =
    '*🎬 Cinesubz Movie/TV Search*\n\n' +
    '📋 Usage: .cinesubz <movie or TV show name>\n' +
    '📝 Example: .cinesubz Breaking Bad\n\n' +
    '💡 _Type a movie or TV show name to search_ 🍿';

  if (!q) return await client.sendMessage(from, { text: usage }, { quoted });

  try {
    const cacheKey = `cine_${q.toLowerCase()}`;
    let searchData = cache.get(cacheKey);

    if (!searchData) {
      const searchUrl = `${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`;
      const { data } = await axios.get(searchUrl, { timeout: 10000 });

      if (!data || !Array.isArray(data.data) || data.data.length === 0)
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

      const sent = await client.sendMessage(from, {
        image: { url: results[0]?.image },
        caption
      }, { quoted });

      // Store pending page selection
      pendingReplies.set(sent.key.id, { type: 'page', results, page });
    };

    await sendPage(page);

  } catch (err) {
    console.error(err);
    await client.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted });
  }
});

// Top-level listener for all replies
const handleReplies = async ({ messages }) => {
  const incoming = messages?.[0];
  if (!incoming?.message?.conversation) return;
  const textRaw = incoming.message.conversation.trim();
  const text = parseInt(textRaw.replace(/\D/g, '')); // remove non-digits
  if (isNaN(text)) return;

  const stanzaId = incoming.message?.contextInfo?.stanzaId;
  if (!stanzaId) return;

  if (!pendingReplies.has(stanzaId)) return;

  const pending = pendingReplies.get(stanzaId);

  if (pending.type === 'page') {
    // Page selection
    const { results, page } = pending;
    const perPage = 20;
    const totalPages = Math.ceil(results.length / perPage);

    if (text === results.length + 1 && page < totalPages) {
      // Next page
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

        const sent = await client.sendMessage(incoming.key.remoteJid, {
          image: { url: nextResults[0]?.image },
          caption
        }, { quoted: incoming });
        pendingReplies.set(sent.key.id, { type: 'page', results: nextResults, page: page + 1 });
      }
      return;
    }

    const selected = results[text - 1];
    if (!selected) {
      await client.sendMessage(incoming.key.remoteJid, { text: '❌ Invalid number.' }, { quoted: incoming });
      return;
    }

    pendingReplies.delete(stanzaId);

    // Fetch download links
    const downloadUrl = `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`;
    const { data: downloadData } = await axios.get(downloadUrl);

    if (!downloadData || !Array.isArray(downloadData.links) || downloadData.links.length === 0) {
      await client.sendMessage(incoming.key.remoteJid, { text: '❌ No download links.' }, { quoted: incoming });
      return;
    }

    const chosen = downloadData.links[0];
    const sizeInGB = parseSizeToGB(chosen.size || '0');

    if (sizeInGB > 2) {
      await client.sendMessage(incoming.key.remoteJid, {
        text: `⚠️ File too large for WhatsApp.\nDirect link:\n${chosen.url}`
      }, { quoted: incoming });
    } else {
      await client.sendMessage(incoming.key.remoteJid, {
        document: { url: chosen.url },
        mimetype: 'video/mp4',
        fileName: `${selected.title} • ${chosen.quality}.mp4`,
        caption: `🎬 ${selected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n${BRAND}`
      }, { quoted: incoming });
    }

  }
};

client.ev.on('messages.upsert', handleReplies);

// Helper: parse human-readable size to GB
function parseSizeToGB(sizeStr) {
  if (!sizeStr) return 0;
  const s = sizeStr.trim().toUpperCase();
  if (s.endsWith('GB')) return parseFloat(s.replace('GB', '')) || 0;
  if (s.endsWith('MB')) return (parseFloat(s.replace('MB', '')) || 0) / 1024;
  if (s.endsWith('KB')) return (parseFloat(s.replace('KB', '')) || 0) / (1024 * 1024);
  return parseFloat(s) || 0;
}
