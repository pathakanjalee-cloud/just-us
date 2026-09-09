const SUPABASE_URL="https://zykfklcbdtotehqmjawx.supabase.co";
const SUPABASE_KEY="sb_publishable_KsHB0P3vSNl5b3IQ3tS0bg_ThX88107";
const {createClient}=supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{realtime:{params:{eventsPerSecond:20}}});

let roomId=new URLSearchParams(location.search).get("room")||"";
let playerName=localStorage.getItem("justus_name")||"";
let channel=null, presence=[];
let soundOn=true, audioCtx=null;
let tttState={board:Array(9).fill(""),turn:"X",winner:""};
let rpsState={};
let c4State={board:Array(42).fill(""),turn:"R",winner:""};
let triviaIndex=0, coupleIndex=0;
let voiceJoined=false,voiceMuted=false,localStream=null,peerConnection=null,pendingIce=[];
let ytPlayer=null,ytReady=false,currentVideoId="",isRemoteMedia=false,suppressYtBroadcast=false,ytSyncTimer=null;
const voiceConfig={iceServers:[{urls:"stun:stun.l.google.com:19302"}]};
const trivia=[
 {q:"Which planet is known as the Red Planet?",a:["Mars","Venus","Jupiter","Mercury"],c:0},
 {q:"How many sides does a hexagon have?",a:["5","6","7","8"],c:1},
 {q:"Which ocean is the largest?",a:["Atlantic","Indian","Pacific","Arctic"],c:2},
 {q:"What is the smallest prime number?",a:["0","1","2","3"],c:2},
 {q:"Which animal is known for its black-and-white stripes?",a:["Tiger","Zebra","Panda","Skunk"],c:1}
];
const couples=[
 "What is one tiny thing I do that always makes you smile?",
 "What would our perfect lazy Sunday look like?",
 "Which memory of us would you replay forever?",
 "What is one place you would love for us to visit together?",
 "What song feels the most like us?",
 "What is something you want us to try together this year?"
];

const $=id=>document.getElementById(id);
function toast(t){const e=$("toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2200)}
function playSound(type="click"){if(!soundOn)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=type==="pop"?650:type==="win"?880:420;o.type="sine";g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13)}catch(e){}}
async function broadcast(event,payload){if(channel)await channel.send({type:"broadcast",event,payload})}

function addBalloons(){const layer=document.createElement("div");layer.className="balloon-layer";document.body.prepend(layer);for(let i=0;i<11;i++){const b=document.createElement("div");b.className="heart-balloon";b.style.left=(Math.random()*100)+"%";b.style.animationDuration=(18+Math.random()*18)+"s";b.style.animationDelay=(-Math.random()*22)+"s";b.style.opacity=.55+Math.random()*.4;b.innerHTML='<span class="string"></span>';b.addEventListener("click",e=>popBalloon(e,b));layer.appendChild(b)}}
function popBalloon(e,b){if(b.classList.contains("popping"))return;playSound("pop");broadcast("balloon-pop",{x:e.clientX,y:e.clientY});b.classList.add("popping");for(let i=0;i<9;i++){const s=document.createElement("i");s.className="spark";s.style.left=e.clientX+"px";s.style.top=e.clientY+"px";s.style.setProperty("--dx",((Math.random()-.5)*90)+"px");s.style.setProperty("--dy",((Math.random()-.5)*90)+"px");document.body.appendChild(s);setTimeout(()=>s.remove(),600)}setTimeout(()=>{b.remove();spawnBalloon()},250)}
function spawnBalloon(){const layer=document.querySelector(".balloon-layer");if(!layer)return;const b=document.createElement("div");b.className="heart-balloon";b.style.left=(Math.random()*100)+"%";b.style.animationDuration=(18+Math.random()*18)+"s";b.innerHTML='<span class="string"></span>';b.addEventListener("click",e=>popBalloon(e,b));layer.appendChild(b)}

async function setupRoom(){if(!roomId)return;$("homeView").classList.add("hidden");$("roomView").classList.remove("hidden");$("roomCode").textContent=roomId;channel=sb.channel("just-us-"+roomId,{config:{broadcast:{self:false},presence:{key:crypto.randomUUID()}}});
 channel.on("presence",{event:"sync"},()=>updatePresence()).on("broadcast",{event:"chat"},({payload})=>addMessage(payload,false)).on("broadcast",{event:"state"},({payload})=>applyState(payload)).on("broadcast",{event:"sound"},({payload})=>playSound(payload.type)).on("broadcast",{event:"draw"},({payload})=>drawRemote(payload)).on("broadcast",{event:"voice-join"},handleVoiceJoin).on("broadcast",{event:"voice-offer"},handleVoiceOffer).on("broadcast",{event:"voice-answer"},handleVoiceAnswer).on("broadcast",{event:"voice-ice"},handleVoiceIce).on("broadcast",{event:"voice-leave"},handleVoiceLeave).on("broadcast",{event:"voice-mute"},({payload})=>{$("voiceStatus").textContent=payload.name+(payload.muted?" muted":" is talking")}).on("broadcast",{event:"balloon-pop"},({payload})=>remotePop(payload)).on("broadcast",{event:"youtube"},payload=>handleYoutubeRemote(payload.payload)).on("broadcast",{event:"spotify"},({payload})=>loadSpotify(payload.url));
 await channel.subscribe(async status=>{if(status==="SUBSCRIBED"){await channel.track({name:playerName||"Guest"});updatePresence();}});renderAll();
}
function updatePresence(){const state=channel?.presenceState()||{};presence=Object.values(state).flat();$("presenceText").textContent=presence.length+(presence.length===1?" person":" people")+" here";$("presenceDot").style.background=presence.length>0?"#50c878":"#bbb"}
function remotePop(p){playSound("pop");const s=document.createElement("i");s.className="spark";s.style.left=p.x+"px";s.style.top=p.y+"px";s.style.setProperty("--dx","0px");s.style.setProperty("--dy","-45px");document.body.appendChild(s);setTimeout(()=>s.remove(),600)}

function createRoom(){openName("create")}
function joinRoom(){openName("join")}
function openName(mode){$("nameModal").dataset.mode=mode;$("nameModal").classList.remove("hidden");$("nameInput").value=playerName;setTimeout(()=>$("nameInput").focus(),50)}
$("closeModal").onclick=()=>$("nameModal").classList.add("hidden");$("closeJoinModal").onclick=()=>$("joinModal").classList.add("hidden");
$("createRoomBtn").onclick=createRoom;$("joinRoomBtn").onclick=joinRoom;
$("nameForm").onsubmit=e=>{e.preventDefault();const n=$("nameInput").value.trim();if(!n)return;playerName=n;localStorage.setItem("justus_name",n);const mode=$("nameModal").dataset.mode;$("nameModal").classList.add("hidden");if(mode==="create"){roomId=Math.random().toString(36).slice(2,8).toUpperCase();history.replaceState({},"","?room="+roomId);setupRoom()}else{$("joinModal").classList.remove("hidden");$("joinCodeInput").value="";setTimeout(()=>$("joinCodeInput").focus(),50)}};
$("joinForm").onsubmit=e=>{e.preventDefault();roomId=$("joinCodeInput").value.trim().toUpperCase();if(roomId.length<4)return toast("Enter the room code");history.replaceState({},"","?room="+roomId);$("joinModal").classList.add("hidden");setupRoom()};
$("copyLinkBtn").onclick=async()=>{const link=location.href;try{await navigator.clipboard.writeText(link);toast("Invite link copied 💗")}catch{toast(link)}};
$("leaveRoomBtn").onclick=()=>{if(channel)channel.unsubscribe();location.href=location.pathname};
$("soundToggle").onclick=()=>{soundOn=!soundOn;$("soundToggle").textContent=soundOn?"🔊 Sound on":"🔇 Sound off";if(soundOn)playSound()};
document.querySelectorAll(".mood").forEach(b=>b.onclick=()=>{document.querySelectorAll(".mood").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.body.dataset.mood=b.dataset.mood});

// Game tabs: only one family is visible at a time.
document.querySelectorAll(".game-tab").forEach(tab=>tab.onclick=()=>{document.querySelectorAll(".game-tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");const family=tab.dataset.family;document.querySelectorAll(".game-box").forEach(x=>x.classList.add("hidden"));$(tab.dataset.game+"Game").classList.remove("hidden")});
// Compatibility with the two family tabs used in the HTML.
document.querySelectorAll("[data-family]").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".game-box").forEach(x=>x.classList.add("hidden"));const first=tab.dataset.family==="quick"?"tttGame":"triviaGame";$(first).classList.remove("hidden") }));

function renderTTT(){const b=$("tttBoard");b.innerHTML="";tttState.board.forEach((v,i)=>{const c=document.createElement("button");c.className="ttt-cell";c.textContent=v;c.onclick=()=>tttMove(i);b.appendChild(c)});$("tttTurn").textContent=tttState.winner||("Turn: "+tttState.turn)}
function tttMove(i){if(tttState.board[i]||tttState.winner)return;tttState.board[i]=tttState.turn;const w=winner3(tttState.board);if(w)tttState.winner=w+" wins!";else if(tttState.board.every(Boolean))tttState.winner="Draw!";else tttState.turn=tttState.turn==="X"?"O":"X";playSound(tttState.winner?"win":"click");broadcast("state",{ttt:tttState});renderTTT()}
function winner3(b){const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(const [a,c,d] of lines)if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];return null}
$("tttReset").onclick=()=>{tttState={board:Array(9).fill(""),turn:"X",winner:""};broadcast("state",{ttt:tttState});renderTTT()};

document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>{const choice=b.dataset.choice;rpsState[playerName]=choice;broadcast("state",{rps:rpsState});renderRPS();playSound()});function renderRPS(){const names=Object.keys(rpsState);$("rpsStatus").textContent=names.length<2?"Waiting for the other move…":"Both moves are in!";if(names.length>=2){const vals=names.map(n=>rpsState[n]);const result=vals[0]===vals[1]?"Draw!":beats(vals[0],vals[1])?names[0]+" wins!":names[1]+" wins!";$("rpsResult").textContent=result}}function beats(a,b){return(a==="rock"&&b==="scissors")||(a==="paper"&&b==="rock")||(a==="scissors"&&b==="paper")}
$("rpsReset").onclick=()=>{rpsState={};broadcast("state",{rps:rpsState});renderRPS()};

function renderC4(){const b=$("c4Board");b.innerHTML="";c4State.board.forEach((v,i)=>{const c=document.createElement("button");c.className="c4-cell "+(v==="R"?"red":v==="Y"?"yellow":"");c.onclick=()=>c4Move(i%7);b.appendChild(c)});$("c4Turn").textContent=c4State.winner||("Turn: "+c4State.turn)}function c4Move(col){if(c4State.winner)return;let placed=false;for(let r=5;r>=0;r--){const i=r*7+col;if(!c4State.board[i]){c4State.board[i]=c4State.turn;placed=true;break}}if(!placed)return;const w=winnerC4(c4State.board);if(w)c4State.winner=(w==="R"?"Red":"Yellow")+" wins!";else if(c4State.board.every(Boolean))c4State.winner="Draw!";else c4State.turn=c4State.turn==="R"?"Y":"R";broadcast("state",{c4:c4State});renderC4();playSound(c4State.winner?"win":"click")}
function winnerC4(b){for(let r=0;r<6;r++)for(let c=0;c<7;c++){const i=r*7+c;if(!b[i])continue;for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){let ok=true;for(let k=1;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=6||cc<0||cc>=7||b[rr*7+cc]!==b[i]){ok=false;break}}if(ok)return b[i]}}return null}
$("c4Reset").onclick=()=>{c4State={board:Array(42).fill(""),turn:"R",winner:""};broadcast("state",{c4:c4State});renderC4()};

function renderTrivia(){const q=trivia[triviaIndex%trivia.length];$("triviaQuestion").textContent=q.q;const wrap=$("triviaChoices");wrap.innerHTML="";q.a.forEach((a,i)=>{const b=document.createElement("button");b.className="answer-btn";b.textContent=a;b.onclick=()=>{b.classList.add(i===q.c?"correct":"wrong");$("triviaStatus").textContent=i===q.c?"Correct! 💗":"Not quite!";broadcast("state",{trivia:{index:triviaIndex,answer:i}});playSound(i===q.c?"win":"click")};wrap.appendChild(b)})}$("triviaNext").onclick=()=>{triviaIndex++;broadcast("state",{trivia:{index:triviaIndex}});renderTrivia()};
function renderCouple(){$("coupleCount").textContent=(coupleIndex%couples.length+1)+" / "+couples.length;$("coupleQuestion").textContent=couples[coupleIndex%couples.length]}$("coupleNext").onclick=()=>{coupleIndex++;broadcast("state",{coupleIndex});renderCouple();playSound()};

let drawing=false,lastX=0,lastY=0;const canvas=$("drawCanvas"),ctx=canvas.getContext("2d");function resizeCanvas(){const r=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1;canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=4;ctx.strokeStyle="#ff5f9e"}window.addEventListener("resize",resizeCanvas);function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}canvas.addEventListener("pointerdown",e=>{drawing=true;const p=point(e);lastX=p.x;lastY=p.y;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener("pointermove",e=>{if(!drawing)return;const p=point(e);ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(p.x,p.y);ctx.stroke();broadcast("draw",{x1:lastX,y1:lastY,x2:p.x,y2:p.y});lastX=p.x;lastY=p.y});canvas.addEventListener("pointerup",()=>drawing=false);canvas.addEventListener("pointercancel",()=>drawing=false);function drawRemote(p){ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke()}$("clearDraw").onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);broadcast("draw",{clear:true})};
$("drawStart").onclick=()=>{ $("drawStatus").textContent="You can draw! Guess in chat 💗";$("clearDraw").disabled=false;playSound()};

function addMessage(msg,me){const d=document.createElement("div");d.className="message"+(me?" me":"");d.innerHTML="<small>"+(msg.name||"Guest")+"</small>"+escapeHtml(msg.text);$("messages").appendChild(d);$("messages").scrollTop=1e9}function escapeHtml(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}$("chatForm").onsubmit=e=>{e.preventDefault();const text=$("chatInput").value.trim();if(!text)return;const msg={name:playerName||"Guest",text};addMessage(msg,true);broadcast("chat",msg);$("chatInput").value="";playSound()};

async function joinVoice(){if(voiceJoined)return;try{localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});voiceJoined=true;voiceMuted=false;$("joinVoiceBtn").classList.add("hidden");$("muteVoiceBtn").classList.remove("hidden");$("leaveVoiceBtn").classList.remove("hidden");$("voiceStatus").textContent="You are in the voice chat. Waiting for your person…";await broadcast("voice-join",{name:playerName});}catch(e){toast("Microphone permission is needed for voice chat")}}
function makePeer(initiator){if(peerConnection)peerConnection.close();peerConnection=new RTCPeerConnection(voiceConfig);localStream?.getTracks().forEach(t=>peerConnection.addTrack(t,localStream));peerConnection.ontrack=e=>{$("remoteAudio").srcObject=e.streams[0]};peerConnection.onicecandidate=e=>{if(e.candidate)broadcast("voice-ice",{candidate:e.candidate})};peerConnection.onconnectionstatechange=()=>{if(["failed","disconnected","closed"].includes(peerConnection.connectionState))$("voiceStatus").textContent="Voice connection ended."};if(initiator)peerConnection.createOffer().then(o=>peerConnection.setLocalDescription(o).then(()=>broadcast("voice-offer",{sdp:o})));return peerConnection}
async function handleVoiceJoin(){if(!voiceJoined)return;const pc=makePeer(true)}async function handleVoiceOffer({payload}){if(!voiceJoined)return;const pc=makePeer(false);await pc.setRemoteDescription(payload.sdp);const a=await pc.createAnswer();await pc.setLocalDescription(a);broadcast("voice-answer",{sdp:a})}async function handleVoiceAnswer({payload}){if(peerConnection)await peerConnection.setRemoteDescription(payload.sdp)}async function handleVoiceIce({payload}){if(peerConnection?.remoteDescription)await peerConnection.addIceCandidate(payload.candidate);else pendingIce.push(payload.candidate)}async function handleVoiceLeave(){if(peerConnection)peerConnection.close();$("voiceStatus").textContent="Your person left voice chat."}async function leaveVoice(){voiceJoined=false;localStream?.getTracks().forEach(t=>t.stop());localStream=null;peerConnection?.close();peerConnection=null;await broadcast("voice-leave",{});$("joinVoiceBtn").classList.remove("hidden");$("muteVoiceBtn").classList.add("hidden");$("leaveVoiceBtn").classList.add("hidden");$("voiceStatus").textContent="Join the call when you’re ready. Your microphone stays off until you join."}async function toggleMute(){if(!localStream)return;voiceMuted=!voiceMuted;localStream.getAudioTracks().forEach(t=>t.enabled=!voiceMuted);$("muteVoiceBtn").textContent=voiceMuted?"🎙️ Unmute":"🔇 Mute";broadcast("voice-mute",{name:playerName,muted:voiceMuted})}$("joinVoiceBtn").onclick=joinVoice;$("leaveVoiceBtn").onclick=leaveVoice;$("muteVoiceBtn").onclick=toggleMute;

function parseYoutube(url){try{const u=new URL(url);if(u.hostname.includes("youtu.be"))return u.pathname.slice(1).split("?")[0];if(u.hostname.includes("youtube.com")){return u.searchParams.get("v")||u.pathname.split("/embed/")[1]||u.pathname.split("/shorts/")[1]}}catch{}return null}
function loadYoutube(id,remote=false){if(!id)return toast("Please paste a valid YouTube link");currentVideoId=id;isRemoteMedia=remote;ytReady=false;$("youtubeStatus").textContent="Video loaded. Play to watch together.";if(ytPlayer?.destroy)try{ytPlayer.destroy()}catch{};const host=$("youtubeFrame");host.src="about:blank";if(window.YT&&YT.Player){ytPlayer=new YT.Player("youtubeFrame",{videoId:id,playerVars:{playsinline:1,controls:1,rel:0},events:{onReady:()=>{ytReady=true;startYoutubeSync();},onStateChange:onYoutubeStateChange}})}else{host.src="https://www.youtube.com/embed/"+id+"?enablejsapi=1&playsinline=1&controls=1&rel=0";setTimeout(()=>loadYoutube(id,remote),800)}}
function startYoutubeSync(){clearInterval(ytSyncTimer);ytSyncTimer=setInterval(()=>{if(!ytPlayer||!ytReady||isRemoteMedia||suppressYtBroadcast)return;try{if(ytPlayer.getPlayerState()===YT.PlayerState.PLAYING)broadcast("youtube",{type:"sync",id:currentVideoId,time:ytPlayer.getCurrentTime()})}catch{}},1800)}
function onYoutubeStateChange(e){if(suppressYtBroadcast||isRemoteMedia)return;if(e.data===YT.PlayerState.PLAYING)broadcast("youtube",{type:"play",id:currentVideoId,time:ytPlayer.getCurrentTime()});else if(e.data===YT.PlayerState.PAUSED)broadcast("youtube",{type:"pause",id:currentVideoId,time:ytPlayer.getCurrentTime()})}
function sendYoutubeCommand(type){if(!ytPlayer||!ytReady)return;const time=ytPlayer.getCurrentTime();broadcast("youtube",{type,id:currentVideoId,time})}
function applyYoutubeCommand(p){if(!ytPlayer||!ytReady||p.id!==currentVideoId)return;suppressYtBroadcast=true;try{if(typeof p.time==="number"&&Math.abs(ytPlayer.getCurrentTime()-p.time)>1.5)ytPlayer.seekTo(p.time,true);if(p.type==="play"||p.type==="sync")ytPlayer.playVideo();if(p.type==="pause")ytPlayer.pauseVideo()}catch{}setTimeout(()=>suppressYtBroadcast=false,400)}
function loadSpotify(url){if(!url)return;let u=url.trim();try{const x=new URL(u);let path=x.pathname.replace(/^\//,"");if(!path.startsWith("embed/"))path="embed/"+path;u="https://open.spotify.com/"+path}catch{return toast("Please paste a Spotify link")}$("spotifyFrame").src="https://open.spotify.com/"+u.split("open.spotify.com/")[1]+"?utm_source=generator";$("spotifyStatus").textContent="Spotify loaded. Open it and press play."}
$("youtubeForm").onsubmit=e=>{e.preventDefault();const id=parseYoutube($("youtubeUrl").value);if(!id)return toast("Paste a YouTube video link");loadYoutube(id);broadcast("youtube",{type:"load",id})};$("spotifyForm").onsubmit=e=>{e.preventDefault();const url=$("spotifyUrl").value.trim();if(!url)return;loadSpotify(url);broadcast("spotify",{url})};
window.onYouTubeIframeAPIReady=()=>{if(currentVideoId&&!ytPlayer)loadYoutube(currentVideoId,isRemoteMedia)};
function handleYoutubeRemote(p){if(p.type==="load"){loadYoutube(p.id,true)}else if(["play","pause","sync"].includes(p.type)){applyYoutubeCommand(p)}}

function applyState(p){if(p.ttt){tttState=p.ttt;renderTTT()}if(p.rps){rpsState=p.rps;renderRPS()}if(p.c4){c4State=p.c4;renderC4()}if(p.trivia){triviaIndex=p.trivia.index??triviaIndex;renderTrivia()}if(typeof p.coupleIndex==="number"){coupleIndex=p.coupleIndex;renderCouple()}if(p.draw?.clear)ctx.clearRect(0,0,canvas.width,canvas.height)}
function renderAll(){renderTTT();renderRPS();renderC4();renderTrivia();renderCouple();resizeCanvas()}

if(roomId){if(!playerName){openName("join")}else setupRoom()}addBalloons();

// Compact game chooser: the two family tabs stay visible, while the six tiny buttons pick the exact game.
document.querySelectorAll(".family-picker .tiny-btn").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".game-box").forEach(x=>x.classList.add("hidden"));const id=btn.dataset.game+"Game";$(id).classList.remove("hidden");document.querySelectorAll(".game-tab").forEach(t=>t.classList.toggle("active",t.dataset.family===(['ttt','rps','c4'].includes(btn.dataset.game)?'quick':'together')))}));
