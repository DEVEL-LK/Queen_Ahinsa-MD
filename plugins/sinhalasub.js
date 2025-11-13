// 🎬 Fixed Cinesubz Command with WhatsApp Document Send
const axios = require('axios');
const { cmd } = require('../command');
const NodeCache = require('node-cache');
const config = require('../config');

const BRAND = config.MOVIE_FOOTER || '🎬 Cinesubz by KAVI';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';

const cache = new NodeCache({ stdTTL: 120, checkperiod: 240 });

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

      if (!data || !Array.isArray(data.results) || data.results.length === 0)
        throw new Error('❌ No movies found.');

      searchData = data.results.map(item => ({
        title: item.title,
        year: item.year || 'N/A',
        imdb: item.imdb || 'N/A',
        image: item.thumbnail || item.image,
        url: item.url || item.link
      }));

      cache.set(cacheKey, searchData);
    }

    let page = 1;
    const perPage = 20;
    const totalPages = Math.ceil(searchData.length / perPage);

    const sendPage = async (p) => {
      const start = (p - 1) * perPage;
      const results = searchData.slice(start, start + perPage);

      let caption = `*🍿 Cinesubz Search Results (Page ${p}/${totalPages})*\n\n`;
      results.forEach((r, i) => {
        caption += `${i + 1}. 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
      });
      if (p < totalPages) caption += `${results.length + 1}. ➡️ *Next Page*\n\n`;
      caption += '🪀 _Reply with number to select_\n\n' + BRAND;

      const sent = await client.sendMessage(from, {
        image: { url: results[0]?.image },
        caption
      }, { quoted });

      client.ev.on('messages.upsert', async ({ messages }) => {
        const incoming = messages?.[0];
        if (!incoming?.message?.conversation) return;
        const text = incoming.message.conversation.trim();

        if (incoming.message?.contextInfo?.stanzaId === sent.key.id) {
          const n = parseInt(text);
          if (isNaN(n)) return;
          if (n === results.length + 1 && p < totalPages) {
            await sendPage(p + 1);
            return;
          }

          const selected = results[n - 1];
          if (!selected) {
            await client.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: incoming });
            return;
          }

          // Download API
          const downloadUrl = `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`;
          const { data: downloadData } = await axios.get(downloadUrl);

          if (!downloadData || !Array.isArray(downloadData.links) || downloadData.links.length === 0) {
            await client.sendMessage(from, { text: '❌ No download links.' }, { quoted: incoming });
            return;
          }

          // Pick first link (or you can add quality selection later)
          const chosen = downloadData.links[0];
          const sizeInGB = parseSizeToGB(chosen.size || '0');

          if (sizeInGB > 2) {
            await client.sendMessage(from, {
              text: `⚠️ File too large for WhatsApp.\nDirect link:\n${chosen.url}`
            }, { quoted: incoming });
          } else {
            await client.sendMessage(from, {
              document: { url: chosen.url },
              mimetype: 'video/mp4',
              fileName: `${selected.title} • ${chosen.quality}.mp4`,
              caption: `🎬 ${selected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n${BRAND}`
            }, { quoted: incoming });
          }
        }
      });
    };

    await sendPage(page);

  } catch (err) {
    console.error(err);
    await client.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted });
  }
});

// Helper: parse size string to GB
function parseSizeToGB(sizeStr) {
  if (!sizeStr) return 0;
  const s = sizeStr.trim().toUpperCase();
  if (s.endsWith('GB')) return parseFloat(s.replace('GB', '')) || 0;
  if (s.endsWith('MB')) return (parseFloat(s.replace('MB', '')) || 0) / 1024;
  if (s.endsWith('KB')) return (parseFloat(s.replace('KB', '')) || 0) / (1024 * 1024);
  return parseFloat(s) || 0;
}
