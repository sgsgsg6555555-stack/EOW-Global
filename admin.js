import {supabase,$,esc,avatarHTML,displayName,shellHeader,getProfiles} from "./shared.js?v=4";

if($("#header")) $("#header").innerHTML=shellHeader();
const status=$("#adminStatus");
const app=$("#adminApp");
const safe=v=>esc(v??"");
const date=v=>v?new Date(v).toLocaleString("zh-CN"):"—";
const cellError=(id,cols,error)=>{$("#"+id).innerHTML=`<tr><td colspan="${cols}">读取失败：${safe(error?.message||"未知错误")}</td></tr>`;};
const empty=(id,cols,label="暂无记录")=>{$("#"+id).innerHTML=`<tr><td colspan="${cols}">${label}</td></tr>`;};
async function countRows(table,filter){
 let q=supabase.from(table).select("id",{count:"exact",head:true});
 if(filter)q=filter(q);
 const {count,error}=await q;
 return error?"—":(count??0);
}
async function loadStats(){
 const specs=[
  ["注册用户","profiles"],["动态总数","posts"],["社区数量","communities"],
  ["待审蓝 V","eow_verification_applications",q=>q.eq("status","pending")],
  ["待处理举报","eow_reports",q=>q.eq("status","pending")],
  ["上架礼物","eow_gifts",q=>q.eq("is_active",true)],
  ["待处理充值单","eow_topup_orders",q=>q.eq("status","pending")]
 ];
 const values=await Promise.all(specs.map(s=>countRows(s[1],s[2])));
 $("#stats").innerHTML=specs.map((s,i)=>`<div class="admin-stat"><span>${s[0]}</span><strong>${values[i]}</strong></div>`).join("");
}
async function loadUsers(){
 const q=$("#userSearch").value.trim();
 let req=supabase.from("profiles").select("id,username,display_name,avatar_url,created_at,is_verified").order("created_at",{ascending:false}).limit(150);
 if(q)req=req.ilike("username",\`%\${q.replace(/[%_,]/g,"")}%\`);
 const {data,error}=await req;
 if(error)return cellError("usersBody",5,error);
 $("#usersBody").innerHTML=(data||[]).map(p=>\`<tr><td>\${avatarHTML(p)} \${safe(displayName(p))} \${p.is_verified?'<span class="admin-pill">蓝 V</span>':""}</td><td>\${safe(p.username)}</td><td><small>\${safe(p.id)}</small></td><td>\${date(p.created_at)}</td><td><button class="admin-user-open" type="button" data-user-detail="\${safe(p.id)}">查看详情</button></td></tr>\`).join("");
 if(!data?.length)empty("usersBody",5);
}
async function loadPosts(){
 const {data,error}=await supabase.from("posts").select("id,user_id,content,media_type,created_at").order("created_at",{ascending:false}).limit(100);
 if(error)return cellError("postsBody",4,error);
 $("#postsBody").innerHTML=(data||[]).map(p=>`<tr><td><small>${safe(p.user_id)}</small></td><td>${safe((p.content||"").slice(0,180))}</td><td>${safe(p.media_type||"文字")}</td><td>${date(p.created_at)}</td></tr>`).join("");
 if(!data?.length)empty("postsBody",4);
}
async function loadVerifications(){
 const {data,error}=await supabase.from("eow_verification_applications").select("id,user_id,real_name,application_type,document_url,reason,status,admin_note,reviewed_at,created_at").order("created_at",{ascending:false}).limit(100);
 if(error)return cellError("verificationBody",6,error);
 const people=await getProfiles((data||[]).map(v=>v.user_id));
 $("#verificationBody").innerHTML=(data||[]).map(v=>\`<tr><td>\${safe(displayName(people[v.user_id]))}<br><small>\${safe(v.real_name||"未填写")} · \${safe(v.application_type||"未分类")}<br>\${safe(v.user_id)}</small></td><td>\${safe(v.reason||"")}</td><td>\${v.document_url?\`<a class="admin-link" href="\${safe(v.document_url)}" target="_blank" rel="noopener noreferrer">查看证明</a>\`:"未提供"}</td><td><span class="admin-pill">\${safe(v.status)}</span>\${v.admin_note?\`<div class="admin-note">\${safe(v.admin_note)}</div>\`:""}</td><td>\${date(v.created_at)}</td><td>\${v.status==="pending"?\`<button class="btn small" data-review="\${safe(v.id)}" data-status="approved">通过</button> <button class="btn secondary small" data-review="\${safe(v.id)}" data-status="rejected">拒绝</button>\`:"已审核"}</td></tr>\`).join("");
 if(!data?.length)empty("verificationBody",6);
}
async function loadReports(){
 const {data,error}=await supabase.from("eow_reports").select("id,reporter_id,target_type,target_id,reason,description,status,created_at").order("created_at",{ascending:false}).limit(100);
 if(error)return cellError("reportsBody",6,error);
 $("#reportsBody").innerHTML=(data||[]).map(r=>`<tr><td><small>${safe(r.reporter_id)}</small></td><td>${safe(r.target_type)} · <small>${safe(r.target_id)}</small></td><td>${safe(r.reason)}</td><td>${safe(r.description)}</td><td><span class="admin-pill">${safe(r.status)}</span></td><td>${date(r.created_at)}</td></tr>`).join("");
 if(!data?.length)empty("reportsBody",6);
}
async function loadGifts(){
 const {data,error}=await supabase.from("eow_gifts").select("id,name,description,image_url,price,is_active,created_at").order("created_at",{ascending:false}).limit(200);
 if(error)return cellError("giftsBody",5,error);
 $("#giftsBody").innerHTML=(data||[]).map(g=>`<tr><td>${g.image_url?`<img src="${safe(g.image_url)}" alt="" width="36" height="36" style="object-fit:cover;border-radius:8px;vertical-align:middle"> `:""}${safe(g.name)}</td><td>${safe(g.description)}</td><td>${safe(g.price)}</td><td><span class="admin-pill">${g.is_active?"上架":"下架"}</span></td><td>${date(g.created_at)}</td></tr>`).join("");
 if(!data?.length)empty("giftsBody",5);
}
async function loadOrders(){
 const {data,error}=await supabase.from("eow_topup_orders").select("id,user_id,amount,currency,payment_provider,status,created_at,paid_at").order("created_at",{ascending:false}).limit(100);
 if(error)return cellError("ordersBody",7,error);
 $("#ordersBody").innerHTML=(data||[]).map(o=>`<tr><td><small>${safe(o.id)}</small></td><td><small>${safe(o.user_id)}</small></td><td>${safe(o.currency||"CNY")} ${safe(o.amount)}</td><td>${safe(o.payment_provider)}</td><td><span class="admin-pill">${safe(o.status)}</span></td><td>${date(o.created_at)}</td><td>${date(o.paid_at)}</td></tr>`).join("");
 if(!data?.length)empty("ordersBody",7);
}
async function loadWallets(){
 const [wallets,tx]=await Promise.all([
  supabase.from("eow_wallets").select("user_id,balance,currency,updated_at").order("updated_at",{ascending:false}).limit(100),
  supabase.from("eow_wallet_transactions").select("id,user_id,type,amount,description,created_at").order("created_at",{ascending:false}).limit(100)
 ]);
 if(wallets.error)cellError("walletsBody",4,wallets.error);
 else{$("#walletsBody").innerHTML=(wallets.data||[]).map(w=>`<tr><td><small>${safe(w.user_id)}</small></td><td>${safe(w.balance)}</td><td>${safe(w.currency)}</td><td>${date(w.updated_at)}</td></tr>`).join("");if(!wallets.data?.length)empty("walletsBody",4);}
 if(tx.error)cellError("walletTxBody",6,tx.error);
 else{$("#walletTxBody").innerHTML=(tx.data||[]).map(t=>`<tr><td><small>${safe(t.id)}</small></td><td><small>${safe(t.user_id)}</small></td><td>${safe(t.type)}</td><td>${safe(t.amount)}</td><td>${safe(t.description)}</td><td>${date(t.created_at)}</td></tr>`).join("");if(!tx.data?.length)empty("walletTxBody",6);}
}
const loaders={users:loadUsers,posts:loadPosts,verifications:loadVerifications,reports:loadReports,gifts:loadGifts,finance:loadOrders,wallets:loadWallets};
async function showUserDetail(id){
 const modal=$("#userDetailModal"),content=$("#userDetailContent");
 modal.hidden=false;content.textContent="正在读取用户资料…";
 try{
  const results=await Promise.all([
   supabase.from("profiles").select("*").eq("id",id).maybeSingle(),
   supabase.from("posts").select("id",{count:"exact",head:true}).eq("user_id",id),
   supabase.from("follows").select("follower_id",{count:"exact",head:true}).eq("following_id",id),
   supabase.from("follows").select("following_id",{count:"exact",head:true}).eq("follower_id",id),
   supabase.from("eow_wallets").select("balance,currency").eq("user_id",id).maybeSingle(),
   supabase.from("eow_verification_applications").select("status,created_at").eq("user_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  const [pRes,posts,followers,following,wallet,verification]=results;
  if(pRes.error)throw pRes.error;
  if(!pRes.data)throw new Error("用户不存在或无权查看");
  const p=pRes.data,v=verification.data;
  content.innerHTML=\`<div class="admin-head-row" style="margin-bottom:16px">\${avatarHTML(p)}<div style="flex:1"><strong>\${safe(displayName(p))}</strong><div class="admin-note">@\${safe(p.username||"")}</div></div>\${p.is_verified?'<span class="admin-pill">蓝 V 已认证</span>':'<span class="admin-pill">未认证</span>'}</div><div class="admin-detail-grid"><div class="admin-detail-item"><small>用户 ID</small>\${safe(p.id)}</div><div class="admin-detail-item"><small>注册时间</small>\${date(p.created_at)}</div><div class="admin-detail-item"><small>个人简介</small>\${safe(p.bio||"未填写")}</div><div class="admin-detail-item"><small>动态数量</small>\${posts.count??"—"}</div><div class="admin-detail-item"><small>粉丝数量</small>\${followers.count??"—"}</div><div class="admin-detail-item"><small>关注数量</small>\${following.count??"—"}</div><div class="admin-detail-item"><small>钱包余额</small>\${wallet.error?"无权读取":safe(wallet.data?.balance??0)+" "+safe(wallet.data?.currency||"CNY")}</div><div class="admin-detail-item"><small>最近蓝 V 申请</small>\${v?safe(v.status)+" · "+date(v.created_at):"暂无申请"}</div></div>\`;
 }catch(e){content.textContent="读取用户详情失败："+(e.message||"未知错误");}
}
async function reviewVerification(id,nextStatus){
 if(!["approved","rejected"].includes(nextStatus))return;
 if(!confirm(nextStatus==="approved"?"确认通过这份蓝 V 认证申请？":"确认拒绝这份蓝 V 认证申请？"))return;
 const {error}=await supabase.rpc("eow_admin_review_verification",{p_application_id:id,p_status:nextStatus,p_admin_note:null});
 if(error)throw error;
 await Promise.all([loadVerifications(),loadStats(),loadUsers()]);
}
async function start(){
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError||!user){location.href="login.html?next="+encodeURIComponent("/admin.html");return;}
 const {data:admin,error:adminError}=await supabase.from("eow_admins").select("user_id,role").eq("user_id",user.id).maybeSingle();
 if(adminError||!admin){status.textContent="当前账号没有管理员权限。请项目所有者核对 eow_admins 中的管理员记录。";status.classList.add("admin-error");return;}
 status.textContent=`管理员身份已验证：${admin.role} · 当前可查看用户详情并审核蓝 V 申请`;
 app.hidden=false;
 await Promise.all([loadStats(),loadUsers()]);
 $("#usersBody").addEventListener("click",e=>{const b=e.target.closest("[data-user-detail]");if(b)showUserDetail(b.dataset.userDetail);});
 $("#closeUserDetail").addEventListener("click",()=>$("#userDetailModal").hidden=true);
 $("#userDetailModal").addEventListener("click",e=>{if(e.target.id==="userDetailModal")e.currentTarget.hidden=true;});
 $("#verificationBody").addEventListener("click",async e=>{const b=e.target.closest("[data-review]");if(!b)return;b.disabled=true;try{await reviewVerification(b.dataset.review,b.dataset.status);}catch(err){alert("审核失败："+err.message);}finally{b.disabled=false;}});
 document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",async()=>{
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll(".admin-panel").forEach(x=>x.hidden=x.id!=="tab-"+btn.dataset.tab);
  const loader=loaders[btn.dataset.tab];if(loader)await loader();
 }));
 $("#userSearch").addEventListener("input",loadUsers);
}
start().catch(error=>{console.error(error);status.textContent="后台初始化失败："+(error?.message||"未知错误");status.classList.add("admin-error");});
