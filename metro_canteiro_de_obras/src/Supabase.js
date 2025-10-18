import { createClient } from '@supabase/supabase-js'

// variáveis fixas do projeto
const SUPABASE_URL = 'https://aedludqrnwntsqgyjjla.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU'

// cria cliente supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default supabase
