import {supabase,$,esc,avatarHTML,displayName,setNotice,shellHeader} from "./shared.js?v=6";
if($("#header")) $("#header").innerHTML=shellHeader();
const {data:{user},error:userError}=await supabase.auth.getUser();
if(userError||!user){location.href="login.html?next="+encodeURIComponent("/admin.html");}
else{
 const {data:admin,error:adminError}=await supabase.from("eow_admins").select("user_id,role").eq("user_id",user.id).maybeSingle();
 if(adminError||!admin){$("#adminStatus").textContent="没有管理员权限。请由项目所有者在 Supabase SQL Editor 中将你的用户 UUID 添加到 eow_admins。";$("#adminStatus").classList.add("error");}
 else{
  $("#adminStatus").textContent=`已验证管理员身份：${admin.role}`;$("#adminApp").hidden=false;
  const escText=v=>esc(v??"");
  async function audit(action,targetType,targetId,details={}){const {error}=await supabase.from("eow_admin_audit_logs").insert({admin_id:user.id,action,target_type:targetType,target_id:targetId,details});if(error)console.warn("audit log:",error.message);}
  async function stats(){
   const names=["profiles","posts","communities","community_members","eow_verification_applications","eow_reports","eow_topup_orders"];
   const counts=await Promise.all(names.map(async t=>{const {count,error}=await supabase.from(t).select("*",{count:"exact",head:true});return error?"—":(count??0);}));
   const labels=["注册用户","动态总数","社区数量","社区成员关系","待审认证（总申请）","举报总数","充值订单"];
   $("#stats").innerHTML=labels.map((x,i)=>`<div class="admin-stat"><span class="muted">${x}</span><strong>${counts[i]}</strong></div>`).join("");
  }
  async function loadUsers(){
   const q=$("#userSearch").value.trim();
   let req=supabase.from("profiles").select("id,username,display_name,avatar_url,created_at").order("created_at",{ascending:false}).limit(150);
   if(q)req=req.or(`display_name.ilike.%${q}%,username.ilike.%${q}%`);
   const {data,error}=await req;$("#usersBody").innerHTML=error?`<tr><td colspan="5">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(p=>`<tr><td>${avatarHTML(p)} ${escText(displayName(p))}</td><td>${escText(p.username)}</td><td>${"资料用户"}</td><td>${p.created_at?new Date(p.created_at).toLocaleDateString("zh-CN"):"—"}</td><td><div class="admin-actions"><button data-wallet-adjust="${p.id}">调整金币</button></div></td></tr>`).join("")||"<tr><td colspan='5'>暂无用户</td></tr>";
  }
  async function loadPosts(){
   const {data,error}=await supabase.from("posts").select("id,user_id,content,media_type,created_at").order("created_at",{ascending:false}).limit(100);
   $("#postsBody").innerHTML=error?`<tr><td colspan="5">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(p=>`<tr><td>${escText(p.user_id)}</td><td>${escText((p.content||"").slice(0,120))}</td><td>${escText(p.media_type||"文字")}</td><td>${new Date(p.created_at).toLocaleString("zh-CN")}</td><td><div class="admin-actions"><button class="danger" data-post-delete="${p.id}">删除动态</button></div></td></tr>`).join("")||"<tr><td colspan='5'>暂无动态</td></tr>";
  }
  async function loadVerifications(){
   const {data,error}=await supabase.from("eow_verification_applications").select("*").order("created_at",{ascending:false}).limit(100);
   $("#verificationBody").innerHTML=error?`<tr><td colspan="5">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(v=>`<tr><td>${escText(v.user_id)}</td><td>${escText(v.reason||"")}</td><td>${escText(v.status)}</td><td>${new Date(v.created_at).toLocaleString("zh-CN")}</td><td><div class="admin-actions"><button data-verification="${v.id}" data-status="approved">通过</button><button class="danger" data-verification="${v.id}" data-status="rejected">拒绝</button></div></td></tr>`).join("")||"<tr><td colspan='5'>暂无申请</td></tr>";
  }
  async function loadReports(){
   const {data,error}=await supabase.from("eow_reports").select("*").order("created_at",{ascending:false}).limit(100);
   $("#reportsBody").innerHTML=error?`<tr><td colspan="5">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(r=>`<tr><td>${escText(r.reporter_id)}</td><td>${escText(r.target_type)} · ${escText(r.target_id)}</td><td>${escText(r.reason)}</td><td>${escText(r.status)}</td><td><div class="admin-actions"><button data-report="${r.id}" data-status="resolved">标记已处理</button><button data-report="${r.id}" data-status="dismissed">驳回</button></div></td></tr>`).join("")||"<tr><td colspan='5'>暂无举报</td></tr>";
  }
  async function loadGifts(){
   const {data,error}=await supabase.from("eow_gifts").select("*").order("created_at",{ascending:false});
   $("#giftsBody").innerHTML=error?`<tr><td colspan="4">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(g=>`<tr><td>${g.image_url?`<img src="${escText(g.image_url)}" width="36" height="36" style="object-fit:cover;border-radius:8px"> `:""}${escText(g.name)}</td><td>${g.price_coins} 金币</td><td>${g.active?"上架":"下架"}</td><td><div class="admin-actions"><button data-gift-toggle="${g.id}" data-value="${!g.active}">${g.active?"下架":"上架"}</button><button class="danger" data-gift-delete="${g.id}">删除</button></div></td></tr>`).join("")||"<tr><td colspan='4'>暂无礼物</td></tr>";
  }
  async function loadOrders(){
   const {data,error}=await supabase.from("eow_topup_orders").select("id,user_id,amount_cny,status,created_at").order("created_at",{ascending:false}).limit(100);
   $("#ordersBody").innerHTML=error?`<tr><td colspan="5">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(o=>`<tr><td>${escText(o.id)}</td><td>${escText(o.user_id)}</td><td>¥${Number(o.amount_cny).toFixed(2)}</td><td>${escText(o.status)}</td><td>${new Date(o.created_at).toLocaleString("zh-CN")}</td></tr>`).join("")||"<tr><td colspan='5'>暂无订单</td></tr>";
  }
  async function loadSettings(){
   const {data,error}=await supabase.from("eow_site_settings").select("key,value").in("key",["announcement","default_cover"]);
   if(error)return;const map=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));$("#siteAnnouncement").value=map.announcement||"";$("#defaultCover").value=map.default_cover||"";
  }
  async function loadAudit(){
   const {data,error}=await supabase.from("eow_admin_audit_logs").select("*").order("created_at",{ascending:false}).limit(100);
   $("#auditBody").innerHTML=error?`<tr><td colspan="5">读取失败：${escText(error.message)}</td></tr>`:(data||[]).map(a=>`<tr><td>${new Date(a.created_at).toLocaleString("zh-CN")}</td><td>${escText(a.admin_id)}</td><td>${escText(a.action)}</td><td>${escText(a.target_type)} ${escText(a.target_id)}</td><td>${escText(JSON.stringify(a.details||{}))}</td></tr>`).join("")||"<tr><td colspan='5'>暂无日志</td></tr>";
  }
  async function loadPostReports(){
   const {data,error}=await supabase.from("post_reports").select("id,post_id,reporter_id,reason,status,created_at").order("created_at",{ascending:false}).limit(150);
   $("#postReportsBody").innerHTML=error?`<tr><td colspan="6">读取失败：${escText(error.message)}。请确认已执行 EOW_内容举报功能.sql。</td></tr>`:(data||[]).map(r=>`<tr><td>${escText(r.reporter_id)}</td><td>${escText(r.post_id)}</td><td>${escText(r.reason)}</td><td>${escText(r.status)}</td><td>${new Date(r.created_at).toLocaleString("zh-CN")}</td><td><div class="admin-actions"><button data-postreport="${escText(r.id)}" data-status="resolved">处理完成</button><button class="danger" data-postreport="${escText(r.id)}" data-status="dismissed">驳回</button></div></td></tr>`).join("")||"<tr><td colspan='6'>暂无动态举报</td></tr>";
  }
  const loaders={users:loadUsers,posts:loadPosts,verifications:loadVerifications,reports:loadReports,postreports:loadPostReports,gifts:loadGifts,finance:loadOrders,settings:loadSettings,audit:loadAudit};
  document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",async()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===btn));document.querySelectorAll(".admin-panel").forEach(x=>x.hidden=x.id!=="tab-"+btn.dataset.tab);await loaders[btn.dataset.tab]();}));
  $("#userSearch").addEventListener("input",loadUsers);
  $("#adminApp").addEventListener("click",async e=>{
   const b=e.target.closest("button");if(!b)return;b.disabled=true;
   try{
    if(b.dataset.walletAdjust){const raw=prompt("请输入金币调整数量（正数增加，负数扣减）：");if(raw===null)return;const delta=Number(raw);if(!Number.isSafeInteger(delta)||delta===0)throw new Error("请输入非零整数");const note=prompt("请输入调整原因：")||"后台人工调整";const {error}=await supabase.rpc("eow_admin_adjust_coins",{p_user:b.dataset.walletAdjust,p_delta:delta,p_note:note});if(error)throw error;await audit("adjust_coins","user",b.dataset.walletAdjust,{delta,note});alert("金币调整成功。");}
    else if(b.dataset.userVerify){const value=b.dataset.value==="true";const {error}=await supabase.rpc("eow_admin_set_verified",{p_user:b.dataset.userVerify,p_verified:value});if(error)throw error;await loadUsers();}
    else if(b.dataset.postDelete){const {error}=await supabase.from("posts").delete().eq("id",b.dataset.postDelete);if(error)throw error;await audit("delete_post","post",b.dataset.postDelete);await loadPosts();}
    else if(b.dataset.verification){const status=b.dataset.status;const {data:app,error}=await supabase.from("eow_verification_applications").update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq("id",b.dataset.verification).select("user_id").single();if(error)throw error;if(status==="approved"){const {error:ve}=await supabase.rpc("eow_admin_set_verified",{p_user:app.user_id,p_verified:true});if(ve)throw ve;}await audit("review_verification","verification",b.dataset.verification,{status});await loadVerifications();}
    else if(b.dataset.postreport){const status=b.dataset.status;const {error}=await supabase.from("post_reports").update({status}).eq("id",b.dataset.postreport);if(error)throw error;await audit("review_post_report","post_report",b.dataset.postreport,{status});await loadPostReports();}
    else if(b.dataset.report){const status=b.dataset.status;const {error}=await supabase.from("eow_reports").update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq("id",b.dataset.report);if(error)throw error;await audit("review_report","report",b.dataset.report,{status});await loadReports();}
    else if(b.dataset.giftToggle){const {error}=await supabase.from("eow_gifts").update({active:b.dataset.value==="true"}).eq("id",b.dataset.giftToggle);if(error)throw error;await audit("toggle_gift","gift",b.dataset.giftToggle);await loadGifts();}
    else if(b.dataset.giftDelete){const {error}=await supabase.from("eow_gifts").delete().eq("id",b.dataset.giftDelete);if(error)throw error;await audit("delete_gift","gift",b.dataset.giftDelete);await loadGifts();}
   }catch(err){alert("操作失败："+err.message);}finally{b.disabled=false;}
  });
  $("#giftForm").onsubmit=async e=>{e.preventDefault();const {error}=await supabase.from("eow_gifts").insert({name:$("#giftName").value.trim(),price_coins:Number($("#giftPrice").value),image_url:$("#giftImage").value.trim()||null,active:true});if(error){alert("添加失败："+error.message);return;}await audit("create_gift","gift",null,{name:$("#giftName").value});e.target.reset();await loadGifts();};
  $("#settingsForm").onsubmit=async e=>{e.preventDefault();for(const [key,value] of [["announcement",$("#siteAnnouncement").value],["default_cover",$("#defaultCover").value]]){const {error}=await supabase.from("eow_site_settings").upsert({key,value,updated_by:user.id,updated_at:new Date().toISOString()});if(error){setNotice($("#settingsNotice"),"保存失败："+error.message,"error");return;}}await audit("update_site_settings","settings",null);setNotice($("#settingsNotice"),"设置已保存。","success");};
  await Promise.all([stats(),loadUsers()]);
 }
}





