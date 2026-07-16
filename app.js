const STORAGE_KEY = "murmur-entries-v1";

const prompts = [
  "いま頭を占めていることは？",
  "今日、少しだけうまくいったことは？",
  "忘れたくない小さな気づきは？",
  "身体は今、何を伝えている？",
  "明日の自分にひとこと残すなら？",
  "考えなくていいことを、ここに置くなら？"
];

const seedEntries = [
  {
    id: "seed-1",
    text: "朝いちばんにタスクを3つ書いたら、いつもより迷子にならなかった。全部じゃなくて「次のひとつ」だけ見るのがよさそう。",
    mood: "晴れ",
    tags: ["できた", "気づき"],
    loved: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 48).toISOString()
  },
  {
    id: "seed-2",
    text: "頭の中がにぎやか。返信、洗濯、あの資料。いったん全部ここに置く。まず水を飲む。",
    mood: "曇り",
    tags: ["モヤモヤ"],
    loved: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
  },
  {
    id: "seed-3",
    text: "帰りに電池を買う。玄関の鍵の横に置く。",
    mood: "ふつう",
    tags: ["あとで"],
    loved: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString()
  }
];

const moodEmoji = { 晴れ: "☀️", ふつう: "🌤️", 曇り: "☁️", 雨: "🌧️", 嵐: "⛈️" };

let entries = loadEntries();
let selectedMood = "";
let selectedTags = [];
let activePromptText = "";
let activeFilter = "all";
let activeView = "home";
let editingId = null;

const $ = (selector) => document.querySelector(selector);
const timeline = $("#timeline");
const emptyState = $("#emptyState");
const sheet = $("#composeSheet");
const backdrop = $("#sheetBackdrop");
const entryText = $("#entryText");
const saveButton = $("#saveEntry");

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : seedEntries;
  } catch {
    return seedEntries;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function escapeHTML(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function relativeTime(iso) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "いま";
  if (mins < 60) return `${mins}分`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getVisibleEntries() {
  const query = $("#searchInput").value.trim().toLowerCase();
  return entries
    .filter((entry) => {
      if (activeView === "favorites" && !entry.loved) return false;
      if (activeFilter === "today" && new Date(entry.createdAt).toDateString() !== new Date().toDateString()) return false;
      if (!["all", "today"].includes(activeFilter) && !entry.tags.includes(activeFilter)) return false;
      if (query && !`${entry.text} ${entry.tags.join(" ")}`.toLowerCase().includes(query)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function render() {
  const visible = getVisibleEntries();
  timeline.innerHTML = visible.map((entry) => `
    <article class="entry" data-id="${entry.id}">
      <div class="entry-avatar">私</div>
      <div>
        <div class="entry-head">
          <strong>わたし</strong><span class="handle">@my_journal</span><span>·</span>
          <time datetime="${entry.createdAt}">${relativeTime(entry.createdAt)}</time>
          <button class="entry-menu" type="button" data-action="delete" aria-label="このメモを削除">···</button>
        </div>
        ${entry.prompt ? `<p class="entry-prompt">✦ ${escapeHTML(entry.prompt)}</p>` : ""}
        <p class="entry-text">${escapeHTML(entry.text)}</p>
        <div class="entry-meta">
          ${entry.mood ? `<span class="mood-badge">${moodEmoji[entry.mood]} ${entry.mood}</span>` : ""}
          ${entry.tags.map((tag) => `<span class="tag-badge"># ${escapeHTML(tag)}</span>`).join("")}
        </div>
        <div class="entry-actions">
          <button type="button" data-action="edit" aria-label="編集" title="編集">
            <svg viewBox="0 0 24 24"><path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z"/></svg>
          </button>
          <button type="button" data-action="copy" aria-label="コピー" title="コピー">
            <svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
          </button>
          <button class="${entry.loved ? "loved" : ""}" type="button" data-action="love" aria-label="${entry.loved ? "大切から外す" : "大切に保存"}" title="${entry.loved ? "大切から外す" : "大切に保存"}">
            <svg viewBox="0 0 24 24"><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8z"/></svg>
          </button>
        </div>
      </div>
    </article>
  `).join("");
  emptyState.classList.toggle("hidden", visible.length > 0);
  timeline.classList.toggle("hidden", visible.length === 0);
}

function openComposer(prompt = "", entry = null) {
  activePromptText = prompt;
  editingId = entry?.id || null;
  selectedMood = entry?.mood || "";
  selectedTags = entry?.tags ? [...entry.tags] : [];
  entryText.value = entry?.text || "";
  $("#composeTitle").textContent = entry ? "メモを編集" : "";
  const promptChip = $("#activePrompt");
  promptChip.textContent = prompt ? `✦ ${prompt}` : "";
  promptChip.classList.toggle("hidden", !prompt);
  $("#moodOptions").querySelectorAll("button").forEach((button) => button.classList.toggle("selected", button.dataset.mood === selectedMood));
  $("#tagOptions").querySelectorAll("button").forEach((button) => button.classList.toggle("selected", selectedTags.includes(button.dataset.tag)));
  updateComposerState();
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => entryText.focus(), 120);
}

function closeComposer() {
  sheet.classList.add("hidden");
  backdrop.classList.add("hidden");
  document.body.style.overflow = "";
  entryText.value = "";
  editingId = null;
}

function updateComposerState() {
  const length = entryText.value.length;
  $("#charCount").textContent = `${length} / 500`;
  saveButton.disabled = entryText.value.trim().length === 0;
}

function saveEntry() {
  const text = entryText.value.trim();
  if (!text) return;
  if (editingId) {
    const entry = entries.find((item) => item.id === editingId);
    Object.assign(entry, { text, mood: selectedMood, tags: selectedTags, prompt: activePromptText || entry.prompt });
    showToast("メモを更新しました");
  } else {
    entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      text,
      mood: selectedMood,
      tags: selectedTags,
      prompt: activePromptText,
      loved: false,
      createdAt: new Date().toISOString()
    });
    showToast("タイムラインに残しました");
  }
  persist();
  closeComposer();
  activeView = "home";
  setActiveNav("home");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 1900);
}

function setActiveNav(view) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#timelineTitle").textContent = view === "favorites" ? "大切に残したメモ" : "自分のタイムライン";
}

function pickPrompt() {
  const current = $("#promptText").textContent;
  const choices = prompts.filter((prompt) => prompt !== current);
  const prompt = choices[Math.floor(Math.random() * choices.length)];
  $("#promptText").textContent = prompt;
  return prompt;
}

$("#composeButton").addEventListener("click", () => openComposer());
$("#emptyCompose").addEventListener("click", () => openComposer());
$("#cancelCompose").addEventListener("click", closeComposer);
backdrop.addEventListener("click", closeComposer);
entryText.addEventListener("input", updateComposerState);
saveButton.addEventListener("click", saveEntry);

$("#promptButton").addEventListener("click", () => openComposer($("#promptText").textContent));
$("#promptButton").addEventListener("contextmenu", (event) => { event.preventDefault(); pickPrompt(); });

$("#moodOptions").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  selectedMood = selectedMood === button.dataset.mood ? "" : button.dataset.mood;
  $("#moodOptions").querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item.dataset.mood === selectedMood));
});

$("#tagOptions").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const tag = button.dataset.tag;
  selectedTags = selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag];
  button.classList.toggle("selected");
});

timeline.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const entry = entries.find((item) => item.id === button.closest(".entry").dataset.id);
  if (!entry) return;
  if (button.dataset.action === "love") {
    entry.loved = !entry.loved;
    persist(); render();
    showToast(entry.loved ? "大切なメモに追加しました" : "大切から外しました");
  }
  if (button.dataset.action === "edit") openComposer(entry.prompt || "", entry);
  if (button.dataset.action === "copy") {
    try { await navigator.clipboard.writeText(entry.text); showToast("コピーしました"); }
    catch { showToast("コピーできませんでした"); }
  }
  if (button.dataset.action === "delete") {
    if (confirm("このメモを削除しますか？")) {
      entries = entries.filter((item) => item.id !== entry.id);
      persist(); render(); showToast("削除しました");
    }
  }
});

$("#searchButton").addEventListener("click", () => {
  $("#searchPanel").classList.remove("hidden");
  $("#searchInput").focus();
});
$("#closeSearch").addEventListener("click", () => {
  $("#searchPanel").classList.add("hidden");
  $("#searchInput").value = "";
  render();
});
$("#searchInput").addEventListener("input", render);

$("#filterButton").addEventListener("click", () => $("#filterMenu").classList.toggle("hidden"));
$("#filterMenu").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  activeFilter = button.dataset.filter;
  $("#filterLabel").textContent = activeFilter === "all" ? "すべて" : activeFilter === "today" ? "今日" : `# ${activeFilter}`;
  $("#filterMenu").classList.add("hidden");
  render();
});

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  const view = button.dataset.view;
  if (view === "insights") return showToast(`今週は ${entries.length} 件、言葉を残しました`);
  if (view === "settings") return showToast("データはこの端末内に保存されています");
  activeView = view;
  setActiveNav(view);
  render();
}));

const now = new Date();
$("#todayLabel").textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${["日", "月", "火", "水", "木", "金", "土"][now.getDay()]}曜日`;
$("#promptText").textContent = prompts[now.getDate() % prompts.length];
render();

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
