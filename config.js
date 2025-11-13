const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "GU9EVbLK#qknOangRU1oP092HxNzm-2F84XwJ4xjdudLAI5Jq_ME",
MONGODB: process.env.MONGODB || "mongodb://mongo:tRCemTxbjefxwnptSDmKfzJbzReKVkNQ@crossover.proxy.rlwy.net:51796",
};
