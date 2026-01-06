
import supabase from './supabaseClient.js';

// Sign Up (standard email/pass)
export const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    return { data, error };
};

// Sign In
export const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    return { data, error };
};

// Sign Out
export const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
};

// Get User
export const getUser = async () => {
    return await supabase.auth.getUser();
};

// Listen for Auth Changes
export const onAuthStateChange = (callback) => {
    supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
};

// Reset Password
export const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href, // Redirect back to app
    });
    return { data, error };
};
