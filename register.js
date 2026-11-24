import {supabase,$,setNotice} from "./shared.js?v=5";

if (window.__eowRegisterHandlerInstalled) throw new Error("EOW register handler already installed");
window.__eowRegisterHandlerInstalled = true;
let inFlight = false;
const isRateLimited = error => Number(error?.status ?? error?.code) === 429 || /rate limit|too many|频繁/i.test(error?.message || "");

$("#registerForm").onsubmit = async e => {
  e.preventDefault();
  if (inFlight) return;
  const email = $("#email").value.trim(), password = $("#password").value, confirm = $("#confirmPassword").value;
  if (password.length < 8) { setNotice($("#message"), "密码至少需要 8 个字符。", "error"); return; }
  if (password !== confirm) { setNotice($("#message"), "两次输入的密码不一致。", "error"); return; }
  const btn = $("#registerButton");
  inFlight = true;
  btn.disabled = true;
  btn.textContent = "正在创建账号…";
  try {
    const {data,error} = await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin+"/index.html"}});
    if (error) throw error;
    if (data.session) { setNotice($("#message"), "注册成功，正在进入 EOW…", "success"); location.href = "index.html"; }
    else setNotice($("#message"), "注册申请已提交，请检查邮箱并点击验证链接完成注册。", "success");
  } catch (err) {
    setNotice($("#message"), isRateLimited(err) ? "请求过于频繁，请稍后再试。请勿连续提交注册请求。" : "注册失败：" + (err.message || "请稍后重试"), "error");
  } finally {
    inFlight = false;
    btn.disabled = false;
    btn.textContent = "创建 EOW 账号";
  }
};