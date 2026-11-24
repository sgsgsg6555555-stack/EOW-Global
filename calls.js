import { $, initShell, setNotice } from "./shared.js?v=6";

const shell = await initShell("calls");
if (shell) {
  const video = $("#localVideo");
  const placeholder = $("#videoPlaceholder");
  const startButton = $("#startDevices");
  const stopButton = $("#stopDevices");
  const cameraButton = $("#toggleCamera");
  const microphoneButton = $("#toggleMicrophone");
  const cameraSelect = $("#cameraSelect");
  const microphoneSelect = $("#microphoneSelect");
  const meterFill = $("#audioMeterFill");
  const meter = $(".audio-meter");
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let meterFrame = 0;
  let cameraEnabled = true;
  let microphoneEnabled = true;

  const capabilities = [
    ["getUserMedia", Boolean(navigator.mediaDevices?.getUserMedia)],
    ["enumerateDevices", Boolean(navigator.mediaDevices?.enumerateDevices)],
    ["RTCPeerConnection", typeof window.RTCPeerConnection === "function"],
    ["getDisplayMedia（屏幕共享）", Boolean(navigator.mediaDevices?.getDisplayMedia)]
  ];
  $("#rtcCapabilities").innerHTML = capabilities.map(([name, supported]) =>
    `<div class="capability-row"><span>${name}</span><strong class="${supported ? "capability-ok" : "capability-no"}">${supported ? "支持" : "不支持"}</strong></div>`
  ).join("");
  const supported = capabilities[0][1];
  setNotice($("#supportStatus"), supported
    ? "浏览器支持媒体设备访问。请在 HTTPS 网站或 localhost 环境中使用。"
    : "当前浏览器不支持媒体设备访问，请更新浏览器或使用 HTTPS / localhost。", supported ? "success" : "error");

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fill = (select, kind, label) => {
      const selected = select.value;
      const options = devices.filter(device => device.kind === kind);
      select.innerHTML = `<option value="">默认${label}</option>` + options.map((device, index) =>
        `<option value="${device.deviceId.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${(device.label || label + " " + (index + 1)).replace(/[<>&"]/g, "")}</option>`
      ).join("");
      if (options.some(device => device.deviceId === selected)) select.value = selected;
    };
    fill(cameraSelect, "videoinput", "摄像头");
    fill(microphoneSelect, "audioinput", "麦克风");
  }

  function stopMeter() {
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = 0;
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
      analyser = null;
    }
    meterFill.style.width = "0%";
    meter?.setAttribute("aria-valuenow", "0");
    $("#audioLevelText").textContent = "尚未检测";
  }

  function startMeter(activeStream) {
    const audioTrack = activeStream.getAudioTracks()[0];
    if (!audioTrack || !window.AudioContext) {
      $("#audioLevelText").textContent = "未检测到可用麦克风";
      return;
    }
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const draw = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const level = Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 220));
      meterFill.style.width = level + "%";
      meter?.setAttribute("aria-valuenow", String(level));
      $("#audioLevelText").textContent = "当前输入电平：" + level + "%";
      meterFrame = requestAnimationFrame(draw);
    };
    draw();
  }

  function stopDevices() {
    stopMeter();
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    placeholder.hidden = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    cameraButton.disabled = true;
    microphoneButton.disabled = true;
    $("#deviceState").textContent = "未启动";
    $("#deviceState").className = "badge";
  }

  async function startDevices() {
    if (!supported) return;
    startButton.disabled = true;
    setNotice($("#deviceNotice"), "正在请求摄像头和麦克风权限…");
    try {
      if (stream) stopDevices();
      const constraints = {
        audio: microphoneSelect.value ? { deviceId: { exact: microphoneSelect.value } } : true,
        video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.hidden = false;
      placeholder.hidden = true;
      await video.play().catch(() => {});
      await refreshDevices();
      startMeter(stream);
      cameraEnabled = true;
      microphoneEnabled = true;
      cameraButton.textContent = "关闭摄像头";
      microphoneButton.textContent = "静音麦克风";
      stopButton.disabled = false;
      cameraButton.disabled = false;
      microphoneButton.disabled = false;
      $("#deviceState").textContent = "设备运行中";
      $("#deviceState").className = "badge success";
      setNotice($("#deviceNotice"), "设备已开启。请检查画面并对着麦克风说话。", "success");
    } catch (error) {
      setNotice($("#deviceNotice"), "无法开启设备：" + (error?.message || "请检查浏览器权限和设备连接"), "error");
      stopDevices();
    } finally {
      startButton.disabled = false;
    }
  }

  startButton.addEventListener("click", startDevices);
  stopButton.addEventListener("click", stopDevices);
  cameraButton.addEventListener("click", () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    cameraEnabled = !cameraEnabled;
    track.enabled = cameraEnabled;
    cameraButton.textContent = cameraEnabled ? "关闭摄像头" : "开启摄像头";
  });
  microphoneButton.addEventListener("click", () => {
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    microphoneEnabled = !microphoneEnabled;
    track.enabled = microphoneEnabled;
    microphoneButton.textContent = microphoneEnabled ? "静音麦克风" : "取消静音";
    if (!microphoneEnabled) {
      stopMeter();
      $("#audioLevelText").textContent = "麦克风已静音";
    } else startMeter(stream);
  });
  cameraSelect.addEventListener("change", () => {
    if (stream) startDevices();
  });
  microphoneSelect.addEventListener("change", () => {
    if (stream) startDevices();
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
  refreshDevices().catch(() => {});
  window.addEventListener("pagehide", stopDevices, { once: true });
}
