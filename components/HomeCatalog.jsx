"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

const DEFAULT_EXTENSION_URL = "#";

function Header({ extensionUrl }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div>
          <div className="brand-title">GAME CATALOG</div>
          <div className="brand-subtitle">Моя коллекция игр</div>
        </div>
      </div>

      <div className="top-actions">
        {extensionUrl && extensionUrl !== DEFAULT_EXTENSION_URL && (
          <a className="extension-link" href={extensionUrl} target="_blank" rel="noreferrer">
            <span>🧩</span> Расширение
          </a>
        )}
        <Link className="admin-link" href="/admin">⚙ Управление</Link>
      </div>
    </header>
  );
}

export default function HomeCatalog() {
  const [games, setGames] = useState([]);
  const [selected, setSelected] = useState(0);
  const [extensionUrl, setExtensionUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);

    const [{ data: gamesData, error: gamesError }, { data: settingData }] =
      await Promise.all([
        supabase
          .from("games")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "extension_download_url")
          .maybeSingle(),
      ]);

    if (gamesError) {
      setError(gamesError.message);
    } else {
      const nextGames = gamesData || [];
      setGames(nextGames);
      setSelected((index) => Math.min(index, Math.max(nextGames.length - 1, 0)));
    }

    setExtensionUrl(settingData?.value || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (!games.length) return;
      if (e.key === "ArrowLeft") setSelected((i) => (i - 1 + games.length) % games.length);
      if (e.key === "ArrowRight") setSelected((i) => (i + 1) % games.length);
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [games.length]);

  function move(delta) {
    if (!games.length) return;
    setSelected((i) => (i + delta + games.length) % games.length);
  }

  const game = games[selected];

  return (
    <>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-overlay" />

      <Header extensionUrl={extensionUrl} />

      <main className="container">
        <section className="hero">
          <p className="eyebrow">STEAM COLLECTION</p>
          <h1>Игры, которые стоит попробовать</h1>
          <p className="hero-text">
            Выбирай игру в центре экрана и переходи прямо на её страницу в Steam.
          </p>
          <div className="hero-line" />
        </section>

        <section className="carousel-section">
          <button className="nav-arrow" onClick={() => move(-1)} aria-label="Предыдущая">‹</button>

          <div className="carousel">
            {games.map((item, index) => (
              <article
                key={item.id}
                className={`game-card ${index === selected ? "active" : ""}`}
                onClick={() => setSelected(index)}
              >
                <div className="card-image-wrap">
                  <img className="card-image" src={item.image_url} alt={item.title} />
                  <div className="card-shine" />
                </div>
                <div className="card-title">{item.title}</div>
              </article>
            ))}
          </div>

          <button className="nav-arrow" onClick={() => move(1)} aria-label="Следующая">›</button>
        </section>

        {loading ? (
          <section className="details">
            <div className="empty"><p>Загружаем игры…</p></div>
          </section>
        ) : error ? (
          <section className="details">
            <div className="empty">
              <h2>Не удалось загрузить игры</h2>
              <p>{error}</p>
            </div>
          </section>
        ) : !game ? (
          <section className="details">
            <div className="empty">
              <div className="empty-icon">🎮</div>
              <h2>Пока нет игр</h2>
              <p>Открой «Управление» и добавь первую игру.</p>
            </div>
          </section>
        ) : (
          <section className="details">
            <div className="detail-wrap">
              <div className="detail-image-wrap">
                <img className="detail-image" src={game.image_url} alt={game.title} />
                <div className="detail-image-glow" />
              </div>

              <div className="detail-content">
                <p className="eyebrow">ИЗБРАННАЯ ИГРА</p>
                <h2>{game.title}</h2>
                <div className="description">{game.description}</div>

                <a className="primary-btn" href={game.steam_url} target="_blank" rel="noreferrer">
                  Перейти в Steam ↗
                </a>

                {game.source === "steam" && (
                  <div className="source-badge">Импортировано из Steam</div>
                )}
              </div>
            </div>
          </section>
        )}

        {extensionUrl && (
          <section className="extension-banner">
            <div className="extension-banner-icon">🧩</div>
            <div>
              <p className="eyebrow">STEAM EXTENSION</p>
              <h3>Добавляй игры в каталог прямо со страницы Steam</h3>
              <p>Открой игру в Steam, нажми «Добавить в каталог» — и она появится здесь автоматически.</p>
            </div>
            <a className="secondary-btn extension-banner-btn" href={extensionUrl} target="_blank" rel="noreferrer">
              Скачать расширение ↗
            </a>
          </section>
        )}

        <div className="footer">
          <span>Каталог работает через Supabase</span>
          <span>{games.length ? `${games.length} игр` : ""}</span>
        </div>
      </main>
    </>
  );
}
