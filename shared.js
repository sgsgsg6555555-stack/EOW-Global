import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => [...root.querySelectorAll(s)];
export const esc = (v="") => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const displayName = p => p?.display_name || p?.username || "EOW 用户";
export const avatarHTML = (p, cls="avatar") => p?.avatar_url
  ? `<img class="${cls}" src="${esc(p.avatar_url)}" alt="头像" loading="lazy" onerror="this.style.display='none'">`
  : `<span class="${cls} avatar-fallback" aria-label="默认头像">E</span>`;
export async function currentUser(){const {data,error}=await supabase.auth.getUser();if(error)throw error;return data.user;}
export async function requireUser(){const user=await currentUser();if(!user){location.href="login.html?next="+encodeURIComponent(location.pathname+location.search);return null;}return user;}
export async function myProfile(user){const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();if(error)throw error;return data;}
export async function ensureProfile(user){let p=await myProfile(user);if(!p){const fallback=(user.email||"eowuser").split("@")[0];const {data,error}=await supabase.from("profiles").insert({id:user.id,username:fallback,display_name:fallback}).select().single();if(error && error.code!=="23505")throw error;p=await myProfile(user);}return p;}
export async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error;location.href="login.html";}
export function setNotice(el,msg,type=""){if(!el)return;el.className="notice"+(type?" "+type:"");el.textContent=msg;el.hidden=!msg;}
export async function getProfiles(ids){const unique=[...new Set((ids||[]).filter(Boolean))];if(!unique.length)return {};const {data,error}=await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,created_at,cover_url").in("id",unique);if(error)throw error;return Object.fromEntries((data||[]).map(p=>[p.id,p]));}
export function navMarkup(active="home", profile=null){const items=[["home","⌂","首页","feed.html"],["discover","⌕","发现","discover.html"],["friends","♧","好友","friends.html"],["messages","✉","私信","messages.html"],["calls","◉","通话测试","calls.html"],["notifications","◉","通知","notifications.html"],["communities","▦","社区","communities.html"],["videos","▶","视频","videos.html"],["profile","◎","个人主页","profile.html"],["wallet","◇","钱包礼物","wallet.html"],["settings","⚙","账号设置","settings.html"]];return `<div class="side-user">${avatarHTML(profile)}<div><strong>${esc(displayName(profile))}</strong><small>我的 EOW 账号</small></div></div>${items.map(([id,icon,label,url])=>`<a class="navlink ${active===id?"active":""}" href="${url}"><span class="navicon">${icon}</span>${label}</a>`).join("")}<a class="navlink" href="#" id="logoutLink"><span class="navicon">↪</span>退出登录</a>`;}
export async function initShell(active="home"){const user=await requireUser();if(!user)return null;const header=$("#header");if(header && !header.innerHTML)header.innerHTML=shellHeader();let profile;try{profile=await ensureProfile(user);}catch(e){console.error(e);profile={display_name:user.email};}const side=$("#sideNav");if(side)side.innerHTML=navMarkup(active,profile);const userChip=$("#userChip");if(userChip)userChip.innerHTML=`${avatarHTML(profile)}<span>${esc(displayName(profile))}</span>`;$("#logoutLink")?.addEventListener("click",async e=>{e.preventDefault();await signOut();});$("#globalSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){location.href="discover.html?q="+encodeURIComponent(e.target.value.trim());}});try{const {data:admin}=await supabase.from("eow_admins").select("user_id").eq("user_id",user.id).maybeSingle();if(admin&&side&&!side.querySelector(`a[href="admin.html"]`))side.insertAdjacentHTML("beforeend",`<a class="navlink" href="admin.html"><span class="navicon">⚙</span>管理后台</a>`);}catch(e){console.warn("管理员入口暂不可用",e);}return {user,profile};}
export function shellHeader(){return `<header class="topbar"><a class="brand" href="feed.html">EOW</a><div class="searchbox"><span>⌕</span><input id="globalSearch" placeholder="搜索用户、内容或社区…" aria-label="全站搜索"></div><div class="top-actions"><a class="btn ghost small hide-mobile" href="notifications.html">通知</a><a id="userChip" class="suggestion" href="profile.html"></a></div></header>`;}
export function postCard(post, author, liked=false, comments=[], viewerId=null){const name=displayName(author);const media=post.media_url?(post.media_type==="video"?`<video class="post-media" src="${esc(post.media_url)}" controls playsinline></video>`:`<img class="post-media" src="${esc(post.media_url)}" alt="动态图片">`):"";const own=!!viewerId&&post.user_id===viewerId;return `<article class="post" data-post="${esc(post.id)}"><div class="post-head">${avatarHTML(author)}<div class="meta"><strong>${esc(name)}</strong><small>${esc(author?.username?"@"+author.username:"EOW 用户")} · ${new Date(post.created_at||Date.now()).toLocaleString("zh-CN")}</small></div>${own?`<div class="post-owner-actions"><button class="action" data-action="edit-post" type="button">编辑</button><button class="action danger-text" data-action="delete-post" type="button">删除</button></div>`:""}</div>${post.content?`<div class="post-content">${esc(post.content)}</div>`:""}${media}<div class="post-actions"><button class="action ${liked?"liked":""}" data-action="like">♥ <span>${liked?"已赞":"点赞"}</span></button><button class="action" data-action="toggle-comments">评论 <span>${comments.length||""}</span></button><button class="action" data-action="share-post" type="button">分享</button>${own?"":'<button class="action" data-action="report-post" type="button">举报</button>'}</div><div class="comment-list" hidden>${comments.map(c=>`<div class="comment" data-comment="${esc(c.id)}"><strong>${esc(displayName(c.profile))}</strong> ${esc(c.content)}${viewerId&&c.user_id===viewerId?` <button class="text-button comment-delete" data-action="delete-comment" type="button">删除</button>`:""}</div>`).join("")}<form class="comment-form"><input class="field" name="content" maxlength="1000" placeholder="写下评论…" required><button class="btn small">发送</button></form></div></article>`;}



// EOW share action: uses native share where available, otherwise copies a canonical post URL.
if (!document.documentElement.dataset.eowShareHandler) {
  document.documentElement.dataset.eowShareHandler = "1";
  document.addEventListener("click", async event => {
    const button = event.target.closest('button[data-action="share-post"]');
    if (!button) return;
    const card = button.closest("[data-post]");
    if (!card?.dataset.post) return;
    const url = new URL("feed.html", location.href);
    url.searchParams.set("post", card.dataset.post);
    const shareData = { title: "EOW 动态", text: "来看看 EOW 上的这条动态", url: url.href };
    button.disabled = true;
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.href);
        button.textContent = "已复制链接";
      } else {
        const field = document.createElement("textarea");
        field.value = url.href;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("浏览器不支持复制，请手动复制地址栏链接。");
        button.textContent = "已复制链接";
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        button.textContent = "分享失败";
        console.warn("EOW share failed", error);
      }
    } finally {
      button.disabled = false;
      setTimeout(() => { if (button.isConnected) button.textContent = "分享"; }, 1800);
    }
  });
}


if (!document.documentElement.dataset.eowReportHandler) {
  document.documentElement.dataset.eowReportHandler = "1";
  document.addEventListener("click", async event => {
    const button = event.target.closest('button[data-action="report-post"]');
    if (!button) return;
    const card = button.closest("[data-post]");
    if (!card?.dataset.post) return;
    const reason = prompt("请选择或填写举报原因（例如：骚扰、仇恨内容、垃圾信息、冒充身份）：");
    if (reason === null) return;
    const detail = reason.trim();
    if (!detail) { alert("请填写举报原因。"); return; }
    button.disabled = true;
    try {
      const { error } = await supabase.from("post_reports").insert({
        post_id: card.dataset.post,
        reporter_id: (await currentUser())?.id,
        reason: detail.slice(0, 500),
        status: "pending"
      });
      if (error) throw error;
      button.textContent = "已举报";
      button.disabled = true;
      alert("举报已提交，感谢你帮助维护 EOW 社区安全。");
    } catch (error) {
      button.disabled = false;
      alert("举报提交失败：" + (error?.message || error) + "。请确认管理员已执行举报功能数据库迁移。");
    }
  });
}

