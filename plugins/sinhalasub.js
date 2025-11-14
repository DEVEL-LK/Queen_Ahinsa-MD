// plugins/sinhalasub.js
const axios = require('axios');
const NodeCache = require('node-cache');
const { cmd } = require('../command');

const API_KEY = '15d9dcfa502789d3290fd69cb2bdbb9ab919fab5969df73b0ee433206c58e05b';
const BASE_URL = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';
const BRAND = '🎬 CHATGPT MOVIE';

// cache for searches (short TTL)
const searchCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// pending maps: keyed by sent message id (so reply->stanzaId matches)
const pendingListMap = new Map();   // when user sees the search list: key -> { results }
const pendingPickMap = new Map();   // when user sees the quality picks: key -> { film, picks }

module.exports = (conn) => {
  // helper: parse human-readable size to GB float
  function parseSizeToGB(sizeStr) {
    if (!sizeStr) return 0;
    const s = String(sizeStr).trim().toUpperCase();
    if (s.endsWith('GB')) {
      const num = parseFloat(s.replace('GB', '').trim());
      return isNaN(num) ? 0 : num;
    } else if (s.endsWith('MB')) {
      const num = parseFloat(s.replace('MB', '').trim());
      return isNaN(num) ? 0 : num / 1024;
    } else if (s.endsWith('KB')) {
      const num = parseFloat(s.replace('KB', '').trim());
      return isNaN(num) ? 0 : num / (1024 * 1024);
    } else {
      const num = parseFloat(s);
      return isNaN(num) ? 0 : num;
    }
  }

  // helper: robust axios get with retries
  async function axiosGetWithRetry(url, opts = {}, retries = 2, backoff = 1000) {
    try {
      const r = await axios.get(url, { timeout: opts.timeout || 20000 });
      return r;
    } catch (err) {
      if (retries > 0) {
        await new Promise(res => setTimeout(res, backoff));
        return axiosGetWithRetry(url, opts, retries - 1, backoff * 1.5);
      }
      throw err;
    }
  }

  // Register the command using cmd() so it appears in the command registry
  cmd({
    pattern: 'sinhalasub',
    react: '🎬',
    desc: 'Search and download Movies/TV Series (Cinesubz)',
    category: 'Movie / TV',
    filename: __filename
  }, async (client, quotedMsg, msg, { from, q }) => {
    // client is the same as conn.sendMessage wrapper in your base
    if (!q) {
      const usage = '*🎬 Movie / TV Series Search*\n\n' +
        '📋 Usage: .sinhalasub <search term>\n\n' +
        '📝 Example: .sinhalasub Breaking Bad\n\n' +
        '*💡 Type Your Movie ㋡*';
      await client.sendMessage(from, { text: usage }, { quoted: quotedMsg });
      return;
    }

    try {
      const cacheKey = 'sinhalasub_' + q.trim().toLowerCase();
      let searchResponse = searchCache.get(cacheKey);

      // call search API if not cached
      if (!searchResponse) {
        const searchUrl = `${BASE_URL}/search?apiKey=${API_KEY}&q=${encodeURIComponent(q)}`;
        const res = await axiosGetWithRetry(searchUrl, { timeout: 20000 }, 2);
        searchResponse = res.data;
        // validate
        if (!searchResponse || !Array.isArray(searchResponse.data) || searchResponse.data.length === 0) {
          throw new Error('❌ No results found.');
        }
        searchCache.set(cacheKey, searchResponse);
      }

      // prepare results: map to internal format
      const results = searchResponse.data.map((item, idx) => ({
        n: idx + 1,
        title: item.title,
        imdb: item.rating || 'N/A',
        year: item.year || 'N/A',
        link: item.link,           // this is the page URL to pass to downloadurl API
        image: item.imageSrc || item.thumbnail || null,
        type: item.type || 'Movie'
      }));

      // build caption with up to 20 items (if more, still list all but it's okay)
      let caption = '*🎬 SEARCH RESULTS*\n\n';
      results.forEach(r => {
        caption += `${r.n}. ${r.type} • ${r.title} • IMDb: ${r.imdb} • Year: ${r.year}\n\n`;
      });
      caption += '🔢 Reply to this message with the number to select (or 0 to cancel)\n\n' + BRAND;

      // send list (quote the user's command message if available)
      const sentListMsg = await client.sendMessage(from, {
        image: results[0].image ? { url: results[0].image } : undefined,
        caption
      }, { quoted: quotedMsg });

      // store pending by the sent message id so reply detection via stanzaId works
      if (sentListMsg && sentListMsg.key && sentListMsg.key.id) {
        pendingListMap.set(sentListMsg.key.id, { results, from });
        // optional: auto-expire pending after X seconds to avoid stale map
        setTimeout(() => pendingListMap.delete(sentListMsg.key.id), 5 * 60 * 1000); // 5 minutes
      }

    } catch (err) {
      consoleLog(err);
      await client.sendMessage(from, { text: '❌ Error: ' + (err.message || String(err)) }, { quoted: quotedMsg });
    }
  });

  // universal incoming message listener (for replies and picks)
  conn.ev.on('messages.upsert', async ({ messages }) => {
    const incoming = messages?.[0];
    if (!incoming || !incoming.message) return;
    if (incoming.key && incoming.key.remoteJid === 'status@broadcast') return; // ignore status

    // normalize text body (conversation or extendedTextMessage)
    let body = '';
    const mKeys = Object.keys(incoming.message || {});
    const primaryType = mKeys[0]; // e.g., conversation, extendedTextMessage, imageMessage...
    if (primaryType === 'conversation') body = incoming.message.conversation || '';
    else if (primaryType === 'extendedTextMessage') body = incoming.message.extendedTextMessage?.text || '';
    else if (primaryType === 'imageMessage') body = incoming.message.imageMessage?.caption || '';
    else if (primaryType === 'videoMessage') body = incoming.message.videoMessage?.caption || '';

    body = String(body || '').trim();
    if (!body) return; // nothing to process

    // convenience: get stanzaId user replied to (WhatsApp reply uses contextInfo.stanzaId)
    const repliedToId = incoming.message?.extendedTextMessage?.contextInfo?.stanzaId
      || incoming.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id
      || incoming.message?.contextInfo?.stanzaId
      || null;

    // ------------ HANDLE CANCEL (user typed '0' as plain text or as reply) ------------
    if (body === '0') {
      // try to remove any pending entries that belong to this user (by matching from)
      const jid = incoming.key.remoteJid;
      // remove all pending entries for this jid (both list and picks)
      for (const [k, v] of pendingListMap) {
        if (v.from === jid) pendingListMap.delete(k);
      }
      for (const [k, v] of pendingPickMap) {
        if (v.from === jid) pendingPickMap.delete(k);
      }
      try { await conn.sendMessage(incoming.key.remoteJid, { text: 'Cancelled.' }, { quoted: incoming }); } catch {}
      return;
    }

    // ------------ CHECK: is this a reply to one of our search list messages? ------------
    if (repliedToId && pendingListMap.has(repliedToId)) {
      const pending = pendingListMap.get(repliedToId);
      const jid = incoming.key.remoteJid;
      // parse number
      const selectedIndex = parseInt(body.replace(/\D/g, ''), 10);
      if (isNaN(selectedIndex)) return; // not a number
      // boundary check
      const selectedMovie = pending.results.find(r => r.n === selectedIndex);
      if (!selectedMovie) {
        await conn.sendMessage(jid, { text: '❌ Invalid number.' }, { quoted: incoming });
        return;
      }

      // react to user reply (confirmation)
      try {
        await conn.sendMessage(jid, { react: { text: '🍿', key: incoming.key } });
      } catch (e) { /* ignore react errors */ }

      // fetch download details from cinesubz downloadurl endpoint (with retries)
      const downloadApiUrl = `${BASE_URL}/downloadurl?apiKey=${API_KEY}&url=${encodeURIComponent(selectedMovie.link || selectedMovie.url || selectedMovie.link)}`;
      let details;
      try {
        const res = await axiosGetWithRetry(downloadApiUrl, { timeout: 25000 }, 2);
        details = res.data;
      } catch (err) {
        // final fallback message
        await conn.sendMessage(jid, { text: `❌ Download failed: ${err.message || err}` }, { quoted: incoming });
        return;
      }

      // details.links or details.data.links - try both shapes
      const linksArray = details.links || details.data?.links || details.data?.results || null;
      // some APIs return sources array differently; we'll attempt to normalise
      let picks = [];

      if (Array.isArray(linksArray)) {
        // typical: each item has quality, size, url / direct
        picks = linksArray.map((lk, idx) => ({
          n: idx + 1,
          quality: lk.quality || lk.label || `Q${idx + 1}`,
          size: lk.size || lk.filesize || 'N/A',
          direct: lk.url || lk.direct || lk.link
        }));
      } else if (Array.isArray(details.sources)) {
        // older shape: details.sources
        picks = details.sources.map((s, idx) => ({
          n: idx + 1,
          quality: s.quality || `Q${idx + 1}`,
          size: s.size || 'N/A',
          direct: s.direct_download || s.link || s.url
        }));
      } else {
        // no links found
        await conn.sendMessage(jid, { text: '❌ No download links.' }, { quoted: incoming });
        return;
      }

      if (!picks.length) {
        await conn.sendMessage(jid, { text: '❌ No download links.' }, { quoted: incoming });
        return;
      }

      // Build quality selection message (user must reply to THIS message)
      let pickCaption = `*🎬 ${selectedMovie.title}*\n\n📥 Choose Quality:\n\n`;
      picks.forEach(p => {
        pickCaption += `${p.n}. ${p.quality} — (${p.size})\n`;
      });
      pickCaption += '\nReply to this message with the number to download.\n\n' + BRAND;

      // send pick message and save pendingPickMap keyed by sent pick message id
      const sentPicksMsg = await conn.sendMessage(jid, {
        image: details.thumbnail || selectedMovie.image || undefined,
        caption: pickCaption
      }, { quoted: incoming });

      if (sentPicksMsg && sentPicksMsg.key && sentPicksMsg.key.id) {
        pendingPickMap.set(sentPicksMsg.key.id, { film: selectedMovie, picks, from: jid });
        setTimeout(() => pendingPickMap.delete(sentPicksMsg.key.id), 5 * 60 * 1000); // auto expire 5min
      }

      // remove the list pending entry (so they can't select multiple times from same list)
      pendingListMap.delete(repliedToId);
      return;
    }

    // ------------ CHECK: is this a reply to one of our picks messages? ------------
    if (repliedToId && pendingPickMap.has(repliedToId)) {
      const pending = pendingPickMap.get(repliedToId);
      const jid = incoming.key.remoteJid;
      const pickNumber = parseInt(body.replace(/\D/g, ''), 10);
      if (isNaN(pickNumber)) return;

      const chosen = pending.picks.find(p => p.n === pickNumber);
      if (!chosen) {
        await conn.sendMessage(jid, { text: '❌ Wrong quality.' }, { quoted: incoming });
        return;
      }

      // react to user selection
      try {
        await conn.sendMessage(jid, { react: { text: '✅', key: incoming.key } });
      } catch (e) { /* ignore react errors */ }

      // ensure chosen.direct exists
      const directUrl = chosen.direct;
      if (!directUrl) {
        await conn.sendMessage(jid, { text: '❌ No direct url available for this quality.' }, { quoted: incoming });
        pendingPickMap.delete(repliedToId);
        return;
      }

      // size check
      const sizeInGB = parseSizeToGB(chosen.size || '');
      if (sizeInGB > 2) {
        // too big for WhatsApp - send direct link
        await conn.sendMessage(jid, { text: `⚠️ File too large for WhatsApp.\nDirect link:\n${directUrl}` }, { quoted: incoming });
        pendingPickMap.delete(repliedToId);
        return;
      }

      // attempt to send as document (video)
      try {
        // send 'downloading' reaction first (optional)
        try { await conn.sendMessage(jid, { react: { text: '⬇️', key: incoming.key } }); } catch (e) {}

        await conn.sendMessage(jid, {
          document: { url: directUrl },
          mimetype: 'video/mp4',
          fileName: `${pending.film.title.replace(/[\\/:*?"<>|]/g, '')} • ${chosen.quality}.mp4`,
          caption: `🎥 ${pending.film.title}\n\nQuality: ${chosen.quality}\nSize: ${chosen.size}\n\n${BRAND}`
        }, { quoted: incoming });

        // final success reaction
        try { await conn.sendMessage(jid, { react: { text: '🎉', key: incoming.key } }); } catch (e) {}

      } catch (err) {
        // if sending as document fails, fallback to sending the direct link
        await conn.sendMessage(jid, { text: `❌ Failed to send file. Direct link:\n${directUrl}` }, { quoted: incoming });
      } finally {
        pendingPickMap.delete(repliedToId);
      }

      return;
    }

    // nothing matched - ignore
  });

  // end module
};
