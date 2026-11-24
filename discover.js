import {supabase,$,initShell,avatarHTML,displayName,esc} from "./shared.js?v=8";
const shell=await initShell("discover");
if(shell){
 let users=[],relations=[],following=new Set(),myProfile={};
 const params=new URLSearchParams(location.search);$("#searchUsers").value=params.get("q")||"";
 async function load(){
  $("#status").textContent="正在加载成员…";
  const [u,r,f,me]=await Promise.all([
   supabase.from("profiles").select("id,username,display_name,avatar_url,bio,created_at,country_code,preferred_language,interests").neq("id",shell.user.id).order("created_at",{ascending:false}).limit(150),
   supabase.from("friendships").select("id,requester_id,addressee_id,status").or(`requester_id.eq.${shell.user.id},addressee_id.eq.${shell.user.id}`),
   supabase.from("follows").select("following_id").eq("follower_id",shell.user.id),
   supabase.from("profiles").select("country_code,preferred_language,interests").eq("id",shell.user.id).maybeSingle()
  ]);
  if(u.error && /country_code|preferred_language|interests|column/i.test(u.error.message||"")){const fallback=await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,created_at").neq("id",shell.user.id).order("created_at",{ascending:false}).limit(150);u.data=fallback.data;u.error=fallback.error;}if(u.error){$("#status").textContent="读取用户失败："+u.error.message;return;}
  if(r.error){$("#status").textContent="好友关系读取失败："+r.error.message;return;}
  if(f.error){$("#status").textContent="关注关系读取失败："+f.error.message;return;}
  users=u.data||[];relations=r.data||[];following=new Set((f.data||[]).map(x=>x.following_id));myProfile=me.data||{};if(me.error)myProfile={};render();
 }
 function relationFor(id){return relations.find(x=>(x.requester_id===shell.user.id&&x.addressee_id===id)||(x.requester_id===id&&x.addressee_id===shell.user.id));}
 function actionMarkup(u){
  const r=relationFor(u.id);
  const friend=!r?'<button class="btn small" data-action="request" data-id="'+esc(u.id)+'">＋ 添加好友</button>':r.status==="accepted"?'<span class="badge">已是好友</span><a class="btn secondary small" href="messages.html?user='+encodeURIComponent(u.id)+'">发消息</a>':r.requester_id===shell.user.id?'<button class="btn secondary small" data-action="cancel" data-id="'+esc(u.id)+'">已发送申请 · 撤回</button>':'<button class="btn small" data-action="accept" data-id="'+esc(u.id)+'">接受申请</button>';
  const followed=following.has(u.id);
  return friend+`<button class="btn ghost small" data-action="follow" data-id="${esc(u.id)}" aria-pressed="${followed}">${followed?"已关注":"关注"}</button>`;
 }
 function recommendationScore(u){let score=0;if(myProfile.country_code&&u.country_code===myProfile.country_code)score+=3;if(myProfile.preferred_language&&u.preferred_language===myProfile.preferred_language)score+=2;const mine=myProfile.interests||[];score+=(u.interests||[]).filter(x=>mine.includes(x)).length*2;return score;}
 function render(){
  const q=$("#searchUsers").value.trim().toLowerCase();
  const rows=users.filter(u=>(u.display_name||"").toLowerCase().includes(q)||(u.username||"").toLowerCase().includes(q)||(u.country_code||"").toLowerCase().includes(q)||(u.interests||[]).some(t=>t.toLowerCase().includes(q))).sort((a,b)=>recommendationScore(b)-recommendationScore(a));
  $("#status").textContent=`找到 ${rows.length} 位成员`;
  $("#users").innerHTML=rows.map(u=>`<article class="user-card">${avatarHTML(u)}<h3>${esc(displayName(u))}</h3><div class="muted">@${esc(u.username||"eow-user")}</div><div class="member-tags">${u.country_code?`<span class="member-tag">⌖ ${esc(u.country_code)}</span>`:""}${u.preferred_language?`<span class="member-tag">文 ${esc(u.preferred_language)}</span>`:""}${(u.interests||[]).slice(0,2).map(t=>`<span class="member-tag">${esc(t)}</span>`).join("")}</div><p class="bio">${esc(u.bio||"这个用户还没有填写个人介绍。")}</p><div class="card-actions"><a class="btn secondary small" href="profile.html?id=${encodeURIComponent(u.id)}">查看主页</a>${actionMarkup(u)}</div></article>`).join("")||'<div class="empty">没有找到匹配的用户。</div>';
 }
 $("#searchUsers").addEventListener("input",render);$("#refreshUsers").addEventListener("click",load);
 $("#users").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-action]");if(!b)return;
  const id=b.dataset.id,act=b.dataset.action;b.disabled=true;let result;
  try{
   if(act==="request")result=await supabase.from("friendships").insert({requester_id:shell.user.id,addressee_id:id,status:"pending",created_at:new Date().toISOString()});
   else if(act==="follow"){
    if(following.has(id))result=await supabase.from("follows").delete().eq("follower_id",shell.user.id).eq("following_id",id);
    else result=await supabase.from("follows").insert({follower_id:shell.user.id,following_id:id,created_at:new Date().toISOString()});
   }else{
    const rel=relationFor(id);if(!rel)return;
    if(act==="accept")result=await supabase.from("friendships").update({status:"accepted"}).eq("id",rel.id).eq("addressee_id",shell.user.id);
    else result=await supabase.from("friendships").delete().eq("id",rel.id).eq("requester_id",shell.user.id);
   }
   if(result?.error)throw result.error;
   await load();
  }catch(error){alert("操作失败："+(error.message||error));b.disabled=false;}
 });
 await load();
}
