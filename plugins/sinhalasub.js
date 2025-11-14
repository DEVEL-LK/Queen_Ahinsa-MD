// 🎬 Cinesubz Movie/TV Command (Client Fix Added)
const axios = require('axios');
const { cmd } = require('../command');
const NodeCache = require('node-cache');
const config = require('../config');

const BRAND = config.MOVIE_FOOTER || '🎬 CHATGPT MOVIE';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';

const cache = new NodeCache({ stdTTL: 120 });
const pendingReplies = new Map();

module.exports = cmd({
    pattern: 'cinesubz',
    react: '🍿',
    desc: 'Search Movies / TV Series from Cinesubz',
    category: 'Movie / TV',
    filename: __filename
}, async (client, quoted, msg, { from, q }) => {

    // -----------------------------
    // MAIN SEARCH COMMAND
    // -----------------------------
    if (!q) {
        return client.sendMessage(from, {
            text: '*🎬 Cinesubz Search*\n\nUsage: .cinesubz <movie name>'
        }, { quoted });
    }

    try {
        const key = `cine_${q.toLowerCase()}`;
        let data = cache.get(key);

        if (!data) {
            const { data: api } = await axios.get(
                `${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`
            );

            if (!api || !api.data || api.data.length === 0)
                return client.sendMessage(from, { text: "❌ No movies found." }, { quoted });

            data = api.data.map(item => ({
                title: item.title,
                year: item.year || 'N/A',
                imdb: item.rating || 'N/A',
                image: item.imageSrc,
                url: item.link,
                type: item.type
            }));

            cache.set(key, data);
        }

        const perPage = 20;
        const totalPages = Math.ceil(data.length / perPage);

        const sendPage = async (page = 1, replyBase = quoted) => {
            const start = (page - 1) * perPage;
            const pageItems = data.slice(start, start + perPage);

            let caption = `*🍿 Results (Page ${page}/${totalPages})*\n\n`;

            pageItems.forEach((r, i) => {
                caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} ⭐ ${r.imdb}\n\n`;
            });

            if (page < totalPages)
                caption += `${pageItems.length + 1}. ➡️ *Next Page*\n\n`;

            caption += "🪀 Reply with number\n\n" + BRAND;

            const sent = await client.sendMessage(from, {
                image: { url: pageItems[0].image },
                caption
            }, { quoted: replyBase });

            pendingReplies.set(sent.key.id, {
                type: 'page',
                page,
                totalPages,
                results: pageItems,
                fullList: data
            });
        };

        await sendPage(1);

    } catch (err) {
        console.log(err);
        client.sendMessage(from, { text: "❌ Error: " + err.message });
    }

    // ---------------------------------------------
    // FIXED REPLY HANDLER — NOW INSIDE COMMAND
    // ---------------------------------------------
    client.ev.on('messages.upsert', async (m) => {
        try {
            const msg2 = m.messages[0];
            if (!msg2.message) return;

            const text =
                msg2.message.conversation ||
                msg2.message.extendedTextMessage?.text ||
                '';

            const num = parseInt(text.trim());
            if (isNaN(num)) return;

            const stanzaId = msg2.message?.extendedTextMessage?.contextInfo?.stanzaId;
            if (!stanzaId) return;

            if (!pendingReplies.has(stanzaId)) return;

            const pend = pendingReplies.get(stanzaId);
            pendingReplies.delete(stanzaId);

            // PAGE HANDLING
            if (pend.type === "page") {
                const { page, totalPages, results, fullList } = pend;

                // NEXT PAGE
                if (num === results.length + 1 && page < totalPages) {
                    const newStart = page * 20;
                    const next = fullList.slice(newStart, newStart + 20);

                    let caption = `*🍿 Page ${page + 1}/${totalPages}*\n\n`;

                    next.forEach((r, i) => {
                        caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n⭐ ${r.imdb}\n\n`;
                    });

                    if (page + 1 < totalPages)
                        caption += `${next.length + 1}. ➡️ Next Page\n\n`;

                    caption += "🪀 Reply with number\n\n" + BRAND;

                    const sent = await client.sendMessage(msg2.key.remoteJid, {
                        image: { url: next[0].image },
                        caption
                    });

                    pendingReplies.set(sent.key.id, {
                        type: 'page',
                        page: page + 1,
                        totalPages,
                        results: next,
                        fullList
                    });

                    return;
                }

                // USER SELECTS MOVIE
                const item = results[num - 1];
                if (!item)
                    return client.sendMessage(msg2.key.remoteJid, { text: "❌ Invalid number" });

                const { data: dl } = await axios.get(
                    `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(item.url)}`
                );

                if (!dl || !dl.links || dl.links.length === 0)
                    return client.sendMessage(msg2.key.remoteJid, { text: "❌ No download links" });

                const file = dl.links[0];

                await client.sendMessage(msg2.key.remoteJid, {
                    document: { url: file.url },
                    mimetype: "video/mp4",
                    fileName: `${item.title} • ${file.quality}.mp4`,
                    caption: `🎬 ${item.title}\n⭐ ${file.quality}\n💾 ${file.size}`
                }, { quoted: msg2 });
            }

        } catch (e) {
            console.log("Reply Error:", e);
        }
    });

});
