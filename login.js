import { supabase, $, setNotice } from "./shared.js?v=7";

const form = $("#loginForm");
const identifier = $("#identifier");
const password = $("#password");
const button = $("#loginButton");
let mode = "email";
let busy = false;

function setMode(next) {
  mode = next;
  const emailMode = mode === "email";
  $("#emailTab").classList.toggle("active", emailMode);
  $("#phoneTab").classList.toggle("active", !emailMode);
  $("#emailTab").setAttribute("aria-pressed", String(emailMode));
  $("#phoneTab").setAttribute("aria-pressed", String(!emailMode));
  $("#identifierLabel").textContent = emailMode ? "邮箱地址" : "手机号码（国际格式）";
  identifier.type = emailMode ? "email" : "tel";
  identifier.autocomplete = emailMode ? "username" : "tel";
  identifier.inputMode = emailMode ? "email" : "tel";
  identifier.placeholder = emailMode ? "请输入注册邮箱" : "例如 +60123456789";
  identifier.value = "";
  identifier.focus();
  setNotice($("#message"), "");
}

function safeNextPath() {
  const value = new URLSearchParams(location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /^(\/\/?|\/\\)/.test(value)) return "feed.html";
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? url.pathname + url.search + url.hash : "feed.html";
  } catch {
    return "feed.html";
  }
}

$("#emailTab").addEventListener("click", () => setMode("email"));
$("#phoneTab").addEventListener("click", () => setMode("phone"));

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const value = identifier.value.trim();
  const secret = password.value;
  if (!value || !secret) {
    setNotice($("#message"), "请输入账号和密码。", "error");
    return;
  }
  let credentials;
  if (mode === "email") credentials = { email: value.toLowerCase(), password: secret };
  else {
    const phone = value.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setNotice($("#message"), "手机号格式不正确，请使用国际格式，例如 +60123456789。", "error");
      return;
    }
    credentials = { phone, password: secret };
  }
  busy = true;
  button.disabled = true;
  button.textContent = "正在登录…";
  setNotice($("#message"), "正在验证账号…");
  try {
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    location.replace(safeNextPath());
  } catch (error) {
    setNotice($("#message"), "登录失败：" + (error?.message || "请检查账号和密码"), "error");
  } finally {
    busy = false;
    button.disabled = false;
    button.textContent = "登录 EOW 账号";
  }
});

$("#forgotPassword").addEventListener("click", async () => {
  if (mode !== "email") {
    setNotice($("#message"), "密码重置邮件目前需要使用邮箱账号。", "error");
    return;
  }
  const email = identifier.value.trim().toLowerCase();
  if (!email) {
    setNotice($("#message"), "请先输入注册邮箱，再点击忘记密码。", "error");
    identifier.focus();
    return;
  }
  const resetButton = $("#forgotPassword");
  resetButton.disabled = true;
  try {
    const redirectTo = "https://sgsgsg6555555-stack.github.io/EOW-Global/reset-password.html";
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    setNotice($("#message"), "如果该邮箱已注册，系统会发送密码重置邮件。请检查收件箱和垃圾邮件。", "success");
  } catch (error) {
    setNotice($("#message"), "暂时无法发送重置邮件：" + (error?.message || "请稍后重试"), "error");
  } finally {
    resetButton.disabled = false;
  }
});
