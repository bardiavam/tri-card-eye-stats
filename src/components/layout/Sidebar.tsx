
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, BarChart2, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  onNavItemClick?: () => void;
}

const Sidebar = ({ onNavItemClick }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const navItems = [
    { path: '/', label: 'Card Checker', icon: <CreditCard className="mr-2 h-5 w-5" /> },
    { path: '/stats', label: 'Statistics', icon: <BarChart2 className="mr-2 h-5 w-5" /> },
    { path: '/settings', label: 'Settings', icon: <Settings className="mr-2 h-5 w-5" /> }
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    if (onNavItemClick) {
      onNavItemClick();
    }
  };

  return (
    <aside className="w-64 bg-sidebar border-r border-border">
      <div className="p-6">
        <h2 className="text-xl font-bold text-sidebar-foreground">Card Checker</h2>
      </div>
      <nav className="mt-6">
        <ul>
          {navItems.map(item => (
            <li key={item.path} className="mb-2">
              <Link
                to={item.path}
                className={cn(
                  "flex items-center px-6 py-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                  location.pathname === item.path && "bg-sidebar-accent text-sidebar-primary font-medium border-l-4 border-sidebar-primary"
                )}
                onClick={onNavItemClick}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {user && (
        <div className="mt-auto p-4 border-t border-border">
          <div className="mb-2 px-6 py-2">
            <div className="text-sm font-medium text-sidebar-foreground">
              Logged in as:
            </div>
            <div className="text-xs text-muted-foreground">
              {user.user_metadata?.username || 'User'}
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {user.email}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
