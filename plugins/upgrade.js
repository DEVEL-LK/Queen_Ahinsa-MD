const { cmd } = require('../command');
const { exec } = require('child_process');

cmd({
    pattern: "upgrade",
    desc: "Auto update bot from GitHub",
    category: "owner",
    filename: __filename
},
async (robin, mek, m,{ reply, isOwner }) => {

try {

    if (!isOwner) return reply("❌ You are not the owner!");

    reply("⏳ Updating bot from GitHub...\nPlease wait...");

    // Git Pull
    exec("git pull", async (err, stdout, stderr) => {

        if (err) {
            reply("❌ Update failed:\n```" + err + "```");
            return;
        }

        if (stdout.includes("Already up to date")) {
            reply("✔ Bot already up-to-date!");
            return;
        }

        reply("✅ Update completed!\n\n🔄 Restarting bot...");

        // Auto restart using PM2
        exec("pm2 restart all");
    });

} catch (e) {
    reply("❌ Error: " + e);
}

});
