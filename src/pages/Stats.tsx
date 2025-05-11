
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { UserStats, GlobalStats } from '@/types/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface StatsResponse {
  topUsers: UserStats[];
  userCards: {status: string, count: number}[];
  totalUserCards: number;
  globalStats: GlobalStats & {
    totalCards: number;
    totalUsers: number;
    successRate: string;
  };
  error?: string; // Optional error message when using fallback data
}

const Stats = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [topUsers, setTopUsers] = useState<UserStats[]>([]);
  const [userCards, setUserCards] = useState<{status: string, count: number}[]>([]);
  const [totalUserCards, setTotalUserCards] = useState<number>(0);
  const [globalStats, setGlobalStats] = useState<GlobalStats & {
    totalCards?: number;
    totalUsers?: number;
    successRate?: string;
  }>({ liveCards: 0, deadCards: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // State for download dialogs
  const [showLiveCardsDialog, setShowLiveCardsDialog] = useState<boolean>(false);
  const [show3dsCardsDialog, setShow3dsCardsDialog] = useState<boolean>(false);
  const [liveCards, setLiveCards] = useState<string[]>([]);
  const [threeDsCards, setThreeDsCards] = useState<string[]>([]);

  // State for cleanup timer
  const [cleanupStatus, setCleanupStatus] = useState<{
    remainingTime: string;
    percentComplete: number;
    nextRun: string;
  } | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState<boolean>(false);

  // Function to fetch live cards
  const fetchLiveCards = async () => {
    if (!session?.access_token) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/user-cards/live', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        // Handle token expiration
        const { error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          toast.error('Your session has expired. Please log in again.');
          navigate('/login');
          return;
        }

        // If refresh succeeds, retry the operation
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession && newSession.access_token) {
          fetchLiveCards();
          return;
        } else {
          toast.error('Authentication required. Please log in.');
          navigate('/login');
          return;
        }
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setLiveCards(data.cards || []);
      setShowLiveCardsDialog(true);
    } catch (error) {
      console.error('Error fetching live cards:', error);
      toast.error('Failed to fetch live cards');
    }
  };

  // Function to fetch 3DS cards
  const fetch3dsCards = async () => {
    if (!session?.access_token) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/user-cards/3ds', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        // Handle token expiration
        const { error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          toast.error('Your session has expired. Please log in again.');
          navigate('/login');
          return;
        }

        // If refresh succeeds, retry the operation
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession && newSession.access_token) {
          fetch3dsCards();
          return;
        } else {
          toast.error('Authentication required. Please log in.');
          navigate('/login');
          return;
        }
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setThreeDsCards(data.cards || []);
      setShow3dsCardsDialog(true);
    } catch (error) {
      console.error('Error fetching 3DS cards:', error);
      toast.error('Failed to fetch 3DS cards');
    }
  };

  // Function to download cards as a text file
  const downloadCards = (cards: string[], filename: string) => {
    const content = cards.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const fetchStats = async () => {
    if (!session?.access_token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setWarning(null);

      const response = await fetch('http://localhost:3000/api/stats', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
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
          fetchStats();
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
        setError('Rate limit exceeded. Please try again later.');
        toast.error('Rate limit exceeded. Please try again later.');
        return;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data: StatsResponse & { error?: string } = await response.json();

      // Check if there's an error message but we still have data (fallback to mock data)
      if (data.error) {
        console.warn('Stats API warning:', data.error);
        setWarning('Using mock data due to database error');
        toast.warning('Using mock data due to database error');
      }

      setTopUsers(data.topUsers);
      setUserCards(data.userCards);
      setTotalUserCards(data.totalUserCards);
      setGlobalStats(data.globalStats);

    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch 3DS cleanup status
  const fetchCleanupStatus = async () => {
    if (!session?.access_token) {
      return;
    }

    setCleanupLoading(true);

    try {
      const response = await fetch('http://localhost:3000/api/cleanup-status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        // Handle token expiration
        const { error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          console.error('Session refresh failed:', refreshError);
          return;
        }

        // If refresh succeeds, retry the operation
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession && newSession.access_token) {
          fetchCleanupStatus();
          return;
        }
      }

      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      console.log('Cleanup status data:', data);

      // Ensure we have valid data
      if (data.status && typeof data.status.remainingTime === 'string' &&
          typeof data.status.percentComplete === 'number' &&
          typeof data.status.nextRun === 'string') {

        // Parse the ISO date string to ensure it's valid
        let nextRunDate: Date;
        try {
          nextRunDate = new Date(data.status.nextRun);
          // Check if the date is valid
          if (isNaN(nextRunDate.getTime())) {
            throw new Error('Invalid date');
          }
        } catch (e) {
          console.error('Invalid nextRun date:', data.status.nextRun);
          // Fallback to current time + 3 hours
          nextRunDate = new Date();
          nextRunDate.setHours(nextRunDate.getHours() + 3);
        }

        setCleanupStatus({
          remainingTime: data.status.remainingTime,
          percentComplete: data.status.percentComplete,
          nextRun: nextRunDate.toISOString()
        });
      } else {
        console.error('Invalid cleanup status data:', data);
      }
    } catch (error) {
      console.error('Error fetching cleanup status:', error);
    } finally {
      setCleanupLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchCleanupStatus();

    // Set up interval to update cleanup status every minute
    const intervalId = setInterval(fetchCleanupStatus, 60000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [session]);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold">Statistics Dashboard</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="bg-destructive/10 text-destructive p-4 rounded-md">
              <p className="font-medium">Error loading statistics</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {warning ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="bg-warning/10 text-warning p-4 rounded-md">
              <p className="font-medium">Warning</p>
              <p className="text-sm mt-1">{warning}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Users</CardTitle>
            <CardDescription>Users with the most live cards</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <Skeleton className="ml-3 h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {topUsers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No data available</p>
                ) : (
                  topUsers.map((user, index) => (
                    <div key={user.id} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground font-bold">
                          {index + 1}
                        </div>
                        <span className="ml-3 font-medium">{user.username}</span>
                      </div>
                      <div className="bg-success/20 text-success px-2 py-1 rounded-md text-sm">
                        {user.liveCardsCount} live cards
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Your Cards</CardTitle>
              <CardDescription>Status of your checked cards</CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={fetchLiveCards}
                title="Download Live Cards"
              >
                <Download className="h-4 w-4 text-success" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={fetch3dsCards}
                title="Download 3DS Cards"
              >
                <Download className="h-4 w-4 text-warning" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {userCards.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No cards checked yet</p>
                ) : (
                  <>
                    {userCards.map((card) => (
                      <div key={card.status} className="flex items-center justify-between">
                        <div className="capitalize">
                          {card.status === '3ds_challenge' ? '3DS Challenge' : card.status}
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                          card.status === 'charged' ? 'bg-success/20 text-success' :
                          card.status === '3ds_challenge' ? 'bg-warning/20 text-warning' :
                          'bg-destructive/20 text-destructive'
                        }`}>
                          {card.count}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-border">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Total</span>
                        <span className="font-medium">{totalUserCards}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3DS Cleanup Timer Card */}
        {cleanupStatus && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>3DS Cards Cleanup Timer</CardTitle>
              <CardDescription>
                3DS card data is automatically cleaned up every 3 hours to optimize storage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="w-full bg-secondary rounded-full h-2.5">
                  <div
                    className="bg-warning h-2.5 rounded-full"
                    style={{ width: `${cleanupStatus.percentComplete}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium">Next cleanup:</span> {cleanupStatus.remainingTime || 'Calculating...'}
                  </div>
                  <div>
                    <span className="font-medium">Scheduled at:</span> {
                      (() => {
                        try {
                          const date = new Date(cleanupStatus.nextRun);
                          return isNaN(date.getTime())
                            ? 'Calculating...'
                            : date.toLocaleString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                                month: 'short',
                                day: 'numeric'
                              });
                        } catch (e) {
                          return 'Calculating...';
                        }
                      })()
                    }
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  When cleanup runs, 3DS card data will be consolidated while preserving the total count.
                  Download your 3DS cards before the cleanup if you need the detailed data.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Global Statistics</CardTitle>
            <CardDescription>Cards checked by all users</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                <div className="rounded-lg bg-card border border-success/20 p-6">
                  <div className="text-sm text-muted-foreground">Live Cards</div>
                  <div className="mt-2 text-3xl font-bold text-success">{globalStats.liveCards}</div>
                </div>

                <div className="rounded-lg bg-card border border-destructive/20 p-6">
                  <div className="text-sm text-muted-foreground">Dead Cards</div>
                  <div className="mt-2 text-3xl font-bold text-destructive">{globalStats.deadCards}</div>
                </div>

                <div className="rounded-lg bg-card border border-warning/20 p-6">
                  <div className="text-sm text-muted-foreground">3DS Cards</div>
                  <div className="mt-2 text-3xl font-bold text-warning">{globalStats.threeDsCards || 0}</div>
                </div>

                <div className="rounded-lg bg-card border border-border p-6">
                  <div className="text-sm text-muted-foreground">Total Cards</div>
                  <div className="mt-2 text-3xl font-bold">{globalStats.totalCards || 0}</div>
                </div>

                <div className="rounded-lg bg-card border border-primary/20 p-6">
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                  <div className="mt-2 text-3xl font-bold text-primary">{globalStats.successRate || '0%'}</div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Total Users: {globalStats.totalUsers || 0}</span>
            </div>
          </CardFooter>
        </Card>
      </div>
      {/* Live Cards Dialog */}
      <Dialog open={showLiveCardsDialog} onOpenChange={setShowLiveCardsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Live Cards</DialogTitle>
            <DialogDescription>
              {liveCards.length} live cards found. You can download them as a text file.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto font-mono text-sm border rounded-md p-4">
            {liveCards.length > 0 ? (
              liveCards.map((card, index) => (
                <div key={index} className="text-success">{card}</div>
              ))
            ) : (
              <div className="text-muted-foreground">No live cards found.</div>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowLiveCardsDialog(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => downloadCards(liveCards, 'live-cards.txt')}
              disabled={liveCards.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3DS Cards Dialog */}
      <Dialog open={show3dsCardsDialog} onOpenChange={setShow3dsCardsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>3DS Cards</DialogTitle>
            <DialogDescription>
              {threeDsCards.length} 3DS cards found. You can download them as a text file.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto font-mono text-sm border rounded-md p-4">
            {threeDsCards.length > 0 ? (
              threeDsCards.map((card, index) => (
                <div key={index} className="text-warning">{card}</div>
              ))
            ) : (
              <div className="text-muted-foreground">No 3DS cards found.</div>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShow3dsCardsDialog(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => downloadCards(threeDsCards, '3ds-cards.txt')}
              disabled={threeDsCards.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Stats;
