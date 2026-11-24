import {supabase,$,initShell,getProfiles,displayName,avatarHTML,esc} from "./shared.js?v=5";
const shell=await initShell("videos");
if(shell){
 let offset=0; const size=12;
 async function load(reset=false){
  if(reset){offset=0;$("#videoGrid").innerHTML="";}
  $("#videoStatus").textContent="正在加载视频…";
  const {data:posts,error}=await supabase.from("posts").select("id,user_id,content,media_url,media_type,created_at").eq("media_type","video").not("media_url","is",null).order("created_at",{ascending:false}).range(offset,offset+size-1);
  if(error){$("#videoStatus").textContent="视频读取失败："+error.message;return;}
  if(!posts?.length && offset===0){$("#videoStatus").textContent="暂时还没有视频动态。";$("#loadMoreVideos").hidden=true;return;}
  const profiles=await getProfiles(posts.map(p=>p.user_id));
  $("#videoGrid").insertAdjacentHTML("beforeend",posts.map(p=>`<article class="post video-card" data-post="${esc(p.id)}"><div class="post-head">${avatarHTML(profiles[p.user_id])}<div class="meta"><strong>${esc(displayName(profiles[p.user_id]))}</strong><small>${new Date(p.created_at).toLocaleString("zh-CN")}</small></div></div>${p.content?`<p class="post-content">${esc(p.content)}</p>`:""}<video class="post-media" src="${esc(p.media_url)}" controls playsinline preload="metadata"></video></article>`).join(""));
  offset+=posts.length;$("#videoStatus").textContent=`已显示 ${offset} 个视频`;$("#loadMoreVideos").hidden=posts.length<size;
 }
 $("#loadMoreVideos").addEventListener("click",()=>load());
 await load(true);
}
