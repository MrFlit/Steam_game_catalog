const STORAGE_KEY = "steamGameCatalog.games";
let games = [];
let selectedIndex = 0;

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

function render() {
  const carousel = document.getElementById("carousel");
  const details = document.getElementById("gameDetails");
  const counter = document.getElementById("gameCounter");

  counter.textContent = games.length ? `${games.length} ${plural(games.length, "игра", "игры", "игр")}` : "";

  if (!games.length) {
    carousel.innerHTML = "";
    details.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎮</div>
        <h2>Пока нет игр</h2>
        <p>Открой раздел «Управление» и добавь первую игру.</p>
        <a class="primary-btn" href="admin.html">Добавить игру</a>
      </div>`;
    return;
  }

  selectedIndex = Math.max(0, Math.min(selectedIndex, games.length - 1));

  carousel.innerHTML = games.map((game, i) => `
    <article class="game-card ${i === selectedIndex ? "active" : ""}" data-index="${i}">
      <img class="card-image" src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)}">
      <div class="card-title">${escapeHtml(game.title)}</div>
    </article>
  `).join("");

  carousel.querySelectorAll(".game-card").forEach(card => {
    card.addEventListener("click", () => selectGame(Number(card.dataset.index), true));
  });

  renderDetails(games[selectedIndex]);
}

function renderDetails(game) {
  const details = document.getElementById("gameDetails");
  details.innerHTML = `
    <div class="detail-wrap">
      <img class="detail-image" src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)}">
      <div class="detail-content">
        <p class="eyebrow">ИЗБРАННАЯ ИГРА</p>
        <h2>${escapeHtml(game.title)}</h2>
        <div class="detail-description">${escapeHtml(game.description)}</div>
        <a class="primary-btn" href="${escapeHtml(safeUrl(game.steamUrl))}" target="_blank" rel="noopener noreferrer">Перейти в Steam ↗</a>
      </div>
    </div>`;
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function selectGame(index, shouldScroll) {
  if (!games[index]) return;
  selectedIndex = index;
  render();

  if (shouldScroll) {
    const card = document.querySelector(`.game-card[data-index="${index}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    document.getElementById("gameDetails")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function step(delta) {
  if (!games.length) return;
  let next = selectedIndex + delta;
  if (next < 0) next = games.length - 1;
  if (next >= games.length) next = 0;
  selectGame(next, true);
}

function plural(number, one, few, many) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

document.getElementById("prevBtn").addEventListener("click", () => step(-1));
document.getElementById("nextBtn").addEventListener("click", () => step(1));

document.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft") step(-1);
  if (event.key === "ArrowRight") step(1);
});

loadGames();
render();
