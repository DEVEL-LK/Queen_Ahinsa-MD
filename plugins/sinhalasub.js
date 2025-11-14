const axios = require("axios");
const NodeCache = require("node-cache");
const { cmd } = require("../command");

const API_KEY = "25f974dba76310042bcd3c9488eec9093816ef32eb36d34c1b6b875ac9215932";
const BASE = "https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz";

module.exports = (conn) => {
  const cache = new NodeCache({ stdTTL: 180 });
  const waitReply = new Map();

  // ─────── SEARCH COMMAND ──────────────────────────────────────────────
  cmd({
    pattern: "cinesubz",
    desc: "Search Movies / TV",
    react: "🍿",
    category: "Movie",
    filename: __filename
  }, async (client, quoted, msg, { from, q }) => {

    if (!q) return client.sendMessage(from, { text: "Usage: .cinesubz <movie name>" }, { quoted: msg });

    try {
      const key = "cine_" + q.toLowerCase();
      let data = cache.get(key);

      if (!data) {
        const r = await axios.get(`${BASE}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`, { timeout: 120000 });
        if (!r.data?.data?.length) throw new Error("❌ No movies found");

        data = r.data.data;
        cache.set(key, data);
      }

      let caption = `*🍿 Cinesubz Search Results*\n\n`;
      data.forEach((m, i) => {
        caption += `${i + 1}. *${m.title}* (${m.year}) ⭐ ${m.rating}\n\n`;
      });
      caption += `Reply with a number`;

      const sent = await client.sendMessage(from, {
        image: { url: data[0].imageSrc },
        caption
      }, { quoted: msg });

      waitReply.set(from, {
        step: "select_movie",
        list: data,
        msgId: sent.key.id,
        timestamp: Date.now()
      });

    } catch (e) {
      return client.sendMessage(from, { text: "❌ Error: " + e.message }, { quoted: msg });
    }
  });

  // ─────── GLOBAL REPLY DETECTOR ───────────────────────────────────────
  conn.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const from = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text;
    if (!text) return;

    const selected = waitReply.get(from);
    if (!selected) return;

    // optional timeout: 3 minutes
    if (Date.now() - selected.timestamp > 3 * 60 * 1000) {
      waitReply.delete(from);
      return;
    }

    const num = parseInt(text);
    if (isNaN(num)) return;

    // ─── STEP 1 : USER SELECTED MOVIE ───────────────────────────────
    if (selected.step === "select_movie") {
      const movie = selected.list[num - 1];
      if (!movie) return conn.sendMessage(from, { text: "❌ Invalid number" });

      waitReply.delete(from);

      try {
        const dl = await axios.get(`${BASE}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(movie.link)}`, { timeout: 120000 });

        // 🔹 Safe fallback for links
        const links = dl.data?.links || dl.data?.data?.links || [];
        if (!links.length) return conn.sendMessage(from, { text: "❌ No download links." });

        let caption = `*🎬 ${movie.title}*\n\nSelect Quality:\n\n`;
        links.forEach((l, i) => {
          caption += `${i + 1}. *${l.quality}* - ${l.size}\n\n`;
        });

        const sent2 = await conn.sendMessage(from, {
          image: { url: movie.imageSrc },
          caption
        }, { quoted: m });

        waitReply.set(from, {
          step: "select_quality",
          movie,
          links,
          msgId: sent2.key.id,
          timestamp: Date.now()
        });

        await conn.sendMessage(from, { react: { text: "🍿", key: m.key } });

      } catch (err) {
        conn.sendMessage(from, { text: "❌ Error: " + err.message });
      }
    }

    // ─── STEP 2 : USER SELECTED QUALITY ──────────────────────────────
    else if (selected.step === "select_quality") {
      const link = selected.links[num - 1];
      if (!link) return conn.sendMessage(from, { text: "❌ Invalid number" });

      waitReply.delete(from);

      const GB = sizeToGB(link.size);

      if (GB > 2) {
        return conn.sendMessage(from, {
          text: `⚠️ File too large to send via WhatsApp.\nDirect link:\n${link.url}`
        });
      }

      try {
        await conn.sendMessage(from, {
          document: { url: link.url },
          mimetype: "video/mp4",
          fileName: `${selected.movie.title} ${link.quality}.mp4`,
          caption: `🎬 ${selected.movie.title}\nQuality: ${link.quality}\nSize: ${link.size}`
        });

        await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (err) {
        conn.sendMessage(from, {
          text: `❌ Failed to send.\nDirect link:\n${link.url}`
        });
      }
    }
  });
};

// ─────── SIZE PARSER ─────────────────────────────────────────────────
function sizeToGB(str) {
  if (!str) return 0;
  let s = str.toUpperCase();
  if (s.includes("GB")) return parseFloat(s) || 0;
  if (s.includes("MB")) return (parseFloat(s) || 0) / 1024;
  return 0;
}
