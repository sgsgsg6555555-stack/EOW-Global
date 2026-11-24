import { supabase, $, initShell, setNotice } from "./shared.js?v=5";

const shell = await initShell("settings");

if (shell) {
  $("#accountEmail").textContent = shell.user.email || "未设置邮箱";
  $("#accountId").textContent = "账号 ID：" + shell.user.id;

  $("#emailForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("#newEmail").value.trim().toLowerCase();
    const button = $("#emailButton");
    if (!email || email === (shell.user.email || "").toLowerCase()) {
      setNotice($("#emailNotice"), "请输入与当前邮箱不同的新邮箱地址。", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "正在提交…";
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      $("#emailForm").reset();
      setNotice($("#emailNotice"), "邮箱变更申请已提交。请按 Supabase 发出的验证邮件完成确认。", "success");
    } catch (error) {
      setNotice($("#emailNotice"), "邮箱变更失败：" + (error.message || "请稍后重试"), "error");
    } finally {
      button.disabled = false;
      button.textContent = "提交邮箱变更";
    }
  });

  $("#passwordForm").addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("#newPassword").value;
    const confirmation = $("#confirmPassword").value;
    if (password.length < 8) {
      setNotice($("#passwordNotice"), "新密码至少需要 8 个字符。", "error");
      return;
    }
    if (password !== confirmation) {
      setNotice($("#passwordNotice"), "两次输入的密码不一致。", "error");
      return;
    }
    const button = $("#passwordButton");
    button.disabled = true;
    button.textContent = "正在更新…";
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      $("#passwordForm").reset();
      setNotice($("#passwordNotice"), "密码已更新。请妥善保管新密码。", "success");
    } catch (error) {
      setNotice($("#passwordNotice"), "密码更新失败：" + (error.message || "请稍后重试"), "error");
    } finally {
      button.disabled = false;
      button.textContent = "更新密码";
    }
  });

  $("#signOutButton").addEventListener("click", async () => {
    if (!window.confirm("确定退出当前 EOW 账号吗？")) return;
    const button = $("#signOutButton");
    button.disabled = true;
    button.textContent = "正在退出…";
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      location.href = "login.html";
    } catch (error) {
      setNotice($("#passwordNotice"), "退出失败：" + (error.message || "请重试"), "error");
      button.disabled = false;
      button.textContent = "退出当前账号";
    }
  });
}
