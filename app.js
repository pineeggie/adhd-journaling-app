const STORAGE_KEY = "murmur-entries-v1";
const PROFILE_STORAGE_KEY = "murmur-profile-v1";
const defaultProfile = { displayName: "わたし", userId: "my_journal", image: "" };

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
let profile = loadProfile();
let selectedMood = "";
let selectedTags = [];
let activePromptText = "";
let activeFilter = "all";
let activeView = "home";
let editingId = null;
let pendingImages = [];
let reflectionPeriod = "7";
let todoFilter = "open";
let composerReturnView = "home";

const $ = (selector) => document.querySelector(selector);
const timeline = $("#timeline");
const emptyState = $("#emptyState");
const sheet = $("#composeSheet");
const backdrop = $("#sheetBackdrop");
const entryText = $("#entryText");
const saveButton = $("#saveEntry");
const settingsSheet = $("#settingsSheet");
let pendingProfileImage = "";

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : seedEntries;
  } catch {
    return seedEntries;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY));
    if (!saved || typeof saved !== "object") return { ...defaultProfile };
    return {
      displayName: typeof saved.displayName === "string" && saved.displayName.trim() ? saved.displayName.trim().slice(0, 30) : defaultProfile.displayName,
      userId: typeof saved.userId === "string" && /^[a-zA-Z0-9_]+$/.test(saved.userId) ? saved.userId.slice(0, 20) : defaultProfile.userId,
      image: typeof saved.image === "string" ? saved.image : ""
    };
  } catch {
    return { ...defaultProfile };
  }
}

function profileInitial(name = profile.displayName) {
  return Array.from(name.trim())[0] || "私";
}

function safeProfileImage(image = profile.image) {
  return typeof image === "string" && /^data:image\/(?:png|jpe?g|webp);base64,/.test(image) ? image : "";
}

function avatarHTML(image = profile.image, name = profile.displayName) {
  const safeImage = safeProfileImage(image);
  return safeImage ? `<img src="${safeImage}" alt="" />` : escapeHTML(profileInitial(name));
}

function safeEntryImage(image) {
  return typeof image === "string" && /^data:image\/(?:png|jpe?g|webp);base64,/.test(image) ? image : "";
}

function entryImagesHTML(entry) {
  const images = Array.isArray(entry.images) ? entry.images.map(safeEntryImage).filter(Boolean).slice(0, 4) : [];
  if (!images.length) return "";
  return `<div class="entry-images image-grid-${images.length}">${images.map((image, index) => `<img src="${image}" alt="添付画像 ${index + 1}" loading="lazy" />`).join("")}</div>`;
}

function renderProfile() {
  document.querySelectorAll("[data-profile-avatar]").forEach((avatar) => { avatar.innerHTML = avatarHTML(); });
  $("#profilePhotoPreview").innerHTML = avatarHTML(pendingProfileImage || profile.image);
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
      <div class="entry-avatar profile-avatar">${avatarHTML()}</div>
      <div>
        <div class="entry-head">
          <strong>${escapeHTML(profile.displayName)}</strong><span class="handle">@${escapeHTML(profile.userId)}</span><span>·</span>
          <time datetime="${entry.createdAt}">${relativeTime(entry.createdAt)}</time>
          <button class="entry-menu" type="button" data-action="delete" aria-label="このメモを削除">···</button>
        </div>
        ${entry.prompt ? `<p class="entry-prompt">✦ ${escapeHTML(entry.prompt)}</p>` : ""}
        ${entry.text ? `<p class="entry-text">${escapeHTML(entry.text)}</p>` : ""}
        ${entryImagesHTML(entry)}
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
  composerReturnView = activeView === "todos" ? "todos" : "home";
  activePromptText = prompt;
  editingId = entry?.id || null;
  selectedMood = entry?.mood || "";
  selectedTags = entry?.tags ? [...entry.tags] : [];
  pendingImages = Array.isArray(entry?.images) ? entry.images.map(safeEntryImage).filter(Boolean).slice(0, 4) : [];
  entryText.value = entry?.text || "";
  $("#composeTitle").textContent = entry ? "メモを編集" : "";
  const promptChip = $("#activePrompt");
  promptChip.textContent = prompt ? `✦ ${prompt}` : "";
  promptChip.classList.toggle("hidden", !prompt);
  $("#moodOptions").querySelectorAll("button").forEach((button) => button.classList.toggle("selected", button.dataset.mood === selectedMood));
  $("#tagOptions").querySelectorAll("button").forEach((button) => button.classList.toggle("selected", selectedTags.includes(button.dataset.tag)));
  updateComposerState();
  renderComposerImages();
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
  pendingImages = [];
  renderComposerImages();
}

function openSettings() {
  pendingProfileImage = profile.image;
  $("#displayNameInput").value = profile.displayName;
  $("#userIdInput").value = profile.userId;
  renderProfile();
  settingsSheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeSettings() {
  settingsSheet.classList.add("hidden");
  backdrop.classList.add("hidden");
  document.body.style.overflow = "";
  pendingProfileImage = "";
}

function closeActiveSheet() {
  if (!settingsSheet.classList.contains("hidden")) closeSettings();
  else closeComposer();
}

function resizeProfileImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const crop = Math.min(image.naturalWidth, image.naturalHeight);
        const sx = (image.naturalWidth - crop) / 2;
        const sy = (image.naturalHeight - crop) / 2;
        context.drawImage(image, sx, sy, crop, crop, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function resizeEntryImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxDimension = 1024;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderComposerImages() {
  const preview = $("#composerImages");
  preview.innerHTML = pendingImages.map((image, index) => `
    <div class="composer-image">
      <img src="${image}" alt="添付画像 ${index + 1}" />
      <button type="button" data-remove-image="${index}" aria-label="添付画像 ${index + 1} を削除">×</button>
    </div>
  `).join("");
  preview.classList.toggle("hidden", pendingImages.length === 0);
  $("#imageCount").textContent = `${pendingImages.length} / 4`;
  $("#imagePickerButton").disabled = pendingImages.length >= 4;
}

function updateComposerState() {
  const length = entryText.value.length;
  $("#charCount").textContent = `${length} / 500`;
  saveButton.disabled = entryText.value.trim().length === 0 && pendingImages.length === 0;
}

function saveEntry() {
  const text = entryText.value.trim();
  if (!text && pendingImages.length === 0) return;
  const previousEntries = entries.map((entry) => ({ ...entry, tags: [...entry.tags], images: Array.isArray(entry.images) ? [...entry.images] : [] }));
  if (editingId) {
    const entry = entries.find((item) => item.id === editingId);
    Object.assign(entry, { text, mood: selectedMood, tags: selectedTags, images: [...pendingImages], prompt: activePromptText || entry.prompt });
    showToast("メモを更新しました");
  } else {
    entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      text,
      mood: selectedMood,
      tags: selectedTags,
      prompt: activePromptText,
      images: [...pendingImages],
      loved: false,
      todoCompleted: false,
      createdAt: new Date().toISOString()
    });
    showToast("タイムラインに残しました");
  }
  if (!persist()) {
    entries = previousEntries;
    showToast("保存容量が足りません。画像を減らしてください");
    return;
  }
  closeComposer();
  if (composerReturnView === "todos") openTodoView();
  else openTimelineView("home");
  document.querySelector("main").scrollTo({ top: 0, behavior: "smooth" });
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
  $("#timelineTitle").textContent = view === "favorites" ? "大切に残したメモ" : "タイムライン";
}

function todoDateLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function getTodoEntries() {
  return entries
    .filter((entry) => Array.isArray(entry.tags) && entry.tags.includes("あとで"))
    .sort((a, b) => Number(Boolean(a.todoCompleted)) - Number(Boolean(b.todoCompleted)) || new Date(b.createdAt) - new Date(a.createdAt));
}

function renderTodos() {
  const todos = getTodoEntries();
  const completed = todos.filter((entry) => entry.todoCompleted).length;
  const open = todos.length - completed;
  const visible = todoFilter === "open" ? todos.filter((entry) => !entry.todoCompleted) : todos;
  const progress = todos.length ? Math.round((completed / todos.length) * 100) : 0;

  $("#todoOpenCount").textContent = open;
  $("#todoProgressBar").style.width = `${progress}%`;
  $("#todoProgressLabel").textContent = `${completed}件完了`;
  document.querySelectorAll("[data-todo-filter]").forEach((button) => button.classList.toggle("selected", button.dataset.todoFilter === todoFilter));
  $("#todoList").innerHTML = visible.map((entry) => `
    <article class="todo-item ${entry.todoCompleted ? "completed" : ""}" data-id="${entry.id}">
      <button class="todo-check" type="button" data-todo-action="toggle" aria-label="${entry.todoCompleted ? "未完了に戻す" : "完了にする"}" aria-pressed="${Boolean(entry.todoCompleted)}">
        <span aria-hidden="true">${entry.todoCompleted ? "✓" : ""}</span>
      </button>
      <button class="todo-content" type="button" data-todo-action="edit" aria-label="投稿を編集">
        <span class="todo-text">${escapeHTML(entry.text || "画像付きの投稿")}</span>
        <span class="todo-date">${todoDateLabel(entry.createdAt)}の投稿</span>
      </button>
      <button class="todo-more" type="button" data-todo-action="edit" aria-label="投稿を編集">›</button>
    </article>
  `).join("");

  const isEmpty = visible.length === 0;
  $("#todoList").classList.toggle("hidden", isEmpty);
  $("#todoEmpty").classList.toggle("hidden", !isEmpty);
  if (todoFilter === "open" && todos.length > 0 && open === 0) {
    $("#todoEmptyTitle").textContent = "ぜんぶ完了しました";
    $("#todoEmptyCopy").textContent = "おつかれさま。完了した項目は「すべて」から見返せます。";
  } else {
    $("#todoEmptyTitle").textContent = "いまは空っぽです";
    $("#todoEmptyCopy").textContent = "投稿に「#あとで」を付けると、ここに追加されます。";
  }
}

function openTodoView() {
  if (activeView === "insights") resetReflection();
  activeView = "todos";
  setActiveNav("todos");
  $("#welcomeView").classList.add("hidden");
  $("#timelineView").classList.add("hidden");
  $("#insightsView").classList.add("hidden");
  $("#todoView").classList.remove("hidden");
  renderTodos();
  document.querySelector("main").scrollTo({ top: 0 });
}

function openTodoComposer() {
  openComposer();
  selectedTags = ["あとで"];
  $("#tagOptions").querySelectorAll("button").forEach((button) => button.classList.toggle("selected", button.dataset.tag === "あとで"));
}

function getReflectionEntries(period = reflectionPeriod) {
  if (period === "all") return [...entries].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const cutoff = Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => new Date(entry.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function reflectionPeriodLabel(period = reflectionPeriod) {
  return period === "all" ? "これまでのすべて" : `直近${period}日間`;
}

function updateReflectionControls() {
  const count = getReflectionEntries().length;
  document.querySelectorAll("[data-period]").forEach((button) => button.classList.toggle("selected", button.dataset.period === reflectionPeriod));
  $("#reflectionCount").textContent = count;
  $("#reflectionRange").textContent = `${reflectionPeriodLabel()}のポストが対象です`;
  $("#generateReflection").disabled = count === 0;
  $("#generateReflection span:first-child").textContent = count ? "ChatGPT用にコピーする" : "この期間にはポストがありません";
}

function showReflectionState(state) {
  ["Start", "Loading", "Result", "Error"].forEach((name) => {
    $(`#reflection${name}`).classList.toggle("hidden", name.toLowerCase() !== state);
  });
}

function resetReflection() {
  $("#resultPeriod").textContent = "";
  $("#reflectionPrompt").value = "";
  try { localStorage.removeItem("murmur-reflections-v1"); } catch {}
  updateReflectionControls();
  showReflectionState("start");
}

function formatEntryForReflection(entry, index) {
  const date = new Date(entry.createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? "日付不明" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const details = [
    `日付: ${dateLabel}`,
    entry.mood ? `気分: ${entry.mood}` : "",
    Array.isArray(entry.tags) && entry.tags.length ? `タグ: ${entry.tags.map((tag) => `#${tag}`).join(" ")}` : ""
  ].filter(Boolean).join(" / ");
  return `${index + 1}. ${details}\n${entry.text.trim()}`;
}

function buildReflectionPrompt(selectedEntries) {
  return `あなたは日本語のジャーナリング伴走者です。
以下は私が${reflectionPeriodLabel()}に書いたジャーナルです。

お願い:
- 全体の流れや傾向を2〜4文で要約してください。
- 私の小さな工夫、気づき、行動を具体的に見つけて、ポジティブなフィードバックを2〜4文でください。
- 診断、決めつけ、説教、過度な称賛は避けてください。
- つらさを無理にポジティブ変換せず、書かれている事実を根拠にしてください。
- 最後に「よかった兆し」を1〜3個、箇条書きで挙げてください。

ジャーナル:
${selectedEntries.map(formatEntryForReflection).join("\n\n")}`;
}

function renderReflection(result) {
  $("#resultPeriod").textContent = `${reflectionPeriodLabel(result.period)}・${result.entryCount}件`;
  $("#reflectionPrompt").value = result.prompt;
  showReflectionState("result");
}

function openInsights() {
  activeView = "insights";
  setActiveNav("insights");
  $("#welcomeView").classList.add("hidden");
  $("#timelineView").classList.add("hidden");
  $("#todoView").classList.add("hidden");
  $("#insightsView").classList.remove("hidden");
  resetReflection();
  document.querySelector("main").scrollTo({ top: 0 });
}

function openTimelineView(view) {
  if (activeView === "insights") resetReflection();
  activeView = view;
  $("#insightsView").classList.add("hidden");
  $("#todoView").classList.add("hidden");
  $("#welcomeView").classList.remove("hidden");
  $("#timelineView").classList.remove("hidden");
  setActiveNav(view);
  render();
}

async function generateReflection() {
  const selectedEntries = getReflectionEntries();
  if (!selectedEntries.length) return;
  const prompt = buildReflectionPrompt(selectedEntries);
  const result = { prompt, period: reflectionPeriod, entryCount: selectedEntries.length };
  renderReflection(result);
  try {
    await Promise.race([
      navigator.clipboard.writeText(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("copy timeout")), 1200))
    ]);
    showToast("ChatGPT用の文章をコピーしました");
  } catch (error) {
    showToast("自動コピーできませんでした。文章を選択してコピーしてください");
  }
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
$("#emptyTodoAdd").addEventListener("click", openTodoComposer);
$("#cancelCompose").addEventListener("click", closeComposer);
backdrop.addEventListener("click", closeActiveSheet);
entryText.addEventListener("input", updateComposerState);
saveButton.addEventListener("click", saveEntry);

$("#imagePickerButton").addEventListener("click", () => $("#entryImageInput").click());
$("#entryImageInput").addEventListener("change", async (event) => {
  const available = 4 - pendingImages.length;
  const selected = Array.from(event.target.files);
  const files = selected.slice(0, available);
  if (selected.length > available) showToast(`画像は4枚まで添付できます`);
  const invalid = files.some((file) => !file.type.startsWith("image/"));
  if (invalid) {
    event.target.value = "";
    return showToast("画像ファイルを選んでください");
  }
  $("#imagePickerButton").classList.add("loading");
  try {
    for (const file of files) pendingImages.push(await resizeEntryImage(file));
    renderComposerImages();
    updateComposerState();
  } catch {
    showToast("画像を読み込めませんでした");
  } finally {
    $("#imagePickerButton").classList.remove("loading");
    event.target.value = "";
  }
});
$("#composerImages").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove-image]");
  if (!button) return;
  pendingImages.splice(Number(button.dataset.removeImage), 1);
  renderComposerImages();
  updateComposerState();
});

$("#profileButton").addEventListener("click", openSettings);
$("#cancelSettings").addEventListener("click", closeSettings);
$("#profilePhotoButton").addEventListener("click", () => $("#profilePhotoInput").click());
$("#changePhotoButton").addEventListener("click", () => $("#profilePhotoInput").click());
$("#profilePhotoInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return showToast("画像ファイルを選んでください");
  try {
    pendingProfileImage = await resizeProfileImage(file);
    $("#profilePhotoPreview").innerHTML = avatarHTML(pendingProfileImage, $("#displayNameInput").value);
  } catch {
    showToast("画像を読み込めませんでした");
  }
  event.target.value = "";
});
$("#displayNameInput").addEventListener("input", () => {
  if (!pendingProfileImage) $("#profilePhotoPreview").textContent = profileInitial($("#displayNameInput").value);
});
$("#userIdInput").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
});
$("#profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const displayName = $("#displayNameInput").value.trim();
  const userId = $("#userIdInput").value.trim();
  if (!displayName || !userId) return showToast("表示名とIDを入力してください");
  profile = { displayName, userId, image: pendingProfileImage };
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    return showToast("プロフィールを保存できませんでした");
  }
  closeSettings();
  renderProfile();
  render();
  showToast("プロフィールを保存しました");
});

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

$("#todoList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-todo-action]");
  if (!button) return;
  const entry = entries.find((candidate) => candidate.id === button.closest(".todo-item")?.dataset.id);
  if (!entry) return;
  if (button.dataset.todoAction === "toggle") {
    entry.todoCompleted = !entry.todoCompleted;
    persist();
    renderTodos();
    showToast(entry.todoCompleted ? "完了にしました" : "未完了に戻しました");
  }
  if (button.dataset.todoAction === "edit") openComposer(entry.prompt || "", entry);
});

document.querySelectorAll("[data-todo-filter]").forEach((button) => button.addEventListener("click", () => {
  todoFilter = button.dataset.todoFilter;
  renderTodos();
}));

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
  if (view === "insights") return openInsights();
  if (view === "todos") return openTodoView();
  openTimelineView(view);
}));

document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
  const nextPeriod = button.dataset.period;
  if (nextPeriod === reflectionPeriod) return;
  reflectionPeriod = nextPeriod;
  resetReflection();
}));
$("#generateReflection").addEventListener("click", generateReflection);
$("#regenerateReflection").addEventListener("click", generateReflection);
$("#retryReflection").addEventListener("click", generateReflection);
$(".chatgpt-link").addEventListener("click", resetReflection);

const now = new Date();
$("#todayLabel").textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${["日", "月", "火", "水", "木", "金", "土"][now.getDay()]}曜日`;
$("#promptText").textContent = prompts[now.getDate() % prompts.length];
renderProfile();
render();

if ("serviceWorker" in navigator) window.addEventListener("load", async () => {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || sessionStorage.getItem("murmur-sw-refreshed") === "1") return;
    refreshing = true;
    sessionStorage.setItem("murmur-sw-refreshed", "1");
    location.reload();
  });

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    await registration.update();
    if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
      });
    });
  } catch {}
});
