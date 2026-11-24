import { supabase, $, setNotice } from "./shared.js?v=6";

const form = $("#registerForm");
let mode = "email";
let pendingPhone = "";
let pendingPassword = "";
let busy = false;

function showMessage(message, type = "") { setNotice($("#message"), message, type); }
function setMode(next) {
  mode = next;
  const emailMode = mode === "email";
  $("#emailFields").hidden = !emailMode;
  $("#phoneFields").hidden = emailMode;
  $("#email").required = emailMode;
  $("#phone").required = !emailMode;
  $("#emailTab").classList.toggle("active", emailMode);
  $("#phoneTab").classList.toggle("active", !emailMode);
  $("#emailTab").setAttribute("aria-pressed", String(emailMode));
  $("#phoneTab").setAttribute("aria-pressed", String(!emailMode));
  $("#otpSection").hidden = true;
  form.hidden = false;
  showMessage("");
}
function isRateLimited(error) {
  return Number(error?.status ?? error?.code) === 429 || /rate.?limit|too many|频繁/i.test(error?.message || "");
}
function validE164(value) { return /^\+[1-9]\d{7,14}$/.test(value); }

$("#emailTab").addEventListener("click", () => setMode("email"));
$("#phoneTab").addEventListener("click", () => setMode("phone"));

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const password = $("#password").value;
  const confirmation = $("#confirmPassword").value;
  if (password.length < 8) return showMessage("密码至少需要 8 个字符。", "error");
  if (password !== confirmation) return showMessage("两次输入的密码不一致。", "error");

  const button = $("#registerButton");
  busy = true;
  button.disabled = true;
  button.textContent = mode === "phone" ? "正在发送验证码…" : "正在创建账号…";
  try {
    if (mode === "email") {
      const email = $("#email").value.trim().toLowerCase();
      if (!email) throw new Error("请输入有效邮箱地址。");
      const emailRedirectTo = new URL("feed.html", location.href).href;
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo }
      });
      if (error) throw error;
      if (data.session) {
        showMessage("注册成功，正在进入 EOW…", "success");
        location.replace("feed.html");
      } else {
        form.reset();
        showMessage("注册申请已提交，请检查邮箱并点击验证链接完成注册。", "success");
      }
    } else {
      const phone = $("#phone").value.trim().replace(/[\s()-]/g, "");
      if (!validE164(phone)) throw new Error("手机号码格式不正确，请使用国际格式，例如 +60123456789。");
      pendingPhone = phone;
      pendingPassword = password;
      const { data, error } = await supabase.auth.signUp({
        phone, password,
        options: { channel: "sms" }
      });
      if (error) throw error;
      if (data.session) {
        showMessage("注册成功，正在进入 EOW…", "success");
        location.replace("feed.html");
      } else {
        form.hidden = true;
        $("#otpSection").hidden = false;
        showMessage("验证码已发送，请查看短信并输入验证码。", "success");
      }
    }
  } catch (error) {
    showMessage(isRateLimited(error) ? "请求过于频繁，请稍后再试。" : "注册失败：" + (error?.message || "请稍后重试"), "error");
  } finally {
    busy = false;
    button.disabled = false;
    button.textContent = "创建 EOW 账号";
  }
});

$("#verifyButton").addEventListener("click", async () => {
  const token = $("#otp").value.trim();
  if (!/^\d{6}$/.test(token) || !pendingPhone) return showMessage("请输入短信中的 6 位验证码。", "error");
  const button = $("#verifyButton");
  button.disabled = true;
  try {
    const { error } = await supabase.auth.verifyOtp({ phone: pendingPhone, token, type: "sms" });
    if (error) throw error;
    showMessage("手机号验证成功，正在进入 EOW…", "success");
    location.replace("feed.html");
  } catch (error) {
    showMessage("验证失败：" + (error?.message || "验证码无效或已过期"), "error");
  } finally {
    button.disabled = false;
  }
});

$("#resendButton").addEventListener("click", async () => {
  if (!pendingPhone || !pendingPassword) return;
  const button = $("#resendButton");
  button.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: pendingPhone,
      options: { shouldCreateUser: false }
    });
    if (error) throw error;
    showMessage("已请求重新发送验证码，请查看短信。", "success");
  } catch (error) {
    showMessage("重新发送失败：" + (error?.message || "请稍后重试"), "error");
  } finally {
    button.disabled = false;
  }
});
