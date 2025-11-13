// 🎬 Cinesubz Movie / TV Command
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
    '*🎬 Cinesubz Movie Search*\n\n' +
    '📋 Usage: .cinesubz <movie name>\n\n' +
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
      searchData = data.results;
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
        caption += `${i + 1}. 🎬 *${r.title}*\n   📅 ${r.year || 'N/A'} • ⭐ ${r.imdb || 'N/A'}\n\n`;
      });
      if (p < totalPages) caption += `${results.length + 1}. ➡️ *Next Page*\n\n`;
      caption += '🪀 _Reply with number to select_\n\n' + BRAND;

      const sent = await client.sendMessage(from, {
        image: { url: results[0]?.thumbnail || results[0]?.image },
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

          const detailsUrl = `${BASE_URL}/movie-details?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url || selected.link)}`;
          const { data: movieDetails } = await axios.get(detailsUrl);

          const downloadUrl = `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url || selected.link)}`;
          const { data: downloadData } = await axios.get(downloadUrl);

          if (!downloadData || !Array.isArray(downloadData.links)) {
            await client.sendMessage(from, { text: '❌ No download links.' }, { quoted: incoming });
            return;
          }

          let detailText = `*🎬 ${selected.title}*\n\n`;
          detailText += `🧩 Type: ${movieDetails.type || 'N/A'}\n`;
          detailText += `📅 Year: ${movieDetails.year || 'N/A'}\n`;
          detailText += `⭐ IMDb: ${movieDetails.imdb || 'N/A'}\n\n`;
          detailText += `📥 *Available Qualities:*\n`;

          downloadData.links.forEach((link, i) => {
            detailText += `${i + 1}. ${link.quality} • ${link.size}\n`;
          });

          detailText += '\n🔢 _Reply with number to download_\n\n' + BRAND;

          const pickMsg = await client.sendMessage(from, {
            image: { url: selected.thumbnail || selected.image },
            caption: detailText
          }, { quoted: incoming });

          client.ev.on('messages.upsert', async ({ messages }) => {
            const reply = messages?.[0];
            if (!reply?.message?.conversation) return;
            const t = reply.message.conversation.trim();
            if (reply.message?.contextInfo?.stanzaId !== pickMsg.key.id) return;

            const idx = parseInt(t);
            const chosen = downloadData.links[idx - 1];
            if (!chosen) {
              await client.sendMessage(from, { text: '❌ Invalid choice.' }, { quoted: reply });
              return;
            }

            await client.sendMessage(from, {
              text: `🎬 *${selected.title}*\n\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n🔗 ${chosen.url || chosen.direct}`
            }, { quoted: reply });
          });
        }
      });
    };

    await sendPage(page);
  } catch (err) {
    console.error(err);
    await client.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted });
  }
});
