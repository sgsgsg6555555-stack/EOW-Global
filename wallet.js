import {supabase,$,initShell,esc,setNotice} from "./shared.js?v=5";
const shell=await initShell("wallet");
if(shell){
 async function load(){
  const [w,g,l]=await Promise.all([
   supabase.from("eow_wallets").select("balance_coins").eq("user_id",shell.user.id).maybeSingle(),
   supabase.from("eow_gifts").select("id,name,price_coins,image_url").eq("active",true).order("price_coins"),
   supabase.from("eow_wallet_ledger").select("id,delta_coins,balance_after,entry_type,note,created_at").eq("user_id",shell.user.id).order("created_at",{ascending:false}).limit(80)
  ]);
  $("#coinBalance").textContent=w.error?"读取失败":(w.data?.balance_coins??0).toLocaleString("zh-CN");
  $("#giftStatus").textContent=g.error?"礼物读取失败："+g.error.message:(g.data?.length?`共 ${g.data.length} 种礼物`:"暂时没有上架礼物");
  $("#giftList").innerHTML=(g.data||[]).map(x=>`<article class="gift-item">${x.image_url?`<img src="${esc(x.image_url)}" alt="">`:"<div style='font-size:42px'>🎁</div>"}<strong>${esc(x.name)}</strong><p class="muted">${x.price_coins} 金币</p><button class="btn small" data-gift="${x.id}" data-name="${esc(x.name)}">赠送礼物</button></article>`).join("");
  $("#ledgerBody").innerHTML=l.error?`<tr><td colspan="5">读取失败：${esc(l.error.message)}</td></tr>`:(l.data||[]).map(x=>`<tr><td>${new Date(x.created_at).toLocaleString("zh-CN")}</td><td>${esc(x.entry_type)}</td><td>${x.delta_coins>0?"+":""}${x.delta_coins}</td><td>${x.balance_after}</td><td>${esc(x.note||"")}</td></tr>`).join("")||"<tr><td colspan='5'>暂无流水</td></tr>";
 }
 $("#giftList").addEventListener("click",async e=>{
  const b=e.target.closest("[data-gift]");if(!b)return;
  const receiverInput=prompt("请输入收礼人的 EOW 用户名（推荐）或用户 UUID：");
  if(!receiverInput)return;
  const receiverText=receiverInput.trim();
  let receiverId=receiverText;
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(receiverText)){
   const {data:matches,error:lookupError}=await supabase.from("profiles").select("id,username,display_name").eq("username",receiverText.replace(/^@/,"")).limit(2);
   if(lookupError){alert("查找收礼人失败："+lookupError.message);return;}
   if(!matches?.length){alert("没有找到该用户名。请确认对方的 EOW 用户名。");return;}
   if(matches.length>1){alert("找到多个匹配用户，请使用准确的 EOW 用户名。");return;}
   receiverId=matches[0].id;
  }
  const qtyRaw=prompt("赠送数量（1-100）：","1");if(qtyRaw===null)return;
  const quantity=Number(qtyRaw);if(!Number.isInteger(quantity)||quantity<1||quantity>100){alert("数量必须是 1 到 100 的整数");return;}
  b.disabled=true;
  const {error}=await supabase.rpc("eow_send_gift",{p_receiver:receiverId,p_gift:b.dataset.gift,p_quantity:quantity,p_message:""});
  if(error)alert("赠送失败："+error.message);else{setNotice($("#giftNotice"),`已赠送 ${b.dataset.name} × ${quantity}`,"success");await load();}
  b.disabled=false;
 });
 await load();
}
