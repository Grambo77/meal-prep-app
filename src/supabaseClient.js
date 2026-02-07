import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yxfbhtapdtyxkxgfymvo.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZmJodGFwZHR5eGt4Z2Z5bXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0OTA3NDgsImV4cCI6MjA4NjA2Njc0OH0.Ijsv8ZorbAiQe0aWpLleB4k_teaqNwqHj97l8vNPOvo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
