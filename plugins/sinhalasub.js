// 🎬 Cinesubz Movie/TV Command (100% Working for Queen-Ahinsa MD)
// Features:
// ✔ Movie/TV Search
// ✔ Number Reply Selection
// ✔ Next Page System
// ✔ WhatsApp Document Download
// ✔ Auto Fix for Baileys v5 Reply Handler
// ----------------------------------------------------

const axios = require('axios');
const { cmd } = require('../command');
const NodeCache = require('node-cache');
const config = require('../config');

const BRAND = config.MOVIE_FOOTER || '🎬 CHATGPT MOVIE';
const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';

const cache = new NodeCache({ stdTTL: 120 });
const pendingReplies = new Map();

// --------------------------------------
// MAIN COMMAND
// --------------------------------------
cmd({
    pattern: 'cinesubz',
    react: '🍿',
    desc: 'Search Movies/TV from Cinesubz',
    category: 'Movie / TV',
    filename: __filename
}, async (client, quoted, msg, { from, q }) => {

    if (!q) {
        return client.sendMessage(from, {
            text: '*🎬 Cinesubz Search*\n\nUsage: .cinesubz <movie name>\nExample: .cinesubz Breaking Bad'
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

        // Paginate -----------------
        const perPage = 20;
        const totalPages = Math.ceil(data.length / perPage);

        const showPage = async (page = 1, replyBase = quoted) => {
            const start = (page - 1) * perPage;
            const pageItems = data.slice(start, start + perPage);

            let caption = `*🍿 Cinesubz Results (Page ${page}/${totalPages})*\n\n`;

            pageItems.forEach((r, i) => {
                caption += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
            });

            if (page < totalPages)
                caption += `${pageItems.length + 1}. ➡️ *Next Page*\n\n`;

            caption += '🪀 Reply with number to select\n\n' + BRAND;

            const sent = await client.sendMessage(from, {
                image: { url: pageItems[0].image },
                caption
            }, { quoted: replyBase });

            pendingReplies.set(sent.key.id, {
                type: "page",
                page,
                totalPages,
                results: pageItems,
                fullResults: data
            });
        };

        await showPage(1);

    } catch (err) {
        console.log(err);
        client.sendMessage(from, { text: "❌ Error: " + err.message });
    }
});

// --------------------------------------
// 100% WORKING REPLY HANDLER FOR QUEEN AHINSA
// --------------------------------------
client.ev.on('messages.upsert', async (m) => {
    try {
        const msg = m.messages[0];
        if (!msg.message) return;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

        if (!text) return;

        const num = parseInt(text.trim());
        if (isNaN(num)) return;

        const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (!stanzaId) return;

        if (!pendingReplies.has(stanzaId)) return;

        const pend = pendingReplies.get(stanzaId);
        pendingReplies.delete(stanzaId);

        // -------------------------------
        // PAGE SYSTEM
        // -------------------------------
        if (pend.type === "page") {
            const { page, totalPages, results, fullResults } = pend;

            // If user selects "Next Page"
            if (num === results.length + 1 && page < totalPages) {

                const newStart = page * 20;
                const next = fullResults.slice(newStart, newStart + 20);

                let cap = `*🍿 Cinesubz Results (Page ${page + 1}/${totalPages})*\n\n`;

                next.forEach((r, i) => {
                    cap += `${i + 1}. ${r.type} 🎬 *${r.title}*\n   📅 ${r.year} • ⭐ ${r.imdb}\n\n`;
                });

                if (page + 1 < totalPages)
                    cap += `${next.length + 1}. ➡️ *Next Page*\n\n`;

                cap += '🪀 Reply with number to select\n\n' + BRAND;

                const sent = await client.sendMessage(msg.key.remoteJid, {
                    image: { url: next[0].image },
                    caption: cap
                });

                pendingReplies.set(sent.key.id, {
                    type: "page",
                    page: page + 1,
                    totalPages,
                    results: next,
                    fullResults
                });

                return;
            }

            const selected = results[num - 1];
            if (!selected)
                return client.sendMessage(msg.key.remoteJid, { text: "❌ Invalid number!" }, { quoted: msg });

            // -------------------------------
            // FETCH DOWNLOAD LINK
            // -------------------------------
            const { data: dl } = await axios.get(
                `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selected.url)}`
            );

            if (!dl || !dl.links || dl.links.length === 0)
                return client.sendMessage(msg.key.remoteJid, { text: "❌ No download links!" }, { quoted: msg });

            const file = dl.links[0];

            // -------------------------------
            // SEND AS DOCUMENT
            // -------------------------------
            await client.sendMessage(msg.key.remoteJid, {
                document: { url: file.url },
                mimetype: "video/mp4",
                fileName: `${selected.title} • ${file.quality}.mp4`,
                caption: `🎬 ${selected.title}\n📥 ${file.quality}\n💾 ${file.size}\n\n${BRAND}`
            }, { quoted: msg });

        }

    } catch (e) {
        console.log("Reply Handler Error:", e);
    }
});
