import { supabase, $, setNotice } from "./shared.js?v=20";

const form = $("#resetForm");
const button = $("#resetButton");
let busy = false;
let recoveryReady = false;

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryReady = true;
    setNotice($("#message"), "验证成功，请输入并保存新密码。", "success");
  }
});

async function initializeRecovery() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const providerError = query.get("error_description") || hash.get("error_description");
  const errorCode = query.get("error_code") || hash.get("error_code");
  if (providerError || errorCode) {
    throw new Error(providerError || (errorCode === "otp_expired" ? "重置链接已过期或已使用，请重新申请。" : "重置链接无效，请重新申请。"));
  }

  let { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;

  // Support Supabase email templates that send token_hash directly.
  if (!session) {
    const tokenHash = query.get("token_hash") || hash.get("token_hash");
    const type = query.get("type") || hash.get("type");
    if (tokenHash && type === "recovery") {
      const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (verified.error) throw verified.error;
      session = verified.data.session;
    }
  }

  // Support PKCE links where the authorization code is returned in the query string.
  if (!session) {
    const code = query.get("code");
    if (code) {
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
      session = exchanged.data.session;
    }
  }

  if (!session) throw new Error("没有检测到有效的密码恢复会话。请从最新一封重置邮件打开链接；如果仍失败，请重新申请。");
  recoveryReady = true;

  // Remove one-time credentials from the address bar after a session is established.
  history.replaceState({}, document.title, location.pathname);
  setNotice($("#message"), "验证成功，请输入并保存新密码。", "success");
}

initializeRecovery().catch(error => {
  recoveryReady = false;
  setNotice($("#message"), "链接验证失败：" + (error?.message || "链接无效或已过期") + " 请返回登录页重新申请。", "error");
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  if (!recoveryReady) {
    setNotice($("#message"), "请先使用最新邮件中的有效链接完成验证。", "error");
    return;
  }
  const password = $("#newPassword").value;
  const confirmation = $("#confirmPassword").value;
  if (password.length < 8) return setNotice($("#message"), "密码至少需要 8 个字符。", "error");
  if (password !== confirmation) return setNotice($("#message"), "两次输入的密码不一致。", "error");
  busy = true;
  button.disabled = true;
  button.textContent = "正在更新…";
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("密码恢复会话已失效，请重新申请重置邮件。");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    form.reset();
    recoveryReady = false;
    setNotice($("#message"), "密码已更新，请使用新密码登录。", "success");
    setTimeout(() => location.replace("login.html"), 1600);
  } catch (error) {
    setNotice($("#message"), "密码更新失败：" + (error?.message || "请重新申请重置链接"), "error");
  } finally {
    busy = false;
    button.disabled = false;
    button.textContent = "更新密码";
  }
});
