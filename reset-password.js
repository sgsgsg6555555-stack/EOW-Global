import { supabase, $, setNotice } from "./shared.js?v=6";

const form = $("#resetForm");
const button = $("#resetButton");
let busy = false;

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    setNotice($("#message"), "验证成功，请输入并保存新密码。", "success");
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
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
    if (!session) throw new Error("重置链接无效或已过期，请返回登录页重新申请。");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    form.reset();
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
