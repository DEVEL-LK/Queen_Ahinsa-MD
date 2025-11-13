// 🎬 Cinetv Command - TV Shows / Episodes
const axios = require('axios');
const { cmd } = require('../command');
const NodeCache = require('node-cache');
const config = require('../config');

const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const BRAND = '🌟 Powered by CHATGPT MOVIE 🍿';

const cache = new NodeCache({ stdTTL: 120, checkperiod: 240 });

cmd({
  pattern: 'cinetv',
  react: '📺',
  desc: 'Search TV Series and Episodes from Cinesubz',
  category: 'TV / Movie',
  filename: __filename
}, async (client, quoted, msg, { from, q }) => {
  const usage =
    '*📺 Cinetv TV Series Search*\n\n' +
    '📋 Usage: .cinetv <show name>\n\n' +
    '📝 Example: .cinetv Breaking Bad\n\n' +
    '💡 _Type a TV show name to search_ 🍿';

  if (!q) return await client.sendMessage(from, { text: usage }, { quoted });

  try {
    const cacheKey = `tv_${q.toLowerCase()}`;
    let searchData = cache.get(cacheKey);

    if (!searchData) {
      const searchUrl = `${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`;
      const { data } = await axios.get(searchUrl, { timeout: 10000 });
      if (!data || !Array.isArray(data.results) || data.results.length === 0)
        throw new Error('❌ No shows found.');
      searchData = data.results.filter(s => s.type && s.type.toLowerCase() === 'tv');
      cache.set(cacheKey, searchData);
    }

    let page = 1;
    const perPage = 20;
    const totalPages = Math.ceil(searchData.length / perPage);

    const sendPage = async (p) => {
      const start = (p - 1) * perPage;
      const results = searchData.slice(start, start + perPage);

      let caption = `*📺 Cinetv Search Results (Page ${p}/${totalPages})*\n\n`;
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
          if (!selected) return await client.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: incoming });

          // Fetch TV show details (Seasons)
          const tvUrl = `${BASE_URL}/tvshow-details?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url || selected.link)}`;
          const { data: tvDetails } = await axios.get(tvUrl);

          if (!tvDetails || !Array.isArray(tvDetails.seasons)) {
            return await client.sendMessage(from, { text: '❌ No season data found.' }, { quoted: incoming });
          }

          let seasonCaption = `*📺 ${selected.title}*\n\n📖 Select Season:\n\n`;
          tvDetails.seasons.forEach((s, i) => {
            seasonCaption += `${i + 1}. Season ${s.number}\n`;
          });
          seasonCaption += '\n🪀 Reply number to select season\n\n' + BRAND;

          const sentSeason = await client.sendMessage(from, { caption: seasonCaption }, { quoted: incoming });

          client.ev.on('messages.upsert', async ({ messages }) => {
            const reply = messages?.[0];
            if (!reply?.message?.conversation) return;
            const t = reply.message.conversation.trim();
            if (reply.message?.contextInfo?.stanzaId !== sentSeason.key.id) return;

            const seasonIdx = parseInt(t) - 1;
            const seasonSelected = tvDetails.seasons[seasonIdx];
            if (!seasonSelected) return await client.sendMessage(from, { text: '❌ Invalid season.' }, { quoted: reply });

            // Fetch Episodes
            const epUrl = `${BASE_URL}/episode-details?apiKey=${API_KEY}&url=${encodeURIComponent(seasonSelected.url)}`;
            const { data: epData } = await axios.get(epUrl);

            if (!epData || !Array.isArray(epData.episodes)) {
              return await client.sendMessage(from, { text: '❌ No episodes found.' }, { quoted: reply });
            }

            let epCaption = `*📺 ${selected.title} - Season ${seasonSelected.number}*\n\n📖 Select Episode:\n\n`;
            epData.episodes.forEach((e, i) => {
              epCaption += `${i + 1}. ${e.title}\n`;
            });
            epCaption += '\n🪀 Reply number to select episode\n\n' + BRAND;

            const sentEpisode = await client.sendMessage(from, { caption: epCaption }, { quoted: reply });

            client.ev.on('messages.upsert', async ({ messages }) => {
              const epReply = messages?.[0];
              if (!epReply?.message?.conversation) return;
              const epText = epReply.message.conversation.trim();
              if (epReply.message?.contextInfo?.stanzaId !== sentEpisode.key.id) return;

              const epIdx = parseInt(epText) - 1;
              const episodeSelected = epData.episodes[epIdx];
              if (!episodeSelected) return await client.sendMessage(from, { text: '❌ Invalid episode.' }, { quoted: epReply });

              // Fetch download link
              const dlUrl = `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(episodeSelected.url)}`;
              const { data: dlData } = await axios.get(dlUrl);

              if (!dlData || !Array.isArray(dlData.links) || dlData.links.length === 0) {
                return await client.sendMessage(from, { text: '❌ No download links found.' }, { quoted: epReply });
              }

              let dlText = `*🎬 ${selected.title} - S${seasonSelected.number}E${episodeSelected.number}*\n\n📥 Available Qualities:\n\n`;
              dlData.links.forEach((l, i) => {
                dlText += `${i + 1}. ${l.quality} • ${l.size}\n`;
              });
              dlText += '\n🪀 Reply number to get download link\n\n' + BRAND;

              const sentDL = await client.sendMessage(from, { caption: dlText }, { quoted: epReply });

              client.ev.on('messages.upsert', async ({ messages }) => {
                const dlReply = messages?.[0];
                if (!dlReply?.message?.conversation) return;
                const dlTextIdx = dlReply.message.conversation.trim();
                if (dlReply.message?.contextInfo?.stanzaId !== sentDL.key.id) return;

                const dlIdx = parseInt(dlTextIdx) - 1;
                const chosen = dlData.links[dlIdx];
                if (!chosen) return await client.sendMessage(from, { text: '❌ Invalid choice.' }, { quoted: dlReply });

                await client.sendMessage(from, {
                  text: `🎬 *${selected.title}*\n📌 Episode: ${episodeSelected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n🔗 ${chosen.direct || chosen.url}\n\n${BRAND}`
                }, { quoted: dlReply });
              });
            });
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
