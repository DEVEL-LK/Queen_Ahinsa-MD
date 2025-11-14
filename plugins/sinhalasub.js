// plugins/sinhalasub.js
const axios = require('axios');
const NodeCache = require('node-cache');

const BRAND = '🎬 CHATGPT MOVIE';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';

const cache = new NodeCache({ stdTTL: 120, checkperiod: 240 });

// pending replies map
const pendingReplies = new Map();

module.exports = (conn) => {

    const { cmd } = require('../command');

    cmd({
        pattern: 'cinesubz',
        react: '🍿',
        desc: 'Search Movies / TV Series from Cinesubz',
        category: 'Movie / TV',
        filename: __filename
    }, async(conn, mek, m, { from, q, quoted }) => {

        const usage = '*🎬 Cinesubz Movie/TV Search*\n\n' +
                      '📋 Usage: .cinesubz <movie or TV show name>\n' +
                      '📝 Example: .cinesubz Breaking Bad\n\n' +
                      '💡 _Type a movie or TV show name to search_ 🍿';

        if (!q) return conn.sendMessage(from, { text: usage }, { quoted });

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

            await sendPage(conn, from, searchData, 1, quoted);

        } catch (err) {
            console.error(err);
            conn.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted });
        }
    });

    // sendPage function
    async function sendPage(conn, from, data, page = 1, quoted) {
        const perPage = 20;
        const totalPages = Math.ceil(data.length / perPage);
        const start = (page - 1) * perPage;
        const results = data.slice(start, start + perPage);

        let caption = `*🍿 Cinesubz Search Results (Page ${page}/${totalPages})*\n\n`;
        results.forEach((r, i) => {
            caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
        });
        if (page < totalPages) caption += `${results.length + 1}. ➡️ *Next Page*\n\n`;
        caption += '🪀 _Reply with number to select_\n\n' + BRAND;

        const sent = await conn.sendMessage(from, {
            image: { url: results[0]?.image },
            caption
        }, { quoted });

        pendingReplies.set(sent.key.id, { type: 'page', results, page, from });
    }

    // reply handler
    conn.ev.on('messages.upsert', async({ messages }) => {
        const incoming = messages[0];
        if (!incoming?.message?.conversation) return;

        const textRaw = incoming.message.conversation.trim();
        const text = parseInt(textRaw.replace(/\D/g, ''));
        if (isNaN(text)) return;

        const stanzaId = incoming.message?.contextInfo?.stanzaId;
        if (!stanzaId) return;

        if (!pendingReplies.has(stanzaId)) return;
        const pending = pendingReplies.get(stanzaId);

        if (pending.type === 'page') {
            const { results, page, from } = pending;

            const perPage = 20;
            const totalPages = Math.ceil(results.length / perPage);

            // next page
            if (text === results.length + 1 && page < totalPages) {
                pendingReplies.delete(stanzaId);
                await sendPage(conn, from, results, page + 1, incoming);
                return;
            }

            const selected = results[text - 1];
            if (!selected) return conn.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: incoming });

            pendingReplies.delete(stanzaId);

            // fetch download links
            const downloadUrl = `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`;
            const { data: downloadData } = await axios.get(downloadUrl);

            if (!downloadData || !Array.isArray(downloadData.links) || downloadData.links.length === 0)
                return conn.sendMessage(from, { text: '❌ No download links.' }, { quoted: incoming });

            const chosen = downloadData.links[0];
            const sizeInGB = parseSizeToGB(chosen.size || '0');

            if (sizeInGB > 2) {
                conn.sendMessage(from, {
                    text: `⚠️ File too large for WhatsApp.\nDirect link:\n${chosen.url}`
                }, { quoted: incoming });
            } else {
                conn.sendMessage(from, {
                    document: { url: chosen.url },
                    mimetype: 'video/mp4',
                    fileName: `${selected.title} • ${chosen.quality}.mp4`,
                    caption: `🎬 ${selected.title}\n📥 Quality: ${chosen.quality}\n💾 Size: ${chosen.size}\n\n${BRAND}`
                }, { quoted: incoming });
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
