const SUPABASE_URL="https://zykfklcbdtotehqmjawx.supabase.co";
const SUPABASE_KEY="sb_publishable_KsHB0P3vSNl5b3IQ3tS0bg_ThX88107";
const {createClient}=supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{realtime:{params:{eventsPerSecond:20}}});

const $=id=>document.getElementById(id);
const roomParam=()=>new URLSearchParams(location.search).get("room");
let roomId=roomParam()||"", playerName=localStorage.getItem("justus_name")||"", channel=null, players=[];
let soundOn=localStorage.getItem("justus_sound")!=="off", audioCtx=null;
let ttt={board:Array(9).fill(""),turn:"X",winner:null}, rps={moves:{},result:""}, c4={board:Array(42).fill(""),turn:"R",winner:null};
let trivia={index:0,answers:{}}, learn={index:0}, draw={strokes:[],drawerId:null};
let voiceJoined=false,voiceMuted=false,localStream=null,peer=null,iceQueue=[];
let ytPlayer=null,ytReady=false,currentVideoId="",ytRemote=false,ytSuppress=false,ytTimer=null,ytPendingId="";
const voiceConfig={iceServers:[{urls:"stun:stun.l.google.com:19302"}]};
const triviaQuestions=[
 {q:"Which planet is known as the Red Planet?",a:["Mars","Venus","Jupiter","Mercury"],c:0},
 {q:"How many sides does a hexagon have?",a:["5","6","7","8"],c:1},
 {q:"Which ocean is the largest?",a:["Atlantic","Indian","Pacific","Arctic"],c:2},
 {q:"What is the smallest prime number?",a:["0","1","2","3"],c:2},
 {q:"Which animal is known for black-and-white stripes?",a:["Tiger","Zebra","Panda","Skunk"],c:1}
];
const coupleQuestions=["What is one tiny thing I do that always makes you smile?","What would our perfect lazy Sunday look like?","Which memory of us would you replay forever?","What place would you love for us to visit together?","What song feels the most like us?","What is something you want us to try together this year?"];

function toast(t){const e=$("toast");e.textContent=t;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function playSound(kind="click"){if(!soundOn)return;try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.value=kind==="pop"?680:kind==="win"?880:420;g.gain.setValueAtTime(.04,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13)}catch{}}
function broadcast(event,payload){return channel?channel.send({type:"broadcast",event,payload}):Promise.resolve()}
function escapeHtml(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
function setSound(){localStorage.setItem("justus_sound",soundOn?"on":"off");$("soundToggle").textContent=soundOn?"🔊 Sound on":"🔇 Sound off"}

function makeHeart(){const layer=document.querySelector(".heart-layer")||(()=>{const x=document.createElement("div");x.className="heart-layer";document.body.prepend(x);return x})();const h=document.createElement("button");h.type="button";h.className="heart-float";h.textContent="♡";h.style.left=(Math.random()*96+2)+"%";h.style.animationDuration=(18+Math.random()*18)+"s";h.style.animationDelay=(-Math.random()*22)+"s";h.addEventListener("click",e=>popHeart(e,h));layer.appendChild(h)}
function addHearts(){if(document.querySelector(".heart-layer"))return;for(let i=0;i<5;i++)makeHeart()}
function popHeart(e,h,remote=false){if(h.classList.contains("popping"))return;if(!remote)broadcast("heart-pop",{x:e.clientX,y:e.clientY});playSound("pop");h.classList.add("popping");for(let i=0;i<7;i++){const s=document.createElement("i");s.className="spark";s.style.left=e.clientX+"px";s.style.top=e.clientY+"px";s.style.setProperty("--dx",((Math.random()-.5)*70)+"px");s.style.setProperty("--dy",((Math.random()-.5)*70)+"px");document.body.appendChild(s);setTimeout(()=>s.remove(),650)}setTimeout(()=>{h.remove();makeHeart()},280)}
function remoteHeart(p){playSound("pop");for(let i=0;i<5;i++){const s=document.createElement("i");s.className="spark";s.style.left=p.x+"px";s.style.top=p.y+"px";s.style.setProperty("--dx",((Math.random()-.5)*55)+"px");s.style.setProperty("--dy",((Math.random()-.5)*55)+"px");document.body.appendChild(s);setTimeout(()=>s.remove(),650)}}

function presenceUpdate(){const state=channel?.presenceState()||{};players=Object.values(state).flat();$("presenceText").textContent=players.length===0?"Waiting for your person…":players.length===1?"1 person here":`${players.length} people here`;$("presenceDot").style.background=players.length?"#50c878":"#bbb";renderGames()}
function symbolForMe(){const ids=players.map(p=>p.key||p.id);return ids[0]===channel?.presenceState?.key?"X":null}
function myPlayerIndex(){return players.findIndex(p=>(p.name||"")===playerName)}

function renderTTT(){const b=$("tttBoard");b.innerHTML="";ttt.board.forEach((v,i)=>{const c=document.createElement("button");c.className="ttt-cell";c.textContent=v;c.disabled=!!v||!!ttt.winner;c.onclick=()=>moveTTT(i);b.appendChild(c)});$("tttTurn").textContent=ttt.winner?ttt.winner+"":players.length<2?"Waiting for your person…":"Turn: "+ttt.turn}
function winner3(b){for(const [a,c,d] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];return b.every(Boolean)?"draw":null}
function moveTTT(i){if(ttt.board[i]||ttt.winner||players.length<2)return;const idx=myPlayerIndex(),me=idx===0?"X":idx===1?"O":null;if(!me||me!==ttt.turn)return;ttt.board[i]=me;const w=winner3(ttt.board);ttt.winner=w? w==="draw"?"Draw!":w+" wins!":null;if(!ttt.winner)ttt.turn=me==="X"?"O":"X";broadcast("state",{ttt});renderTTT();playSound(ttt.winner?"win":"click")}
$("tttReset").onclick=()=>{ttt={board:Array(9).fill(""),turn:"X",winner:null};broadcast("state",{ttt});renderTTT();playSound()};

function renderRPS(){const n=Object.keys(rps.moves).length;$("rpsStatus").textContent=n<2?"Choose your move.":"Both moves are in!";$("rpsResult").textContent=rps.result||""}
function rpsWinner(a,b){if(a===b)return"draw";return(a==="rock"&&b==="scissors")||(a==="scissors"&&b==="paper")||(a==="paper"&&b==="rock")?"first":"second"}
document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>{const id=playerName||"Guest";rps.moves[id]=b.dataset.choice;rps.result="";const ids=Object.keys(rps.moves);if(ids.length>=2){const o=rpsWinner(rps.moves[ids[0]],rps.moves[ids[1]]);rps.result=o==="draw"?"It's a draw! 🤝":o==="first"?ids[0]+" wins!":ids[1]+" wins!"}broadcast("state",{rps});renderRPS();playSound()});
$("rpsReset").onclick=()=>{rps={moves:{},result:""};broadcast("state",{rps});renderRPS();playSound()};

function renderC4(){const b=$("c4Board");b.innerHTML="";c4.board.forEach((v,i)=>{const c=document.createElement("button");c.className="c4-cell";c.textContent=v==="R"?"🔴":v==="Y"?"🟡":"";c.disabled=!!v||!!c4.winner;c.onclick=()=>moveC4(i%7);b.appendChild(c)});$("c4Turn").textContent=c4.winner?c4.winner:players.length<2?"Waiting for your person…":"Turn: "+(c4.turn==="R"?"🔴":"🟡")}
function checkC4(b){for(let r=0;r<6;r++)for(let c=0;c<7;c++){const s=b[r*7+c];if(!s)continue;for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]){let ok=true;for(let k=1;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=6||cc<0||cc>=7||b[rr*7+cc]!==s){ok=false;break}}if(ok)return s}}return b.every(Boolean)?"draw":null}
function moveC4(col){if(players.length<2||c4.winner)return;const idx=myPlayerIndex(),me=idx===0?"R":idx===1?"Y":null;if(!me||me!==c4.turn)return;for(let r=5;r>=0;r--){const i=r*7+col;if(!c4.board[i]){c4.board[i]=me;const w=checkC4(c4.board);c4.winner=w?(w==="draw"?"Draw!":w+" wins!"):null;if(!c4.winner)c4.turn=me==="R"?"Y":"R";broadcast("state",{c4});renderC4();playSound(c4.winner?"win":"click");break}}}
$("c4Reset").onclick=()=>{c4={board:Array(42).fill(""),turn:"R",winner:null};broadcast("state",{c4});renderC4();playSound()};

function renderTrivia(){const q=triviaQuestions[trivia.index%triviaQuestions.length];$("triviaQuestion").textContent=q.q;const w=$("triviaChoices");w.innerHTML="";q.a.forEach((a,i)=>{const b=document.createElement("button");b.className="answer-btn"+(trivia.answers[playerName]===i?" selected":"");b.textContent=a;b.onclick=()=>{trivia.answers[playerName]=i;broadcast("state",{trivia});renderTrivia();playSound()};w.appendChild(b)});$("triviaStatus").textContent=Object.keys(trivia.answers).length>=2?"Both answered — compare your answers!":"Choose an answer."}
$("triviaNext").onclick=()=>{trivia={index:(trivia.index+1)%triviaQuestions.length,answers:{}};broadcast("state",{trivia});renderTrivia();playSound()};
const canvas=$("drawCanvas"),ctx=canvas.getContext("2d");let drawing=false,last=null;
function resizeCanvas(){const r=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));ctx.setTransform(d,0,0,d,0,0);ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#c98e9f"}
function drawLine(s){ctx.beginPath();ctx.moveTo(s.x1*canvas.clientWidth,s.y1*canvas.clientHeight);ctx.lineTo(s.x2*canvas.clientWidth,s.y2*canvas.clientHeight);ctx.stroke()}
canvas.addEventListener("pointerdown",e=>{if(e.cancelable)e.preventDefault();if(draw.drawerId!==playerName)return;drawing=true;const r=canvas.getBoundingClientRect();last={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{if(e.cancelable)e.preventDefault();if(!drawing||draw.drawerId!==playerName)return;const r=canvas.getBoundingClientRect(),p={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};const s={x1:last.x,y1:last.y,x2:p.x,y2:p.y};draw.strokes.push(s);drawLine(s);broadcast("draw",{stroke:s});last=p});
canvas.addEventListener("pointerup",e=>{if(e.cancelable)e.preventDefault();drawing=false;last=null});canvas.addEventListener("pointercancel",()=>{drawing=false;last=null});
function todayKey(){return new Date().toISOString().slice(0,10)}
async function loadLearn(force=false){
  const key=todayKey();
  if(!force && learn.loadedDate===key && learn.stories.length){renderLearn();return}
  const wrap=$("learnStories"); if(wrap)wrap.innerHTML='<div class="learn-loading">Loading today’s fresh stories…</div>';
  const rss='https://news.google.com/rss/search?q=science+technology+psychology+productivity&hl=en-IN&gl=IN&ceid=IN:en';
  try{
    const res=await fetch('https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(rss),{cache:'no-store'});
    const data=await res.json();
    learn={loadedDate:key,stories:(data.items||[]).slice(0,5).map(x=>({title:x.title,link:x.link,source:x.author||'Today’s news'}))};
  }catch{
    learn={loadedDate:key,stories:[{title:"Try a 10-minute phone-free walk together.",link:"#",source:"Just Us idea"},{title:"Teach each other one thing you learned this week.",link:"#",source:"Just Us idea"},{title:"Pick one tiny habit and test it together for seven days.",link:"#",source:"Just Us idea"}]};
  }
  renderLearn(); broadcast("learn",{state:learn});
}
function renderLearn(){
  const date=$("learnDate"),wrap=$("learnStories"); if(!wrap)return;
  if(date)date.textContent=new Date().toLocaleDateString(undefined,{day:"numeric",month:"short"});
  wrap.innerHTML=learn.stories.map((s,i)=>`<article class="learn-story"><a href="${escapeHtml(s.link)}" target="_blank" rel="noopener"><div class="learn-story-title">${i+1}. ${escapeHtml(s.title)}</div><div class="learn-story-meta">${escapeHtml(s.source)} · tap to read</div></a></article>`).join("");
}
function renderDraw(){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();resizeCanvas();draw.strokes.forEach(drawLine);$("drawStatus").textContent=draw.drawerId?draw.drawerId===playerName?"You're drawing ✏️ — they'll guess!":"Your person is drawing ✏️":"Start a round to draw.";$("clearDraw").disabled=draw.drawerId!==playerName}
$("drawStart").onclick=()=>{if(players.length<2)return toast("Wait for your person to join first.");draw={strokes:[],drawerId:players[0].name};broadcast("state",{draw});renderDraw();playSound()};
$("clearDraw").onclick=()=>{if(draw.drawerId!==playerName)return;draw.strokes=[];renderDraw();broadcast("state",{draw});playSound()};window.addEventListener("resize",resizeCanvas);

function addMessage(msg,me=false){const d=document.createElement("div");d.className="message"+(me?" me":"");d.innerHTML="<small>"+escapeHtml(msg.name||"Guest")+"</small>"+escapeHtml(msg.text||"");$("messages").appendChild(d);$("messages").scrollTop=1e9}
$("chatForm").onsubmit=e=>{e.preventDefault();const text=$("chatInput").value.trim();if(!text)return;const msg={name:playerName||"Guest",text};addMessage(msg,true);broadcast("chat",msg);$("chatInput").value="";playSound()};

function closePeer(){if(peer){peer.onicecandidate=null;peer.ontrack=null;peer.close()}peer=null;iceQueue=[];$("remoteAudio").srcObject=null}
function resetVoice(){voiceJoined=false;voiceMuted=false;localStream?.getTracks().forEach(t=>t.stop());localStream=null;closePeer();$("joinVoiceBtn").classList.remove("hidden");$("muteVoiceBtn").classList.add("hidden");$("leaveVoiceBtn").classList.add("hidden")}
function makePeer(offerer){closePeer();peer=new RTCPeerConnection(voiceConfig);localStream?.getTracks().forEach(t=>peer.addTrack(t,localStream));peer.ontrack=e=>{$("remoteAudio").srcObject=e.streams[0];$("remoteAudio").play().catch(()=>{})};peer.onicecandidate=e=>{if(e.candidate)broadcast("voice-ice",{candidate:e.candidate})};if(offerer)peer.createOffer().then(o=>peer.setLocalDescription(o)).then(()=>broadcast("voice-offer",{offer:peer.localDescription}));return peer}
async function joinVoice(){if(voiceJoined)return;try{localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});voiceJoined=true;$("joinVoiceBtn").classList.add("hidden");$("muteVoiceBtn").classList.remove("hidden");$("leaveVoiceBtn").classList.remove("hidden");$("voiceStatus").textContent="You're in the call. Your person can hear you.";broadcast("voice-join",{name:playerName});}catch(e){toast("Microphone permission is needed for voice chat.")}}
$("joinVoiceBtn").onclick=joinVoice;$("leaveVoiceBtn").onclick=()=>{broadcast("voice-leave",{});resetVoice();$("voiceStatus").textContent="Join the call when you’re ready."};$("muteVoiceBtn").onclick=()=>{voiceMuted=!voiceMuted;localStream?.getAudioTracks().forEach(t=>t.enabled=!voiceMuted);$("muteVoiceBtn").textContent=voiceMuted?"🎙️ Unmute":"🔇 Mute";broadcast("voice-mute",{name:playerName,muted:voiceMuted})};

function parseYoutube(url){try{const u=new URL(url.trim());if(u.hostname.includes("youtu.be"))return u.pathname.slice(1).split("/")[0];if(u.hostname.includes("youtube.com"))return u.searchParams.get("v")||u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]||null}catch{}return null}
function onYTReady(){ytReady=true;$("youtubeStatus").innerHTML="<span>Video ready. Play it and your person will sync.</span><span>Voice stays available.</span>";if(ytPendingId){const id=ytPendingId;ytPendingId="";loadYoutube(id,ytRemote)}}
function loadYoutube(id,remote=false){if(!id)return;currentVideoId=id;ytRemote=remote;ytReady=false;if(ytPlayer?.destroy)try{ytPlayer.destroy()}catch{};$("youtubePlayer").innerHTML="";if(window.YT?.Player){ytPlayer=new YT.Player("youtubePlayer",{width:"100%",height:"100%",videoId:id,playerVars:{playsinline:1,controls:1,rel:0,modestbranding:1},events:{onReady:onYTReady,onStateChange:onYTState}})}else{ytPendingId=id;$("youtubeStatus").textContent="YouTube is loading…"}}
function onYTState(e){if(ytSuppress||ytRemote||!ytReady)return;const state=e.data,time=ytPlayer.getCurrentTime();if(state===YT.PlayerState.PLAYING)broadcast("youtube",{type:"play",id:currentVideoId,time});else if(state===YT.PlayerState.PAUSED)broadcast("youtube",{type:"pause",id:currentVideoId,time})}
function startYTTimer(){clearInterval(ytTimer);ytTimer=setInterval(()=>{if(!ytPlayer||!ytReady||ytRemote||ytSuppress)return;try{if(ytPlayer.getPlayerState()===YT.PlayerState.PLAYING)broadcast("youtube",{type:"sync",id:currentVideoId,time:ytPlayer.getCurrentTime()})}catch{}},1800)}
function applyYT(p){if(!ytPlayer||!ytReady||p.id!==currentVideoId)return;ytSuppress=true;try{if(typeof p.time==="number"&&Math.abs(ytPlayer.getCurrentTime()-p.time)>1.2)ytPlayer.seekTo(p.time,true);if(p.type==="play")ytPlayer.playVideo();if(p.type==="pause")ytPlayer.pauseVideo();if(p.type==="sync"&&ytPlayer.getPlayerState()===YT.PlayerState.PLAYING)ytPlayer.seekTo(p.time,true)}catch{}setTimeout(()=>ytSuppress=false,350)}
$("youtubeForm").onsubmit=e=>{e.preventDefault();const id=parseYoutube($("youtubeUrl").value);if(!id)return toast("Paste a valid YouTube video link.");loadYoutube(id,false);broadcast("youtube",{type:"load",id})};window.onYouTubeIframeAPIReady=()=>{if(ytPendingId){const id=ytPendingId;ytPendingId="";loadYoutube(id,ytRemote)}};

function parseSpotify(url){try{const u=new URL(url.trim());if(!u.hostname.includes("spotify.com"))return null;const m=u.pathname.match(/\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/);return m?{type:m[1],id:m[2]}:null}catch{return null}}
function loadSpotify(url){const s=parseSpotify(url);if(!s)return toast("Paste a valid Spotify song, album or playlist link.");$("spotifyFrame").src=`https://open.spotify.com/embed/${s.type}/${s.id}?utm_source=generator`;$("spotifyStatus").textContent="Spotify loaded. Press play to listen."}
$("spotifyForm").onsubmit=e=>{e.preventDefault();const url=$("spotifyUrl").value.trim();if(!url)return;const s=parseSpotify(url);if(!s)return toast("Paste a valid Spotify link.");loadSpotify(url);broadcast("spotify",{url})};

function applyState(p){if(p.ttt){ttt=p.ttt;renderTTT()}if(p.rps){rps=p.rps;renderRPS()}if(p.c4){c4=p.c4;renderC4()}if(p.trivia){trivia=p.trivia;renderTrivia()}if(p.learn){learn=p.learn;renderLearn()}if(p.draw){draw=p.draw;renderDraw()}}
function setupRoom(){if(!roomId)return;$("homeView").classList.add("hidden");$("roomView").classList.remove("hidden");$("roomCode").textContent=roomId;channel=sb.channel(`just-us:${roomId}`,{config:{presence:{key:playerName||crypto.randomUUID()},broadcast:{self:false}}});channel.on("presence",{event:"sync"},presenceUpdate).on("broadcast",{event:"chat"},({payload})=>addMessage(payload)).on("broadcast",{event:"state"},({payload})=>applyState(payload)).on("broadcast",{event:"heart-pop"},({payload})=>remoteHeart(payload)).on("broadcast",{event:"voice-join"},async()=>{if(voiceJoined)makePeer(true)}).on("broadcast",{event:"voice-offer"},async({payload})=>{if(!voiceJoined)return;try{const p=makePeer(false);await p.setRemoteDescription(payload.offer);for(const c of iceQueue)await p.addIceCandidate(c).catch(()=>{});iceQueue=[];await p.setLocalDescription(await p.createAnswer());broadcast("voice-answer",{answer:p.localDescription})}catch{toast("Voice connection failed.")}}).on("broadcast",{event:"voice-answer"},async({payload})=>{if(peer)try{await peer.setRemoteDescription(payload.answer)}catch{}}).on("broadcast",{event:"voice-ice"},async({payload})=>{if(peer?.remoteDescription)await peer.addIceCandidate(payload.candidate).catch(()=>{});else iceQueue.push(payload.candidate)}).on("broadcast",{event:"voice-leave"},()=>{closePeer();$("voiceStatus").textContent="Your person left voice chat."}).on("broadcast",{event:"voice-mute"},({payload})=>{if(payload.name!==playerName)$("voiceStatus").textContent=payload.muted?"Your person muted their mic.":"Your person is unmuted."}).on("broadcast",{event:"draw"},({payload})=>{if(payload.stroke){draw.strokes.push(payload.stroke);drawLine(payload.stroke)} }).on("broadcast",{event:"learn"},({payload})=>{if(payload.state){learn=payload.state;renderLearn()}}).on("broadcast",{event:"youtube"},({payload})=>{if(payload.type==="load")loadYoutube(payload.id,true);else applyYT(payload)}).on("broadcast",{event:"spotify"},({payload})=>loadSpotify(payload.url));channel.subscribe(async status=>{if(status==="SUBSCRIBED"){await channel.track({name:playerName||"Guest"});presenceUpdate();renderAll()}})}

function renderAll(){renderTTT();renderRPS();renderC4();renderTrivia();renderLearn();resizeCanvas();renderDraw();startYTTimer()}
function showFamily(family){$("quickPicker").classList.toggle("hidden",family!=="quick");$("togetherPicker").classList.toggle("hidden",family!=="together");document.querySelectorAll(".game-tab").forEach(b=>b.classList.toggle("active",b.dataset.family===family));showGame(family==="quick"?"ttt":"trivia",true)}
function showGame(game,fromFamily=false){document.querySelectorAll(".game-box").forEach(x=>x.classList.add("hidden"));const box=$(game+"Game");if(box)box.classList.remove("hidden");document.querySelectorAll(".family-picker .tiny-btn").forEach(b=>b.classList.toggle("active-game",b.dataset.game===game));if(!fromFamily){const family=["ttt","rps","c4"].includes(game)?"quick":"together";$("quickPicker").classList.toggle("hidden",family!=="quick");$("togetherPicker").classList.toggle("hidden",family!=="together");document.querySelectorAll(".game-tab").forEach(b=>b.classList.toggle("active",b.dataset.family===family))}if(game==="learn")loadLearn();}
document.querySelectorAll(".game-tab").forEach(b=>b.onclick=()=>{showFamily(b.dataset.family);playSound()});document.querySelectorAll(".family-picker .tiny-btn").forEach(b=>b.onclick=()=>{showGame(b.dataset.game);playSound()});

$("createRoomBtn").onclick=()=>openName("create");$("joinRoomBtn").onclick=()=>openName("join");function openName(mode){$("nameModal").dataset.mode=mode;$("nameModal").classList.remove("hidden");$("nameInput").value=playerName;setTimeout(()=>$("nameInput").focus(),50)}
$("closeModal").onclick=()=>$("nameModal").classList.add("hidden");$("closeJoinModal").onclick=()=>$("joinModal").classList.add("hidden");$("nameForm").onsubmit=e=>{e.preventDefault();const n=$("nameInput").value.trim();if(!n)return;playerName=n.slice(0,24);localStorage.setItem("justus_name",playerName);$("nameModal").classList.add("hidden");if($("nameModal").dataset.mode==="create"){roomId=Math.random().toString(36).slice(2,8).toUpperCase();history.replaceState({},"",`?room=${roomId}`);setupRoom()}else{$("joinModal").classList.remove("hidden");setTimeout(()=>$("joinCodeInput").focus(),50)}};
$("joinForm").onsubmit=e=>{e.preventDefault();const code=$("joinCodeInput").value.trim().toUpperCase();if(code.length<4)return toast("Enter the room code.");roomId=code;history.replaceState({},"",`?room=${roomId}`);$("joinModal").classList.add("hidden");setupRoom()};$("copyLinkBtn").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast("Invite link copied 💗")}catch{toast(location.href)}};$("leaveRoomBtn").onclick=()=>{resetVoice();channel?.unsubscribe();channel=null;location.href=location.pathname};$("gamesNav").onclick=()=>$("gamesPanel")?.scrollIntoView({behavior:"smooth"});$("soundToggle").onclick=()=>{soundOn=!soundOn;setSound();if(soundOn)playSound()};document.querySelectorAll(".mood").forEach(b=>b.onclick=()=>{document.querySelectorAll(".mood").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.body.dataset.mood=b.dataset.mood});

setSound();addHearts();if(roomId){if(playerName)setupRoom();else openName("join")}else{renderAll()}

const learnRefresh=$("learnRefresh"); if(learnRefresh)learnRefresh.onclick=()=>loadLearn(true);
