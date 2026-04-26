/* =========================================
   مذكراتي — Cloud Notes App
   app.js
   ========================================= */

'use strict';

/* ==========================================
   FIREBASE CONFIG — ثابتة لا تتغير
   ========================================== */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC4_ExLirUsBijIdPvmhCEVJ6YZaFBtCm4",
  authDomain:        "notes-c307f.firebaseapp.com",
  databaseURL:       "https://notes-c307f-default-rtdb.firebaseio.com",
  projectId:         "notes-c307f",
  storageBucket:     "notes-c307f.firebasestorage.app",
  messagingSenderId: "875467306887",
  appId:             "1:875467306887:web:44c88b25c66be0cde88522",
};

/* ==========================================
   STATE
   ========================================== */
const App = {
  notes: {},
  currentId: null,
  autoSaveTimer: null,
  firebaseReady: false,
  db: null,
  storage: null,
  mediaRecorder: null,
  recordingChunks: [],
  recTimerInterval: null,
  recSeconds: 0,
  isRecording: false,
};

/* ==========================================
   UTILS
   ========================================== */
function genId() {
  return 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)      return 'الآن';
  if (diff < 3600000)    return Math.floor(diff / 60000) + ' دقيقة';
  if (diff < 86400000)   return Math.floor(diff / 3600000) + ' ساعة';
  if (diff < 2592000000) return Math.floor(diff / 86400000) + ' يوم';
  return new Date(ts).toLocaleDateString('ar-SA');
}
function formatTime(secs) {
  return String(Math.floor(secs / 60)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0');
}
function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ==========================================
   STATUS BAR
   ========================================== */
function setStatus(text, type) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot';
  if (type === 'saving')  dot.classList.add('saving');
  if (type === 'offline') dot.classList.add('offline');
  if (type === 'error')   dot.classList.add('error');
}

/* ==========================================
   LOCAL STORAGE
   ========================================== */
const LS_KEY = 'mnotes_v2';

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { App.notes = JSON.parse(raw); return; }
  } catch(_) {}
  // ملاحظات ترحيبية أول مرة
  const id1 = genId();
  App.notes[id1] = {
    id: id1, title: 'مرحباً بك 👋',
    content: '<p>هذا تطبيق <strong>مذكراتي</strong> السحابي.</p><ul><li>اكتب ملاحظاتك مع تنسيق كامل</li><li>سجّل مقاطع صوتية</li><li>تتزامن تلقائياً على جميع أجهزتك</li></ul>',
    audios: [], created: Date.now()-100000, updated: Date.now()-100000,
  };
  saveLocal();
}

function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(App.notes)); } catch(_) {}
}

/* ==========================================
   FIREBASE
   ========================================== */
function initFirebase() {
  setStatus('جارٍ الاتصال بـ Firebase...', 'saving');

  const load = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  load('https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-app-compat.min.js')
    .then(() => load('https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-database-compat.min.js'))
    .then(() => load('https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-storage-compat.min.js'))
    .then(() => {
      try { firebase.app(); } catch(_) { firebase.initializeApp(FIREBASE_CONFIG); }
      App.db = firebase.database();
      App.storage = firebase.storage();
      App.firebaseReady = true;

      // شارة Firebase
      const badge = document.getElementById('demoBadge');
      if (badge) { badge.textContent = 'FIREBASE ☁️'; badge.style.color='var(--success)'; badge.style.borderColor='var(--success)'; }

      // مزامنة فورية
      App.db.ref('notes').on('value', snap => {
        const data = snap.val();
        if (data) {
          App.notes = data;
          renderList();
          if (App.currentId && App.notes[App.currentId]) refreshEditor();
        }
        setStatus('متصل · مزامنة تلقائية ☁️', 'ok');
      }, err => {
        setStatus('خطأ في الاتصال', 'error');
        console.error(err);
      });
    })
    .catch(err => {
      console.error(err);
      setStatus('تعذّر الاتصال بـ Firebase', 'error');
    });
}

async function saveToFirebase(note) {
  if (!App.db) return;
  try { await App.db.ref('notes/' + note.id).set(note); }
  catch(e) { console.error(e); }
}

async function uploadAudio(blob, noteId, clipId) {
  if (!App.storage) return null;
  try {
    const ref = App.storage.ref(`audio/${noteId}/${clipId}.webm`);
    await ref.put(blob);
    return await ref.getDownloadURL();
  } catch(e) { console.error(e); return null; }
}

/* ==========================================
   NOTES CRUD
   ========================================== */
function newNote() {
  const id = genId();
  App.notes[id] = { id, title:'', content:'', audios:[], created:Date.now(), updated:Date.now() };
  saveLocal();
  openNote(id);
  renderList();
  setTimeout(() => document.getElementById('noteTitle').focus(), 50);
}

function openNote(id) {
  const note = App.notes[id];
  if (!note) return;
  App.currentId = id;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('editorContainer').classList.remove('hidden');
  document.getElementById('noteTitle').value = note.title || '';
  document.getElementById('editor').innerHTML = note.content || '';
  renderAudioClips();
  renderList();
}

function refreshEditor() {
  if (!App.currentId) return;
  const note = App.notes[App.currentId];
  if (!note) return;
  const titleEl = document.getElementById('noteTitle');
  const editorEl = document.getElementById('editor');
  if (document.activeElement !== titleEl && document.activeElement !== editorEl) {
    titleEl.value = note.title || '';
    editorEl.innerHTML = note.content || '';
    renderAudioClips();
  }
}

function deleteNote() {
  if (!App.currentId || !confirm('حذف هذه الملاحظة نهائياً؟')) return;
  const id = App.currentId;
  App.currentId = null;
  if (App.db) App.db.ref('notes/' + id).remove();
  delete App.notes[id];
  saveLocal();
  document.getElementById('editorContainer').classList.add('hidden');
  document.getElementById('emptyState').classList.remove('hidden');
  renderList();
}

/* ==========================================
   AUTO SAVE
   ========================================== */
function onEdit() {
  const note = App.notes[App.currentId];
  if (!note) return;
  note.title   = document.getElementById('noteTitle').value;
  note.content = document.getElementById('editor').innerHTML;
  note.updated = Date.now();
  setStatus('جارٍ الحفظ...', 'saving');
  clearTimeout(App.autoSaveTimer);
  App.autoSaveTimer = setTimeout(async () => {
    saveLocal();
    if (App.firebaseReady) {
      await saveToFirebase(note);
      setStatus('محفوظ · Firebase ☁️', 'ok');
    } else {
      setStatus('محفوظ محلياً', 'ok');
    }
    renderList();
  }, 800);
}

/* ==========================================
   RENDER
   ========================================== */
function renderList(filter) {
  filter = filter || document.getElementById('searchInput')?.value || '';
  const list = document.getElementById('notesList');
  const sorted = Object.values(App.notes)
    .sort((a,b) => b.updated - a.updated)
    .filter(n => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (n.title||'').toLowerCase().includes(q) || stripHtml(n.content||'').toLowerCase().includes(q);
    });

  if (!sorted.length) {
    list.innerHTML = `<div class="notes-empty">${filter ? 'لا توجد نتائج' : 'لا توجد ملاحظات'}</div>`;
    return;
  }
  list.innerHTML = sorted.map(n => `
    <div class="note-item ${n.id===App.currentId?'active':''}" onclick="openNote('${n.id}')">
      <div class="note-item-title">${escHtml(n.title)||'بدون عنوان'}</div>
      <div class="note-item-preview">${escHtml(stripHtml(n.content||'').slice(0,60))||'فارغة'}</div>
      <div class="note-item-footer">
        <span class="note-item-date">${timeAgo(n.updated)}</span>
        ${n.audios&&n.audios.length?`<span class="note-item-audio">🎙 ${n.audios.length}</span>`:''}
      </div>
    </div>`).join('');
}

function searchNotes(v) { renderList(v); }

/* ==========================================
   FORMATTING
   ========================================== */
function fmt(cmd, val) {
  document.execCommand(cmd, false, val||null);
  document.getElementById('editor').focus();
}
function handleKey(e) {
  if (e.key==='Tab') { e.preventDefault(); document.execCommand('insertHTML',false,'&nbsp;&nbsp;&nbsp;&nbsp;'); }
  if ((e.ctrlKey||e.metaKey)&&e.key==='b') { e.preventDefault(); fmt('bold'); }
  if ((e.ctrlKey||e.metaKey)&&e.key==='i') { e.preventDefault(); fmt('italic'); }
  if ((e.ctrlKey||e.metaKey)&&e.key==='u') { e.preventDefault(); fmt('underline'); }
}

/* ==========================================
   AUDIO
   ========================================== */
async function toggleRecord() {
  if (!App.isRecording) await startRecord(); else stopRecord();
}

async function startRecord() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    App.mediaRecorder = new MediaRecorder(stream, {mimeType:'audio/webm'});
    App.recordingChunks = [];
    App.mediaRecorder.ondataavailable = e => { if(e.data.size>0) App.recordingChunks.push(e.data); };
    App.mediaRecorder.onstop = processRecording;
    App.mediaRecorder.start(100);
    App.isRecording = true;
    App.recSeconds  = 0;
    document.getElementById('recordBtn').classList.add('recording');
    document.getElementById('recordLabel').textContent = 'إيقاف التسجيل';
    document.getElementById('recTimer').classList.add('visible');
    App.recTimerInterval = setInterval(() => {
      App.recSeconds++;
      document.getElementById('recTimer').textContent = formatTime(App.recSeconds);
    }, 1000);
  } catch(err) {
    alert(err.name==='NotAllowedError' ? 'يرجى السماح بالوصول للميكروفون' : 'خطأ: '+err.message);
  }
}

function stopRecord() {
  if (App.mediaRecorder && App.mediaRecorder.state!=='inactive') {
    App.mediaRecorder.stop();
    App.mediaRecorder.stream.getTracks().forEach(t=>t.stop());
  }
  clearInterval(App.recTimerInterval);
  App.isRecording = false;
  document.getElementById('recordBtn').classList.remove('recording');
  document.getElementById('recordLabel').textContent = 'بدء التسجيل';
  document.getElementById('recTimer').classList.remove('visible');
  document.getElementById('recTimer').textContent = '00:00';
}

async function processRecording() {
  const blob = new Blob(App.recordingChunks, {type:'audio/webm'});
  const localUrl = URL.createObjectURL(blob);
  const note = App.notes[App.currentId];
  if (!note) return;
  if (!note.audios) note.audios = [];
  const clipId   = 'clip_' + Date.now();
  const clipName = 'تسجيل ' + new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
  const clip = {id:clipId, name:clipName, url:localUrl, duration:App.recSeconds, uploadedUrl:null};
  note.audios.push(clip);
  note.updated = Date.now();
  saveLocal();
  renderAudioClips();
  renderList();

  if (App.firebaseReady && App.storage) {
    setStatus('جارٍ رفع التسجيل...', 'saving');
    const dlUrl = await uploadAudio(blob, App.currentId, clipId);
    if (dlUrl) {
      clip.uploadedUrl = dlUrl;
      clip.url = dlUrl;
      saveLocal();
      await saveToFirebase(note);
      setStatus('تم رفع التسجيل ☁️', 'ok');
    }
  } else {
    saveLocal();
  }
}

function renderAudioClips() {
  const note = App.notes[App.currentId];
  const clips = note?.audios || [];
  document.getElementById('audioClips').innerHTML = clips.map(c => `
    <div class="audio-clip" id="clip-${c.id}">
      <span class="clip-icon">🎙</span>
      <span class="clip-name">${escHtml(c.name)}</span>
      <span class="clip-duration">${formatTime(c.duration||0)}</span>
      <button class="clip-play" onclick="playClip('${c.id}')" title="تشغيل">▶</button>
      <button class="clip-del"  onclick="deleteClip('${c.id}')" title="حذف">✕</button>
    </div>`).join('');
}

function playClip(clipId) {
  const note = App.notes[App.currentId];
  const clip = note?.audios?.find(c=>c.id===clipId);
  if (!clip) return;
  if (window._audio) { window._audio.pause(); window._audio=null; }
  const a = new Audio(clip.url);
  window._audio = a;
  const btn = document.querySelector(`#clip-${clipId} .clip-play`);
  if (btn) btn.textContent = '⏸';
  a.onended = () => { if(btn) btn.textContent='▶'; };
  a.play();
}

function deleteClip(clipId) {
  if (!confirm('حذف هذا التسجيل؟')) return;
  const note = App.notes[App.currentId];
  if (!note) return;
  note.audios = note.audios.filter(c=>c.id!==clipId);
  note.updated = Date.now();
  saveLocal();
  if (App.firebaseReady) saveToFirebase(note);
  renderAudioClips();
  renderList();
}

/* ==========================================
   KEYBOARD SHORTCUTS
   ========================================== */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey||e.metaKey) && e.key==='n') { e.preventDefault(); newNote(); }
});

/* ==========================================
   INIT — بدون أي نافذة إعداد
   ========================================== */
function init() {
  loadLocal();
  renderList();
  // افتح أحدث ملاحظة تلقائياً
  const first = Object.values(App.notes).sort((a,b)=>b.updated-a.updated)[0];
  if (first) openNote(first.id);
  // اتصل بـ Firebase مباشرة
  initFirebase();
}

/* Globals for onclick */
window.newNote      = newNote;
window.openNote     = openNote;
window.deleteNote   = deleteNote;
window.onEdit       = onEdit;
window.handleKey    = handleKey;
window.fmt          = fmt;
window.searchNotes  = searchNotes;
window.toggleRecord = toggleRecord;
window.playClip     = playClip;
window.deleteClip   = deleteClip;

document.addEventListener('DOMContentLoaded', init);