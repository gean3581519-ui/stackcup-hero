疊杯英雄榜成績系統｜正式版

正式版用途：
- 多位教練可同時登入。
- 成績存在 Supabase 雲端資料庫。
- 同一筆「成績年份 + 月份 + 組別 + 項目 + 選手編號」會自動覆蓋。
- 可匯出符合原 Excel 格式的 CSV。

上線設定：
1. 建立 Supabase 專案。
2. 到 Supabase SQL Editor 執行 supabase_schema.sql。
3. 到 Supabase Authentication 建立教練帳號。
4. 到 Supabase Project Settings > API 複製：
   - Project URL
   - anon public key
5. 打開 config.js，填入：
   window.HERO_CONFIG = {
     supabaseUrl: "你的 Project URL",
     supabaseAnonKey: "你的 anon public key"
   };
6. 將本資料夾部署到 Netlify、Vercel、GitHub Pages 或學校伺服器。

目前名單：
- students.js 已依總名單.xlsx 產生。
- 若總名單變更，需要重新產生 students.js。

注意：
- 不要把 service_role key 放到網頁，正式網頁只能放 anon public key。
- Row Level Security 已在 supabase_schema.sql 啟用。
