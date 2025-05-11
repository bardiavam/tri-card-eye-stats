/**
 * Gets the next proxy from the user's proxy list
 * @returns The next proxy to use, or undefined if proxies are disabled or none are available
 */
export const getNextProxy = (userId: string): string | undefined => {
  // Check if proxies are enabled
  const proxyEnabled = localStorage.getItem(`${userId}_proxyEnabled`);
  if (proxyEnabled !== 'true') {
    return undefined;
  }

  // Get the proxy list
  const proxies = localStorage.getItem(`${userId}_proxies`);
  if (!proxies || proxies.trim() === '') {
    return undefined;
  }

  // Parse the proxy list
  const proxyList = proxies.trim().split('\n').filter(p => p.trim());
  if (proxyList.length === 0) {
    return undefined;
  }

  // Get the current index
  let currentIndex = 0;
  const storedIndex = localStorage.getItem(`${userId}_currentProxyIndex`);
  if (storedIndex) {
    currentIndex = parseInt(storedIndex, 10);
  }

  // Get the next proxy
  const proxy = proxyList[currentIndex];

  // Update the index for next time
  const nextIndex = (currentIndex + 1) % proxyList.length;
  localStorage.setItem(`${userId}_currentProxyIndex`, nextIndex.toString());

  return proxy;
};

/**
 * Gets the proxy timeout setting
 * @returns The proxy timeout in milliseconds, or the default (5000ms)
 */
export const getProxyTimeout = (userId: string): number => {
  const timeout = localStorage.getItem(`${userId}_proxyTimeout`);
  if (timeout) {
    return parseInt(timeout, 10);
  }
  return 5000; // Default timeout
};
