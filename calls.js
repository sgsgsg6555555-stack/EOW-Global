// EOW one-to-one WebRTC calls. TURN credentials are intentionally not embedded in the client.
const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"] }, ...(window.EOW_TURN_SERVERS || [])];
const style = `
#eowCallLayer{position:fixed;inset:0;z-index:9999;background:#0b1220cc;display:grid;place-items:center;padding:16px}
#eowCallLayer[hidden]{display:none}
.eow-call-card{width:min(680px,100%);background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 80px #0005}
.eow-call-card h2{margin:0 0 8px}.eow-call-muted{color:#64748b;font-size:13px}
.eow-call-media{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}
.eow-call-media video{width:100%;min-height:150px;max-height:320px;object-fit:cover;background:#0f172a;border-radius:12px}
.eow-call-actions{display:flex;gap:8px;flex-wrap:wrap}
.eow-call-actions button{border:0;border-radius:10px;padding:10px 14px;background:#2563eb;color:white;cursor:pointer}
.eow-call-actions button.secondary{background:#eaf0ff;color:#1d4ed8}
.eow-call-actions button.danger{background:#dc2626;color:white}
.eow-call-actions button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:520px){.eow-call-media{grid-template-columns:1fr}.eow-call-media video{max-height:220px}}
`;

export async function initCallUI(user, supabase, onIncoming = null) {
  if (window.eowCalls) return window.eowCalls;
  if (!user || !supabase) return null;
  if (!document.getElementById("eowCallStyle")) {
    const s=document.createElement("style");s.id="eowCallStyle";s.textContent=style;document.head.append(s);
  }
  const root=document.createElement("div");
  root.id="eowCallLayer";root.hidden=true;
  root.innerHTML=`<section class="eow-call-card" role="dialog" aria-modal="true" aria-labelledby="eowCallTitle">
    <h2 id="eowCallTitle">EOW 通话</h2><p id="eowCallStatus" class="eow-call-muted">正在连接…</p>
    <div class="eow-call-media"><video id="eowRemoteVideo" autoplay playsinline></video><video id="eowLocalVideo" autoplay muted playsinline></video></div>
    <audio id="eowRemoteAudio" autoplay></audio>
    <div class="eow-call-actions">
      <button id="eowAcceptCall">接听</button><button id="eowRejectCall" class="secondary">拒绝</button>
      <button id="eowMuteCall" class="secondary" hidden>静音</button><button id="eowCameraCall" class="secondary" hidden>关闭摄像头</button><button id="eowSwitchCamera" class="secondary" hidden>切换摄像头</button>
      <button id="eowEndCall" class="danger" hidden>挂断</button>
    </div>
  </section>`;
  document.body.append(root);
  const $=id=>root.querySelector("#"+id);
  const status=$("eowCallStatus"),remoteVideo=$("eowRemoteVideo"),localVideo=$("eowLocalVideo"),remoteAudio=$("eowRemoteAudio");
  let current=null,signalChannel=null,pc=null,localStream=null,remoteStream=null,remoteCandidates=[],ringTimer=null,muted=false,cameraOff=false,cameraFacing="user";
  const setStatus=t=>{status.textContent=t;};
  const show=(title,message)=>{root.hidden=false;$("eowCallTitle").textContent=title;setStatus(message);};
  const send=async(signalType,payload={})=>{
    if(!current)throw new Error("当前没有通话");
    const {error}=await supabase.from("eow_call_signals").insert({call_id:current.id,sender_id:user.id,receiver_id:current.peerId,signal_type:signalType,payload});
    if(error)throw error;
  };
  const closeMedia=()=>{
    if(pc){pc.ontrack=null;pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close();pc=null;}
    if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
    remoteStream=null;remoteCandidates=[];remoteVideo.srcObject=null;remoteAudio.srcObject=null;localVideo.srcObject=null;remoteVideo.hidden=false;localVideo.hidden=false;
    muted=false;cameraOff=false;cameraFacing="user";$("eowMuteCall").textContent="静音";$("eowCameraCall").textContent="关闭摄像头";
  };
  const cleanup=async()=>{
    if(ringTimer)clearTimeout(ringTimer);ringTimer=null;
    if(signalChannel){const old=signalChannel;signalChannel=null;await supabase.removeChannel(old);}
    closeMedia();current=null;root.hidden=true;
    $("eowAcceptCall").hidden=false;$("eowRejectCall").hidden=false;
    $("eowMuteCall").hidden=true;$("eowCameraCall").hidden=true;$("eowSwitchCamera").hidden=true;$("eowEndCall").hidden=true;
  };
  const ensureMedia=async(type)=>{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("当前浏览器不支持音视频通话，请使用 HTTPS 页面和较新的浏览器");
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==="video"});
    localVideo.srcObject=localStream;localVideo.hidden=type!=="video";remoteVideo.hidden=type!=="video";
    $("eowMuteCall").hidden=false;$("eowCameraCall").hidden=type!=="video";$("eowSwitchCamera").hidden=type!=="video";$("eowEndCall").hidden=false;
    $("eowAcceptCall").hidden=true;$("eowRejectCall").hidden=true;
  };
  const createPeer=()=>{
    pc=new RTCPeerConnection({iceServers:ICE_SERVERS});
    remoteStream=new MediaStream();remoteVideo.srcObject=remoteStream;remoteAudio.srcObject=remoteStream;
    for(const track of localStream.getTracks())pc.addTrack(track,localStream);
    pc.ontrack=e=>{for(const track of e.streams[0]?.getTracks()||[e.track])remoteStream.addTrack(track);};
    pc.onicecandidate=e=>{if(e.candidate)send("ice",{candidate:e.candidate.toJSON()}).catch(err=>setStatus(err.message));};
    pc.onconnectionstatechange=()=>{
      if(!pc)return;
      if(pc.connectionState==="connected")setStatus("已连接 · 通话中");
      if(["failed","disconnected"].includes(pc.connectionState))setStatus("网络连接中断，正在尝试恢复…");
    };
    return pc;
  };
  const subscribeCall=async(callId)=>{
    signalChannel=supabase.channel("eow-call-signals:"+callId);
    signalChannel.on("postgres_changes",{event:"INSERT",schema:"public",table:"eow_call_signals",filter:"call_id=eq."+callId},async({new:row})=>{
      const payload={...(row?.payload||{}),event:row?.signal_type,sender_id:row?.sender_id};
      if(!current||payload?.sender_id===user.id)return;
      try{
        if(payload.event==="ready"&&current.role==="caller"){
          if(ringTimer)clearTimeout(ringTimer);ringTimer=null;
          const offer=await pc.createOffer();await pc.setLocalDescription(offer);await send("offer",{description:pc.localDescription});
        }else if(payload.event==="offer"&&current.role==="callee"){
          await pc.setRemoteDescription(payload.description);
          for(const candidate of remoteCandidates.splice(0))await pc.addIceCandidate(candidate);
          const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await send("answer",{description:pc.localDescription});
        }else if(payload.event==="answer"&&current.role==="caller"){
          await pc.setRemoteDescription(payload.description);
          for(const candidate of remoteCandidates.splice(0))await pc.addIceCandidate(candidate);
        }else if(payload.event==="ice"&&payload.candidate){
          const candidate=new RTCIceCandidate(payload.candidate);
          if(pc?.remoteDescription)await pc.addIceCandidate(candidate);else remoteCandidates.push(candidate);
        }else if(payload.event==="hangup"||payload.event==="reject"){
          setStatus(payload.event==="reject"?"对方已拒绝":"对方已结束通话");await cleanup();
        }
      }catch(err){setStatus("通话连接失败："+(err?.message||"未知错误"));}
    });
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("通话信令连接超时")),12000);
      channel.subscribe(state=>{if(state==="SUBSCRIBED"){clearTimeout(timer);resolve(state);}else if(state==="CHANNEL_ERROR"||state==="TIMED_OUT"){clearTimeout(timer);reject(new Error("无法建立安全通话频道，请检查 Supabase Realtime 策略"));}});
    });
    return result;
  };
  const startCall=async(peerId,type="audio")=>{
    if(current)throw new Error("当前已有通话");
    if(!peerId||peerId===user.id)throw new Error("通话对象无效");
    show(type==="video"?"视频通话":"语音通话","正在验证好友关系…");
    try{
      const {data:callId,error}=await supabase.rpc("eow_start_call",{p_callee_id:peerId,p_call_type:type});
      if(error)throw error;
      current={id:callId,peerId,type,role:"caller"};
      await ensureMedia(type);
      setStatus("正在呼叫对方…");
      await subscribeCall(callId);
      pc=createPeer();
      await send("ringing",{call_type:type});
      ringTimer=setTimeout(async()=>{if(current?.id===callId){try{await supabase.rpc("eow_end_call",{p_call_id:callId,p_reason:"missed"});}catch{}await cleanup();}},45000);
    }catch(err){if(current?.id){try{await supabase.rpc("eow_end_call",{p_call_id:current.id,p_reason:"failed"});}catch{}}await cleanup();throw err;}
  };
  const acceptCall=async()=>{
    if(!current||current.role!=="callee")return;
    const call=current;
    if(ringTimer)clearTimeout(ringTimer);ringTimer=null;
    try{
      await ensureMedia(call.type);
      const {error}=await supabase.rpc("eow_respond_call",{p_call_id:call.id,p_response:"accepted"});
      if(error)throw error;
      pc=createPeer();setStatus("已接听，正在建立连接…");
      await send("ready");
    }catch(err){setStatus("接听失败："+(err?.message||"未知错误"));try{await supabase.rpc("eow_end_call",{p_call_id:call.id,p_reason:"failed"});}catch{}await cleanup();}
  };
  const rejectCall=async()=>{
    if(!current)return;
    const call=current;
    try{await supabase.rpc("eow_respond_call",{p_call_id:call.id,p_response:"rejected"});await send("reject");}catch{}
    await cleanup();
  };
  const endCall=async()=>{
    if(!current)return;
    const call=current;
    try{await send("hangup");}catch{}
    try{await supabase.rpc("eow_end_call",{p_call_id:call.id,p_reason:"hangup"});}catch{}
    await cleanup();
  };
  $("eowAcceptCall").onclick=acceptCall;$("eowRejectCall").onclick=rejectCall;$("eowEndCall").onclick=endCall;
  $("eowMuteCall").onclick=()=>{muted=!muted;for(const t of localStream?.getAudioTracks()||[])t.enabled=!muted;$("eowMuteCall").textContent=muted?"取消静音":"静音";};
  $("eowCameraCall").onclick=()=>{cameraOff=!cameraOff;for(const t of localStream?.getVideoTracks()||[])t.enabled=!cameraOff;$("eowCameraCall").textContent=cameraOff?"开启摄像头":"关闭摄像头";};
  $("eowSwitchCamera").onclick=async()=>{try{const nextFacing=cameraFacing==="user"?"environment":"user";const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:nextFacing}},audio:false});const track=next.getVideoTracks()[0];const sender=pc?.getSenders().find(s=>s.track?.kind==="video");if(!track||!sender)throw new Error("当前通话无法切换摄像头");await sender.replaceTrack(track);const old=localStream.getVideoTracks()[0];if(old){localStream.removeTrack(old);old.stop();}localStream.addTrack(track);localVideo.srcObject=localStream;cameraFacing=nextFacing;cameraOff=false;$("eowCameraCall").textContent="关闭摄像头";}catch(err){setStatus("切换摄像头失败："+err.message);}};

  const incoming=async(call)=>{
    if(current||call.caller_id===user.id)return;
    current={id:call.id,peerId:call.caller_id,type:call.call_type,role:"callee"};
    try{
      await subscribeCall(call.id);
      show(call.call_type==="video"?"视频来电":"语音来电","好友来电 · "+(call.call_type==="video"?"视频通话":"语音通话"));\n      if(onIncoming)onIncoming(call.caller_id);
      $("eowAcceptCall").hidden=false;$("eowRejectCall").hidden=false;
      $("eowMuteCall").hidden=true;$("eowCameraCall").hidden=true;$("eowSwitchCamera").hidden=true;$("eowEndCall").hidden=true;
      ringTimer=setTimeout(async()=>{if(current?.id===call.id){try{await supabase.rpc("eow_expire_incoming_calls");}catch{}await cleanup();}},45000);
    }catch(err){setStatus("无法接收来电："+err.message);await cleanup();}
  };
  const inbound=supabase.channel("eow-incoming-calls:"+user.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"eow_calls",filter:"callee_id=eq."+user.id},payload=>incoming(payload.new))
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"eow_calls",filter:"callee_id=eq."+user.id},payload=>{if(current?.id===payload.new.id&&!["ringing","accepted"].includes(payload.new.status)){setStatus("来电已结束");cleanup();}})
    .subscribe();
  try{
    await supabase.rpc("eow_expire_incoming_calls");
    const {data}=await supabase.from("eow_calls").select("id,caller_id,call_type,created_at").eq("callee_id",user.id).eq("status","ringing").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(data)await incoming(data);
  }catch(err){console.warn("来电监听初始化失败",err);}
  window.addEventListener("beforeunload",()=>{if(inbound)supabase.removeChannel(inbound);if(signalChannel)supabase.removeChannel(signalChannel);closeMedia();});
  window.eowCalls={startCall};
  return window.eowCalls;
}
