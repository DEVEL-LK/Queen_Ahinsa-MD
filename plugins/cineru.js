const axios = require("axios");
const NodeCache = require("node-cache");
const { cmd } = require("../command");

const API_KEY = "25f974dba76310042bcd3c9488eec9093816ef32eb36d34c1b6b875ac9215932";
const BASE = "https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cineru";

module.exports = (conn) => {
  const cache = new NodeCache({ stdTTL: 180 });
  const waitReply = new Map();

  // ─────── SEARCH COMMAND ─────────────────────────────
  cmd({
    pattern: "cineru",
    desc: "Search Movies / TV (non-button, document send)",
    react: "🎬",
    category: "Movie",
    filename: __filename
  }, async (client, quoted, msg, { from, q }) => {
    if (!q) return client.sendMessage(from, { text: "Usage: .cineru <movie name>" }, { quoted: msg });

    try {
      const key = "cine_" + q.toLowerCase();
      let data = cache.get(key);

      if (!data) {
        const r = await axios.get(`${BASE}/search?apiKey=${API_KEY}&query=${encodeURIComponent(q)}`, { timeout: 120000 });
        if (!r.data?.data?.length) throw new Error("❌ No movies found");
        data = r.data.data;
        cache.set(key, data);
      }

      let caption = `*🎬 Cineru Search Results*\n\n`;
      data.forEach((m, i) => caption += `${i + 1}. *${m.title}* (${m.year}) ⭐ ${m.rating}\n`);
      caption += `\nReply with the number to get download links/document.`;

      await client.sendMessage(from, { text: caption }, { quoted: msg });
      waitReply.set(from, { step: "select_movie", list: data, timestamp: Date.now() });

    } catch (e) {
      return client.sendMessage(from, { text: "❌ Error: " + e.message }, { quoted: msg });
    }
  });

  // ─────── REPLY HANDLER ─────────────────────────────
  conn.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const from = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text;
    if (!text) return;

    const selected = waitReply.get(from);
    if (!selected) return;
    if (Date.now() - selected.timestamp > 3 * 60 * 1000) { waitReply.delete(from); return; }

    const num = parseInt(text);
    if (isNaN(num)) return;

    if (selected.step === "select_movie") {
      const movie = selected.list[num - 1];
      if (!movie) return conn.sendMessage(from, { text: "❌ Invalid number" });
      waitReply.delete(from);

      try {
        const dl = await axios.get(`${BASE}/movie?apiKey=${API_KEY}&id=${movie.id}`, { timeout: 120000 });
        const links = dl.data?.sources || [];

        if (!links.length) return conn.sendMessage(from, { text: "❌ No download links found." });

        // Send each link as document if ≤ 2GB
        for (const l of links) {
          const sizeGB = sizeToGB(l.size);
          if (sizeGB > 2) {
            await conn.sendMessage(from, { text: `⚠️ File too large to send via WhatsApp:\n${l.url}` });
          } else {
            await conn.sendMessage(from, {
              document: { url: l.url },
              mimetype: "video/mp4",
              fileName: `${movie.title} ${l.quality || "HD"}.mp4`,
              caption: `🎬 ${movie.title}\nQuality: ${l.quality || "HD"}\nSize: ${l.size || "Unknown"}`
            });
          }
        }

      } catch (err) {
        conn.sendMessage(from, { text: "❌ Error: " + err.message });
      }
    }
  });
};

// ─────── SIZE PARSER ───────────────────────────────
function sizeToGB(str) {
  if (!str) return 0;
  let s = str.toUpperCase();
  if (s.includes("GB")) return parseFloat(s) || 0;
  if (s.includes("MB")) return (parseFloat(s) || 0) / 1024;
  return 0;
}
