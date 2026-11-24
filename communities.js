import {supabase,$,initShell,setNotice,esc,trackActivity} from "./shared.js?v=21";
const shell=await initShell("communities");if(shell){let communities=[],joined=new Set(),counts={};
 async function load(){$("#communityStatus").textContent="正在加载社区…";const [c,m]=await Promise.all([supabase.from("communities").select("id,name,description,owner_id,created_at").order("created_at",{ascending:false}).limit(150),supabase.from("community_members").select("community_id,user_id")]);if(c.error){$("#communityStatus").textContent="读取社区失败："+c.error.message;return;}if(m.error){$("#communityStatus").textContent="读取成员信息失败："+m.error.message;return;}communities=c.data||[];joined=new Set((m.data||[]).filter(x=>x.user_id===shell.user.id).map(x=>x.community_id));counts={};(m.data||[]).forEach(x=>counts[x.community_id]=(counts[x.community_id]||0)+1);render();}
 function render(){const q=$("#communitySearch").value.trim().toLowerCase();const list=communities.filter(c=>(c.name||"").toLowerCase().includes(q)||(c.description||"").toLowerCase().includes(q));$("#communityStatus").textContent=`共 ${communities.length} 个社区 · 显示 ${list.length} 个`;$("#communityList").innerHTML=list.map(c=>`<article class="community-card" data-community-open="${esc(c.id)}" style="cursor:pointer"><div class="community-top"><div class="community-icon">◉</div><div><strong>${esc(c.name)}</strong><div class="muted" style="font-size:12px">创建于 ${new Date(c.created_at||Date.now()).toLocaleDateString("zh-CN")}</div></div></div><p>${esc(c.description||"欢迎加入社区，一起交流分享。")}</p><div class="community-meta"><span>👥 ${counts[c.id]||0} 位成员</span><span>${joined.has(c.id)?"已加入":"开放加入"}</span></div><button class="btn ${joined.has(c.id)?"secondary":""} small" data-community="${esc(c.id)}" data-joined="${joined.has(c.id)}" ${c.owner_id===shell.user.id?"disabled":""}>${c.owner_id===shell.user.id?"社区创建者":joined.has(c.id)?"退出社区":"加入社区"}</button></article>`).join("")||'<div class="empty">没有找到社区。试试其他关键词，或创建一个新社区。</div>';}
 $("#communitySearch").addEventListener("input",render);
 $("#createCommunity").onsubmit=async e=>{e.preventDefault();const name=$("#communityName").value.trim(),description=$("#communityDescription").value.trim();if(!name)return;const btn=e.target.querySelector("button");btn.disabled=true;const {data,error}=await supabase.from("communities").insert({name,description,owner_id:shell.user.id,created_at:new Date().toISOString()}).select("id").single();if(error){setNotice($("#communityNotice"),"创建失败："+error.message,"error");btn.disabled=false;return;}const {error:memberErr}=await supabase.from("community_members").insert({community_id:data.id,user_id:shell.user.id,role:"owner",joined_at:new Date().toISOString()});if(memberErr)setNotice($("#communityNotice"),"社区已创建，但自动加入失败："+memberErr.message,"error");else{await trackActivity("community_joined");setNotice($("#communityNotice"),"社区创建成功，已自动加入！","success");}e.target.reset();btn.disabled=false;await load();};
 $("#communityList").addEventListener("click",async e=>{const b=e.target.closest("[data-community]");if(!b)return;const id=b.dataset.community,isJoined=b.dataset.joined==="true";b.disabled=true;let result;if(isJoined)result=await supabase.from("community_members").delete().eq("community_id",id).eq("user_id",shell.user.id);else{const {data:existing,error:checkErr}=await supabase.from("community_members").select("community_id").eq("community_id",id).eq("user_id",shell.user.id).maybeSingle();if(checkErr){alert("检查成员状态失败："+checkErr.message);b.disabled=false;return;}result=existing?{error:null}:await supabase.from("community_members").insert({community_id:id,user_id:shell.user.id,role:"member",joined_at:new Date().toISOString()});}if(result.error)alert((isJoined?"退出":"加入")+"失败："+result.error.message);else if(!isJoined)await trackActivity("community_joined");await load();});
 await load();}
 // 点击社区卡片进入详情页
$("#communityList").addEventListener("click", e => {
    // 点击加入或退出按钮时，不进行页面跳转
    if (e.target.closest("button")) return;

    const card = e.target.closest("[data-community-open]");
    if (!card) return;

    const id = card.dataset.communityOpen;

    window.location.href =
        "community-detail.html?id=" + encodeURIComponent(id);
});

