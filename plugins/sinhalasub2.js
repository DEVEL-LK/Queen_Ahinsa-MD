const consoleLog = console.log;
const config = require('../config');
const { cmd } = require('../command');
const axios = require('axios');
const NodeCache = require('node-cache');
const searchCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const BRAND = '' + config.MOVIE_FOOTER;
const searchUrlBase = 'https://sadaslk-apis.vercel.app/api/v1/movie/sinhalasub/search?q=';
const downloadApiBase = 'https://sadaslk-apis.vercel.app/api/v1/movie/sinhalasub/infodl?q=';

cmd({pattern: 'sinhalasub', react: '🎬', desc: 'Search and download Movies/TV Series', category: 'Movie / TV', filename: __filename}, async (client, quotedMsg, msg, { from, q }) => {
if(!q){await client.sendMessage(from,{text:'*🎬 Movie / TV Series Search*\n\n📋 Usage: .sinhalasub <search term>\n\n📝 Example: .sinhalasub Breaking Bad\n\n*💡 Type Your Movie ㋡*'},{quoted:quotedMsg});return;}
try{
const cacheKey='sinhalasub_'+q.trim().toLowerCase();
let searchResponse=searchCache.get(cacheKey);
if(!searchResponse){
const requestUrl=searchUrlBase+encodeURIComponent(q)+'&apiKey=c56182a993f60b4f49cf97ab09886d17';
const res=await axios.get(requestUrl,{timeout:10000});
searchResponse=res.data;
if(!searchResponse||!searchResponse.data||!Array.isArray(searchResponse.data))throw new Error('❌ No results found.');
searchCache.set(cacheKey,searchResponse);}
const results=searchResponse.data.map((item,idx)=>({n:idx+1,title:item.Title,year:item.Year||item.year,link:item.Link,image:item.Img,rating:item.Rating||'N/A'}));
let caption='*🎬 SEARCH RESULTS*\n\n';
results.forEach(r=>{caption+=`${r.n}. • ${r.title} *•* ${r.rating} • Year: ${r.year}\n\n`;});
caption+='🔢 Reply with number to get info/download 🪀\n\n*~'+BRAND+'*';
const sentListMsg=await client.sendMessage(from,{image:{url:results[0].image},caption},{quoted:quotedMsg});
const pendingMap=new Map();
pendingMap.set(sentListMsg.key.id,results);
const handleUpsert=async({messages})=>{
const incoming=messages?.[0];
if(!incoming||!incoming.message||!incoming.message.conversation)return;
const text=(incoming.message.conversation||'').trim();
if(text==='0'){client.ev.removeListener('messages.upsert',handleUpsert);pendingMap.clear();await client.sendMessage(from,{text:'OK.'},{quoted:incoming});return;}
const replyToId=incoming.message?.contextInfo?.stanzaId||incoming.message?.contextInfo?.quotedMessage?.key?.id;
if(replyToId&&pendingMap.has(replyToId)&&Array.isArray(pendingMap.get(replyToId))){
const resultsList=pendingMap.get(replyToId);
const selectedIndex=parseInt(text,10);
const selectedMovie=resultsList.find(r=>r.n===selectedIndex);
if(!selectedMovie){await client.sendMessage(from,{text:'❌ Invalid number.'},{quoted:incoming});return;}
const downloadRequestUrl=downloadApiBase+encodeURIComponent(selectedMovie.link)+'&apiKey=c56182a993f60b4f49cf97ab09886d17';
const res=await axios.get(downloadRequestUrl,{timeout:10000});
const details=res.data.data;
if(!details){await client.sendMessage(from,{text:'❌ Failed to fetch info.'},{quoted:incoming});return;}
const sources=details.downloadLinks||[];
const sdPick=sources.find(s=>s.quality.includes('480'));
const hdPick=sources.find(s=>s.quality.includes('720')||s.quality.includes('1080'));
const picks=[];
if(sdPick)picks.push({n:1,q:'SD',size:sdPick.size,direct:sdPick.link,qualityLabel:sdPick.quality});
if(hdPick)picks.push({n:2,q:'HD',size:hdPick.size,direct:hdPick.link,qualityLabel:hdPick.quality});
if(!picks.length){await client.sendMessage(from,{text:'❌ No links.'},{quoted:incoming});return;}
let pickCaption=`*🎬 ${details.title}*\n\n📥 Choose Quality:\n\n`;
picks.forEach(p=>{pickCaption+=`${p.n}. *${p.q}* (${p.qualityLabel}) - (${p.size})\n`;});
pickCaption+='\n*~'+BRAND+'*';
const sentPicksMsg=await client.sendMessage(from,{image:{url:details.images?.[0]||selectedMovie.image},caption:pickCaption},{quoted:incoming});
pendingMap.set(sentPicksMsg.key.id,{film:selectedMovie,picks});
return;}
const pickReplyId=incoming.message?.contextInfo?.stanzaId;
if(pickReplyId&&pendingMap.has(pickReplyId)&&pendingMap.get(pickReplyId).picks){
const {film,picks}=pendingMap.get(pickReplyId);
const pickNumber=parseInt(text,10);
const chosen=picks.find(p=>p.n===pickNumber);
if(!chosen){await client.sendMessage(from,{text:'❌ Wrong quality.'},{quoted:incoming});return;}
const sizeInGB=parseSizeToGB(chosen.size||'');
if(sizeInGB>2){await client.sendMessage(from,{text:`⚠️ Too large. Direct link:\n${chosen.direct}`},{quoted:incoming});return;}
const safeTitle=film.title.replace(/[\\/:*?"<>|]/g,'');
const fileName=`KAVI • ${safeTitle} • ${chosen.q}.mp4`;
try{await client.sendMessage(from,{document:{url:chosen.direct},mimetype:'video/mp4',fileName,caption:`🎥 ${film.title}\n\nQuality: ${chosen.qualityLabel}\n\n${BRAND}`},{quoted:incoming});
await client.sendMessage(from,{react:{text:'✅',key:incoming.key}});}catch(err){await client.sendMessage(from,{text:`❌ Failed. Direct link:\n${chosen.direct}`},{quoted:incoming});}return;}
};
client.ev.on('messages.upsert',handleUpsert);
}catch(err){consoleLog(err);await client.sendMessage(from,{text:'❌ Error: '+(err.message||String(err))},{quoted:quotedMsg});}});

function parseSizeToGB(sizeStr){if(!sizeStr)return 0;const s=String(sizeStr).trim().toUpperCase();if(s.endsWith('GB'))return parseFloat(s.replace('GB','').trim())||0;if(s.endsWith('MB'))return(parseFloat(s.replace('MB','').trim())||0)/1024;if(s.endsWith('KB'))return(parseFloat(s.replace('KB','').trim())||0)/(1024*1024);const num=parseFloat(s);return isNaN(num)?0:num;}
