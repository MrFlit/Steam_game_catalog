"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

const DEFAULT_EXTENSION_URL = "#";

function Header({ extensionUrl }) {
  return (
    <header className="topbar site-header">
      <div className="brand">
        <div className="brand-mark">S</div>

        <div className="brand-copy">
          <div className="brand-title">GAME CATALOG</div>
          <div className="brand-subtitle">Моя коллекция игр</div>
        </div>
      </div>

      <div className="top-actions">
        {extensionUrl && extensionUrl !== DEFAULT_EXTENSION_URL && (
          <a
            className="extension-link"
            href={extensionUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span>🧩</span> Расширение
          </a>
        )}

        <Link className="admin-link" href="/admin">
          <span className="header-action-icon">⚙</span>
          <span>Управление</span>
        </Link>
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

  const carouselRef = useRef(null);
  const settleTimerRef = useRef(null);

  async function load() {
    setLoading(true);

    const [
      { data: gamesData, error: gamesError },
      { data: settingData },
    ] = await Promise.all([
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

      setSelected((current) =>
        Math.min(
          current,
          Math.max(nextGames.length - 1, 0)
        )
      );
    }

    setExtensionUrl(settingData?.value || "");
    setLoading(false);
  }

  useEffect(() => {
    load();

    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const getNearestCardIndex = useCallback(() => {
    const carousel = carouselRef.current;

    if (!carousel) {
      return 0;
    }

    const cards = Array.from(
      carousel.querySelectorAll("[data-game-index]")
    );

    if (!cards.length) {
      return 0;
    }

    const carouselRect =
      carousel.getBoundingClientRect();

    const center =
      carouselRect.left +
      carouselRect.width / 2;

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    cards.forEach((card) => {
      const rect =
        card.getBoundingClientRect();

      const cardCenter =
        rect.left + rect.width / 2;

      const distance = Math.abs(
        cardCenter - center
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = Number(
          card.dataset.gameIndex
        );
      }
    });

    return nearestIndex;
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;

    if (!carousel) {
      return;
    }

    const handleScroll = () => {
      if (settleTimerRef.current) {
        clearTimeout(
          settleTimerRef.current
        );
      }

      settleTimerRef.current = setTimeout(
        () => {
          setSelected(
            getNearestCardIndex()
          );
        },
        110
      );
    };

    carousel.addEventListener(
      "scroll",
      handleScroll,
      { passive: true }
    );

    return () => {
      carousel.removeEventListener(
        "scroll",
        handleScroll
      );

      if (settleTimerRef.current) {
        clearTimeout(
          settleTimerRef.current
        );
      }
    };
  }, [games, getNearestCardIndex]);

  const scrollToGame = useCallback(
    (
      index,
      behavior = "smooth"
    ) => {
      if (!games.length) {
        return;
      }

      const nextIndex =
        (index + games.length) %
        games.length;

      const carousel =
        carouselRef.current;

      if (!carousel) {
        return;
      }

      const card =
        carousel.querySelector(
          `[data-game-index="${nextIndex}"]`
        );

      if (!card) {
        return;
      }

      const left =
        card.offsetLeft -
        (carousel.clientWidth -
          card.offsetWidth) /
          2;

      setSelected(nextIndex);

      carousel.scrollTo({
        left: Math.max(
          0,
          left
        ),
        behavior,
      });
    },
    [games.length]
  );

  const move = useCallback(
    (delta) => {
      if (!games.length) {
        return;
      }

      scrollToGame(
        selected + delta
      );
    },
    [
      games.length,
      scrollToGame,
      selected,
    ]
  );

  useEffect(() => {
    function handleKeyDown(event) {
      if (!games.length) {
        return;
      }

      if (
        event.key ===
        "ArrowLeft"
      ) {
        event.preventDefault();
        move(-1);
      }

      if (
        event.key ===
        "ArrowRight"
      ) {
        event.preventDefault();
        move(1);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [
    games.length,
    move,
  ]);

  const game = games[selected];

  return (
    <>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-overlay" />

      <Header
        extensionUrl={
          extensionUrl
        }
      />

      <main className="container">
        <section className="hero">
          <p className="eyebrow">
            STEAM COLLECTION
          </p>

          <h1>
            Игры, которые стоит
            попробовать
          </h1>

          <p className="hero-text">
            Выбирай игру в центре
            экрана и переходи прямо
            на её страницу в Steam.
          </p>

          <div className="hero-line" />
        </section>

        <section className="carousel-section">
          <button
            className="nav-arrow"
            onClick={() =>
              move(-1)
            }
            aria-label="Предыдущая игра"
            type="button"
          >
            ‹
          </button>

          <div className="carousel-shell">
            <div
              className="carousel"
              ref={carouselRef}
            >
              <div
                className="carousel-edge"
                aria-hidden="true"
              />

              {games.map(
                (
                  item,
                  index
                ) => (
                  <article
                    key={
                      item.id
                    }
                    data-game-index={
                      index
                    }
                    className={`game-card ${
                      index ===
                      selected
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      scrollToGame(
                        index
                      )
                    }
                  >
                    <div className="card-image-wrap">
                      <img
                        className="card-image"
                        src={
                          item.image_url
                        }
                        alt={
                          item.title
                        }
                      />

                      <div className="card-shine" />
                    </div>

                    <div className="card-title">
                      {
                        item.title
                      }
                    </div>
                  </article>
                )
              )}

              <div
                className="carousel-edge"
                aria-hidden="true"
              />
            </div>

            {games.length >
              1 && (
              <nav
                className="carousel-dots"
                aria-label="Навигация по играм"
              >
                {games.map(
                  (
                    item,
                    index
                  ) => (
                    <button
                      key={
                        item.id
                      }
                      type="button"
                      className={`carousel-dot ${
                        index ===
                        selected
                          ? "active"
                          : ""
                      }`}
                      aria-label={`Открыть ${item.title}`}
                      aria-current={
                        index ===
                        selected
                          ? "true"
                          : undefined
                      }
                      title={
                        item.title
                      }
                      onClick={() =>
                        scrollToGame(
                          index
                        )
                      }
                    >
                      <span />
                    </button>
                  )
                )}
              </nav>
            )}
          </div>

          <button
            className="nav-arrow"
            onClick={() =>
              move(1)
            }
            aria-label="Следующая игра"
            type="button"
          >
            ›
          </button>
        </section>

        {loading ? (
          <section className="details">
            <div className="empty">
              <p>
                Загружаем игры…
              </p>
            </div>
          </section>
        ) : error ? (
          <section className="details">
            <div className="empty">
              <h2>
                Не удалось
                загрузить игры
              </h2>
              <p>{error}</p>
            </div>
          </section>
        ) : !game ? (
          <section className="details">
            <div className="empty">
              <div className="empty-icon">
                🎮
              </div>

              <h2>
                Пока нет игр
              </h2>

              <p>
                Открой
                «Управление»
                и добавь
                первую игру.
              </p>
            </div>
          </section>
        ) : (
          <section
            className="details detail-reveal"
            key={game.id}
          >
            <div className="detail-wrap">
              <div className="detail-image-wrap">
                <img
                  className="detail-image"
                  src={
                    game.image_url
                  }
                  alt={
                    game.title
                  }
                />

                <div className="detail-image-glow" />
              </div>

              <div className="detail-content">
                <p className="eyebrow">
                  ИЗБРАННАЯ ИГРА
                </p>

                <h2>
                  {game.title}
                </h2>

                <div className="description">
                  {
                    game.description
                  }
                </div>

                <a
                  className="primary-btn"
                  href={
                    game.steam_url
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Перейти в Steam ↗
                </a>

                {game.source ===
                  "steam" && (
                  <div className="source-badge">
                    Импортировано
                    из Steam
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {extensionUrl && (
          <section className="extension-banner">
            <div className="extension-banner-icon">
              🧩
            </div>

            <div>
              <p className="eyebrow">
                STEAM EXTENSION
              </p>

              <h3>
                Добавляй игры в каталог
                прямо со страницы Steam
              </h3>

              <p>
                Открой игру в Steam,
                нажми «Добавить в
                каталог» — и она
                появится здесь
                автоматически.
              </p>
            </div>

            <a
              className="secondary-btn extension-banner-btn"
              href={
                extensionUrl
              }
              target="_blank"
              rel="noreferrer"
            >
              Скачать расширение ↗
            </a>
          </section>
        )}

        <div className="footer">
          <span>
            Copyright © 2026-2035
            Flit Gaming Ltd. All
            rights reserved.
          </span>

          <span>
            {games.length
              ? `${games.length} игр`
              : ""}
          </span>
        </div>
      </main>
    </>
  );
}
