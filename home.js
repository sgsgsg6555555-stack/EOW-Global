import {supabase,$,initShell,shellHeader,avatarHTML,displayName,getProfiles,postCard,setNotice,trackActivity,esc} from "./shared.js?v=7";
const shell=await initShell("home");if(shell){
$("#composerAvatar").innerHTML=avatarHTML(shell.profile);
$("#postMedia").addEventListener("change",e=>$("#mediaName").textContent=e.target.files[0]?.name||"支持图片或视频，单个文件最大 30MB");
let offset=0;const pageSize=10;
async function loadFeed(reset=false){if(reset){offset=0;$("#feed").innerHTML="";}$("#feedStatus").textContent="正在加载动态…";
const {data:posts,error}=await supabase.from("posts").select("*").order("created_at",{ascending:false}).range(offset,offset+pageSize-1);
if(error){$("#feedStatus").textContent="动态读取失败："+error.message;return;}
if(!posts?.length&&offset===0){$("#feedStatus").textContent="还没有动态，发布第一条动态吧！";$("#loadMore").hidden=true;return;}
const ids=posts.map(p=>p.user_id);let profiles={};try{profiles=await getProfiles(ids);}catch(e){console.warn(e);}
const postIds=posts.map(p=>p.id);
let likes=[],comments=[];if(postIds.length){const l=await supabase.from("likes").select("post_id,user_id").in("post_id",postIds);if(!l.error)likes=l.data||[];const c=await supabase.from("comments").select("*").in("post_id",postIds).order("created_at",{ascending:true});if(!c.error)comments=c.data||[];}
let commenterProfiles={};try{commenterProfiles=await getProfiles(comments.map(c=>c.user_id).filter(id=>!profiles[id]));}catch(e){console.warn("评论者资料读取失败",e);}profiles={...profiles,...commenterProfiles};
for(const p of posts){const liked=likes.some(l=>l.post_id===p.id&&l.user_id===shell.user.id);const cs=comments.filter(c=>c.post_id===p.id).map(c=>({...c,profile:profiles[c.user_id]}));$("#feed").insertAdjacentHTML("beforeend",postCard(p,profiles[p.user_id],liked,cs,shell.user.id,{likeCount:likes.filter(l=>l.post_id===p.id).length,commentCount:comments.filter(c=>c.post_id===p.id).length}));}
offset+=posts.length;$("#feedStatus").textContent=document.documentElement.lang==="en"?`Showing ${offset} posts`:`已显示 ${offset} 条动态`;$("#feedCount").textContent=document.documentElement.lang==="en"?`${offset} posts`:`${offset} 条`;$("#loadMore").textContent=document.documentElement.lang==="en"?"Load more":"加载更多";$("#loadMore").hidden=posts.length<pageSize;if(reset)renderTrending(posts);if(typeof applyLanguage==="function")applyLanguage(localStorage.getItem("eow-language")==="en"?"en":"zh");
}
$("#postForm").addEventListener("submit",async e=>{e.preventDefault();const text=$("#postText").value.trim();const file=$("#postMedia").files[0];if(!text&&!file){setNotice($("#postNotice"),"请填写动态内容或选择图片/视频。","error");return;}if(file&&file.size>30*1024*1024){setNotice($("#postNotice"),"文件不能超过 30MB。","error");return;}
const btn=$("#publishBtn");btn.disabled=true;btn.textContent="正在发布…";try{let mediaUrl=null,mediaType=null;if(file){const path=`${shell.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:upErr}=await supabase.storage.from("posts").upload(path,file,{upsert:false,contentType:file.type});if(upErr)throw upErr;mediaUrl=supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;mediaType=file.type.startsWith("video/")?"video":"image";}
const {error}=await supabase.from("posts").insert({user_id:shell.user.id,content:text,media_url:mediaUrl,media_type:mediaType,created_at:new Date().toISOString()});if(error)throw error;await trackActivity("post_created");$("#postText").value="";$("#postMedia").value="";$("#mediaName").textContent="支持图片或视频，单个文件最大 30MB";setNotice($("#postNotice"),"发布成功！","success");await loadFeed(true);
}catch(err){setNotice($("#postNotice"),"发布失败："+err.message,"error");}finally{btn.disabled=false;btn.textContent="发布动态";}});
async function handlePostManagement(button, card) {
  const action = button.dataset.action;
  button.disabled = true;
  try {
    if (action === "edit-post") {
      const contentEl = card.querySelector(".post-content");
      const current = contentEl?.textContent || "";
      const next = prompt("编辑动态内容：", current);
      if (next === null) return;
      const content = next.trim();
      if (!content) throw new Error("动态内容不能为空；如需移除内容，请删除这条动态。");
      const { error } = await supabase.from("posts").update({ content }).eq("id", card.dataset.post).eq("user_id", shell.user.id);
      if (error) throw error;
      if (contentEl) contentEl.textContent = content;
      else {
        const el = document.createElement("div");
        el.className = "post-content";
        el.textContent = content;
        card.querySelector(".post-head").after(el);
      }
    } else if (action === "delete-post") {
      if (!confirm("确定删除这条动态吗？此操作无法撤销。")) return;
      const { error } = await supabase.from("posts").delete().eq("id", card.dataset.post).eq("user_id", shell.user.id);
      if (error) throw error;
      card.remove();
    } else if (action === "delete-comment") {
      const comment = button.closest("[data-comment]");
      if (!comment || !confirm("确定删除这条评论吗？")) return;
      const { error } = await supabase.from("comments").delete().eq("id", comment.dataset.comment).eq("user_id", shell.user.id);
      if (error) throw error;
      comment.remove();
      const count = card.querySelector('[data-action="toggle-comments"] span');
      if (count) {
        const value = Math.max(0, Number(count.textContent || 0) - 1);
        count.textContent = value || "";
      }
    }
  } catch (error) {
    alert("操作失败：" + (error?.message || error));
  } finally {
    button.disabled = false;
  }
}

$("#feed").addEventListener("click",async e=>{const btn=e.target.closest("button[data-action]");if(!btn)return;const card=btn.closest("[data-post]");const postId=card.dataset.post;
if (["edit-post","delete-post","delete-comment"].includes(btn.dataset.action)) {
  await handlePostManagement(btn, card);
  return;
 }
 if(btn.dataset.action==="toggle-comments"){const box=card.querySelector(".comment-list");box.hidden=!box.hidden;return;}
 if(btn.dataset.action==="share-post"){const url=new URL("feed.html",location.href).href+"#post-"+encodeURIComponent(postId);try{if(navigator.share)await navigator.share({title:"EOW Global",text:"查看这条 EOW 动态",url});else{await navigator.clipboard.writeText(url);alert("动态链接已复制。");}}catch(err){if(err?.name!=="AbortError")alert("分享失败，请复制页面地址。");}return;}
if(btn.dataset.action==="like"){btn.disabled=true;try{const {data:existing,error:findErr}=await supabase.from("likes").select("id").eq("post_id",postId).eq("user_id",shell.user.id).maybeSingle();if(findErr)throw findErr;if(existing){const {error}=await supabase.from("likes").delete().eq("id",existing.id);if(error)throw error;btn.classList.remove("liked");btn.querySelector("span").textContent="点赞";const count=card.querySelector("[data-like-count]");if(count)count.textContent=String(Math.max(0,Number(count.textContent||0)-1));}else{const {error}=await supabase.from("likes").insert({post_id:postId,user_id:shell.user.id,created_at:new Date().toISOString()});if(error)throw error;btn.classList.add("liked");btn.querySelector("span").textContent="已赞";const count=card.querySelector("[data-like-count]");if(count)count.textContent=String(Number(count.textContent||0)+1);}}catch(err){alert("点赞操作失败："+err.message);}finally{btn.disabled=false;}}
});
$("#feed").addEventListener("submit",async e=>{if(!e.target.matches(".comment-form"))return;e.preventDefault();const postId=e.target.closest("[data-post]").dataset.post;const input=e.target.elements.content;const content=input.value.trim();if(!content)return;const submit=e.target.querySelector("button");submit.disabled=true;const {error}=await supabase.from("comments").insert({post_id:postId,user_id:shell.user.id,content,created_at:new Date().toISOString()});if(error)alert("评论失败："+error.message);else{const row=document.createElement("div");row.className="comment";row.innerHTML=`<strong>${displayName(shell.profile)}</strong>`;row.append(document.createTextNode(content));e.target.before(row);const count=e.target.closest("[data-post]").querySelector("[data-comment-count]");if(count)count.textContent=String(Number(count.textContent||0)+1);input.value="";}submit.disabled=false;});
$("#loadMore").addEventListener("click",()=>loadFeed());
function renderTrending(posts){const counts=new Map();for(const post of posts){const tags=(post.content||"").match(/#[\p{L}\p{N}_-]{2,}/gu)||[];for(const tag of tags)counts.set(tag,(counts.get(tag)||0)+1);}const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);$("#trendingList").innerHTML=top.length?top.map(([tag,n],i)=>`<button class="eow-trend-row" type="button" data-tag="${esc(tag)}"><span class="eow-trend-rank">${i+1}</span><span class="eow-trend-name">${esc(tag)}<small>${n} ${document.documentElement.lang==="en"?"posts":"条动态"}</small></span><span class="eow-trend-spark">⌁</span></button>`).join(""):'<div class="eow-empty">动态中的 #话题 将显示在这里</div>';}
$("#trendingList").addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(!b)return;const tag=b.dataset.tag;const cards=[...document.querySelectorAll("#feed [data-post]")];let shown=0;for(const card of cards){const match=card.querySelector(".post-content")?.textContent.includes(tag);card.hidden=!match;if(match)shown++;}$("#feedStatus").textContent=`话题 ${tag} · ${shown} 条动态`;$("#loadMore").hidden=true;});
async function loadHighlights(){const [communities,members]=await Promise.all([supabase.from("communities").select("id,name,description").order("created_at",{ascending:false}).limit(5),supabase.from("community_members").select("community_id,user_id")]);if(communities.error){$("#communityHighlights").textContent="暂时无法加载社区";return;}const counts={};(members.data||[]).forEach(x=>counts[x.community_id]=(counts[x.community_id]||0)+1);$("#communityHighlights").innerHTML=(communities.data||[]).map(c=>`<a class="eow-community-row" href="community-detail.html?id=${encodeURIComponent(c.id)}"><span class="eow-community-icon">◈</span><span><b>${esc(c.name)}</b><small>${counts[c.id]||0} ${document.documentElement.lang==="en"?"members":"位成员"}</small></span><span class="eow-row-arrow">›</span></a>`).join("")||'<div class="eow-empty">还没有社区，去创建第一个吧。</div>';}
async function loadActiveMembers(){const {data:posts,error}=await supabase.from("posts").select("user_id,created_at").order("created_at",{ascending:false}).limit(40);if(error){$("#activeMembers").textContent="暂时无法加载成员";return;}const ids=[...new Set((posts||[]).map(p=>p.user_id).filter(id=>id!==shell.user.id))].slice(0,8);const profiles=await getProfiles(ids);$("#activeMembers").innerHTML=ids.map(id=>{const p=profiles[id];if(!p)return "";return `<a class="eow-story-user" href="profile.html?id=${encodeURIComponent(id)}">${avatarHTML(p,"eow-story-avatar")}<span>${esc(displayName(p))}</span></a>`;}).join("")||'<span class="eow-empty">发布动态后，这里会展示活跃成员。</span>';}
async function suggestions(){const [users,following]=await Promise.all([supabase.from("profiles").select("id,username,display_name,avatar_url,bio").neq("id",shell.user.id).limit(5),supabase.from("follows").select("following_id").eq("follower_id",shell.user.id)]);if(users.error){$("#suggestions").textContent="暂时无法加载推荐用户";return;}const followed=new Set((following.data||[]).map(x=>x.following_id));$("#suggestions").innerHTML=(users.data||[]).map(p=>`<div class="eow-suggest-row">${avatarHTML(p)}<div class="grow"><strong>${esc(displayName(p))}</strong><small>@${esc(p.username||"eow-member")}</small></div><button class="eow-follow-btn" data-follow="${esc(p.id)}" aria-pressed="${followed.has(p.id)}">${followed.has(p.id)?"已关注":"关注"}</button></div>`).join("")||"暂时没有其他成员";}
$("#suggestions").addEventListener("click",async e=>{const b=e.target.closest("[data-follow]");if(!b)return;const id=b.dataset.follow;b.disabled=true;const isFollowing=b.getAttribute("aria-pressed")==="true";const result=isFollowing?await supabase.from("follows").delete().eq("follower_id",shell.user.id).eq("following_id",id):await supabase.from("follows").insert({follower_id:shell.user.id,following_id:id,created_at:new Date().toISOString()});if(result.error)alert("关注操作失败："+result.error.message);else{b.setAttribute("aria-pressed",String(!isFollowing));b.textContent=isFollowing?"关注":"已关注";}b.disabled=false;});
const i18n={zh:{navHome:"首页",navExplore:"发现",navCommunities:"社区",navNotifications:"通知",navMessages:"私信",createPost:"发布动态",shortcuts:"快捷入口",communities:"兴趣社区",friends:"好友",videos:"视频",myProfile:"个人主页",stories:"活跃成员",viewAll:"查看全部",shareMoment:"分享此刻",imageVideo:"图片 / 视频",publish:"发布动态",latestFeed:"最新动态",trendingNow:"热门话题",suggestedForYou:"为你推荐",likes:"点赞",comments:"条评论",likedLabel:"点赞",commentAction:"评论",share:"分享"},en:{navHome:"Home",navExplore:"Explore",navCommunities:"Communities",navNotifications:"Notifications",navMessages:"Messages",createPost:"Create post",shortcuts:"Shortcuts",communities:"Communities",friends:"Friends",videos:"Videos",myProfile:"My profile",stories:"Active members",viewAll:"View all",shareMoment:"Share a moment",imageVideo:"Image / Video",publish:"Publish",latestFeed:"Latest feed",trendingNow:"Trending now",suggestedForYou:"Suggested for you",likes:"Likes",comments:"comments",likedLabel:"Like",commentAction:"Comment",share:"Share"}};
function applyLanguage(lang){const dict=i18n[lang]||i18n.zh;document.documentElement.lang=lang==="en"?"en":"zh-CN";const search=document.querySelector("#globalSearch");if(search)search.placeholder=lang==="en"?"Search people, posts or communities…":"搜索用户、内容或社区…";const composer=document.querySelector("#postText");if(composer)composer.placeholder=lang==="en"?"What’s happening? Share it with the EOW community…":"今天有什么新鲜事？和 EOW 社区分享吧…";const mediaHint=document.querySelector("#mediaName");if(mediaHint&&!document.querySelector("#postMedia").files.length)mediaHint.textContent=lang==="en"?"Images or video · up to 30 MB per file":"支持图片或视频，单个文件最大 30MB";document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.textContent=dict[key];});document.querySelectorAll(".eow-global-nav [data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.textContent=dict[key];});const labels={home:lang==="en"?"Home":"首页",discover:lang==="en"?"Explore":"发现",friends:lang==="en"?"Friends":"好友",messages:lang==="en"?"Messages":"私信",notifications:lang==="en"?"Notifications":"通知",communities:lang==="en"?"Communities":"社区",videos:lang==="en"?"Videos":"视频",profile:lang==="en"?"My profile":"个人主页",wallet:lang==="en"?"Wallet & gifts":"钱包礼物"};document.querySelectorAll("#sideNav .navlink").forEach(a=>{const href=(a.getAttribute("href")||"").split("?")[0].replace(".html","");const key=href.split("/").pop();if(labels[key]){const icon=a.querySelector(".navicon")?.outerHTML||"";a.innerHTML=icon+labels[key];}});document.querySelectorAll(".eow-language [data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));const notice=document.querySelector(".top-actions .btn");if(notice)notice.textContent=lang==="en"?"Notifications":"通知";localStorage.setItem("eow-language",lang);}
const savedLang=localStorage.getItem("eow-language")==="en"?"en":"zh";applyLanguage(savedLang);document.querySelectorAll(".eow-language [data-lang]").forEach(b=>b.addEventListener("click",()=>applyLanguage(b.dataset.lang)));await Promise.all([loadFeed(true),suggestions(),loadHighlights(),loadActiveMembers()]);applyLanguage(savedLang);
}


