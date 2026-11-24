import {supabase,$,initShell,shellHeader,avatarHTML,displayName,getProfiles,postCard,setNotice,esc} from "./shared.js?v=8";
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
for(const p of posts){const liked=likes.some(l=>l.post_id===p.id&&l.user_id===shell.user.id);const cs=comments.filter(c=>c.post_id===p.id).map(c=>({...c,profile:profiles[c.user_id]}));$("#feed").insertAdjacentHTML("beforeend",postCard(p,profiles[p.user_id],liked,cs,shell.user.id));}
offset+=posts.length;$("#feedStatus").textContent=`已显示 ${offset} 条动态`;$("#loadMore").hidden=posts.length<pageSize;
}
$("#postForm").addEventListener("submit",async e=>{e.preventDefault();const text=$("#postText").value.trim();const file=$("#postMedia").files[0];if(!text&&!file){setNotice($("#postNotice"),"请填写动态内容或选择图片/视频。","error");return;}if(file&&file.size>30*1024*1024){setNotice($("#postNotice"),"文件不能超过 30MB。","error");return;}
const btn=$("#publishBtn");btn.disabled=true;btn.textContent="正在发布…";try{let mediaUrl=null,mediaType=null;if(file){const path=`${shell.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:upErr}=await supabase.storage.from("posts").upload(path,file,{upsert:false,contentType:file.type});if(upErr)throw upErr;mediaUrl=supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;mediaType=file.type.startsWith("video/")?"video":"image";}
const {error}=await supabase.from("posts").insert({user_id:shell.user.id,content:text,media_url:mediaUrl,media_type:mediaType,created_at:new Date().toISOString()});if(error)throw error;$("#postText").value="";$("#postMedia").value="";$("#mediaName").textContent="支持图片或视频，单个文件最大 30MB";setNotice($("#postNotice"),"发布成功！","success");await loadFeed(true);
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
if(btn.dataset.action==="like"){btn.disabled=true;try{const {data:existing,error:findErr}=await supabase.from("likes").select("id").eq("post_id",postId).eq("user_id",shell.user.id).maybeSingle();if(findErr)throw findErr;if(existing){const {error}=await supabase.from("likes").delete().eq("id",existing.id);if(error)throw error;btn.classList.remove("liked");btn.querySelector("span").textContent="点赞";}else{const {error}=await supabase.from("likes").insert({post_id:postId,user_id:shell.user.id,created_at:new Date().toISOString()});if(error)throw error;btn.classList.add("liked");btn.querySelector("span").textContent="已赞";}}catch(err){alert("点赞操作失败："+err.message);}finally{btn.disabled=false;}}
});
$("#feed").addEventListener("submit",async e=>{if(!e.target.matches(".comment-form"))return;e.preventDefault();const postId=e.target.closest("[data-post]").dataset.post;const input=e.target.elements.content;const content=input.value.trim();if(!content)return;const submit=e.target.querySelector("button");submit.disabled=true;const {error}=await supabase.from("comments").insert({post_id:postId,user_id:shell.user.id,content,created_at:new Date().toISOString()});if(error)alert("评论失败："+error.message);else{const row=document.createElement("div");row.className="comment";row.innerHTML=`<strong>${displayName(shell.profile)}</strong>`;row.append(document.createTextNode(content));e.target.before(row);input.value="";}submit.disabled=false;});
$("#loadMore").addEventListener("click",()=>loadFeed());
async function loadTrending(){
 const box=$("#trendingPosts");if(!box)return;
 const {data,error}=await supabase.from("posts").select("id,content,created_at").order("created_at",{ascending:false}).limit(60);
 if(error){box.textContent="暂时无法加载热门动态";return;}
 const rows=data||[];if(!rows.length){box.innerHTML='<div class="muted">还没有热门内容，来发布第一条动态吧。</div>';return;}
 const ids=rows.map(x=>x.id);const [likes,comments]=await Promise.all([supabase.from("likes").select("post_id").in("post_id",ids),supabase.from("comments").select("post_id").in("post_id",ids)]);
 const score={};(likes.data||[]).forEach(x=>score[x.post_id]=(score[x.post_id]||0)+1);(comments.data||[]).forEach(x=>score[x.post_id]=(score[x.post_id]||0)+2);
 rows.sort((a,b)=>(score[b.id]||0)-(score[a.id]||0));
 box.innerHTML=rows.slice(0,5).map((p,i)=>'<a class="trending-item" href="#feed" data-trend="'+esc(p.id)+'"><span class="trend-number">'+(i+1)+'</span><span class="trend-copy"><strong>'+esc((p.content||"分享了一张图片").slice(0,46))+'</strong><small>'+(score[p.id]||0)+' 次互动 · '+new Date(p.created_at).toLocaleDateString()+'</small></span></a>').join("");
 box.querySelectorAll("[data-trend]").forEach(a=>a.addEventListener("click",()=>{const card=document.querySelector('[data-post="'+a.dataset.trend+'"]');card?.scrollIntoView({behavior:"smooth",block:"center"});}));
}
async function loadInvite(){
 const box=$("#inviteCode");if(!box)return;
 const {data,error}=await supabase.from("profiles").select("invite_code").eq("id",shell.user.id).maybeSingle();
 if(error||!data?.invite_code){box.textContent="邀请功能部署后开放";$("#copyInvite").disabled=true;return;}
 const url=new URL("register.html",location.href);url.searchParams.set("invite",data.invite_code);
 box.textContent=data.invite_code;$("#copyInvite").onclick=async()=>{try{await navigator.clipboard.writeText(url.href);$("#inviteNotice").textContent="邀请链接已复制，可以分享给朋友。";}catch{$("#inviteNotice").textContent=url.href;}};
}
async function suggestions(){const {data,error}=await supabase.from("profiles").select("id,username,display_name,avatar_url,bio").neq("id",shell.user.id).limit(4);if(error){$("#suggestions").textContent="暂时无法加载推荐用户";return;}$("#suggestions").innerHTML=(data||[]).map(p=>`<div class="suggestion">${avatarHTML(p)}<div class="grow"><strong>${displayName(p)}</strong><small>${p.username?"@"+p.username:"EOW 成员"}</small></div><a class="btn secondary small" href="profile.html?id=${encodeURIComponent(p.id)}">查看</a></div>`).join("")||"暂时没有其他成员";}
await Promise.all([loadFeed(true),suggestions(),loadTrending(),loadInvite()]);
}


