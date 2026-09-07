const STORAGE_KEY = "steamGameCatalog.games";
let games = [];
let editingId = null;
let imageData = "";
let draggedId = null;

const form = document.getElementById("gameForm");
const titleInput = document.getElementById("title");
const urlInput = document.getElementById("steamUrl");
const descInput = document.getElementById("description");
const imageInput = document.getElementById("image");
const preview = document.getElementById("preview");
const message = document.getElementById("message");
const saveBtn = document.getElementById("saveBtn");
const cancelEdit = document.getElementById("cancelEdit");

function loadGames() {
  try {
    games = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(games)) games = [];
  } catch {
    games = [];
  }
}

function saveGames() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function renderList() {
  const list = document.getElementById("adminList");
  document.getElementById("countBadge").textContent = games.length;

  if (!games.length) {
    list.innerHTML = `<div class="empty-state" style="padding: 35px 12px"><div class="empty-icon">📚</div><p>Игры ещё не добавлены.</p></div>`;
    return;
  }

  list.innerHTML = games.map((game, index) => `
    <div class="admin-item" draggable="true" data-id="${escapeHtml(game.id)}">
      <div class="drag-handle" title="Перетащить игру" aria-label="Перетащить игру">⠿</div>
      <img class="admin-thumb" src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)}">
      <div class="admin-info">
        <div class="admin-number">${index + 1}</div>
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.description)}</p>
      </div>
      <div class="item-actions">
        <button class="secondary-btn" data-action="edit" data-id="${escapeHtml(game.id)}">Изменить</button>
        <button class="danger-btn" data-action="delete" data-id="${escapeHtml(game.id)}">Удалить</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-action='edit']").forEach(btn => {
    btn.addEventListener("click", () => editGame(btn.dataset.id));
  });

  list.querySelectorAll("[data-action='delete']").forEach(btn => {
    btn.addEventListener("click", () => deleteGame(btn.dataset.id));
  });

  list.querySelectorAll(".admin-item").forEach(item => {
    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("dragenter", handleDragEnter);
    item.addEventListener("dragleave", handleDragLeave);
    item.addEventListener("drop", handleDrop);
    item.addEventListener("dragend", handleDragEnd);
  });
}

function handleDragStart(event) {
  draggedId = event.currentTarget.dataset.id;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedId);
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleDragEnter(event) {
  event.preventDefault();
  const item = event.currentTarget;
  if (item.dataset.id !== draggedId) {
    item.classList.add("drag-over");
  }
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleDrop(event) {
  event.preventDefault();
  const targetId = event.currentTarget.dataset.id;

  if (!draggedId || draggedId === targetId) {
    return;
  }

  const fromIndex = games.findIndex(game => game.id === draggedId);
  const toIndex = games.findIndex(game => game.id === targetId);

  if (fromIndex === -1 || toIndex === -1) {
    return;
  }

  const [movedGame] = games.splice(fromIndex, 1);
  games.splice(toIndex, 0, movedGame);
  saveGames();
  renderList();
  showMessage("Порядок игр сохранён.");
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".admin-item").forEach(item => {
    item.classList.remove("drag-over");
  });
  draggedId = null;
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showMessage("Файл слишком большой. Выбери изображение до 8 МБ.", true);
    imageInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    imageData = String(reader.result);
    preview.src = imageData;
    preview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

form.addEventListener("submit", event => {
  event.preventDefault();
  message.textContent = "";

  const title = titleInput.value.trim();
  const steamUrl = urlInput.value.trim();
  const description = descInput.value.trim();

  if (!title || !description || !steamUrl) {
    showMessage("Заполни все обязательные поля.", true);
    return;
  }

  const validUrl = safeUrl(steamUrl);
  if (validUrl === "#") {
    showMessage("Укажи корректную ссылку, начинающуюся с http:// или https://.", true);
    return;
  }

  const existing = editingId ? games.find(g => g.id === editingId) : null;
  const image = imageData || existing?.image;

  if (!image) {
    showMessage("Выбери изображение карточки.", true);
    return;
  }

  if (existing) {
    existing.title = title;
    existing.steamUrl = validUrl;
    existing.description = description;
    existing.image = image;
    showMessage("Игра обновлена.");
  } else {
    games.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      steamUrl: validUrl,
      description,
      image,
      createdAt: Date.now()
    });
    showMessage("Игра добавлена в каталог.");
  }

  saveGames();
  renderList();
  resetForm(false);
});

cancelEdit.addEventListener("click", () => resetForm(true));

function editGame(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  editingId = id;
  imageData = game.image;
  titleInput.value = game.title;
  urlInput.value = game.steamUrl;
  descInput.value = game.description;
  preview.src = game.image;
  preview.classList.remove("hidden");
  saveBtn.textContent = "Сохранить изменения";
  cancelEdit.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteGame(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  const ok = confirm(`Удалить «${game.title}»?`);
  if (!ok) return;

  games = games.filter(g => g.id !== id);
  saveGames();
  renderList();
  if (editingId === id) resetForm(true);
  showMessage("Игра удалена.");
}

function resetForm(clearMessage = true) {
  editingId = null;
  imageData = "";
  form.reset();
  preview.src = "";
  preview.classList.add("hidden");
  saveBtn.textContent = "Добавить игру";
  cancelEdit.classList.add("hidden");
  if (clearMessage) message.textContent = "";
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "var(--danger)" : "var(--success)";
}

loadGames();
renderList();
