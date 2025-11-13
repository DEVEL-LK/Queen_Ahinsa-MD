const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "𝚀𝚞𝚎𝚎𝚗_𝙰𝚑𝚒𝚗𝚜𝚊-𝚞𝚒𝚍~SNNzQQSQ#KuZ3Bv8W1OVocITD5ZATLRZWxTax0CvOKBcJsV_LDUc",
MONGODB: process.env.MONGODB || "mongodb://mongo:tRCemTxbjefxwnptSDmKfzJbzReKVkNQ@crossover.proxy.rlwy.net:51796",
};
