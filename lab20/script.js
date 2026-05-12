import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHGxP7CzjpXh2cHrFin0EKSG42KVR4qpw",
  authDomain: "my-notes-app-b21a8.firebaseapp.com",
  projectId: "my-notes-app-b21a8",
  storageBucket: "my-notes-app-b21a8.firebasestorage.app",
  messagingSenderId: "783787952283",
  appId: "1:783787952283:web:9542387d58ce488bd25e3e",
  measurementId: "G-93R76E1954"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let currentUser = null;
"use strict";
const STORE_KEY = "pro_arabic_notes_v1";
const colors = [
  "#d8b36b",
  "#8aa7ff",
  "#72d391",
  "#ef6262",
  "#c084fc",
  "#38bdf8",
  "#f59e0b",
  "#f8fafc",
];
const templates = {
  summary:
    "<h2>ملخص الدرس</h2><ul><li><b>الفكرة الأساسية:</b> </li><li><b>القوانين أو التعاريف:</b> </li><li><b>مثال مهم:</b> </li></ul>",
  tasks:
    "<h2>الواجبات والمهام</h2><ul><li>المهمة الأولى: </li><li>الموعد النهائي: </li><li>ملاحظات إضافية: </li></ul>",
  questions:
    "<h2>أسئلة للمراجعة</h2><ol><li>ما أهم نقطة في الدرس؟</li><li>ما الجزء الذي يحتاج مراجعة؟</li><li>كيف أطبق الفكرة على مثال؟</li></ol>",
};
const $ = (selector) => document.querySelector(selector);
const appUI = $(".app");
const subjectsEl = $("#subjects");
const editor = $("#editor");
const titleInput = $("#noteTitle");
const visualTitle = $("#visualTitle");
const toast = $("#toast");
let state = loadState();
let activeId = state.activeId || (state.subjects[0] && state.subjects[0].id);
let saveTimer = null;
let mediaRecorder = null;
let audioChunks = [];
let recordStartedAt = 0;
let recordTimer = null;
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}
function setRecordingUi(isRecording) {
  const btn = $("#recordBtn");
  btn.classList.toggle("recording", isRecording);
  $("#recordLabel").textContent = isRecording ? "إيقاف التسجيل" : "بدء التسجيل";
  if (!isRecording) $("#recordStatus").textContent = "جاهز";
}
function insertAudioIntoEditor(dataUrl) {
  const stamp = new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const html =
    '<div class=\"audio-note\" contenteditable=\"false\"><b>تسجيل صوتي - ' +
    stamp +
    '</b><audio controls src=\"' +
    dataUrl +
    '\"></audio></div><p><br></p>';
  editor.focus();
  document.execCommand("insertHTML", false, html);
  updateStats();
  scheduleSave();
}
async function startRecording() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia ||
    !window.MediaRecorder
  ) {
    alert(
      "المتصفح لا يدعم تسجيل الصوت. جرب Chrome أو Edge عبر localhost أو HTTPS.",
    );
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      clearInterval(recordTimer);
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      const reader = new FileReader();
      reader.addEventListener("loadend", () => {
        insertAudioIntoEditor(reader.result);
        $("#recordStatus").textContent = "تمت الإضافة";
        window.setTimeout(
          () => ($("#recordStatus").textContent = "جاهز"),
          1400,
        );
      });
      reader.readAsDataURL(blob);
      setRecordingUi(false);
    });
    mediaRecorder.start();
    recordStartedAt = Date.now();
    setRecordingUi(true);
    $("#recordStatus").textContent = "00:00";
    recordTimer = window.setInterval(() => {
      $("#recordStatus").textContent = formatDuration(
        Date.now() - recordStartedAt,
      );
    }, 500);
  } catch (error) {
    alert("تعذر تشغيل الميكروفون. تأكد من منح الإذن للمتصفح.");
    setRecordingUi(false);
  }
}
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording")
    mediaRecorder.stop();
}

function defaultState() {
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  return {
    activeId: id,
    subjects: [
      {
        id,
        title: "مادة جديدة",
        color: "#d8b36b",
        body: "<p>هذا تطبيق مذكرات عادي بتصميم احترافي. أضف موادك من القائمة الجانبية واكتب ملاحظاتك هنا.</p><ul><li>اكتب ملاحظاتك مع تنسيق كامل</li><li>احفظ تلقائياً</li><li>صدّر المذكرة عند الحاجة</li></ul>",
        updated: Date.now(),
      },
    ],
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved && Array.isArray(saved.subjects) && saved.subjects.length
      ? saved
      : defaultState();
  } catch (error) {
    return defaultState();
  }
}
function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  saveUserNote();

  $("#saveState").textContent = "تم الحفظ الآن";
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1200);
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    syncActive();
    persist();
    renderSubjects();
  }, 350);
}
function activeSubject() {
  return (
    state.subjects.find((item) => item.id === activeId) || state.subjects[0]
  );
}
function escapeText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function renderSubjects() {
  const query = $("#search").value.trim().toLowerCase();
  subjectsEl.innerHTML = "";
  state.subjects
    .filter((s) => s.title.toLowerCase().includes(query))
    .forEach((subject) => {
      const item = document.createElement("button");
      item.className = "subject" + (subject.id === activeId ? " active" : "");
      item.innerHTML =
        "<span><b>" +
        escapeText(subject.title) +
        "</b><span>" +
        formatDate(subject.updated) +
        '</span></span><i class="badge" style="background:' +
        subject.color +
        '"></i>';
      item.addEventListener("click", () => {
        syncActive();
        activeId = subject.id;
        state.activeId = activeId;
        renderAll();
        persist();
      });
      subjectsEl.appendChild(item);
    });
}
function renderEditor() {
  const subject = activeSubject();
  if (!subject) return;
  titleInput.value = subject.title;
  visualTitle.textContent = subject.title;
  visualTitle.style.color = subject.color;
  editor.innerHTML = subject.body || "";
  updateStats();
  $("#updatedAt").textContent = "آخر تعديل: " + formatDate(subject.updated);
}
function renderPalette() {
  const palette = $("#palette");
  palette.innerHTML = "";
  colors.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "color";
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener("click", () => {
      const s = activeSubject();
      s.color = color;
      s.updated = Date.now();
      visualTitle.style.color = color;
      persist();
      renderSubjects();
    });
    palette.appendChild(btn);
  });
}
function renderAll() {
  renderSubjects();
  renderEditor();
  renderPalette();
}
function syncActive() {
  const subject = activeSubject();
  if (!subject) return;
  subject.title = titleInput.value.trim() || "بدون عنوان";
  subject.body = editor.innerHTML;
  subject.updated = Date.now();
  state.activeId = activeId;
}
function formatDate(time) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
}
function updateStats() {
  const text = editor.innerText.trim();
  $("#wordCount").textContent = (text ? text.split(/\s+/).length : 0) + " كلمة";
  $("#charCount").textContent = text.length + " حرف";
}
function command(name, value = null) {
  editor.focus();
  document.execCommand(name, false, value);
  scheduleSave();
  updateToolState();
}
function updateToolState() {
  document
    .querySelectorAll("[data-cmd]")
    .forEach((btn) =>
      btn.classList.toggle(
        "active",
        document.queryCommandState(btn.dataset.cmd),
      ),
    );
}

function placeCaretAtEnd(element) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function isSelectionInsideEditor() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return false;
  const node = selection.anchorNode;
  return node === editor || editor.contains(node);
}
function insertHtmlInsideEditor(html) {
  editor.focus();
  if (!isSelectionInsideEditor()) placeCaretAtEnd(editor);
  document.execCommand("insertHTML", false, html);
  updateStats();
  scheduleSave();
}
function escapeAttribute(text) {
  return String(text).replace(
    /[&<>\"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[char],
  );
}
function imageHtml(src, caption) {
  const safeCaption = caption ? escapeText(caption) : "صورة مضافة داخل المذكرة";
  const safeSrc = escapeAttribute(src);

  return (
    '<figure class="image-note" contenteditable="false">' +
      '<button type="button" class="image-delete">×</button>' +
      '<div class="image-resize-box">' +
        '<img src="' + safeSrc + '" alt="' + safeCaption + '" loading="lazy">' +
        '<span class="resize-handle top-left"></span>' +
        '<span class="resize-handle top-right"></span>' +
        '<span class="resize-handle bottom-left"></span>' +
        '<span class="resize-handle bottom-right"></span>' +
      '</div>' +
    '</figure>' +
    '<p><br></p>'
  );
}

function insertImageFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) return;

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    insertHtmlInsideEditor(
      imageHtml(reader.result, file.name || "صورة من الحافظة")
    );
  });

  reader.readAsDataURL(file);
}
function detectCodeLanguage(text) {
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return "markup";
  if (/[{};]/.test(text) && /(\.|#|body|display|color|background|margin|padding)/i.test(text)) return "css";
  if (/(function|const|let|var|=>|console\.log|document\.|addEventListener)/.test(text)) return "javascript";
  return null;
}

function handleEditorPaste(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const imageFiles = Array.from(clipboard.files || []).filter((file) =>
    file.type.startsWith("image/")
  );

  if (imageFiles.length) {
    event.preventDefault();
    imageFiles.forEach(insertImageFile);
    return;
  }

  const plainText = clipboard.getData("text/plain");
  const language = detectCodeLanguage(plainText);

  if (plainText && language) {
    event.preventDefault();

    insertHtmlInsideEditor(
      `<pre><code class="language-${language}">${escapeText(plainText)}</code></pre><p><br></p>`
    );

    highlightCodeBlocks();
    return;
  }

  if (plainText) {
    event.preventDefault();
    document.execCommand("insertText", false, plainText);
    updateStats();
    scheduleSave();
  }
}

function handleEditorDrop(event) {
  const files = Array.from(
    event.dataTransfer && event.dataTransfer.files
      ? event.dataTransfer.files
      : [],
  ).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  files.forEach(insertImageFile);
}

function togglePanel(panel) {
  const isMobile = window.matchMedia("(max-width:760px)").matches;
  if (panel === "subjects") {
    appUI.classList.toggle(isMobile ? "show-subjects-mobile" : "hide-subjects");
  } else {
    appUI.classList.toggle(isMobile ? "show-inspector-mobile" : "hide-inspector");
  }
}
$("#toggleSubjects").addEventListener("click", () => togglePanel("subjects"));
$("#toggleInspector").addEventListener("click", () => togglePanel("inspector"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    appUI.classList.remove("show-subjects-mobile", "show-inspector-mobile");
  }
});

$("#addSubject").addEventListener("click", () => {
  syncActive();
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  state.subjects.unshift({
    id,
    title: "مادة جديدة",
    color: colors[state.subjects.length % colors.length],
    body: "<p></p>",
    updated: Date.now(),
  });
  activeId = id;
  state.activeId = id;
  renderAll();
  persist();
  titleInput.focus();
  titleInput.select();
});
$("#deleteBtn").addEventListener("click", () => {
  if (state.subjects.length <= 1) {
    editor.innerHTML = "";
    titleInput.value = "مادة جديدة";
    scheduleSave();
    return;
  }
  if (!confirm("هل تريد حذف هذه المادة؟")) return;
  state.subjects = state.subjects.filter((s) => s.id !== activeId);
  activeId = state.subjects[0].id;
  state.activeId = activeId;
  renderAll();
  persist();
});
$("#saveBtn").addEventListener("click", () => {
  syncActive();
  persist();
  renderSubjects();
});
$("#printBtn").addEventListener("click", () => {
  syncActive();
  persist();
  window.print();
});
window.addEventListener("beforeprint", () => {
  syncActive();
  visualTitle.textContent = titleInput.value || "بدون عنوان";
});
$("#search").addEventListener("input", renderSubjects);
titleInput.addEventListener("input", () => {
  visualTitle.textContent = titleInput.value || "بدون عنوان";
  scheduleSave();
});
function highlightCodeBlocks() {
  if (window.Prism) {
    Prism.highlightAll();
  }
}
editor.addEventListener("input", () => {
  updateStats();
  scheduleSave();
  highlightCodeBlocks();
});

editor.addEventListener("paste", handleEditorPaste);
editor.addEventListener("drop", handleEditorDrop);
editor.addEventListener("dragover", (event) => event.preventDefault());

document
  .querySelectorAll("[data-cmd]")
  .forEach((btn) =>
    btn.addEventListener("click", () => command(btn.dataset.cmd)),
  );
$("#format").addEventListener("change", (event) =>
  command("formatBlock", event.target.value),
);
$("#fontSize").addEventListener("change", (event) =>
  command("fontSize", event.target.value),
);
document.querySelectorAll("[data-template]").forEach((btn) =>
  btn.addEventListener("click", () => {
    editor.focus();
    document.execCommand("insertHTML", false, templates[btn.dataset.template]);
    scheduleSave();
    updateStats();
  }),
);
$("#recordBtn").addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") stopRecording();
  else startRecording();
});
$("#exportBtn").addEventListener("click", () => {
  syncActive();
  const subject = activeSubject();
  const blob = new Blob([subject.title + "\n\n" + editor.innerText], {
    type: "text/plain;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = subject.title.replace(/[\\/:*?"<>|]/g, "-") + ".txt";
  link.click();
  URL.revokeObjectURL(link.href);
});
window.addEventListener("beforeunload", syncActive);
renderAll();
persist();
const authBox = document.getElementById("authBox");
const appBox = document.getElementById("appBox");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authMessage = document.getElementById("authMessage");

document.getElementById("registerBtn").addEventListener("click", async () => {
  authMessage.textContent = "";

  try {
    await createUserWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value
    );
  } catch (error) {
    authMessage.textContent = "تعذر إنشاء الحساب: " + error.message;
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  authMessage.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value
    );
  } catch (error) {
    authMessage.textContent = "تعذر تسجيل الدخول: " + error.message;
  }
});

async function saveUserNote() {
  if (!currentUser) return;

  syncActive();

  await setDoc(doc(db, "notes", currentUser.uid), {
    state: state,
    updatedAt: new Date()
  });
}
async function loadUserNote() {
  if (!currentUser) return;

  const snap = await getDoc(doc(db, "notes", currentUser.uid));

  if (snap.exists() && snap.data().state) {
    state = snap.data().state;
    activeId = state.activeId || state.subjects[0]?.id;
    renderAll();
    highlightCodeBlocks();
  }
}
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    authBox.style.display = "none";
    appBox.style.display = "block";

    await loadUserNote(); // 🔥 مهم
  } else {
    currentUser = null;

    authBox.style.display = "grid";
    appBox.style.display = "none";
  }
});
let timerMinutes = 5;
let timerSecondsLeft = timerMinutes * 60;
let timerInterval = null;
let timerRunning = false;

const timerModal = document.getElementById("timerModal");
const timerTab = document.getElementById("timerTab");
const closeTimer = document.getElementById("closeTimer");
const increaseTimer = document.getElementById("increaseTimer");
const decreaseTimer = document.getElementById("decreaseTimer");
const timerInput = document.getElementById("timerInput");
const timerDisplay = document.getElementById("timerDisplay");
const startTimer = document.getElementById("startTimer");
const resetTimer = document.getElementById("resetTimer");
const timerStatus = document.getElementById("timerStatus");

function updateTimerUI() {
  const minutes = String(Math.floor(timerSecondsLeft / 60)).padStart(2, "0");
  const seconds = String(timerSecondsLeft % 60).padStart(2, "0");
  timerDisplay.textContent = `${minutes}:${seconds}`;
  timerInput.value = timerMinutes;
}

function setTimerMinutes(value) {
  if (timerRunning) return;

  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes < 1) {
    timerMinutes = 1;
  } else {
    timerMinutes = Math.floor(minutes);
  }

  timerSecondsLeft = timerMinutes * 60;
  updateTimerUI();
}

function playTimerAlert() {
  const audioCtx = new AudioContext();
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.25;

  oscillator.connect(gain);
  gain.connect(audioCtx.destination);

  oscillator.start();

  setTimeout(() => {
    oscillator.frequency.value = 660;
  }, 250);

  setTimeout(() => {
    oscillator.stop();
    audioCtx.close();
  }, 1200);
}

function finishTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  startTimer.textContent = "▶";
  timerStatus.textContent = "انتهى الوقت";
  playTimerAlert();
}

function startOrPauseTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    startTimer.textContent = "▶";
    timerStatus.textContent = "متوقف مؤقتاً";
    return;
  }

  if (timerSecondsLeft <= 0) {
    timerSecondsLeft = timerMinutes * 60;
  }

  timerRunning = true;
  startTimer.textContent = "⏸";
  timerStatus.textContent = "المؤقت يعمل";

  timerInterval = setInterval(() => {
    timerSecondsLeft--;

    if (timerSecondsLeft <= 0) {
      timerSecondsLeft = 0;
      updateTimerUI();
      finishTimer();
      return;
    }

    updateTimerUI();
  }, 1000);
}

timerTab.addEventListener("click", () => {
  timerModal.classList.toggle("show");

  if (timerModal.classList.contains("show")) {
    timerInput.focus();
    timerInput.select();
  }
});

closeTimer.addEventListener("click", () => {
  timerModal.classList.remove("show");
});

increaseTimer.addEventListener("click", () => {
  setTimerMinutes(timerMinutes + 1);
});

decreaseTimer.addEventListener("click", () => {
  setTimerMinutes(timerMinutes - 1);
});

timerInput.addEventListener("input", () => {
  setTimerMinutes(timerInput.value);
});

timerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    startOrPauseTimer();
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setTimerMinutes(timerMinutes + 1);
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setTimerMinutes(timerMinutes - 1);
  }
});

startTimer.addEventListener("click", startOrPauseTimer);

resetTimer.addEventListener("click", () => {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSecondsLeft = timerMinutes * 60;
  startTimer.textContent = "▶";
  timerStatus.textContent = "جاهز للبدء";
  updateTimerUI();
});

updateTimerUI();
let resizingImage = null;
let startX = 0;
let startWidth = 0;

editor.addEventListener("click", (event) => {
  const imageNote = event.target.closest(".image-note");

  document.querySelectorAll(".image-note.selected").forEach((item) => {
    item.classList.remove("selected");
  });

  if (imageNote) {
    imageNote.classList.add("selected");
  }
});

editor.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest(".image-delete");
  if (!deleteBtn) return;

  const figure = deleteBtn.closest(".image-note");
  figure.remove();
  scheduleSave();
});

editor.addEventListener("mousedown", (event) => {
  const handle = event.target.closest(".resize-handle");
  if (!handle) return;

  event.preventDefault();

  const figure = handle.closest(".image-note");
  const img = figure.querySelector("img");

  resizingImage = img;
  startX = event.clientX;
  startWidth = img.getBoundingClientRect().width;

  figure.classList.add("selected");
});

document.addEventListener("mousemove", (event) => {
  if (!resizingImage) return;

  const diff = event.clientX - startX;
  const maxWidth = editor.clientWidth - 40;
  const newWidth = Math.max(120, Math.min(startWidth + diff, maxWidth));

  resizingImage.style.width = newWidth + "px";
});

document.addEventListener("mouseup", () => {
  if (!resizingImage) return;

  resizingImage = null;
  scheduleSave();
});
document.getElementById("codeBtn").addEventListener("click", () => {
  const selection = window.getSelection();
  const selectedText = selection.toString();

  if (!selectedText.trim()) {
    alert("حدد الكود أولاً");
    return;
  }

  const safeCode = escapeText(selectedText);

  document.execCommand(
    "insertHTML",
    false,
    `<pre><code class="language-markup">${safeCode}</code></pre><p><br></p>`
  );

  highlightCodeBlocks();
  scheduleSave();
});
