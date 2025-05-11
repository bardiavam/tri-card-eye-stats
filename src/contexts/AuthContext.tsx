import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, username: string, password: string) => Promise<{ error: any, user: User | null }>;
  signOut: () => Promise<void>;
  handleTokenExpiration: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for active session on mount
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return { error };
      }

      toast.success('Signed in successfully');
      return { error: null };
    } catch (error) {
      toast.error('An unexpected error occurred');
      return { error };
    }
  };

  // Function to handle token expiration
  const handleTokenExpiration = () => {
    // Clear the user and session
    setUser(null);
    setSession(null);

    // Show a toast message
    toast.error('Your session has expired. Please log in again.');

    // Redirect to login page
    window.location.href = '/login';
  };

  const signUp = async (email: string, username: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) {
        toast.error(error.message);
        return { error, user: null };
      }

      toast.success('Registered successfully');
      return { error: null, user: data.user };
    } catch (error) {
      toast.error('An unexpected error occurred');
      return { error, user: null };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out successfully');
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    handleTokenExpiration,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
