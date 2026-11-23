import {supabase,$,initShell,avatarHTML,displayName,esc} from "./shared.js?v=4";
const shell=await initShell("discover");
if(shell){
 let users=[], relations=[];
 const params=new URLSearchParams(location.search); $("#searchUsers").value=params.get("q")||"";
 async function load(){
  $("#status").textContent="正在加载成员…";
  const [u,r]=await Promise.all([
   supabase.from("profiles").select("id,username,display_name,avatar_url,bio,created_at").neq("id",shell.user.id).order("created_at",{ascending:false}).limit(150),
   supabase.from("friendships").select("id,requester_id,addressee_id,status").or(`requester_id.eq.${shell.user.id},addressee_id.eq.${shell.user.id}`)
  ]);
  if(u.error){$("#status").textContent="读取用户失败："+u.error.message;return;}
  if(r.error){$("#status").textContent="好友关系读取失败："+r.error.message;return;}
  users=u.data||[];relations=r.data||[];render();
 }
 function relationFor(id){return relations.find(x=>(x.requester_id===shell.user.id&&x.addressee_id===id)||(x.requester_id===id&&x.addressee_id===shell.user.id));}
 function actionMarkup(u){const r=relationFor(u.id);if(!r)return `<button class="btn small" data-action="request" data-id="${esc(u.id)}">＋ 添加好友</button>`;
  if(r.status==="accepted")return `<span class="badge">已是好友</span><a class="btn secondary small" href="messages.html?user=${encodeURIComponent(u.id)}">发消息</a>`;
  if(r.requester_id===shell.user.id)return `<button class="btn secondary small" data-action="cancel" data-id="${esc(u.id)}">已发送申请 · 撤回</button>`;
  return `<button class="btn small" data-action="accept" data-id="${esc(u.id)}">接受申请</button>`;
 }
 function render(){const q=$("#searchUsers").value.trim().toLowerCase();const rows=users.filter(u=>(u.display_name||"").toLowerCase().includes(q)||(u.username||"").toLowerCase().includes(q));$("#status").textContent=`找到 ${rows.length} 位成员`;
  $("#users").innerHTML=rows.map(u=>`<article class="user-card">${avatarHTML(u)}<h3>${esc(displayName(u))}</h3><div class="muted">@${esc(u.username||"eow-user")}</div><p class="bio">${esc(u.bio||"这个用户还没有填写个人介绍。")}</p><div class="card-actions"><a class="btn secondary small" href="profile.html?id=${encodeURIComponent(u.id)}">查看主页</a>${actionMarkup(u)}</div></article>`).join("")||'<div class="empty">没有找到匹配的用户。</div>';}
 $("#searchUsers").addEventListener("input",render);$("#refreshUsers").addEventListener("click",load);
 $("#users").addEventListener("click",async e=>{const b=e.target.closest("button[data-action]");if(!b)return;const id=b.dataset.id,act=b.dataset.action;b.disabled=true;let result;
  if(act==="request"){result=await supabase.from("friendships").insert({requester_id:shell.user.id,addressee_id:id,status:"pending",created_at:new Date().toISOString()});}
  else {const r=relationFor(id);if(!r)return;if(act==="accept")result=await supabase.from("friendships").update({status:"accepted"}).eq("id",r.id).eq("addressee_id",shell.user.id);else result=await supabase.from("friendships").delete().eq("id",r.id).eq("requester_id",shell.user.id);}
  if(result?.error)alert("操作失败："+result.error.message);await load();
 });
 await load();
}

