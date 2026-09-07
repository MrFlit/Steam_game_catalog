"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {supabase} from "../lib/supabase";

export default function HomeCatalog(){
 const [games,setGames]=useState([]),[selected,setSelected]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{load()},[]);
 async function load(){const {data,error}=await supabase.from("games").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:true});if(error)setError(error.message);else{setGames(data||[]);setSelected(0)}setLoading(false)}
 useEffect(()=>{const f=e=>{if(!games.length)return;if(e.key==="ArrowLeft")setSelected(i=>(i-1+games.length)%games.length);if(e.key==="ArrowRight")setSelected(i=>(i+1)%games.length)};addEventListener("keydown",f);return()=>removeEventListener("keydown",f)},[games.length]);
 function move(d){if(!games.length)return;setSelected(i=>(i+d+games.length)%games.length)}
 const g=games[selected];
 return <><header className="topbar"><div className="brand"><div className="brand-mark">S</div><div><div className="brand-title">GAME CATALOG</div><div className="brand-subtitle">Моя коллекция игр</div></div></div><Link className="admin-link" href="/admin">⚙ Управление</Link></header>
 <main className="container"><section className="hero"><p className="eyebrow">STEAM COLLECTION</p><h1>Игры, которые стоит попробовать</h1><p className="hero-text">Выбирай игру в центре экрана и переходи прямо на её страницу в Steam.</p></section>
 <section className="carousel-section"><button className="nav-arrow" onClick={()=>move(-1)}>‹</button><div className="carousel">{games.map((x,i)=><article key={x.id} className={`game-card ${i===selected?"active":""}`} onClick={()=>setSelected(i)}><img className="card-image" src={x.image_url} alt={x.title}/><div className="card-title">{x.title}</div></article>)}</div><button className="nav-arrow" onClick={()=>move(1)}>›</button></section>
 {loading?<section className="details"><div className="empty"><p>Загружаем игры…</p></div></section>:error?<section className="details"><div className="empty"><h2>Не удалось загрузить игры</h2><p>{error}</p></div></section>:!g?<section className="details"><div className="empty"><h2>Пока нет игр</h2><p>Открой «Управление» и добавь первую игру.</p></div></section>:<section className="details"><div className="detail-wrap"><img className="detail-image" src={g.image_url} alt={g.title}/><div className="detail-content"><p className="eyebrow">ИЗБРАННАЯ ИГРА</p><h2>{g.title}</h2><div className="description">{g.description}</div><a className="primary-btn" href={g.steam_url} target="_blank" rel="noreferrer">Перейти в Steam ↗</a></div></div></section>}
 <div className="footer"><span>Каталог работает через Supabase</span><span>{games.length?`${games.length} игр`:""}</span></div></main></>
}