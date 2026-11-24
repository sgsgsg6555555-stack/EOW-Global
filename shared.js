import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { initCallUI } from "./calls.js?v=4";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => [...root.querySelectorAll(s)];
export const esc = (v="") => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const displayName = p => p?.display_name || p?.username || (document.documentElement.lang==="en"?"EOW user":"EOW 用户");
export const verifiedBadgeHTML = p => p?.is_verified ? `<span class="verified-badge" title="${document.documentElement.lang==="en"?"Verified account":"已认证账号"}" aria-label="${document.documentElement.lang==="en"?"Verified account":"已认证账号"}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="verified-badge-shape" d="M12 1.15c.95 0 1.63 1.65 2.53 1.92.91.27 2.5-.66 3.28-.12.78.54.52 2.34 1.18 3 .66.66 2.46.4 3 1.18.54.78-.39 2.37-.12 3.28.27.9 1.92 1.58 1.92 2.53s-1.65 1.63-1.92 2.53c-.27.91.66 2.5.12 3.28-.54.78-2.34.52-3 1.18-.66.66-.4 2.46-1.18 3-.78.54-2.37-.39-3.28-.12-.9.27-1.58 1.92-2.53 1.92s-1.63-1.65-2.53-1.92c-.91-.27-2.5.66-3.28.12-.78-.54-.52-2.34-1.18-3-.66-.66-2.46-.4-3-1.18-.54-.78.39-2.37.12-3.28C1.86 13.63.21 12.95.21 12s1.65-1.63 1.92-2.53c.27-.91-.66-2.5-.12-3.28.54-.78 2.34-.52 3-1.18.66-.66.4-2.46 1.18-3 .78-.54 2.37.39 3.28.12C10.37 2.8 11.05 1.15 12 1.15Z"/><path class="verified-badge-check" d="m7.1 12.25 3.15 3.1 6.75-6.85"/></svg></span>` : "";
export const avatarHTML = (p, cls="avatar") => p?.avatar_url
  ? `<img class="${cls}" src="${esc(p.avatar_url)}" alt="头像" loading="lazy" onerror="this.style.display='none'">`
  : `<span class="${cls} avatar-fallback" aria-label="默认头像">E</span>`;
export async function currentUser(){const {data,error}=await supabase.auth.getUser();if(error)throw error;return data.user;}
export async function requireUser(){const user=await currentUser();if(!user){location.href="login.html?next="+encodeURIComponent(location.pathname+location.search);return null;}return user;}
export async function myProfile(user){const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();if(error)throw error;return data;}
export async function ensureProfile(user){let p=await myProfile(user);if(!p){const fallback=(user.email||"eowuser").split("@")[0];const {data,error}=await supabase.from("profiles").insert({id:user.id,username:fallback,display_name:fallback}).select().single();if(error && error.code!=="23505")throw error;p=await myProfile(user);}return p;}
export async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error;location.href="login.html";}
export function setNotice(el,msg,type=""){if(!el)return;el.className="notice"+(type?" "+type:"");el.textContent=msg;el.hidden=!msg;}
export async function getProfiles(ids){const unique=[...new Set((ids||[]).filter(Boolean))];if(!unique.length)return {};const {data,error}=await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,created_at,cover_url,is_verified").in("id",unique);if(error)throw error;return Object.fromEntries((data||[]).map(p=>[p.id,p]));}
export function navMarkup(active="home", profile=null){const items=[["home","⌂","首页","feed.html"],["discover","⌕","发现","discover.html"],["friends","♧","好友","friends.html"],["messages","✉","私信","messages.html"],["notifications","◉","通知","notifications.html"],["communities","▦","社区","communities.html"],["videos","▶","视频","videos.html"],["profile","◎","个人主页","profile.html"],["wallet","◇","钱包礼物","wallet.html"]];return `<div class="side-user">${avatarHTML(profile)}<div><strong>${esc(displayName(profile))} ${verifiedBadgeHTML(profile)}</strong><small>我的 EOW 账号</small></div></div>${items.map(([id,icon,label,url])=>`<a class="navlink ${active===id?"active":""}" href="${url}"><span class="navicon">${icon}</span>${label}</a>`).join("")}<a class="navlink" href="#" id="logoutLink"><span class="navicon">↪</span>退出登录</a>`;}
export async function trackActivity(eventType){
 try{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const params=new URLSearchParams(location.search);
  const rawSource=params.get("utm_source");
  let referrerDomain="";
  try{if(document.referrer)referrerDomain=new URL(document.referrer).hostname.slice(0,120);}catch{}
  const source=(rawSource||referrerDomain||"direct").trim().slice(0,120);
  const campaign=(params.get("utm_campaign")||"").trim().slice(0,120);
  const page=(location.pathname.split("/").pop()||"index").slice(0,120);
  const {error}=await supabase.from("eow_activity_events").insert({user_id:user.id,event_type:eventType,page,source:eventType==="signup"?source:null,campaign:eventType==="signup"?campaign:null});
  if(error)console.warn("EOW activity tracking unavailable:",error.message);
 }catch(error){console.warn("EOW activity tracking skipped:",error?.message||error);}
}

function initMessageAlerts(user){
 if(!user||window.__eowMessageAlerts===user.id)return;
 window.__eowMessageAlerts=user.id;
 let box=document.getElementById("eowMessageToasts");
 if(!box){box=document.createElement("div");box.id="eowMessageToasts";box.className="eow-message-toasts";box.setAttribute("aria-live","polite");document.body.append(box);}
 const renderCount=count=>{
  const link=document.querySelector('#sideNav a[href="messages.html"]');if(!link)return;
  let badge=link.querySelector(".eow-unread-badge");
  if(count>0){if(!badge){badge=document.createElement("span");badge.className="eow-unread-badge";link.append(badge);}badge.textContent=count>99?"99+":String(count);}
  else badge?.remove();
 };
 const refresh=async()=>{
  const {count,error}=await supabase.from("messages").select("id",{count:"exact",head:true}).eq("receiver_id",user.id).is("read_at",null);
  if(!error)renderCount(count||0);
 };
 const show=async message=>{
  const profiles=await getProfiles([message.sender_id]).catch(()=>({}));
  const profile=profiles[message.sender_id]||{};
  const toast=document.createElement("div");toast.className="eow-message-toast";toast.dataset.href="messages.html?user="+encodeURIComponent(message.sender_id);
  toast.innerHTML=avatarHTML(profile,"avatar")+"<div class='eow-message-toast-copy'><strong>"+esc(displayName(profile))+"</strong><p>"+esc(message.content||"新消息")+"</p><small>"+(document.documentElement.lang==="en"?"New message":"发来一条新消息")+"</small></div><button type='button' class='eow-message-toast-close' aria-label='Close'>×</button>";
  toast.addEventListener("click",event=>{if(event.target.closest(".eow-message-toast-close")){toast.remove();return;}location.href=toast.dataset.href;});
  box.prepend(toast);while(box.children.length>4)box.lastElementChild.remove();
  setTimeout(()=>toast.remove(),9000);
 };
 refresh();
 const channel=supabase.channel("eow-global-message-alerts-"+user.id)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"receiver_id=eq."+user.id},async payload=>{
   const m=payload.new;if(!m||m.sender_id===user.id)return;
   const isOpenChat=location.pathname.endsWith("messages.html")&&window.EOW_ACTIVE_CHAT_ID===m.sender_id&&document.visibilityState==="visible";
   if(!isOpenChat)await show(m);
   refresh();
  })
  .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages",filter:"receiver_id=eq."+user.id},refresh)
  .subscribe();
 window.addEventListener("focus",refresh);
 window.addEventListener("beforeunload",()=>supabase.removeChannel(channel),{once:true});
}

export async function initShell(active="home"){const user=await requireUser();if(!user)return null;const header=$("#header");if(header && !header.innerHTML)header.innerHTML=shellHeader();let profile;try{profile=await ensureProfile(user);}catch(e){console.error(e);profile={display_name:user.email};}const side=$("#sideNav");if(side)side.innerHTML=navMarkup(active,profile);initMessageAlerts(user);try{await initCallUI(user,supabase);}catch(callInitError){console.warn("EOW call UI unavailable",callInitError);}const userChip=$("#userChip");if(userChip)userChip.innerHTML=`${avatarHTML(profile)}<span>${esc(displayName(profile))} ${verifiedBadgeHTML(profile)}</span>`;$("#logoutLink")?.addEventListener("click",async e=>{e.preventDefault();await signOut();});$("#globalSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){location.href="discover.html?q="+encodeURIComponent(e.target.value.trim());}});try{const {data:admin}=await supabase.from("eow_admins").select("user_id").eq("user_id",user.id).maybeSingle();if(admin&&side&&!side.querySelector(`a[href="admin.html"]`))side.insertAdjacentHTML("beforeend",`<a class="navlink" href="admin.html"><span class="navicon">⚙</span>管理后台</a>`);}catch(e){console.warn("管理员入口暂不可用",e);}trackActivity("page_view");return {user,profile};}
export function shellHeader(){const feedNav=document.body.classList.contains("eow-feed-page")?`<nav class="eow-global-nav" aria-label="Primary navigation"><a href="feed.html" class="active">⌂ <span data-i18n="navHome">首页</span></a><a href="discover.html">⌕ <span data-i18n="navExplore">发现</span></a><a href="communities.html">♧ <span data-i18n="navCommunities">社区</span></a><a href="notifications.html">◉ <span data-i18n="navNotifications">通知</span></a><a href="messages.html">✉ <span data-i18n="navMessages">私信</span></a><div class="eow-language"><button type="button" data-lang="zh">中文</button><span>/</span><button type="button" data-lang="en">EN</button></div></nav>`:"";return `<header class="topbar"><a class="brand" href="feed.html">EOW</a>${feedNav}<div class="searchbox"><span>⌕</span><input id="globalSearch" placeholder="搜索用户、内容或社区…" aria-label="全站搜索"></div><div class="top-actions"><a class="btn ghost small hide-mobile" href="notifications.html">通知</a><a id="userChip" class="suggestion" href="profile.html"></a></div></header>`;}
export function relativeTime(value){const date=new Date(value||Date.now());const seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));const en=document.documentElement.lang==="en";if(seconds<60)return en?"Just now":"刚刚";if(seconds<3600)return en?Math.floor(seconds/60)+"m ago":Math.floor(seconds/60)+" 分钟前";if(seconds<86400)return en?Math.floor(seconds/3600)+"h ago":Math.floor(seconds/3600)+" 小时前";if(seconds<604800)return en?Math.floor(seconds/86400)+"d ago":Math.floor(seconds/86400)+" 天前";return date.toLocaleDateString(en?"en-US":"zh-CN",{month:"short",day:"numeric"});}
export function postCard(post, author, liked=false, comments=[], currentUserId=null, stats={}){
 const en=document.documentElement.lang==="en";
 const name=displayName(author);
 const media=post.media_url?(post.media_type==="video"?`<video class="post-media" src="${esc(post.media_url)}" controls playsinline></video>`:`<img class="post-media" src="${esc(post.media_url)}" alt="${en?"Post image":"动态图片"}" loading="lazy">`):"";
 const likes=Number(stats.likeCount??0),commentCount=Number(stats.commentCount??comments.length);
 const likeLabel=liked?(en?"Liked":"已赞"):(en?"Like":"点赞"),commentLabel=en?"Comment":"评论";
 return `<article class="post eow-post" data-post="${esc(post.id)}">
  <div class="post-head">${avatarHTML(author)}<div class="meta"><strong>${esc(name)} ${verifiedBadgeHTML(author)}</strong><small>${esc(author?.username?"@"+author.username:(en?"EOW user":"EOW 用户"))} · <time datetime="${esc(post.created_at||"")}" title="${new Date(post.created_at||Date.now()).toLocaleString(en?"en-US":"zh-CN")}">${relativeTime(post.created_at)}</time></small></div></div>
  ${post.content?`<div class="post-content">${esc(post.content)}</div>`:""}${media}
  <div class="eow-post-stats" aria-label="${en?"Post engagement":"动态互动数据"}">
   <span class="eow-stat-like">♥ <b data-like-count>${likes.toLocaleString(en?"en-US":"zh-CN")}</b> <span data-i18n="likes">${en?"Likes":"点赞"}</span></span>
   <span class="eow-stat-comments"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/></svg> <b data-comment-count>${commentCount.toLocaleString(en?"en-US":"zh-CN")}</b> <span data-i18n="comments">${en?"comments":"条评论"}</span></span>
  </div>
  <div class="post-actions eow-post-actions">
   <button class="action eow-like-action ${liked?"liked":""}" data-action="like" aria-label="${likeLabel}"><svg class="action-icon heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.3 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg><span class="action-label" data-i18n="likedLabel">${likeLabel}</span></button>
   <button class="action eow-comment-action" data-action="toggle-comments" aria-label="${commentLabel}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/></svg><span class="action-label" data-i18n="commentAction">${commentLabel}</span></button>
   <button class="action eow-share-action" data-action="share-post" aria-label="${en?"Share":"分享"}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5"/></svg><span class="action-label" data-i18n="share">${en?"Share":"分享"}</span></button>
   <button class="action eow-save-action ${stats.saved?"saved":""}" data-action="bookmark" aria-pressed="${stats.saved?"true":"false"}" aria-label="${en?"Save post":"收藏动态"}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.8h12v17l-6-3.8-6 3.8v-17Z"/></svg><span class="action-label" data-i18n="savePost">${stats.saved?(en?"Saved":"已收藏"):(en?"Save":"收藏")}</span></button>
  </div>
  <div class="comment-list" hidden>${comments.slice(-3).map(c=>`<div class="comment"><strong>${esc(displayName(c.profile))}</strong>${esc(c.content)}</div>`).join("")}<form class="comment-form"><input class="field" name="content" maxlength="1000" placeholder="${en?"Write a comment…":"写下评论…"}" required><button class="btn small">${en?"Send":"发送"}</button></form></div>
 </article>`;
}
