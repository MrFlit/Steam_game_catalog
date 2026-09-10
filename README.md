# Steam Game Catalog — Supabase + Vercel

Серверная версия каталога: Supabase PostgreSQL + Storage + Auth, Vercel для хостинга.

1. Таблица `games` и bucket `game-images` создаются по нашей инструкции.
2. `supabase/policies.sql` содержит политики RLS/Storage.
3. Для локального запуска: скопируй `.env.local.example` в `.env.local`, затем `npm install` и `npm run dev`.
4. В Vercel добавь Environment Variables:
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
5. В браузер не помещай Secret/service_role key.

Админка: `/admin`. Публичный каталог: `/`.


## Site settings
Выполни `supabase/settings.sql` один раз. Он создаёт `site_settings` для URL расширения.