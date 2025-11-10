// import { createClient } from "@supabase/supabase-js";

// export const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
// export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";

// export const NODE_RENDER_URL = "https://metro-canteiro-de-obras.onrender.com/compress";
// export const ANALYZE_URL = "https://aedludqrnwntsqgyjjla.functions.supabase.co/-rapid-analyze";

// export const BUCKET = "canteiro de obras";

// export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
//////////////////////////////////////////////////////////////////////////////////////
// Config do Supabase e URL do backend (AJUSTE os valores abaixo)
import { createClient } from "@supabase/supabase-js";

// Seu projeto Supabase (use a URL/anon key do seu front)
export const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Nome do bucket onde você já está salvando
export const BUCKET = "canteiro de obras";

// URL do backend Deno (o que te passei). Ex.: uma Function do Supabase, Fly.io, Vercel, etc.
export const ANALYZE_URL = "https://aedludqrnwntsqgyjjla.functions.supabase.co/-rapid-analyze"; // <-- ajuste para a rota do seu backend
