import {supabase,$,avatarHTML,displayName,getProfiles,esc,relativeTime} from "./shared.js?v=10";

const t=(zh,en)=>document.documentElement.lang==="en"?en:zh;
const upload=async(userId,file,prefix)=>{
  if(!file)throw new Error(t("请选择文件","Choose a file"));
  if(file.size>30*1024*1024)throw new Error(t("文件不能超过 30MB","File must be 30 MB or smaller"));
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=userId+"/"+prefix+"-"+Date.now()+"-"+safe;
  const {error}=await supabase.storage.from("posts").upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;
};

export async function renderPollCard(postId,userId){
  const {data:poll,error}=await supabase.from("eow_polls").select("id,closes_at").eq("post_id",postId).maybeSingle();
  if(error||!poll)return "";
  const [{data:options},{data:votes}]=await Promise.all([
    supabase.from("eow_poll_options").select("id,option_text,position").eq("poll_id",poll.id).order("position"),
    supabase.from("eow_poll_votes").select("option_id,user_id").eq("poll_id",poll.id)
  ]);
  const rows=options||[], allVotes=votes||[], myVote=allVotes.find(v=>v.user_id===userId);
  const total=allVotes.length, closed=poll.closes_at&&new Date(poll.closes_at)<=new Date();
  return `<section class="eow-poll" data-poll="${esc(poll.id)}"><div class="eow-poll-title">${t("投票","Poll")} · <span>${total} ${t("票","votes")}</span></div>${rows.map(o=>{const count=allVotes.filter(v=>v.option_id===o.id).length,pct=total?Math.round(count/total*100):0;return `<button class="eow-poll-option ${myVote?.option_id===o.id?"selected":""}" data-action="vote" data-vote-option="${esc(o.id)}" ${myVote||closed?"disabled":""}><span>${esc(o.option_text)}</span><b>${pct}% · ${count}</b><i style="width:${pct}%"></i></button>`;}).join("")}<small>${myVote?t("你已投票","You voted"):closed?t("投票已结束","Poll closed"):t("选择一个选项投票","Choose an option to vote")}</small></section>`;
}

export async function initSocialExtras(shell){
 const host=$("#activeMembers")?.closest(".eow-stories-panel");
 if(!host)return;
 host.insertAdjacentHTML("afterend",`<section class="eow-rail-card eow-events-panel"><div class="eow-panel-heading"><h2>${t("近期活动","Upcoming events")}</h2><button id="createEvent" class="eow-mini-action">＋ ${t("创建","Create")}</button></div><div id="eventList"><span class="eow-loading">${t("正在加载活动…","Loading events…")}</span></div></section>`);
 const storyInput=document.createElement("input");storyInput.type="file";storyInput.accept="image/*,video/*";storyInput.hidden=true;document.body.append(storyInput);
 const modal=document.createElement("div");modal.className="eow-modal-backdrop";modal.hidden=true;modal.innerHTML='<div class="eow-modal" role="dialog" aria-modal="true"><button class="eow-modal-close" type="button" aria-label="Close">×</button><div class="eow-modal-content"></div></div>';document.body.append(modal);
 const close=()=>{modal.hidden=true;modal.querySelector(".eow-modal-content").replaceChildren();};
 modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest(".eow-modal-close"))close();});
 const show=(title,body)=>{modal.querySelector(".eow-modal-content").innerHTML=`<h2>${title}</h2>${body}`;modal.hidden=false;};
 const stories=async()=>{
  const {data,error}=await supabase.from("eow_stories").select("*").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(40);
  const box=$("#activeMembers");if(error){console.warn(error);return;}
  const ids=[...new Set((data||[]).map(x=>x.user_id))],profiles=await getProfiles(ids);
  const mine=(data||[]).filter(x=>x.user_id===shell.user.id);
  box.innerHTML=`<button class="eow-story-create" id="addStory"><span>＋</span><b>${t("发布快拍","Add story")}</b></button>`+(data||[]).map(s=>{const p=profiles[s.user_id];if(!p)return "";return `<button class="eow-story-user" data-story="${esc(s.id)}"><span class="eow-story-ring">${avatarHTML(p,"eow-story-avatar")}</span><span>${esc(displayName(p))}</span></button>`;}).join("")||`<span class="eow-empty">${t("发布 24 小时快拍，与朋友分享此刻","Share a moment that stays for 24 hours")}</span>`;
  $("#addStory").addEventListener("click",()=>storyInput.click());
  box.querySelectorAll("[data-story]").forEach(b=>b.addEventListener("click",()=>viewStory(b.dataset.story)));
  $("#addStory").title=mine.length?t("你已有快拍","You have active stories"):t("添加你的第一条快拍","Add your first story");
 };
 const viewStory=async id=>{
  const {data:s,error}=await supabase.from("eow_stories").select("*").eq("id",id).maybeSingle();if(error||!s)return;
  show(t("EOW 快拍","EOW Story"),`<div class="eow-story-viewer">${s.media_type==="video"?`<video src="${esc(s.media_url)}" controls autoplay playsinline></video>`:`<img src="${esc(s.media_url)}" alt="Story">`}<p>${esc(s.caption)}</p><small>${relativeTime(s.created_at)}</small></div>`);
 };
 storyInput.addEventListener("change",async()=>{
  const file=storyInput.files?.[0];if(!file)return;
  try{const url=await upload(shell.user.id,file,"story");const caption=prompt(t("添加快拍文字（可留空）","Add a story caption (optional)"))||"";const {error}=await supabase.from("eow_stories").insert({user_id:shell.user.id,media_url:url,media_type:file.type.startsWith("video/")?"video":"image",caption:caption.slice(0,500)});if(error)throw error;await stories();}
  catch(e){alert(t("快拍发布失败：","Story upload failed: ")+e.message);}finally{storyInput.value="";}
 });
 const eventList=async()=>{
  const {data,error}=await supabase.from("eow_events").select("*").gte("starts_at",new Date(Date.now()-86400000).toISOString()).order("starts_at").limit(8);
  const box=$("#eventList");if(error){box.textContent=t("活动加载失败","Could not load events");return;}
  const events=data||[];if(!events.length){box.innerHTML=`<p class="eow-empty">${t("还没有近期活动，创建一个邀请大家参加吧。","No upcoming events yet. Create one and invite people.")}</p>`;return;}
  const ids=events.map(e=>e.organizer_id),profiles=await getProfiles(ids);
  const r=await supabase.from("eow_event_rsvps").select("event_id,user_id,status").in("event_id",events.map(e=>e.id));
  const rsvps=r.data||[];
  box.innerHTML=events.map(ev=>{const mine=rsvps.find(x=>x.event_id===ev.id&&x.user_id===shell.user.id);const count=rsvps.filter(x=>x.event_id===ev.id&&x.status==="going").length;return `<article class="eow-event-card" data-event="${esc(ev.id)}"><b>${esc(ev.title)}</b><small>${new Date(ev.starts_at).toLocaleString(document.documentElement.lang==="en"?"en-US":"zh-CN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})} · ${esc(ev.location||t("线上活动","Online"))}</small><p>${esc(ev.description||"")}</p><div><span>${count} ${t("将参加","going")}</span><button class="eow-mini-action" data-rsvp="${esc(ev.id)}" data-going="${mine?"1":"0"}">${mine?t("取消参加","Cancel"):t("参加","I'm going")}</button></div></article>`;}).join("");
 };
 $("#eventList").addEventListener("click",async e=>{const b=e.target.closest("[data-rsvp]");if(!b)return;b.disabled=true;const id=b.dataset.rsvp;const old=b.dataset.going==="1";const res=old?await supabase.from("eow_event_rsvps").delete().eq("event_id",id).eq("user_id",shell.user.id):await supabase.from("eow_event_rsvps").insert({event_id:id,user_id:shell.user.id,status:"going"});if(res.error)alert(t("操作失败：","Action failed: ")+res.error.message);await eventList();});
 $("#createEvent").addEventListener("click",async()=>{
  const title=prompt(t("活动名称","Event title"));if(!title?.trim())return;
  const when=prompt(t("活动开始时间（例如 2026-12-01 18:00）","Start time (e.g. 2026-12-01 18:00)"));if(!when)return;
  const starts=new Date(when);if(Number.isNaN(starts.getTime())||starts<=new Date()){alert(t("请输入有效的未来时间","Enter a valid future date and time"));return;}
  const location=prompt(t("活动地点或线上链接","Location or online link"))||"";
  const description=prompt(t("活动介绍（可留空）","Description (optional)"))||"";
  const {error}=await supabase.from("eow_events").insert({organizer_id:shell.user.id,title:title.trim().slice(0,120),starts_at:starts.toISOString(),location:location.slice(0,240),description:description.slice(0,2000)});
  if(error)alert(t("创建失败：","Could not create event: ")+error.message);else await eventList();
 });
 const toolbar=document.querySelector(".eow-composer-actions");
 if(toolbar&&!$("#eowPollCreate"))toolbar.insertAdjacentHTML("beforeend",`<button id="eowPollCreate" type="button" class="eow-tool-btn">▤ ${t("发起投票","Poll")}</button><button id="eowSavedOpen" type="button" class="eow-tool-btn">▣ ${t("我的收藏","Saved")}</button>`);
 $("#eowPollCreate").addEventListener("click",async()=>{
  const question=prompt(t("投票问题","Poll question"));if(!question?.trim())return;
  const raw=prompt(t("输入选项，以英文逗号分隔（至少两个）","Options separated by commas (at least two)"),"选项一,选项二");if(!raw)return;
  const options=raw.split(/[,，]/).map(x=>x.trim()).filter(Boolean).slice(0,6);if(options.length<2){alert(t("至少需要两个选项","At least two options are required"));return;}
  const {data:post,error:pErr}=await supabase.from("posts").insert({user_id:shell.user.id,content:question.trim(),media_type:"text"}).select("id").single();if(pErr){alert(pErr.message);return;}
  const {data:poll,error:qErr}=await supabase.from("eow_polls").insert({post_id:post.id}).select("id").single();if(qErr){alert(qErr.message);return;}
  const {error:oErr}=await supabase.from("eow_poll_options").insert(options.map((option_text,position)=>({poll_id:poll.id,option_text,position})));
  if(oErr)alert(t("投票选项创建失败：","Could not create poll options: ")+oErr.message);else location.reload();
 });
 $("#eowSavedOpen").addEventListener("click",async()=>{
  show(t("我的收藏","Saved posts"),`<div id="savedPostsList" class="eow-saved-list">${t("正在加载…","Loading…")}</div>`);
  const {data:saved,error}=await supabase.from("eow_saved_posts").select("post_id,created_at").eq("user_id",shell.user.id).order("created_at",{ascending:false});
  const box=$("#savedPostsList");if(error){box.textContent=error.message;return;}if(!saved?.length){box.textContent=t("还没有收藏的动态。","No saved posts yet.");return;}
  const ids=saved.map(x=>x.post_id),{data:posts}=await supabase.from("posts").select("*").in("id",ids);
  const rows=posts||[];const profiles=await getProfiles(rows.map(p=>p.user_id));
  box.innerHTML=rows.map(p=>`<article class="eow-saved-row"><a href="feed.html#post-${encodeURIComponent(p.id)}">${esc((p.content||t("媒体动态","Media post")).slice(0,160))}</a><button data-unsave="${esc(p.id)}" class="eow-mini-action">${t("取消收藏","Remove")}</button></article>`).join("");
  box.addEventListener("click",async ev=>{const b=ev.target.closest("[data-unsave]");if(!b)return;const {error}=await supabase.from("eow_saved_posts").delete().eq("user_id",shell.user.id).eq("post_id",b.dataset.unsave);if(error)alert(error.message);else b.closest(".eow-saved-row").remove();},{once:true});
 });
 await Promise.all([stories(),eventList()]);
}
