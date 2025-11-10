const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "𝚀𝚞𝚎𝚎𝚗_𝙰𝚑𝚒𝚗𝚜𝚊-𝚞𝚒𝚍~yFtAwTpJ#vTRXrwu42QEJLWOHF2a7N_RekfawWVTrUAiL9BGgsx8",
MONGODB: process.env.MONGODB || "mongodb://mongo:pRUEpCCxeofZlYsVHrNBuAeqsfVjsDvd@hopper.proxy.rlwy.net:21545",
};
