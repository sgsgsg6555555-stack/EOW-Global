
const esc=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const displayName=profile=>profile?.display_name||profile?.username||"EOW 用户";
const avatarHTML=profile=>profile?.avatar_url?'<img class="avatar" src="'+esc(profile.avatar_url)+'" alt="头像">' : '<span class="avatar avatar-fallback">E</span>';

const noticeStyle = `
#eowMessageNoticeRoot{position:fixed;right:24px;bottom:24px;z-index:8000;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}
.eow-message-toast{pointer-events:auto;width:min(360px,calc(100vw - 32px));display:flex;align-items:flex-start;gap:11px;padding:13px 14px;background:#fff;border:1px solid #e7eaf5;border-radius:16px;box-shadow:0 16px 48px #26345b26;cursor:pointer;animation:eowToastIn .2s ease-out}
.eow-message-toast:hover{transform:translateY(-2px);box-shadow:0 20px 54px #26345b32}
.eow-message-toast .avatar{width:42px;height:42px;flex:0 0 42px;border-radius:50%;object-fit:cover}
.eow-message-toast .eow-toast-copy{min-width:0;flex:1}
.eow-message-toast strong{display:block;color:#1d2945;font-size:13px;margin:1px 0 4px}
.eow-message-toast p{margin:0;color:#65718d;font-size:13px;line-height:1.45;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.eow-message-toast small{display:block;color:#98a1b5;font-size:11px;margin-top:5px}
.eow-message-toast .eow-toast-close{border:0;background:transparent;color:#9aa3b6;font-size:18px;cursor:pointer;padding:0 2px;line-height:1}
#eowMessageLauncher{pointer-events:auto;width:54px;height:54px;border:0;border-radius:50%;background:linear-gradient(135deg,#6258e8,#3989f5);color:#fff;font-size:21px;box-shadow:0 10px 28px #465fd34d;cursor:pointer;position:relative}
#eowMessageLauncher span{position:absolute;right:-4px;top:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center;border:2px solid #fff}
@keyframes eowToastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:600px){#eowMessageNoticeRoot{right:12px;bottom:12px}.eow-message-toast{width:min(340px,calc(100vw - 24px))}}
`;

export async function initGlobalMessageNotices(user,supabase){
 if(!user||window.eowMessageNoticeChannel)return;
 if(!document.getElementById("eowMessageNoticeStyle")){const style=document.createElement("style");style.id="eowMessageNoticeStyle";style.textContent=noticeStyle;document.head.append(style);}
 let root=document.getElementById("eowMessageNoticeRoot");
 if(!root){root=document.createElement("div");root.id="eowMessageNoticeRoot";root.setAttribute("aria-live","polite");root.setAttribute("aria-relevant","additions");document.body.append(root);}
 let unread=0;
 const launcher=document.createElement("button");launcher.id="eowMessageLauncher";launcher.type="button";launcher.setAttribute("aria-label","打开私信");launcher.innerHTML='✉<span hidden>0</span>';launcher.addEventListener("click",()=>{location.href="messages.html";});root.append(launcher);
 const badge=launcher.querySelector("span");
 const notify=async(message)=>{
  if(!message||message.sender_id===user.id)return;
  let profile={};try{const {data}=await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id",message.sender_id).maybeSingle();profile=data||{};}catch(e){console.warn("无法读取消息发送者资料",e);}
  unread+=1;badge.hidden=false;badge.textContent=unread>99?"99+":String(unread);
  const card=document.createElement("article");card.className="eow-message-toast";card.setAttribute("role","button");card.tabIndex=0;
  card.innerHTML=`${avatarHTML(profile)}<div class="eow-toast-copy"><strong>${esc(displayName(profile))} 给你发来新消息</strong><p>${esc(message.content||"你收到一条新消息")}</p><small>${new Date(message.created_at||Date.now()).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})} · 点击回复</small></div><button class="eow-toast-close" type="button" aria-label="关闭提醒">×</button>`;
  const go=()=>{location.href="messages.html?user="+encodeURIComponent(message.sender_id);};
  card.addEventListener("click",e=>{if(!e.target.closest(".eow-toast-close"))go();});
  card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go();}});
  card.querySelector(".eow-toast-close").addEventListener("click",e=>{e.stopPropagation();card.remove();});
  root.insertBefore(card,launcher);
  while(root.querySelectorAll(".eow-message-toast").length>4)root.querySelector(".eow-message-toast")?.remove();
  if(document.hidden&&"Notification" in window&&Notification.permission==="granted"){
   try{const n=new Notification(displayName(profile),{body:message.content||"你收到一条新消息",icon:profile.avatar_url||undefined,tag:"eow-message-"+message.id});n.onclick=go;}catch{}
  }
 };
 const channel=supabase.channel("eow-message-notices:"+user.id)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"receiver_id=eq."+user.id},payload=>notify(payload.new))
  .subscribe(state=>{if(state==="CHANNEL_ERROR"||state==="TIMED_OUT")console.warn("EOW 消息提醒 Realtime 连接失败");});
 window.eowMessageNoticeChannel=channel;
 window.addEventListener("beforeunload",()=>{if(window.eowMessageNoticeChannel){supabase.removeChannel(window.eowMessageNoticeChannel);window.eowMessageNoticeChannel=null;}});
}
