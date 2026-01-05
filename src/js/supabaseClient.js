import config from './config.js';
// Re-fixed: Use global variable for stability
const { createClient } = supabase;

const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

export default client;
