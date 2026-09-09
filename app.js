const SUPABASE_URL = "https://zykfklcbdtotehqmjawx.supabase.co";
const SUPABASE_KEY = "sb_publishable_KsHB0P3vSNl5b3IQ3tS0bg_ThX88107";
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 15 } } });

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let channel = null;
let roomId = new URLSearchParams(location.search).get("room")?.toUpperCase() || null;
let myName = sessionStorage.getItem("justUsName") || "";
let myId = crypto.randomUUID();
let players = new Map();
let currentGame = "ttt";
let soundOn = sessionStorage.getItem("justUsSound") !== "off";
let audioCtx = null;

// Voice chat uses WebRTC for audio and the existing Supabase Realtime channel only for signaling.
let voiceJoined = false;
let voiceMuted = false;
let localStream = null;
let peerConnection = null;
let pendingIceCandidates = [];
const voiceConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

let ttt = { board: Array(9).fill(""), turn: "X", winner: null };
let rps = { moves: {}, round: 0, result: "" };
let c4 = { board: Array(42).fill(""), turn: "R", winner: null };
let trivia = { index: 0, answers: {}, revealed: false };
let couples = { index: 0 };
let draw = { strokes: [], drawerId: null, round: 0 };

const triviaQuestions = [
  {q:"Which tiny thing makes you feel most loved?", a:["A sweet text","A hug","Being remembered","A surprise"]},
  {q:"Pick a perfect two-hour date.", a:["Coffee + walk","Movie + snacks","Dinner + dessert","Stay in + games"]},
  {q:"Who is more likely to say 'let's just wing it'?", a:["Me","Them","Both","Neither"]},
  {q:"What would you choose for a spontaneous trip?", a:["Mountains","Beach","City","Cozy cabin"]}
];
const coupleQuestions = [
  "What is one little habit of mine you secretly love?",
  "What is a memory with me you would replay forever?",
  "What should we try together this month?",
  "What is one thing you think we are really good at as a team?",
  "If we had a free weekend anywhere, where would we go?",
  "What song feels a little bit like us?"
];

function showToast(text){ const el=$("#toast"); el.textContent=text; el.classList.add("show"); clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.remove("show"),2200); }
function openModal(id){ $(id).classList.remove("hidden"); }
function closeModal(id){ $(id).classList.add("hidden"); }
function randomCode(){ const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let out=""; for(let i=0;i<6;i++) out+=chars[Math.floor(Math.random()*chars.length)]; return out; }
function escapeHtml(str){ return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function setMood(mood){ document.body.dataset.mood=mood; $$(".mood").forEach(b=>b.classList.toggle("active",b.dataset.mood===mood)); }
function playerList(){ return [...players.values()].sort((a,b)=>a.joinedAt-b.joinedAt); }
function symbolFor(id){ const idx=playerList().findIndex(p=>p.id===id); return idx===0?"X":idx===1?"O":null; }
function nameForSymbol(s){ const list=playerList(); return s==="X"?(list[0]?.name||"Player 1"):(list[1]?.name||"Player 2"); }
function canPlayTtt(){ return playerList().length>=2&&!ttt.winner&&symbolFor(myId)===ttt.turn; }
function c4Color(id){ const idx=playerList().findIndex(p=>p.id===id); return idx===0?"R":idx===1?"Y":null; }
function canPlayC4(){ return playerList().length>=2&&!c4.winner&&c4Color(myId)===c4.turn; }

function ensureAudio(){
  if(!soundOn) return;
  try{ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==="suspended") audioCtx.resume(); }catch{}
}
function playSound(kind="move"){
  if(!soundOn) return;
  ensureAudio(); if(!audioCtx) return;
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator(); const gain=audioCtx.createGain();
  const freq=kind==="win"?740:kind==="tap"?420:560;
  osc.type="sine"; osc.frequency.setValueAtTime(freq,now); osc.frequency.exponentialRampToValueAtTime(freq*0.72,now+0.09);
  gain.gain.setValueAtTime(0.0001,now); gain.gain.exponentialRampToValueAtTime(0.08,now+0.008); gain.gain.exponentialRampToValueAtTime(0.0001,now+0.11);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now+0.12);
}
function setSound(on){ soundOn=on; sessionStorage.setItem("justUsSound",on?"on":"off"); updateSoundUI(); if(on){ensureAudio();playSound("tap");} }
function updateSoundUI(){ const b=$("#soundToggle"); if(!b)return; b.textContent=soundOn?"🔊 Sound on":"🔇 Sound off"; b.classList.toggle("active",soundOn); }
function broadcast(type,payload){ if(channel) channel.send({type:"broadcast",event:type,payload}).catch(()=>{}); }
function syncAll(){ broadcast("snapshot",{ttt,rps,c4,trivia,couples,draw}); }
function announceMove(){ playSound("move"); broadcast("sfx",{id:myId,kind:"move"}); }

function isVoiceInitiator(){ const ids=[myId,...playerList().map(p=>p.id)].sort(); return ids[0]===myId; }
function updateVoiceUI(){
  const join=$("#joinVoiceBtn"), mute=$("#muteVoiceBtn"), leave=$("#leaveVoiceBtn"), status=$("#voiceStatus");
  if(!join||!mute||!leave||!status)return;
  join.classList.toggle("hidden",voiceJoined); mute.classList.toggle("hidden",!voiceJoined); leave.classList.toggle("hidden",!voiceJoined);
  if(voiceJoined) status.textContent=voiceMuted?"You’re muted. Tap unmute whenever you’re ready.":"You’re in the call. Your person can hear you.";
  else status.textContent="Join the call when you’re ready. Your microphone stays off until you join.";
  mute.textContent=voiceMuted?"🎙️ Unmute":"🔇 Mute";
}
function closePeerConnection(){
  if(peerConnection){ peerConnection.onicecandidate=null; peerConnection.ontrack=null; peerConnection.onconnectionstatechange=null; peerConnection.close(); }
  peerConnection=null; pendingIceCandidates=[];
  const audio=$("#remoteAudio"); if(audio)audio.srcObject=null;
}
function stopVoiceLocal(){ if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;} }
function resetVoice(){voiceJoined=false;voiceMuted=false;closePeerConnection();stopVoiceLocal();updateVoiceUI();}
function createPeerConnection(){
  closePeerConnection();
  peerConnection=new RTCPeerConnection(voiceConfig);
  localStream?.getTracks().forEach(track=>peerConnection.addTrack(track,localStream));
  peerConnection.onicecandidate=e=>{if(e.candidate)broadcast("voice-ice",{id:myId,candidate:e.candidate});};
  peerConnection.ontrack=e=>{const audio=$("#remoteAudio");if(audio){audio.srcObject=e.streams[0];audio.play().catch(()=>{});}};
  peerConnection.onconnectionstatechange=()=>{
    if(!peerConnection)return;
    if(["failed","closed","disconnected"].includes(peerConnection.connectionState)) showToast("Voice call disconnected.");
  };
  return peerConnection;
}
async function makeVoiceOffer(){
  if(!voiceJoined||!isVoiceInitiator())return;
  const pc=createPeerConnection();
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  broadcast("voice-offer",{id:myId,offer:pc.localDescription});
}
async function joinVoice(){
  if(voiceJoined)return;
  if(!navigator.mediaDevices?.getUserMedia){showToast("Voice chat isn't supported in this browser.");return;}
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    voiceJoined=true; voiceMuted=false; updateVoiceUI(); ensureAudio();
    broadcast("voice-join",{id:myId});
    if(isVoiceInitiator()) await makeVoiceOffer();
    showToast("You joined the voice call 🎙️");
  }catch(err){
    resetVoice();
    showToast(err?.name==="NotAllowedError"?"Microphone permission was blocked. Allow it in Safari settings.":"Couldn’t access your microphone.");
  }
}
function toggleVoiceMute(){if(!localStream)return;voiceMuted=!voiceMuted;localStream.getAudioTracks().forEach(t=>t.enabled=!voiceMuted);updateVoiceUI();playSound("tap");broadcast("voice-mute",{id:myId,muted:voiceMuted});}
function leaveVoice(){if(!voiceJoined)return;broadcast("voice-leave",{id:myId});resetVoice();showToast("You left the voice call.");}

function renderPresence(){
  const list=playerList(); $("#presenceDot").classList.toggle("online",list.length>0);
  $("#presenceText").textContent=list.length>=2?`${list[0].name} & ${list[1].name} are here`:"Waiting for your person…";
  renderTtt(); renderRps(); renderC4(); renderTrivia(); renderCouples(); renderDraw();
}
function renderTtt(){
  const board=$("#tttBoard"); board.innerHTML="";
  ttt.board.forEach((v,i)=>{const b=document.createElement("button");b.className="ttt-cell";b.textContent=v;b.disabled=!!v||!canPlayTtt();b.addEventListener("click",()=>moveTtt(i));board.appendChild(b);});
  $("#tttTurn").textContent=playerList().length<2?"Waiting for your person…":ttt.winner==="draw"?"It's a draw.":ttt.winner?`${nameForSymbol(ttt.winner)} wins!`: `${nameForSymbol(ttt.turn)}'s turn`;
  $("#tttResult").textContent=ttt.winner==="draw"?"Cute. Nobody wins this round. 💗":ttt.winner?`Winner: ${nameForSymbol(ttt.winner)} ✨`:"";
}
function checkWinner(board){ const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for(const [a,b,c] of lines)if(board[a]&&board[a]===board[b]&&board[a]===board[c])return board[a]; return board.every(Boolean)?"draw":null; }
function moveTtt(i){ if(!canPlayTtt())return; ttt.board[i]=ttt.turn; ttt.winner=checkWinner(ttt.board); ttt.turn=ttt.turn==="X"?"O":"X"; renderTtt(); announceMove(); broadcast("game",{game:"ttt",state:ttt}); if(ttt.winner)broadcast("sfx",{id:myId,kind:"win"}); }
function resetTtt(){ ttt={board:Array(9).fill(""),turn:"X",winner:null}; renderTtt(); broadcast("game",{game:"ttt",state:ttt}); playSound("tap"); }

function renderRps(){ const count=Object.keys(rps.moves).length; $("#rpsStatus").textContent=count===0?"Choose your move.":count===1?"Waiting for your person…":"Both moves are in!"; $("#rpsResult").textContent=rps.result||""; }
function rpsWinner(a,b){if(a===b)return"draw";if((a==="rock"&&b==="scissors")||(a==="scissors"&&b==="paper")||(a==="paper"&&b==="rock"))return"first";return"second";}
function chooseRps(choice){ rps.moves[myId]=choice;rps.result="";announceMove();broadcast("game",{game:"rps",state:rps});renderRps();if(Object.keys(rps.moves).length>=2){const ids=Object.keys(rps.moves);const outcome=rpsWinner(rps.moves[ids[0]],rps.moves[ids[1]]);const text=outcome==="draw"?"It's a draw! 🤝":(outcome==="first"?ids[0]:ids[1])===myId?"You win! 🥳":"They win! 😘";rps.result=`${text} (${rps.moves[ids[0]]} vs ${rps.moves[ids[1]]})`;broadcast("game",{game:"rps",state:rps});renderRps();}}
function resetRps(){rps={moves:{},round:rps.round+1,result:""};renderRps();broadcast("game",{game:"rps",state:rps});playSound("tap");}

function renderC4(){ const board=$("#c4Board"); if(!board)return; board.innerHTML=""; c4.board.forEach((v,i)=>{const b=document.createElement("button");b.className="c4-cell";b.textContent=v==="R"?"🔴":v==="Y"?"🟡":"";b.disabled=!!v||!canPlayC4();b.addEventListener("click",()=>moveC4(i%7));board.appendChild(b);}); $("#c4Turn").textContent=playerList().length<2?"Waiting for your person…":c4.winner==="draw"?"It's a draw.":c4.winner?`${c4.winner==="R"?nameForSymbol("X"):nameForSymbol("O")} wins!`: `${c4.turn==="R"?nameForSymbol("X"):nameForSymbol("O")}'s turn`; }
function checkC4Winner(b){
  const dirs=[[1,0],[0,1],[1,1],[1,-1]];
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){const s=b[r*7+c];if(!s)continue;for(const [dr,dc] of dirs){let n=1;for(let k=1;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=6||cc<0||cc>=7||b[rr*7+cc]!==s)break;n++;}if(n>=4)return s;}}
  return b.every(Boolean)?"draw":null;
}
function moveC4(col){ if(!canPlayC4())return; for(let r=5;r>=0;r--){const i=r*7+col;if(!c4.board[i]){c4.board[i]=c4.turn;c4.winner=checkC4Winner(c4.board);c4.turn=c4.turn==="R"?"Y":"R";renderC4();announceMove();broadcast("game",{game:"c4",state:c4});if(c4.winner)broadcast("sfx",{id:myId,kind:"win"});return;}} }
function resetC4(){c4={board:Array(42).fill(""),turn:"R",winner:null};renderC4();broadcast("game",{game:"c4",state:c4});playSound("tap");}

function renderTrivia(){ const q=triviaQuestions[trivia.index%triviaQuestions.length]; $("#triviaQuestion").textContent=q.q; const wrap=$("#triviaChoices"); wrap.innerHTML=""; q.a.forEach((ans,i)=>{const b=document.createElement("button");b.className="answer-btn"+(trivia.answers[myId]===i?" selected":"");b.textContent=ans;b.addEventListener("click",()=>answerTrivia(i));wrap.appendChild(b);}); $("#triviaStatus").textContent=trivia.revealed?"Both answered — next question?":Object.keys(trivia.answers).length===1?"Your answer is in. Waiting for your person…":"Choose an answer."; }
function answerTrivia(i){trivia.answers[myId]=i;announceMove();if(Object.keys(trivia.answers).length>=2)trivia.revealed=true;broadcast("game",{game:"trivia",state:trivia});renderTrivia();}
function nextTrivia(){trivia={index:(trivia.index+1)%triviaQuestions.length,answers:{},revealed:false};broadcast("game",{game:"trivia",state:trivia});renderTrivia();playSound("tap");}

function renderCouples(){ $("#coupleQuestion").textContent=coupleQuestions[couples.index%coupleQuestions.length]; $("#coupleCount").textContent=`${(couples.index%coupleQuestions.length)+1} / ${coupleQuestions.length}`; }
function nextCouple(){couples={index:(couples.index+1)%coupleQuestions.length};broadcast("game",{game:"couples",state:couples});renderCouples();playSound("tap");}

function renderDraw(){ const canvas=$("#drawCanvas"); if(!canvas)return; clearCanvas(); $("#drawStatus").textContent=playerList().length<2?"Waiting for your person…":draw.drawerId===myId?"You're drawing ✏️ — they'll guess!":"Your person is drawing ✏️"; $("#clearDraw").disabled=draw.drawerId!==myId; draw.strokes.forEach(s=>drawStrokeCanvas(canvas,s)); }
function clearCanvas(){const c=$("#drawCanvas");const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);}
function drawStrokeCanvas(canvas,s){const ctx=canvas.getContext("2d");ctx.strokeStyle="#b86c80";ctx.lineWidth=4;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(s.x1*canvas.width,s.y1*canvas.height);ctx.lineTo(s.x2*canvas.width,s.y2*canvas.height);ctx.stroke();}
function initCanvas(){const canvas=$("#drawCanvas");if(!canvas)return;canvas.width=720;canvas.height=420;let drawing=false,last=null;const pos=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};canvas.addEventListener("pointerdown",e=>{if(draw.drawerId!==myId)return;ensureAudio();drawing=true;last=pos(e);canvas.setPointerCapture(e.pointerId);});canvas.addEventListener("pointermove",e=>{if(!drawing||draw.drawerId!==myId)return;const p=pos(e);const s={x1:last.x,y1:last.y,x2:p.x,y2:p.y};draw.strokes.push(s);drawStrokeCanvas(canvas,s);broadcast("draw",{stroke:s});last=p;});canvas.addEventListener("pointerup",()=>{drawing=false;last=null;});canvas.addEventListener("pointercancel",()=>{drawing=false;last=null;});}
function startDraw(){if(playerList().length<2)return;draw={strokes:[],drawerId:playerList()[0].id,round:draw.round+1};clearCanvas();broadcast("game",{game:"draw",state:draw});renderDraw();playSound("tap");}
function clearDraw(){if(draw.drawerId!==myId)return;draw.strokes=[];clearCanvas();broadcast("game",{game:"draw",state:draw});playSound("tap");}

function addMessage(name,text,mine=false){const wrap=$("#messages");const row=document.createElement("div");row.className="msg"+(mine?" mine":"");row.innerHTML=`<div class="msg-meta">${escapeHtml(name)}</div><div class="bubble">${escapeHtml(text)}</div>`;wrap.appendChild(row);wrap.scrollTop=wrap.scrollHeight;}
function sendChat(text){if(!text.trim())return;addMessage(myName,text.trim(),true);broadcast("chat",{id:myId,name:myName,text:text.trim()});playSound("tap");}

function setupChannel(){
  if(channel)channel.unsubscribe();
  channel=sb.channel(`just-us:${roomId}`,{config:{presence:{key:myId}}});
  channel.on("presence",{event:"sync"},()=>{const state=channel.presenceState();players.clear();Object.values(state).flat().forEach(p=>players.set(p.id,p));renderPresence();})
    .on("broadcast",{event:"chat"},({payload})=>{if(payload.id!==myId){addMessage(payload.name,payload.text,false);}})
    .on("broadcast",{event:"sfx"},({payload})=>{if(payload.id!==myId)playSound(payload.kind||"move");})
    .on("broadcast",{event:"draw"},({payload})=>{if(payload.stroke){draw.strokes.push(payload.stroke);drawStrokeCanvas($("#drawCanvas"),payload.stroke);}})
    .on("broadcast",{event:"snapshot"},({payload})=>{if(payload.id===myId)return;if(payload.ttt)ttt=payload.ttt;if(payload.rps)rps=payload.rps;if(payload.c4)c4=payload.c4;if(payload.trivia)trivia=payload.trivia;if(payload.couples)couples=payload.couples;if(payload.draw)draw=payload.draw;renderTtt();renderRps();renderC4();renderTrivia();renderCouples();renderDraw();})
    .on("broadcast",{event:"game"},({payload})=>{if(payload.game==="ttt")ttt=payload.state;if(payload.game==="rps")rps=payload.state;if(payload.game==="c4")c4=payload.state;if(payload.game==="trivia")trivia=payload.state;if(payload.game==="couples")couples=payload.state;if(payload.game==="draw"){draw=payload.state;clearCanvas();}renderTtt();renderRps();renderC4();renderTrivia();renderCouples();renderDraw();})
    .on("broadcast",{event:"hello"},({payload})=>{if(payload.id!==myId)broadcast("snapshot",{id:myId,ttt,rps,c4,trivia,couples,draw});})
    .on("broadcast",{event:"voice-join"},async ({payload})=>{if(payload.id===myId||!voiceJoined)return;if(isVoiceInitiator())await makeVoiceOffer();})
    .on("broadcast",{event:"voice-offer"},async ({payload})=>{
      if(payload.id===myId||!voiceJoined)return;
      try{const pc=createPeerConnection();await pc.setRemoteDescription(payload.offer);for(const c of pendingIceCandidates)await pc.addIceCandidate(c).catch(()=>{});pendingIceCandidates=[];const answer=await pc.createAnswer();await pc.setLocalDescription(answer);broadcast("voice-answer",{id:myId,answer:pc.localDescription});}
      catch{showToast("Couldn’t connect the voice call.");}
    })
    .on("broadcast",{event:"voice-answer"},async ({payload})=>{if(payload.id===myId||!peerConnection)return;try{await peerConnection.setRemoteDescription(payload.answer);for(const c of pendingIceCandidates)await peerConnection.addIceCandidate(c).catch(()=>{});pendingIceCandidates=[];}catch{}})
    .on("broadcast",{event:"voice-ice"},async ({payload})=>{
      if(payload.id===myId||!voiceJoined)return;
      try{if(peerConnection?.remoteDescription)await peerConnection.addIceCandidate(payload.candidate);else pendingIceCandidates.push(payload.candidate);}catch{}
    })
    .on("broadcast",{event:"voice-leave"},({payload})=>{if(payload.id!==myId){closePeerConnection();if(voiceJoined)showToast("Your person left the voice call.");}})
    .on("broadcast",{event:"voice-mute"},({payload})=>{if(payload.id!==myId&&payload.muted)showToast("Your person muted their mic.");else if(payload.id!==myId&&!payload.muted)showToast("Your person unmuted their mic.");})
    .subscribe(async status=>{if(status==="SUBSCRIBED"){await channel.track({id:myId,name:myName,joinedAt:Date.now()});broadcast("hello",{id:myId});}});
}

async function enterRoom(code){roomId=code.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);if(roomId.length!==6){showToast("That room code doesn't look right.");return;}history.replaceState({},"",`?room=${roomId}`);$("#roomCode").textContent=roomId;$("#homeView").classList.add("hidden");$("#roomView").classList.remove("hidden");closeModal("#nameModal");closeModal("#joinModal");setupChannel();}

$("#createRoomBtn").addEventListener("click",()=>{ensureAudio();if(!myName){sessionStorage.removeItem("justUsName");openModal("#nameModal");}else enterRoom(randomCode());});
$("#joinRoomBtn").addEventListener("click",()=>{$("#joinCodeInput").value=roomId||"";openModal("#joinModal");});
$("#closeModal").addEventListener("click",()=>closeModal("#nameModal"));
$("#closeJoinModal").addEventListener("click",()=>closeModal("#joinModal"));
$("#nameForm").addEventListener("submit",e=>{e.preventDefault();myName=$("#nameInput").value.trim().slice(0,24);if(!myName)return;sessionStorage.setItem("justUsName",myName);const pending=roomId||sessionStorage.getItem("pendingRoom");sessionStorage.removeItem("pendingRoom");enterRoom(pending||randomCode());});
$("#joinForm").addEventListener("submit",e=>{e.preventDefault();const code=$("#joinCodeInput").value.trim();if(!myName){sessionStorage.setItem("pendingRoom",code.toUpperCase());closeModal("#joinModal");openModal("#nameModal");}else enterRoom(code);});
$("#leaveRoomBtn").addEventListener("click",()=>{if(voiceJoined)broadcast("voice-leave",{id:myId});resetVoice();channel?.unsubscribe();channel=null;players.clear();history.replaceState({},"",location.pathname);$("#roomView").classList.add("hidden");$("#homeView").classList.remove("hidden");showToast("You left the room.");});
$("#copyLinkBtn").addEventListener("click",async()=>{const link=location.href;try{await navigator.clipboard.writeText(link);showToast("Invite link copied 💗");}catch{showToast(link);}});
$("#chatForm").addEventListener("submit",e=>{e.preventDefault();const input=$("#chatInput");sendChat(input.value);input.value="";input.focus();});
$("#tttReset").addEventListener("click",resetTtt);$("#rpsReset").addEventListener("click",resetRps);$("#c4Reset").addEventListener("click",resetC4);$("#triviaNext").addEventListener("click",nextTrivia);$("#coupleNext").addEventListener("click",nextCouple);$("#drawStart").addEventListener("click",startDraw);$("#clearDraw").addEventListener("click",clearDraw);
$$(".choice").forEach(b=>b.addEventListener("click",()=>chooseRps(b.dataset.choice)));
$$('.game-tab').forEach(b=>b.addEventListener("click",()=>{ensureAudio();currentGame=b.dataset.game;$$('.game-tab').forEach(x=>x.classList.toggle('active',x===b));$$('.game-box').forEach(x=>x.classList.add('hidden'));$(`#${currentGame}Game`).classList.remove('hidden');if(currentGame==='draw')renderDraw();}));
$("#gamesNav").addEventListener("click",()=>$("#gamesPanel")?.scrollIntoView({behavior:"smooth"}));
$("#soundToggle").addEventListener("click",()=>setSound(!soundOn));
$("#joinVoiceBtn").addEventListener("click",joinVoice);
$("#muteVoiceBtn").addEventListener("click",toggleVoiceMute);
$("#leaveVoiceBtn").addEventListener("click",leaveVoice);
$$('.mood').forEach(b=>b.addEventListener('click',()=>setMood(b.dataset.mood)));
window.addEventListener('pointerdown',ensureAudio,{once:true});window.addEventListener('beforeunload',()=>{if(voiceJoined)broadcast("voice-leave",{id:myId});resetVoice();channel?.unsubscribe();});
setMood("rose");updateSoundUI();initCanvas();
if(roomId){if(!myName){openModal("#nameModal");}else enterRoom(roomId);}renderTtt();renderRps();renderC4();renderTrivia();renderCouples();renderDraw();
