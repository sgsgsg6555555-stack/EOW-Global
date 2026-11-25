import {supabase,$,initShell,shellHeader,avatarHTML,displayName,getProfiles,postCard,setNotice,trackActivity,esc} from "./shared.js?v=22";
import {renderPollCard,initSocialExtras} from "./social-extras.js?v=4";
const t=(zh,en)=>document.documentElement.lang==="en"?en:zh;
const shell=await initShell("home");if(shell){
if(!document.querySelector(".eow-mobile-bottom-nav")){
 const mobileNav=document.createElement("nav");
 mobileNav.className="eow-mobile-bottom-nav";
 mobileNav.setAttribute("aria-label","EOW 手机导航");
 mobileNav.innerHTML=[
  ["feed.html","⌂","首页"],["discover.html","⌕","发现"],["friends.html","♧","好友"],["messages.html","✉","私信"],["notifications.html","◉","通知"]
 ].map(([href,icon,label],i)=>`<a href="${href}" class="${i===0?"active":""}"><span class="eow-mobile-nav-icon">${icon}</span><span>${label}</span></a>`).join("");
 document.body.append(mobileNav);
}
$("#composerAvatar").innerHTML=avatarHTML(shell.profile);
let editedMedia=null, editingMedia=false;
const mediaHint=()=>t("支持图片或视频，单个文件最大 30MB","Images or video · up to 30 MB per file");
const notice=$("#postNotice");
notice.style.setProperty("display","none","important");
function postError(message){notice.style.removeProperty("display");setNotice(notice,message,"error");}
function clearPostNotice(){notice.replaceChildren();notice.style.setProperty("display","none","important");}
function editPostImage(file){return new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(file), img=new Image();
 img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(t("无法读取图片","Cannot read image")));};
 img.onload=()=>{
 const d=document.createElement("dialog");d.style.cssText="width:min(92vw,620px);max-height:90vh;overflow:auto;border:1px solid #526589;border-radius:16px;background:#101e35;color:white;padding:18px;box-sizing:border-box";
 const heading=document.createElement("h3");heading.textContent=t("调整图片","Adjust image");
 const canvas=document.createElement("canvas");canvas.width=960;canvas.height=Math.max(320,Math.min(1200,Math.round(960*img.height/img.width)));canvas.style.cssText="display:block;width:100%;max-height:48vh;object-fit:contain;background:#081225;touch-action:none;cursor:grab";
 const ctx=canvas.getContext("2d");let angle=0,x=0,y=0,drag=null;
 const zoom=document.createElement("input");zoom.type="range";zoom.min="1";zoom.max="4";zoom.step=".01";zoom.value="1";zoom.style.width="100%";zoom.setAttribute("aria-label",t("缩放","Zoom"));
 const label=document.createElement("label");label.textContent=t("缩放图片 · 拖动图片调整位置","Zoom · drag to reposition");label.append(zoom);
 function draw(){const swap=angle%180!==0,w=swap?img.height:img.width,h=swap?img.width:img.height;const scale=Math.max(canvas.width/w,canvas.height/h)*Number(zoom.value);const mx=Math.max(0,(w*scale-canvas.width)/2),my=Math.max(0,(h*scale-canvas.height)/2);x=Math.max(-mx,Math.min(mx,x));y=Math.max(-my,Math.min(my,y));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2+x,canvas.height/2+y);ctx.rotate(angle*Math.PI/180);ctx.scale(scale,scale);ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();}
 zoom.oninput=draw;canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;const b=canvas.getBoundingClientRect(),scale=Math.min(b.width/canvas.width,b.height/canvas.height);x+=(e.clientX-drag[0])/scale;y+=(e.clientY-drag[1])/scale;drag=[e.clientX,e.clientY];draw();};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
 const actions=document.createElement("div");actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px";
 function button(label,fn){const b=document.createElement("button");b.type="button";b.className="btn";b.textContent=label;b.onclick=fn;actions.append(b);return b;}
 let done=false;function finish(value){if(done)return;done=true;d.close();d.remove();URL.revokeObjectURL(url);resolve(value);}
 button(t("旋转90°","Rotate 90°"),()=>{angle=(angle+90)%360;x=y=0;draw();});
 button(t("重置","Reset"),()=>{angle=x=y=0;zoom.value="1";draw();});
 button(t("取消","Cancel"),()=>finish(null));
 const confirm=button(t("确认图片","Confirm image"),()=>{confirm.disabled=true;canvas.toBlob(blob=>{if(!blob){confirm.disabled=false;return;}finish(new File([blob],"edited-"+Date.now()+".png",{type:"image/png"}));},"image/png");});
 d.addEventListener("cancel",e=>{e.preventDefault();finish(null);});d.append(heading,canvas,label,actions);document.body.append(d);d.showModal();draw();
 };img.src=url;
});}
$("#postMedia").addEventListener("change",async e=>{const input=e.target,file=input.files[0];editedMedia=null;clearPostNotice();if(!file){$("#mediaName").textContent=mediaHint();return;}if(file.size>30*1024*1024){input.value="";$("#mediaName").textContent=mediaHint();postError(t("文件不能超过 30MB。","Files must be 30 MB or smaller."));return;}if(file.type.startsWith("image/")&&file.type!=="image/gif"){editingMedia=true;$("#publishBtn").disabled=true;try{editedMedia=await editPostImage(file);if(!editedMedia)input.value="";}catch(err){input.value="";postError(err.message);}finally{editingMedia=false;$("#publishBtn").disabled=false;}}$("#mediaName").textContent=input.files[0]?.name||mediaHint();});
let offset=0;const pageSize=10;let latestPosts=[];
async function loadFeed(reset=false){if(reset){offset=0;$("#feed").innerHTML="";}$("#feedStatus").textContent=t("正在加载动态…","Loading posts…");
const {data:posts,error}=await supabase.from("posts").select("*").order("created_at",{ascending:false}).range(offset,offset+pageSize-1);
if(error){$("#feedStatus").textContent=t("动态读取失败：","Could not load posts: ")+error.message;return;}
if(reset)latestPosts=[];latestPosts=latestPosts.concat(posts||[]);
if(!posts?.length&&offset===0){$("#feedStatus").textContent=t("还没有动态，发布第一条动态吧！","No posts yet. Be the first to share something!");$("#loadMore").hidden=true;return;}
const ids=posts.map(p=>p.user_id);let profiles={};try{profiles=await getProfiles(ids);}catch(e){console.warn(e);}
const postIds=posts.map(p=>p.id);
let likes=[],comments=[],saved=[];if(postIds.length){const [l,c,b]=await Promise.all([supabase.from("likes").select("post_id,user_id").in("post_id",postIds),supabase.from("comments").select("*").in("post_id",postIds).order("created_at",{ascending:true}),supabase.from("eow_saved_posts").select("post_id").eq("user_id",shell.user.id).in("post_id",postIds)]);if(!l.error)likes=l.data||[];if(!c.error)comments=c.data||[];if(!b.error)saved=b.data||[];}
let commenterProfiles={};try{commenterProfiles=await getProfiles(comments.map(c=>c.user_id).filter(id=>!profiles[id]));}catch(e){console.warn("评论者资料读取失败",e);}profiles={...profiles,...commenterProfiles};
for(const p of posts){const liked=likes.some(l=>l.post_id===p.id&&l.user_id===shell.user.id);const cs=comments.filter(c=>c.post_id===p.id).map(c=>({...c,profile:profiles[c.user_id]}));$("#feed").insertAdjacentHTML("beforeend",postCard(p,profiles[p.user_id],liked,cs,shell.user.id,{likeCount:likes.filter(l=>l.post_id===p.id).length,commentCount:comments.filter(c=>c.post_id===p.id).length,saved:saved.some(x=>x.post_id===p.id)}));const pollHTML=await renderPollCard(p.id,shell.user.id);if(pollHTML)$("#feed [data-post='"+CSS.escape(p.id)+"']")?.insertAdjacentHTML("beforeend",pollHTML);}
offset+=posts.length;$("#feedStatus").textContent=t(`已显示 ${offset} 条动态`,`Showing ${offset} posts`);$("#feedCount").textContent=t(`${offset} 条`,`${offset} posts`);$("#loadMore").textContent=t("加载更多","Load more");$("#loadMore").hidden=posts.length<pageSize;if(reset)renderTrending(posts);if(typeof applyLanguage==="function")applyLanguage(localStorage.getItem("eow-language")==="en"?"en":"zh");
}
$("#postForm").addEventListener("submit",async e=>{e.preventDefault();const text=$("#postText").value.trim();if(editingMedia)return;clearPostNotice();const file=editedMedia||$("#postMedia").files[0];if(!text&&!file){postError(t("请填写动态内容或选择图片/视频。","Write something or choose an image/video."));return;}if(file&&file.size>30*1024*1024){postError(t("文件不能超过 30MB。","Files must be 30 MB or smaller."));return;}
const btn=$("#publishBtn");btn.disabled=true;btn.textContent=t("正在发布…","Publishing…");try{let mediaUrl=null,mediaType=null;if(file){const path=`${shell.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:upErr}=await supabase.storage.from("posts").upload(path,file,{upsert:false,contentType:file.type});if(upErr)throw upErr;mediaUrl=supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;mediaType=file.type.startsWith("video/")?"video":"image";}
const {error}=await supabase.from("posts").insert({user_id:shell.user.id,content:text,media_url:mediaUrl,media_type:mediaType,created_at:new Date().toISOString()});if(error)throw error;await trackActivity("post_created");$("#postText").value="";$("#postMedia").value="";$("#mediaName").textContent=t("支持图片或视频，单个文件最大 30MB","Images or video · up to 30 MB per file");editedMedia=null;clearPostNotice();await loadFeed(true);
}catch(err){postError(t("发布失败：","Could not publish: ")+err.message);}finally{btn.disabled=false;btn.textContent=t("发布动态","Publish");}});
async function handlePostManagement(button, card) {
  const action = button.dataset.action;
  button.disabled = true;
  try {
    if (action === "edit-post") {
      const contentEl = card.querySelector(".post-content");
      const current = contentEl?.textContent || "";
      const next = prompt(t("编辑动态内容：","Edit post: "), current);
      if (next === null) return;
      const content = next.trim();
      if (!content) throw new Error(t("动态内容不能为空；如需移除内容，请删除这条动态。","Post content cannot be empty. Delete the post if you want to remove it."));
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
      if (!confirm(t("确定删除这条动态吗？此操作无法撤销。","Delete this post? This cannot be undone."))) return;
      const { error } = await supabase.from("posts").delete().eq("id", card.dataset.post).eq("user_id", shell.user.id);
      if (error) throw error;
      card.remove();
    } else if (action === "delete-comment") {
      const comment = button.closest("[data-comment]");
      if (!comment || !confirm(t("确定删除这条评论吗？","Delete this comment?"))) return;
      const { error } = await supabase.from("comments").delete().eq("id", comment.dataset.comment).eq("user_id", shell.user.id);
      if (error) throw error;
      comment.remove();
      const count = card.querySelector("[data-comment-count]");
      if (count) {
        const value = Math.max(0, (parseInt((count.textContent||"0").replace(/[^0-9-]/g,""),10)||0) - 1);
        count.textContent = value || "";
      }
    }
  } catch (error) {
    alert(t("操作失败：","Action failed: ") + (error?.message || error));
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
 if(btn.dataset.action==="bookmark"){btn.disabled=true;const was=btn.getAttribute("aria-pressed")==="true";const result=was?await supabase.from("eow_saved_posts").delete().eq("user_id",shell.user.id).eq("post_id",postId):await supabase.from("eow_saved_posts").insert({user_id:shell.user.id,post_id:postId});if(result.error)alert(t("收藏操作失败：","Save failed: ")+result.error.message);else{btn.setAttribute("aria-pressed",String(!was));btn.classList.toggle("saved",!was);btn.querySelector("span").textContent=was?t("收藏","Save"):t("已收藏","Saved");}btn.disabled=false;return;}
 if(btn.dataset.voteOption){const poll=btn.closest("[data-poll]");const {error}=await supabase.from("eow_poll_votes").upsert({poll_id:poll.dataset.poll,option_id:btn.dataset.voteOption,user_id:shell.user.id},{onConflict:"poll_id,user_id"});if(error)alert(t("投票失败：","Vote failed: ")+error.message);else location.reload();return;}
 if(btn.dataset.action==="share-post"){const url=new URL("feed.html",location.href).href+"#post-"+encodeURIComponent(postId);try{if(navigator.share)await navigator.share({title:"EOW Global",text:t("查看这条 EOW 动态","View this EOW post"),url});else{await navigator.clipboard.writeText(url);alert(t("动态链接已复制。","Post link copied."));}}catch(err){if(err?.name!=="AbortError")alert(t("分享失败，请复制页面地址。","Could not share. Please copy the page URL."));}return;}
if(btn.dataset.action==="like"){btn.disabled=true;try{const {data:existing,error:findErr}=await supabase.from("likes").select("id").eq("post_id",postId).eq("user_id",shell.user.id).maybeSingle();if(findErr)throw findErr;if(existing){const {error}=await supabase.from("likes").delete().eq("id",existing.id);if(error)throw error;btn.classList.remove("liked");btn.querySelector("span").textContent=t("点赞","Like");const count=card.querySelector("[data-like-count]");if(count)count.textContent=String(Math.max(0,(parseInt((count.textContent||"0").replace(/[^0-9-]/g,""),10)||0)-1));}else{const {error}=await supabase.from("likes").insert({post_id:postId,user_id:shell.user.id,created_at:new Date().toISOString()});if(error)throw error;btn.classList.add("liked");btn.querySelector("span").textContent=t("已赞","Liked");const count=card.querySelector("[data-like-count]");if(count)count.textContent=String((parseInt((count.textContent||"0").replace(/[^0-9-]/g,""),10)||0)+1);}}catch(err){alert(t("点赞操作失败：","Like failed: ")+err.message);}finally{btn.disabled=false;}}
});
$("#feed").addEventListener("submit",async e=>{if(!e.target.matches(".comment-form"))return;e.preventDefault();const postId=e.target.closest("[data-post]").dataset.post;const input=e.target.elements.content;const content=input.value.trim();if(!content)return;const submit=e.target.querySelector("button");submit.disabled=true;const {error}=await supabase.from("comments").insert({post_id:postId,user_id:shell.user.id,content,created_at:new Date().toISOString()});if(error)alert(t("评论失败：","Comment failed: ")+error.message);else{const row=document.createElement("div");row.className="comment";row.innerHTML=`<strong>${displayName(shell.profile)}</strong>`;row.append(document.createTextNode(content));e.target.before(row);const count=e.target.closest("[data-post]").querySelector("[data-comment-count]");if(count)count.textContent=String((parseInt((count.textContent||"0").replace(/[^0-9-]/g,""),10)||0)+1);input.value="";}submit.disabled=false;});
$("#loadMore").addEventListener("click",()=>loadFeed());
function renderTrending(posts){const counts=new Map();for(const post of posts){const tags=(post.content||"").match(/#[\p{L}\p{N}_-]{2,}/gu)||[];for(const tag of tags)counts.set(tag,(counts.get(tag)||0)+1);}const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);$("#trendingList").innerHTML=top.length?top.map(([tag,n],i)=>`<button class="eow-trend-row" type="button" data-tag="${esc(tag)}"><span class="eow-trend-rank">${i+1}</span><span class="eow-trend-name">${esc(tag)}<small>${n} ${document.documentElement.lang==="en"?"posts":"条动态"}</small></span><span class="eow-trend-spark">⌁</span></button>`).join(""):`<div class="eow-empty">${t("动态中的 #话题 将显示在这里","Hashtags from posts will appear here")}</div>`;}
$("#trendingList").addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(!b)return;const tag=b.dataset.tag;const cards=[...document.querySelectorAll("#feed [data-post]")];let shown=0;for(const card of cards){const match=card.querySelector(".post-content")?.textContent.includes(tag);card.hidden=!match;if(match)shown++;}$("#feedStatus").textContent=t("话题 ","Topic ")+tag+t(" · "," · ")+shown+t(" 条动态"," posts");$("#loadMore").hidden=true;});
async function loadHighlights(){const [communities,members]=await Promise.all([supabase.from("communities").select("id,name,description").order("created_at",{ascending:false}).limit(5),supabase.from("community_members").select("community_id,user_id")]);if(communities.error){$("#communityHighlights").textContent=t("暂时无法加载社区","Could not load communities");return;}const counts={};(members.data||[]).forEach(x=>counts[x.community_id]=(counts[x.community_id]||0)+1);$("#communityHighlights").innerHTML=(communities.data||[]).map(c=>`<a class="eow-community-row" href="community-detail.html?id=${encodeURIComponent(c.id)}"><span class="eow-community-icon">◈</span><span><b>${esc(c.name)}</b><small>${counts[c.id]||0} ${document.documentElement.lang==="en"?"members":"位成员"}</small></span><span class="eow-row-arrow">›</span></a>`).join("")||`<div class="eow-empty">${t("还没有社区，去创建第一个吧。","No communities yet. Create the first one!")}</div>`;}
async function loadActiveMembers(){const {data:posts,error}=await supabase.from("posts").select("user_id,created_at").order("created_at",{ascending:false}).limit(40);if(error){$("#activeMembers").textContent=t("暂时无法加载成员","Could not load members");return;}const ids=[...new Set((posts||[]).map(p=>p.user_id).filter(id=>id!==shell.user.id))].slice(0,8);const profiles=await getProfiles(ids);$("#activeMembers").innerHTML=ids.map(id=>{const p=profiles[id];if(!p)return "";return `<a class="eow-story-user" href="profile.html?id=${encodeURIComponent(id)}">${avatarHTML(p,"eow-story-avatar")}<span>${esc(displayName(p))}</span></a>`;}).join("")||`<span class="eow-empty">${t("发布动态后，这里会展示活跃成员。","Active members will appear here as people post.")}</span>`;}
async function loadInvite(){
 const box=$("#inviteCode");if(!box)return;
 const {data,error}=await supabase.from("profiles").select("invite_code").eq("id",shell.user.id).maybeSingle();
 if(error||!data?.invite_code){box.textContent=t("邀请功能部署后开放","Invite links are not available yet");$("#copyInvite").disabled=true;return;}
 const url=new URL("register.html",location.href);url.searchParams.set("invite",data.invite_code);
 box.textContent=data.invite_code;$("#copyInvite").onclick=async()=>{try{await navigator.clipboard.writeText(url.href);$("#inviteNotice").textContent=t("邀请链接已复制，可以分享给朋友。","Invite link copied. Share it with your friends.");await trackActivity("invite_link_created");}catch{$("#inviteNotice").textContent=url.href;}};
}
async function suggestions(){const [users,following]=await Promise.all([supabase.from("profiles").select("id,username,display_name,avatar_url,bio").neq("id",shell.user.id).limit(5),supabase.from("follows").select("following_id").eq("follower_id",shell.user.id)]);if(users.error){$("#suggestions").textContent=t("暂时无法加载推荐用户","Could not load suggested users");return;}const followed=new Set((following.data||[]).map(x=>x.following_id));$("#suggestions").innerHTML=(users.data||[]).map(p=>`<div class="eow-suggest-row">${avatarHTML(p)}<div class="grow"><strong>${esc(displayName(p))}</strong><small>@${esc(p.username||"eow-member")}</small></div><button class="eow-follow-btn" data-follow="${esc(p.id)}" aria-pressed="${followed.has(p.id)}">${followed.has(p.id)?t("已关注","Following"):t("关注","Follow")}</button></div>`).join("")||t("暂时没有其他成员","No other members yet");}
$("#suggestions").addEventListener("click",async e=>{const b=e.target.closest("[data-follow]");if(!b)return;const id=b.dataset.follow;b.disabled=true;const isFollowing=b.getAttribute("aria-pressed")==="true";const result=isFollowing?await supabase.from("follows").delete().eq("follower_id",shell.user.id).eq("following_id",id):await supabase.from("follows").insert({follower_id:shell.user.id,following_id:id,created_at:new Date().toISOString()});if(result.error)alert(t("关注操作失败：","Follow action failed: ")+result.error.message);else{b.setAttribute("aria-pressed",String(!isFollowing));b.textContent=isFollowing?t("关注","Follow"):t("已关注","Following");}b.disabled=false;});
const i18n={zh:{navHome:"首页",navExplore:"发现",navCommunities:"社区",navNotifications:"通知",navMessages:"私信",createPost:"发布动态",shortcuts:"快捷入口",communities:"兴趣社区",friends:"好友",videos:"视频",myProfile:"个人主页",stories:"快拍",viewAll:"查看全部",shareMoment:"分享此刻",imageVideo:"图片 / 视频",publish:"发布动态",latestFeed:"最新动态",trendingNow:"热门话题",suggestedForYou:"为你推荐",likes:"点赞",comments:"条评论",likedLabel:"点赞",commentAction:"评论",share:"分享",savePost:"收藏",inviteFriends:"邀请朋友",inviteDescription:"分享你的专属邀请链接，邀请朋友加入 EOW。",copyInvite:"复制邀请链接",loadMore:"加载更多",feedEmpty:"还没有动态，发布第一条动态吧！",trendingEmpty:"动态中的 #话题 将显示在这里",noCommunities:"还没有社区，去创建第一个吧。",noSuggested:"暂时没有其他成员",event:"活动",poll:"发起投票"},en:{navHome:"Home",navExplore:"Explore",navCommunities:"Communities",navNotifications:"Notifications",navMessages:"Messages",createPost:"Create post",shortcuts:"Shortcuts",communities:"Communities",friends:"Friends",videos:"Videos",myProfile:"My profile",stories:"Stories",viewAll:"View all",shareMoment:"Share a moment",imageVideo:"Image / Video",publish:"Publish",latestFeed:"Latest feed",trendingNow:"Trending now",suggestedForYou:"Suggested for you",likes:"Likes",comments:"comments",likedLabel:"Like",commentAction:"Comment",share:"Share",savePost:"Save",inviteFriends:"Invite friends",inviteDescription:"Share your personal invite link and bring friends to EOW.",copyInvite:"Copy invite link",loadMore:"Load more",feedEmpty:"No posts yet. Be the first to share something!",trendingEmpty:"Hashtags from posts will appear here",noCommunities:"No communities yet. Create the first one!",noSuggested:"No other members yet",event:"Event",poll:"Create poll"}};
function applyLanguage(lang){const dict=i18n[lang]||i18n.zh;const nextHtmlLang=lang==="en"?"en":"zh-CN";const languageChanged=document.documentElement.lang!==nextHtmlLang;document.documentElement.lang=nextHtmlLang;document.title=lang==="en"?"EOW Global — Feed":"EOW Global — 动态广场";const search=document.querySelector("#globalSearch");if(search)search.placeholder=lang==="en"?"Search people, posts or communities…":"搜索用户、内容或社区…";const composer=document.querySelector("#postText");if(composer)composer.placeholder=lang==="en"?"What’s happening? Share it with the EOW community…":"今天有什么新鲜事？和 EOW 社区分享吧…";const mediaHint=document.querySelector("#mediaName");if(mediaHint&&!document.querySelector("#postMedia").files.length)mediaHint.textContent=lang==="en"?"Images or video · up to 30 MB per file":t("支持图片或视频，单个文件最大 30MB","Images or video · up to 30 MB per file");document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.textContent=dict[key];});document.querySelectorAll(".eow-global-nav [data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.textContent=dict[key];});const labels={admin:lang==="en"?"Admin":"管理后台",home:lang==="en"?"Home":"首页",discover:lang==="en"?"Explore":"发现",friends:lang==="en"?"Friends":"好友",messages:lang==="en"?"Messages":"私信",notifications:lang==="en"?"Notifications":"通知",communities:lang==="en"?"Communities":"社区",videos:lang==="en"?"Videos":"视频",profile:lang==="en"?"My profile":"个人主页",wallet:lang==="en"?"Wallet & gifts":"钱包礼物"};document.querySelector("#sideNav .side-user small")?.remove();document.querySelectorAll("#sideNav .navlink").forEach(a=>{if(a.id==="logoutLink"){const icon=a.querySelector(".navicon")?.outerHTML||"";a.innerHTML=icon+(lang==="en"?"Log out":"退出登录");return;}const href=(a.getAttribute("href")||"").split("?")[0].replace(".html","");const key=href.split("/").pop();if(labels[key]){const icon=a.querySelector(".navicon")?.outerHTML||"";a.innerHTML=icon+labels[key];}});document.querySelectorAll(".eow-language [data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));const notice=document.querySelector(".top-actions .btn");if(notice)notice.textContent=lang==="en"?"Notifications":"通知";localStorage.setItem("eow-language",lang);document.querySelectorAll(".comment-form .field").forEach(el=>el.placeholder=lang==="en"?"Write a comment…":"写下评论…");document.querySelectorAll(".comment-form button").forEach(el=>el.textContent=lang==="en"?"Send":"发送");document.querySelectorAll('[data-action="like"] .action-label').forEach(el=>el.textContent=lang==="en"?(el.closest("button").classList.contains("liked")?"Liked":"Like"):(el.closest("button").classList.contains("liked")?"已赞":"点赞"));document.querySelectorAll('[data-action="toggle-comments"] .action-label').forEach(el=>el.textContent=lang==="en"?"Comment":"评论");document.querySelectorAll('[data-action="share-post"] .action-label').forEach(el=>el.textContent=lang==="en"?"Share":"分享");document.querySelectorAll('[data-action="bookmark"] .action-label').forEach(el=>el.textContent=el.closest("button").getAttribute("aria-pressed")==="true"?(lang==="en"?"Saved":"已收藏"):(lang==="en"?"Save":"收藏"));document.querySelectorAll('[data-action="like"]').forEach(el=>el.setAttribute("aria-label",lang==="en"?"Like":"点赞"));document.querySelectorAll('[data-action="toggle-comments"]').forEach(el=>el.setAttribute("aria-label",lang==="en"?"Comment":"评论"));document.querySelectorAll('[data-action="bookmark"]').forEach(el=>el.setAttribute("aria-label",lang==="en"?"Save post":"收藏动态"));if(languageChanged)document.dispatchEvent(new CustomEvent("eow:languagechange",{detail:{lang}}));}
document.addEventListener("eow:languagechange",()=>{if(latestPosts.length)renderTrending(latestPosts);loadHighlights();suggestions();});
const savedLang=localStorage.getItem("eow-language")==="en"?"en":"zh";applyLanguage(savedLang);initSocialExtras(shell).catch(error=>{
 console.warn("EOW social extras failed to initialize:",error);
 const box=$("#activeMembers");
 if(box&&box.textContent.includes("加载"))box.textContent=t("快拍暂时无法加载，正在显示活跃成员…","Stories unavailable; loading active members…");
 loadActiveMembers().catch(fallbackError=>{console.warn("Active members fallback failed:",fallbackError);if(box)box.textContent=t("活跃成员暂时无法加载","Active members are temporarily unavailable");});
});
document.querySelectorAll(".eow-language [data-lang]").forEach(b=>b.addEventListener("click",()=>applyLanguage(b.dataset.lang)));
await Promise.allSettled([
 loadFeed(true).catch(error=>{console.error("Feed loading failed:",error);$("#feedStatus").textContent=t("动态加载失败：","Could not load posts: ")+(error?.message||error);$("#feedStatus").classList.add("error");}),
 suggestions().catch(error=>{console.error("Suggestions loading failed:",error);$("#suggestions").textContent=t("推荐暂时无法加载","Suggestions are temporarily unavailable");}),
 loadHighlights().catch(error=>{console.error("Community highlights failed:",error);$("#communityHighlights").textContent=t("社区暂时无法加载","Communities are temporarily unavailable");}),
 loadInvite().catch(error=>{console.warn("Invite info unavailable:",error);$("#inviteCode").textContent=t("邀请信息暂时无法加载","Invite information unavailable");})
]);
applyLanguage(savedLang);
}


