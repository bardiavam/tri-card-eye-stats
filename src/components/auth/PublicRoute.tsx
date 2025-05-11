import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface PublicRouteProps {
  children: ReactNode;
}

/**
 * PublicRoute component restricts access to public routes (like login and register)
 * for users who are already authenticated, redirecting them to the main page.
 */
const PublicRoute = ({ children }: PublicRouteProps) => {
  const { user, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // Redirect to main page if already authenticated
  if (user) {
    return <Navigate to="/" replace />;
  }

  // Render children if not authenticated
  return <>{children}</>;
};

export default PublicRoute;
