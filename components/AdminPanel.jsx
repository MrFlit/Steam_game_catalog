"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

const BUCKET = "game-images";

function Header({ email }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div>
          <div className="brand-title">GAME CATALOG</div>
          <div className="brand-subtitle">{email || "Управление коллекцией"}</div>
        </div>
      </div>

      <div className="top-actions">
        <button className="secondary-btn" onClick={() => supabase.auth.signOut()}>Выйти</button>
        <Link className="admin-link" href="/">← К каталогу</Link>
      </div>
    </header>
  );
}

export default function AdminPanel() {
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);
  const [games, setGames] = useState([]);
  const [editing, setEditing] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [dragged, setDragged] = useState(null);
  const [extensionUrl, setExtensionUrl] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      load();
    }
  }, [session]);

  async function load() {
    setErr("");

    const [{ data, error }, { data: setting }] = await Promise.all([
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

    if (error) {
      setErr(error.message);
      return;
    }

    setGames(data || []);
    setExtensionUrl(setting?.value || "");
  }

  function reset() {
    setEditing(null);
    setFile(null);
    setPreview("");
    document.getElementById("gameForm")?.reset();
    setMsg("");
    setErr("");
  }

  function start(game) {
    setEditing(game);
    setFile(null);
    setPreview(game.image_url);

    document.getElementById("title").value = game.title;
    document.getElementById("steam_url").value = game.steam_url;
    document.getElementById("description").value = game.description;

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function upload(fileToUpload) {
    const safeName = fileToUpload.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const path = `${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, fileToUpload, {
        cacheControl: "31536000",
        upsert: false,
      });

    if (error) throw error;

    return supabase.storage
      .from(BUCKET)
      .getPublicUrl(path).data.publicUrl;
  }

  function oldPath(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = url.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : null;
  }

  async function removeImage(url) {
    const path = oldPath(url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);
  }

  async function save(event) {
    event.preventDefault();

    setErr("");
    setMsg("");

    const form = event.currentTarget;
    const title = form.title.value.trim();
    const steam_url = form.steam_url.value.trim();
    const description = form.description.value.trim();

    if (!title || !steam_url || !description) {
      setErr("Заполни все поля.");
      return;
    }

    try {
      new URL(steam_url);
    } catch {
      setErr("Укажи корректную ссылку Steam.");
      return;
    }

    try {
      let image_url = editing?.image_url || "";
      const oldImageUrl = editing?.image_url || null;

      if (file) {
        image_url = await upload(file);
      }

      if (!image_url) {
        setErr("Выбери изображение.");
        return;
      }

      if (editing) {
        const { error } = await supabase
          .from("games")
          .update({
            title,
            steam_url,
            description,
            image_url,
          })
          .eq("id", editing.id);

        if (error) throw error;

        if (file && oldImageUrl) {
          await removeImage(oldImageUrl);
        }

        setMsg("Игра обновлена.");
      } else {
        const sort_order = games.length
          ? Math.max(...games.map((game) => game.sort_order || 0)) + 1
          : 0;

        const { error } = await supabase
          .from("games")
          .insert({
            title,
            steam_url,
            description,
            image_url,
            sort_order,
            source: "manual",
          });

        if (error) throw error;

        setMsg("Игра добавлена.");
      }

      setEditing(null);
      setFile(null);
      setPreview("");
      form.reset();
      await load();
    } catch (error) {
      setErr(error?.message || "Ошибка сохранения.");
    }
  }

  async function del(game) {
    if (!confirm(`Удалить «${game.title}»?`)) return;

    setErr("");
    setMsg("");

    const { error } = await supabase
      .from("games")
      .delete()
      .eq("id", game.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await removeImage(game.image_url);
    await load();
    setMsg("Игра удалена.");
  }

  async function drop(targetId) {
    if (!dragged || dragged === targetId) return;

    const from = games.findIndex((game) => game.id === dragged);
    const to = games.findIndex((game) => game.id === targetId);
    if (from < 0 || to < 0) return;

    const reordered = [...games];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    setGames(reordered);
    setDragged(null);

    const results = await Promise.all(
      reordered.map((game, index) =>
        supabase
          .from("games")
          .update({ sort_order: index })
          .eq("id", game.id)
      )
    );

    const failed = results.find((result) => result.error);

    if (failed) {
      setErr(failed.error.message);
      await load();
    } else {
      setMsg("Порядок игр сохранён.");
    }
  }

  async function saveExtensionUrl(event) {
    event.preventDefault();
    setErr("");
    setMsg("");

    const value = event.currentTarget.extension_url.value.trim();

    if (value) {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error();
        }
      } catch {
        setErr("Укажи корректную ссылку http:// или https://.");
        return;
      }
    }

    const { error } = await supabase
      .from("site_settings")
      .upsert({
        key: "extension_download_url",
        value,
      });

    if (error) {
      setErr(error.message);
      return;
    }

    setExtensionUrl(value);
    setMsg("Ссылка на расширение сохранена.");
  }

  if (!checked) {
    return <div className="empty"><p>Проверяем авторизацию…</p></div>;
  }

  if (!session) {
    return (
      <>
        <Header />
        <main className="admin-container">
          <section className="hero">
            <p className="eyebrow">ADMIN</p>
            <h1>Вход</h1>
            <p className="hero-text">Раздел управления доступен только владельцу каталога.</p>
          </section>
          <Login />
        </main>
      </>
    );
  }

  return (
    <>
      <Header email={session.user.email} />

      <main className="admin-container">
        <section className="hero">
          <p className="eyebrow">ADMIN</p>
          <h1>Управление каталогом</h1>
          <p className="hero-text">
            Добавляй игры, редактируй карточки и перетаскивай их для изменения порядка.
          </p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SETTINGS</p>
              <h2>Ссылка на расширение</h2>
            </div>
          </div>

          <form className="settings-form" onSubmit={saveExtensionUrl}>
            <label>
              URL актуальной версии расширения
              <input
                name="extension_url"
                type="url"
                defaultValue={extensionUrl}
                placeholder="https://github.com/..."
              />
              <span className="hint">
                Эта ссылка будет показана на главной странице в кнопке «Скачать расширение».
              </span>
            </label>

            <div className="form-actions">
              <button className="primary-btn" type="submit">Сохранить ссылку</button>
            </div>
          </form>
        </section>

        <section className="panel">
          <form id="gameForm" onSubmit={save}>
            <div className="form-grid">
              <label>
                Название игры
                <input id="title" name="title" required />
              </label>

              <label>
                Ссылка на Steam
                <input id="steam_url" name="steam_url" type="url" required />
              </label>

              <label className="full">
                Описание
                <textarea id="description" name="description" required />
              </label>

              <label className="full upload-box">
                Изображение
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] || null;
                    setFile(selected);
                    if (selected) {
                      setPreview(URL.createObjectURL(selected));
                    }
                  }}
                />
                <span className="hint">PNG, JPG, WEBP.</span>
                {preview && <img className="preview" src={preview} alt="Предпросмотр" />}
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-btn" type="submit">
                {editing ? "Сохранить изменения" : "Добавить игру"}
              </button>

              {editing && (
                <button type="button" className="secondary-btn" onClick={reset}>
                  Отмена
                </button>
              )}
            </div>

            {msg && <p className="message success-text">{msg}</p>}
            {err && <p className="message error-text">{err}</p>}
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">COLLECTION</p>
              <h2>Мои игры</h2>
            </div>
            <span className="admin-number">{games.length}</span>
          </div>

          <p className="list-hint">☷ Перетаскивай игры мышью, чтобы менять порядок.</p>

          <div className="admin-list">
            {games.map((game, index) => (
              <div
                key={game.id}
                className={`admin-item ${dragged === game.id ? "dragging" : ""}`}
                draggable
                onDragStart={() => setDragged(game.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => drop(game.id)}
              >
                <div className="drag-handle" title="Перетащить">⠿</div>

                <img className="admin-thumb" src={game.image_url} alt={game.title} />

                <div className="admin-info">
                  <div className="admin-number">{index + 1}</div>
                  <h3>{game.title}</h3>
                  <p>{game.description}</p>
                </div>

                <div className="item-actions">
                  <button className="secondary-btn" onClick={() => start(game)}>
                    Изменить
                  </button>
                  <button className="danger-btn" onClick={() => del(game)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <section className="panel login">
      <form onSubmit={submit}>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="primary-btn" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>
        </div>

        {error && <p className="message error-text">{error}</p>}
      </form>
    </section>
  );
}
