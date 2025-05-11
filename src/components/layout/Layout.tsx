
import { ReactNode, useState } from 'react';
import Sidebar from './Sidebar';
import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar with Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild className="md:hidden absolute top-4 left-4 z-10">
          <Button variant="outline" size="icon">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar onNavItemClick={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-card py-4 px-6 border-b border-border flex items-center">
          <div className="w-10 md:hidden"></div> {/* Spacer for mobile menu button */}
          <h1 className="text-xl md:text-2xl font-bold text-foreground text-center md:text-left flex-1">{pageTitle}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

const getPageTitle = (pathname: string): string => {
  switch(pathname) {
    case '/':
      return 'Card Checker';
    case '/stats':
      return 'Statistics';
    case '/settings':
      return 'Settings';
    default:
      return 'Card Checker';
  }
};

export default Layout;
