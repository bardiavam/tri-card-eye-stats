
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';
import { CardStatus } from '@/types/card';
import { Download, LogIn } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getNextProxy } from '@/utils/proxyUtils';

const Index = () => {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [proxy, setProxy] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<{card: string, status: CardStatus, message?: string, amount?: string, raw_response?: string}[]>([]);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [isDebugDialogOpen, setIsDebugDialogOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !session) {
      toast.error('Please log in to use the card checker');
      navigate('/login');
    }
  }, [session, loading, navigate]);

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const handleProxyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setProxy(event.target.value);
  };

  // Validate proxy format
  const isProxyValid = (proxyString: string): boolean => {
    if (!proxyString.trim()) return true; // Empty proxy is valid (will use default)

    const parts = proxyString.split(':');

    // Check for hostname:port format (ip:port)
    if (parts.length === 2) {
      return parts[0].trim() !== '' &&
             /^\d+$/.test(parts[1]) &&
             parseInt(parts[1]) > 0 &&
             parseInt(parts[1]) <= 65535;
    }

    // Check for hostname:port:username:password format
    if (parts.length === 4) {
      return parts[0].trim() !== '' &&
             /^\d+$/.test(parts[1]) &&
             parseInt(parts[1]) > 0 &&
             parseInt(parts[1]) <= 65535 &&
             parts[2].trim() !== '' &&
             parts[3].trim() !== '';
    }

    return false;
  };

  // This function checks cards using the server-side API
  const checkCards = async () => {
    if (!input.trim()) {
      toast.error('Please enter card details');
      return;
    }

    // Validate proxy format if provided
    if (proxy.trim() && !isProxyValid(proxy)) {
      toast.error('Invalid proxy format. Please use ip:port or hostname:port:username:password');
      return;
    }

    setIsChecking(true);
    const cards = input.trim().split('\n');

    try {
      // Check if user is authenticated
      if (!session || !session.access_token) {
        toast.error('Authentication required. Please log in.');
        setIsChecking(false);
        return;
      }

      const token = session.access_token;

      // Get the next proxy from the settings if enabled
      let proxyToUse = proxy;

      // If no manual proxy is entered, try to get one from the settings
      if (!proxyToUse && user) {
        const nextProxy = getNextProxy(user.id);
        if (nextProxy) {
          proxyToUse = nextProxy;
          // Using proxy from settings
          toast.info(`Using proxy from settings: ${nextProxy.split(':')[0]}`, {
            description: "Proxy rotation is working correctly",
            duration: 5000
          });
          // Set the proxy in the input field so the user can see it's being used
          setProxy(nextProxy);
        }
      }

      // Use our server-side batch API to check all cards at once
      const response = await fetch('/api/check-cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          cards,
          proxy: proxyToUse || undefined
        })
      });

      // Handle token expiration (401 Unauthorized)
      if (response.status === 401) {
        // Try to refresh the session
        const { error: refreshError } = await supabase.auth.refreshSession();

        // If refresh fails, redirect to login
        if (refreshError) {
          toast.error('Your session has expired. Please log in again.');
          navigate('/login');
          return;
        }

        // If refresh succeeds, retry the operation
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession && newSession.access_token) {
          // Retry the operation
          checkCards();
          return;
        } else {
          // Still no valid session after refresh
          toast.error('Authentication required. Please log in.');
          navigate('/login');
          return;
        }
      }

      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429) {
        toast.error('Rate limit exceeded. Please try again later.');
        return;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Unknown error');
      }

      // Update results with the response data
      setResults(data.results.map((result: any) => ({
        card: result.card,
        status: result.result?.toUpperCase() === 'CHARGED' || result.result?.toUpperCase() === 'APPROVED'
          ? 'charged'
          : result.result?.toUpperCase() === '3DS'
            ? '3ds_challenge'
            : 'declined',
        message: result.response || result.error || '',
        amount: result.amount,
        raw_response: JSON.stringify(result)
      })));

      toast.success(`Checked ${cards.length} cards`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check cards');
      console.error('Error checking cards:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusColor = (status: CardStatus): string => {
    switch (status) {
      case 'charged':
        return 'bg-success text-success-foreground';
      case '3ds_challenge':
        return 'bg-warning text-warning-foreground';
      case 'declined':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleDownloadClick = () => {
    if (results.length === 0) {
      toast.error('No cards to download');
      return;
    }
    setIsDownloadDialogOpen(true);
  };

  const downloadCards = (status: CardStatus | 'all') => {
    let cardsToDownload = results;

    if (status !== 'all') {
      cardsToDownload = results.filter(result => result.status === status);
    }

    if (cardsToDownload.length === 0) {
      toast.error(`No ${status === 'all' ? '' : status} cards to download`);
      return;
    }

    // Format cards for the file
    const content = cardsToDownload.map(result => result.card).join('\n');

    // Create a blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${status === 'all' ? 'all' : status}_cards.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Downloaded ${cardsToDownload.length} ${status === 'all' ? '' : status} cards`);
    setIsDownloadDialogOpen(false);
  };

  // Show loading state
  if (loading) {
    return (
      <Layout>
        <div className="container py-6 flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-muted-foreground">Checking authentication...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Show login prompt if not authenticated
  if (!session) {
    return (
      <Layout>
        <div className="container py-6 flex items-center justify-center min-h-[50vh]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Authentication Required</CardTitle>
              <CardDescription>
                You need to be logged in to use the card checker.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <LogIn className="h-16 w-16 text-muted-foreground" />
              <p className="text-center text-muted-foreground">
                Please log in or register to access the card checker functionality.
              </p>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => navigate('/login')} className="w-full">
                Go to Login
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Credit Card Checker</CardTitle>
            <CardDescription>
              Enter your cards in format: xxxxxxxxxxxxxxxx|mm|yy|cvv (one per line)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proxy">Proxy (Optional)</Label>
              <Input
                id="proxy"
                placeholder="ip:port or hostname:port:username:password"
                value={proxy}
                onChange={handleProxyChange}
                disabled={isChecking}
              />
              <p className="text-xs text-muted-foreground">
                Supported formats:<br />
                • <span className="font-semibold">ip:port</span> (Example: 192.168.1.1:8080)<br />
                • <span className="font-semibold">hostname:port:username:password</span> (Example: proxy.example.com:8080:username:password)<br />
                {!proxy && user && (
                  <span className="text-primary">
                    Leave empty to use proxies from your <a href="/settings" className="underline">settings</a>
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cards">Cards</Label>
              <Textarea
                id="cards"
                placeholder="4111111111111111|05|28|123"
                rows={8}
                value={input}
                onChange={handleInputChange}
                className="font-mono"
                disabled={isChecking}
              />
              <p className="text-xs text-muted-foreground">Format: cardnumber|month|year|cvv (one per line)</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={checkCards}
              disabled={isChecking || !input.trim()}
              className="w-full"
            >
              {isChecking ? 'Checking...' : 'Check Cards'}
            </Button>
          </CardFooter>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  {results.length} cards checked
                </CardDescription>
              </div>
              <Button onClick={handleDownloadClick} variant="outline" size="sm" className="flex items-center gap-2 w-full sm:w-auto">
                <Download size={16} /> Download Cards
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {results.map((result, index) => (
                  <div key={index} className="flex flex-col p-3 bg-card border border-border rounded-md">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
                      <div className="font-mono text-sm break-all">{result.card}</div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => {
                            setDebugInfo(result.raw_response || JSON.stringify(result, null, 2));
                            setIsDebugDialogOpen(true);
                          }}
                        >
                          Debug
                        </Button>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                          {result.status === '3ds_challenge' ? '3DS Challenge' :
                            result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                        </div>
                      </div>
                    </div>
                    {result.message && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {result.message}
                      </div>
                    )}
                    {result.amount && (
                      <div className="mt-1 text-xs font-medium">
                        Amount: {result.amount}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Download Cards</DialogTitle>
              <DialogDescription>
                Select which type of cards you want to download
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                onClick={() => downloadCards('all')}
                variant="outline"
                className="flex flex-col p-4 h-auto items-center gap-2 border-border hover:bg-muted"
              >
                <span className="text-lg font-semibold">All Cards</span>
                <span className="text-xs text-muted-foreground">Download all checked cards</span>
              </Button>
              <Button
                onClick={() => downloadCards('charged')}
                variant="outline"
                className="flex flex-col p-4 h-auto items-center gap-2 border-success text-success hover:bg-success/10"
              >
                <span className="text-lg font-semibold">Live Cards</span>
                <span className="text-xs">Download charged cards only</span>
              </Button>
              <Button
                onClick={() => downloadCards('3ds_challenge')}
                variant="outline"
                className="flex flex-col p-4 h-auto items-center gap-2 border-warning text-warning hover:bg-warning/10"
              >
                <span className="text-lg font-semibold">3DS Cards</span>
                <span className="text-xs">Download 3DS challenge cards only</span>
              </Button>
              <Button
                onClick={() => downloadCards('declined')}
                variant="outline"
                className="flex flex-col p-4 h-auto items-center gap-2 border-destructive text-destructive hover:bg-destructive/10"
              >
                <span className="text-lg font-semibold">Dead Cards</span>
                <span className="text-xs">Download declined cards only</span>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDebugDialogOpen} onOpenChange={setIsDebugDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Debug Information</DialogTitle>
              <DialogDescription>
                Technical details about the API response
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto">
              <pre className="p-4 bg-card border border-border rounded-md text-xs font-mono whitespace-pre-wrap">
                {debugInfo || 'No debug information available'}
              </pre>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDebugDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Index;
