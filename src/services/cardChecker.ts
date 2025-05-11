import { CardStatus } from '@/types/card';
import { supabase } from '@/lib/supabase';

interface ApiResponse {
  amount: string;
  card: string;
  response: string;
  result: string;
}

interface CheckCardResponse {
  status: CardStatus;
  message: string;
  amount?: string;
  raw_response?: string;
}

/**
 * Checks a credit card using the server-side API
 * @param cardData Card data in format: number|month|year|cvv
 * @param siteUrl The merchant site URL to check against (default is provided)
 * @param proxy Proxy information in format: ip:port:username:password
 * @returns Promise with the check result
 */
export async function checkCard(
  cardData: string,
  siteUrl: string = 'https://rinsekit.com/products/donations',
  proxy?: string
): Promise<CheckCardResponse> {
  // Start card check process

  try {
    // Validate card format
    if (!validateCardFormat(cardData)) {
      // Card validation failed
      return {
        status: 'declined',
        message: 'Invalid card format',
      };
    }

    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout

    try {
      // Get the authentication token from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      // Make the request to our server-side API
      const response = await fetch('/api/check-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          cardData,
          siteUrl,
          proxy
        }),
        signal: controller.signal,
      });

      // Clear the timeout
      clearTimeout(timeoutId);

      // Handle token expiration (401 Unauthorized)
      if (response.status === 401) {
        // Get the auth context
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        // If we have a session but got a 401, the token is likely expired
        if (currentSession) {
          // Force refresh the session
          const { error: refreshError } = await supabase.auth.refreshSession();

          // If refresh fails, redirect to login
          if (refreshError) {
            window.location.href = '/login';
            return {
              status: 'declined',
              message: 'Your session has expired. Please log in again.',
            };
          }

          // If refresh succeeds, retry the request with the new token
          return checkCard(cardData, siteUrl, proxy);
        }

        // No current session
        window.location.href = '/login';
        return {
          status: 'declined',
          message: 'Authentication required. Please log in.',
        };
      }

      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429) {
        return {
          status: 'declined',
          message: 'Rate limit exceeded. Please try again later.',
        };
      }

      // Check if the request was successful
      if (!response.ok) {
        return {
          status: 'declined',
          message: `API error: ${response.status} ${response.statusText}`,
        };
      }

      // Parse the response
      const responseData: ApiResponse = await response.json();

      // Map the API result to our CardStatus type
      let status: CardStatus;

      switch (responseData.result?.toUpperCase() || '') {
        case 'CHARGED':
        case 'APPROVED':
          status = 'charged';
          break;
        case '3DS':
          status = '3ds_challenge';
          break;
        default:
          status = 'declined';
      }

      return {
        status,
        message: responseData.response || 'No response message',
        amount: responseData.amount,
        raw_response: JSON.stringify(responseData)
      };
    } catch (error) {
      // Clear the timeout
      clearTimeout(timeoutId);

      // Handle timeout errors
      if (error.name === 'AbortError') {
        return {
          status: 'declined',
          message: 'Request timed out. The server took too long to respond.',
        };
      }

      // Handle other errors
      return {
        status: 'declined',
        message: error instanceof Error ? `Error: ${error.message}` : 'Unknown error occurred',
      };
    }
  } catch (error) {
    return {
      status: 'declined',
      message: error instanceof Error ? `Error: ${error.message}` : 'Unknown error occurred',
    };
  }
}

/**
 * Validates the card format
 * @param card Card data in format: number|month|year|cvv
 * @returns boolean indicating if the format is valid
 */
export function validateCardFormat(card: string): boolean {
  // Simple validation for the format xxxxxxxxxxxxxxxx|mm|yy|cvv
  const parts = card.split('|');
  return parts.length === 4 &&
         parts[0].length >= 13 && parts[0].length <= 19 &&
         parts[1].length === 2 &&
         (parts[2].length === 2 || parts[2].length === 4) &&
         parts[3].length >= 3 && parts[3].length <= 4;
}
