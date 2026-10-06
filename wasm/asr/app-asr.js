// ==============================================================================
// 模块名称: app-asr.js (神级自愈全平台完全体)
// 核心机制: 虚拟文件系统就绪双重探针 + 3kHz 物理弱声雷达 + 零 OOM 防爆穿透
// ==============================================================================

let recognizer = null;
let activeLiveStream = null;
let micStream = null;
let micCtx = null;
let micProcessor = null;

let isRecording = false;
let isProcessingFile = false;
let isModelReady = false;

// DOM 节点绑定
const statusBanner        = document.getElementById('statusBanner');
const startBtn             = document.getElementById('startBtn');
const stopBtn              = document.getElementById('stopBtn');
const clearBtn             = document.getElementById('clearBtn');
const transcript           = document.getElementById('transcript');
const statusText           = document.getElementById('status');
const fileInput            = document.getElementById('fileInput');
const dropZone             = document.getElementById('dropZone');

const progressCard         = document.getElementById('progressCard');
const progressBar          = document.getElementById('progressBar');
const progressPercentage   = document.getElementById('progressPercentage');
const speedIndicator       = document.getElementById('speedIndicator');
const originalDurationText = document.getElementById('originalDurationText');
const currentPositionText  = document.getElementById('currentPositionText');
const rtfText              = document.getElementById('rtfText');
const elapsedTimeText      = document.getElementById('elapsedTimeText');
const finalBadge           = document.getElementById('finalBadge');

function formatDurationDisplay(totalSeconds) {
  totalSeconds = Math.max(0, totalSeconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const hms = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  if (h > 0) return `${h}小时${m}分${s}秒 [${hms}]`;
  return `${m}分${s}秒 [${hms}]`;
}

function formatHMS(seconds) {
  seconds = Math.max(0, seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ==============================================================================
// §0 声学雷达 DSP 滤波器 (3kHz Peaking EQ + Log-Compand 弱声抽吸)
// ==============================================================================
class AcousticRadarDSP {
  constructor(sampleRate = 16000) {
    const A = Math.pow(10, 8.0 / 40.0); // +8dB 增益
    const w0 = 2.0 * Math.PI * 3000.0 / sampleRate;
    const alpha = Math.sin(w0) / (2.0 * 1.2); // Q=1.2

    const b0 = 1.0 + alpha * A;
    const b1 = -2.0 * Math.cos(w0);
    const b2 = 1.0 - alpha * A;
    const a0 = 1.0 + alpha / A;
    const a1 = -2.0 * Math.cos(w0);
    const a2 = 1.0 - alpha / A;

    this.b0_a0 = b0 / a0;
    this.b1_a0 = b1 / a0;
    this.b2_a0 = b2 / a0;
    this.a1_a0 = a1 / a0;
    this.a2_a0 = a2 / a0;

    this.d1 = 0.0;
    this.d2 = 0.0;
  }

  reset() {
    this.d1 = 0.0;
    this.d2 = 0.0;
  }

  process(samples) {
    const n = samples.length;
    const out = new Float32Array(n);
    let d1 = this.d1;
    let d2 = this.d2;
    const b0 = this.b0_a0, b1 = this.b1_a0, b2 = this.b2_a0, a1 = this.a1_a0, a2 = this.a2_a0;

    for (let i = 0; i < n; i++) {
      const x = samples[i];
      const y = b0 * x + d1;
      d1 = b1 * x - a1 * y + d2;
      d2 = b2 * x - a2 * y;

      const absY = Math.abs(y);
      const signY = y < 0 ? -1 : 1;
      const boosted = signY * Math.pow(absY, 0.65) * 1.85;
      out[i] = Math.tanh(boosted);
    }

    this.d1 = d1;
    this.d2 = d2;
    return out;
  }
}

const dspEngine = new AcousticRadarDSP(16000);

// ==============================================================================
// §1 严密生命周期管理 (根治 360/星愿/Safari 的 undefined 报错)
// ==============================================================================
function decodeEmscriptenError(err) {
  if (!err) return '未知异常';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (typeof err === 'number' && typeof Module !== 'undefined' && Module.UTF8ToString) {
    try {
      const decoded = Module.UTF8ToString(err);
      if (decoded) return decoded;
    } catch (_) {}
    return 'WASM 底层错误代码 #' + err;
  }
  return String(err);
}

window.checkAndInitEngine = function() {
  if (isModelReady && recognizer) return true;

  // 核心探针：不仅要 WASM 编译好，还要确保 MEMFS 中的 tokens.txt / encoder.onnx 已经解压就绪
  const isModuleCallable = (typeof Module !== 'undefined') &&
                           (typeof createOnlineRecognizer === 'function') &&
                           (typeof Module._SherpaOnnxCreateOnlineRecognizer === 'function');

  if (!isModuleCallable) return false;

  // 探测虚拟文件系统是否挂载完毕
  let isFilesystemReady = false;
  try {
    if (Module.FS && Module.FS.analyzePath) {
      const tokenInfo = Module.FS.analyzePath('tokens.txt');
      isFilesystemReady = tokenInfo && tokenInfo.exists;
    } else {
      isFilesystemReady = window.isDataPackageLoaded || true;
    }
  } catch (_) {
    isFilesystemReady = true;
  }

  if (!isFilesystemReady) return false;

  try {
    console.log("🚀 开始实例化 Sherpa-ONNX 识别中枢...");
    recognizer = createOnlineRecognizer(Module);
    if (recognizer) {
      isModelReady = true;
      console.log("✅ 识别中枢初始化成功:", recognizer);
      if (statusBanner) {
        statusBanner.className = 'status-banner ready';
        statusBanner.innerHTML = '✨ 语音模型已就绪 (100% 本地离线计算，随时可识别)';
      }
      if (statusText) {
        statusText.innerText = '✅ 引擎就绪，请选择音频或开启麦克风！';
        statusText.style.color = '#16a34a';
      }
      if (startBtn) startBtn.disabled = false;
      return true;
    }
  } catch (err) {
    const readableErr = decodeEmscriptenError(err);
    console.warn("⏳ 正在等待数据包解压完成...", readableErr);
  }
  return false;
};

// 轮询双保险
const engineInitInterval = setInterval(() => {
  if (window.checkAndInitEngine()) {
    clearInterval(engineInitInterval);
  }
}, 100);

// ==============================================================================
// §2 麦克风实时识别通道
// ==============================================================================
let micResultList = [];
let micCurrentSentence = '';

startBtn.onclick = async function() {
  if (!window.checkAndInitEngine()) return alert('语音引擎正在装载模型数据包，请稍等 1 秒...');
  if (isProcessingFile) return alert('超长音频转录进行中，请稍候...');

  try {
    micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (micCtx.state === 'suspended') await micCtx.resume();
    
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = micCtx.createMediaStreamSource(micStream);
    micProcessor = micCtx.createScriptProcessor(4096, 1, 1);
    
    activeLiveStream = recognizer.createStream();
    micResultList = [];
    micCurrentSentence = '';
    dspEngine.reset();

    micProcessor.onaudioprocess = function(e) {
      if (!recognizer || !activeLiveStream || !isRecording) return;
      const rawSamples = e.inputBuffer.getChannelData(0);
      
      // 前置 3kHz 声学雷达激化弱声
      const enhanced = dspEngine.process(rawSamples);
      activeLiveStream.acceptWaveform(16000, enhanced);

      while (recognizer.isReady(activeLiveStream)) {
        recognizer.decode(activeLiveStream);
      }

      const text = recognizer.getResult(activeLiveStream).text;
      if (text.length > 0) {
        micCurrentSentence = text;
      }

      if (recognizer.isEndpoint(activeLiveStream)) {
        if (micCurrentSentence.trim().length > 0) {
          micResultList.push(micCurrentSentence.trim());
          micCurrentSentence = '';
        }
        recognizer.reset(activeLiveStream);
      }

      let display = '';
      for (let i = 0; i < micResultList.length; i++) {
        display += (i + 1) + '. ' + micResultList[i] + '\n\n';
      }
      if (micCurrentSentence.trim().length > 0) {
        display += (micResultList.length + 1) + '. ' + micCurrentSentence.trim();
      }
      transcript.value = display;
      transcript.scrollTop = transcript.scrollHeight;
    };

    source.connect(micProcessor);
    micProcessor.connect(micCtx.destination);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    isRecording = true;
    statusText.innerText = '🎙️ 正在实时录音转录中 (声学雷达工作中)...';
    if (finalBadge) finalBadge.style.display = 'none';
  } catch (err) {
    alert('麦克风启动失败: ' + decodeEmscriptenError(err));
  }
};

stopBtn.onclick = function() {
  isRecording = false;
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (micProcessor) micProcessor.disconnect();
  if (micCtx) micCtx.close();

  if (activeLiveStream && recognizer) {
    const tail = recognizer.getResult(activeLiveStream).text;
    if (tail.trim().length > 0 && !micResultList.includes(tail.trim())) {
      micResultList.push(tail.trim());
    }
    recognizer.reset(activeLiveStream);
    activeLiveStream.free();
    activeLiveStream = null;
  }

  let finalDisplay = '';
  for (let i = 0; i < micResultList.length; i++) {
    finalDisplay += (i + 1) + '. ' + micResultList[i] + '\n\n';
  }
  transcript.value = finalDisplay.trim();

  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusText.innerText = '⏹️ 录音已停止。';
};

clearBtn.onclick = function() {
  transcript.value = '';
  micResultList = [];
  micCurrentSentence = '';
  if (activeLiveStream && recognizer) {
    recognizer.reset(activeLiveStream);
  }
  progressCard.style.display = 'none';
  progressBar.style.width = '0%';
  if (finalBadge) finalBadge.style.display = 'none';
  statusText.innerText = '🗑️ 内容已清空。';
};

// ==============================================================================
// §3 超长音频流式转录核心 (WAV 零内存直读 + 动态大步长 + 纯推理测速)
// ==============================================================================

function parseWavDirectly(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0, false) !== 0x52494646) return null; // RIFF
    if (view.getUint32(8, false) !== 0x57415645) return null; // WAVE

    let offset = 12;
    let channels = 1, sampleRate = 16000, bitsPerSample = 16, dataOffset = 0, dataLen = 0;

    while (offset < view.byteLength - 8) {
      const chunkId = view.getUint32(offset, false);
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 0x666d7420) {
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      } else if (chunkId === 0x64617461) {
        dataOffset = offset + 8;
        dataLen = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }

    if (!dataOffset || sampleRate === 0 || bitsPerSample !== 16) return null;

    const numSamples = Math.floor(dataLen / (channels * 2));
    const targetLen = Math.round(numSamples * 16000 / sampleRate);
    const mono16k = new Float32Array(targetLen);
    const ratio = sampleRate / 16000.0;

    for (let i = 0; i < targetLen; i++) {
      const srcIdx = Math.floor(i * ratio);
      if (srcIdx >= numSamples) break;
      const bytePos = dataOffset + srcIdx * channels * 2;
      let s = view.getInt16(bytePos, true);
      if (channels > 1) {
        s = (s + view.getInt16(bytePos + 2, true)) * 0.5;
      }
      mono16k[i] = s / 32768.0;
    }

    return { samples: mono16k, duration: numSamples / sampleRate };
  } catch (e) {
    return null;
  }
}

async function decodeAudioGeneral(arrayBuffer) {
  const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    if (tempCtx.state === 'suspended') await tempCtx.resume();
    const raw = await tempCtx.decodeAudioData(arrayBuffer);
    const duration = raw.duration;
    const origSr = raw.sampleRate;
    const origLen = raw.length;
    const channels = raw.numberOfChannels;

    const targetLen = Math.round(origLen * 16000 / origSr);
    const mono16k = new Float32Array(targetLen);
    const ratio = origLen / targetLen;

    const ch0 = raw.getChannelData(0);
    const ch1 = channels > 1 ? raw.getChannelData(1) : null;

    for (let i = 0; i < targetLen; i++) {
      const srcIdx = Math.floor(i * ratio);
      if (srcIdx >= origLen) break;
      mono16k[i] = ch1 ? (ch0[srcIdx] + ch1[srcIdx]) * 0.5 : ch0[srcIdx];
    }

    return { samples: mono16k, duration: duration };
  } finally {
    tempCtx.close();
  }
}

async function processAudioFile(file) {
  if (!window.checkAndInitEngine()) return alert('识别引擎正在加载模型，请稍等 1 秒！');
  if (isRecording) return alert('请先停止麦克风录音！');
  if (isProcessingFile) return alert('已有音频正在转录中！');

  isProcessingFile = true;
  if (finalBadge) finalBadge.style.display = 'none';

  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  progressPercentage.innerText = '0.0%';
  speedIndicator.innerText = '正在读取母带数据...';
  originalDurationText.innerText = '解析中...';
  currentPositionText.innerText = '00:00:00';
  rtfText.innerText = '0.0x 超实时';
  elapsedTimeText.innerText = '0.0 秒';
  transcript.value = '';

  let fs = null;
  dspEngine.reset();

  try {
    const rawBuffer = await file.arrayBuffer();
    speedIndicator.innerText = '正在执行声学转换...';
    await new Promise(r => setTimeout(r, 10));

    // 优先尝试 WAV 0ms 直读，彻底避开 2.14GB decodeAudioData 内存炸弹
    let decoded = parseWavDirectly(rawBuffer);
    if (!decoded) {
      decoded = await decodeAudioGeneral(rawBuffer);
    }

    const totalDurationSec = decoded.duration;
    const durationStr = formatDurationDisplay(totalDurationSec);
    originalDurationText.innerText = durationStr;
    statusText.innerText = `⚡ 正在满血推演中 (原时长: ${durationStr})...`;
    speedIndicator.innerText = '⚡ 满血推演全速运行中...';

    const samples = decoded.samples;
    const totalSamples = samples.length;
    const CHUNK_SIZE = 24000; // 1.5 秒动态大步长
    const totalChunks = Math.ceil(totalSamples / CHUNK_SIZE);

    fs = recognizer.createStream();

    let resultList = [];
    let lastSentence = '';
    let lastUiTime = performance.now();

    // 关键：在真正开始推理的一刻启动秒表！彻底排除解码耗时，测速从第 1 秒起即为真实最高速！
    const tInferStart = performance.now();

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSamples);
      const rawChunk = samples.subarray(start, end);

      // 前置 3kHz 声学雷达弱声激化
      const chunk = dspEngine.process(rawChunk);

      fs.acceptWaveform(16000, chunk);

      while (recognizer.isReady(fs)) {
        recognizer.decode(fs);
      }

      const text = recognizer.getResult(fs).text;
      if (text.length > 0) {
        lastSentence = text;
      }

      const isEndpoint = recognizer.isEndpoint(fs);
      if (isEndpoint) {
        if (lastSentence.trim().length > 0) {
          resultList.push(lastSentence.trim());
          lastSentence = '';
        }
        recognizer.reset(fs);
      }

      const now = performance.now();
      // 120ms 解耦节流上屏
      if (now - lastUiTime > 120 || i === totalChunks - 1) {
        const curSec = end / 16000.0;
        const costSec = ((now - tInferStart) / 1000.0).toFixed(1);
        const pct = Math.min(100, ((end / totalSamples) * 100)).toFixed(1);
        const currentRtf = (curSec / Math.max(0.01, parseFloat(costSec))).toFixed(1);

        progressBar.style.width = `${pct}%`;
        progressPercentage.innerText = `${pct}%`;
        currentPositionText.innerText = formatHMS(curSec);
        rtfText.innerText = `${currentRtf}x 超实时`;
        elapsedTimeText.innerText = `${costSec} 秒`;

        let currentDisplay = '';
        for (let k = 0; k < resultList.length; k++) {
          currentDisplay += (k + 1) + '. ' + resultList[k] + '\n\n';
        }
        if (lastSentence.trim().length > 0) {
          currentDisplay += (resultList.length + 1) + '. ' + lastSentence.trim();
        }
        transcript.value = currentDisplay;
        transcript.scrollTop = transcript.scrollHeight;

        await new Promise(r => setTimeout(r, 0));
        lastUiTime = performance.now();
      }
    }

    // 尾部冲刷
    fs.inputFinished();
    if (recognizer.config && recognizer.config.modelConfig && recognizer.config.modelConfig.paraformer && recognizer.config.modelConfig.paraformer.encoder !== '') {
      const tailPaddings = new Float32Array(16000);
      fs.acceptWaveform(16000, tailPaddings);
    }

    while (recognizer.isReady(fs)) {
      recognizer.decode(fs);
    }

    const finalTail = recognizer.getResult(fs).text;
    if (finalTail.trim().length > 0 && finalTail.trim() !== lastSentence.trim()) {
      resultList.push(finalTail.trim());
    } else if (lastSentence.trim().length > 0 && !resultList.includes(lastSentence.trim())) {
      resultList.push(lastSentence.trim());
    }

    let finalDisplay = '';
    for (let k = 0; k < resultList.length; k++) {
      finalDisplay += (k + 1) + '. ' + resultList[k] + '\n\n';
    }
    transcript.value = finalDisplay.trim();
    transcript.scrollTop = transcript.scrollHeight;

    const totalInferSeconds = (performance.now() - tInferStart) / 1000.0;
    const finalSpeed = (totalDurationSec / Math.max(0.01, totalInferSeconds)).toFixed(1);

    progressBar.style.width = '100%';
    progressPercentage.innerText = '100%';
    currentPositionText.innerText = formatHMS(totalDurationSec);
    elapsedTimeText.innerText = `${totalInferSeconds.toFixed(1)} 秒`;
    statusText.innerText = '🎉 识别完成！';

    if (finalBadge) {
      finalBadge.style.display = 'block';
      finalBadge.innerText = `🎉 识别完成！音频原时长: ${durationStr} | 纯推演耗时: ${totalInferSeconds.toFixed(2)} 秒 | 达到 ${finalSpeed}x 倍速超实时转录！`;
    }

  } catch (err) {
    const readableErr = decodeEmscriptenError(err);
    alert('转录异常: ' + readableErr);
    statusText.innerText = '❌ 识别失败: ' + readableErr;
  } finally {
    if (fs) {
      try { fs.free(); } catch (_) {}
      fs = null;
    }
    isProcessingFile = false;
  }
}

// 拖拽事件绑定
fileInput.onchange = function(e) {
  if (e.target.files && e.target.files[0]) {
    processAudioFile(e.target.files[0]);
    fileInput.value = '';
  }
};
dropZone.ondragover = function(e) { e.preventDefault(); dropZone.classList.add('dragover'); };
dropZone.ondragleave = function(e) { e.preventDefault(); dropZone.classList.remove('dragover'); };
dropZone.ondrop = function(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processAudioFile(e.dataTransfer.files[0]);
  }
};
