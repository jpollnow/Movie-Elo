import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ltfxlrhapxqmgplzuzpn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0ZnhscmhhcHhxbWdwbHp1enBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTUzODgsImV4cCI6MjA2MzY5MTM4OH0.3XGvsSxm0qwIfV9njaVHfhSuv1m_n93rCnhJiOf0Gx4';

export const supabase = createClient(supabaseUrl, supabaseKey);