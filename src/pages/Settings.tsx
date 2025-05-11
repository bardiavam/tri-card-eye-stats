
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getNextProxy } from '@/utils/proxyUtils';

const Settings = () => {
  const { user } = useAuth();
  const [proxies, setProxies] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyTimeout, setProxyTimeout] = useState('5000');
  const [currentProxyIndex, setCurrentProxyIndex] = useState(0);

  // Load settings from localStorage on component mount
  useEffect(() => {
    if (user) {
      const storedProxies = localStorage.getItem(`${user.id}_proxies`);
      const storedProxyEnabled = localStorage.getItem(`${user.id}_proxyEnabled`);
      const storedProxyTimeout = localStorage.getItem(`${user.id}_proxyTimeout`);
      const storedCurrentProxyIndex = localStorage.getItem(`${user.id}_currentProxyIndex`);

      if (storedProxies) setProxies(storedProxies);
      if (storedProxyEnabled) setProxyEnabled(storedProxyEnabled === 'true');
      if (storedProxyTimeout) setProxyTimeout(storedProxyTimeout);
      if (storedCurrentProxyIndex) setCurrentProxyIndex(parseInt(storedCurrentProxyIndex, 10));
    }
  }, [user]);

  const handleSaveProxies = () => {
    if (!user) {
      toast.error('You must be logged in to save settings');
      return;
    }

    // Validate proxies
    const proxyList = proxies.trim().split('\n').filter(p => p.trim());
    const invalidProxies = proxyList.filter(p => !isValidProxy(p));

    if (invalidProxies.length > 0) {
      toast.error(`${invalidProxies.length} invalid proxies found. Please check the format.`);
      return;
    }

    // Save to localStorage
    localStorage.setItem(`${user.id}_proxies`, proxies);
    localStorage.setItem(`${user.id}_proxyEnabled`, proxyEnabled.toString());
    localStorage.setItem(`${user.id}_proxyTimeout`, proxyTimeout);
    localStorage.setItem(`${user.id}_currentProxyIndex`, '0'); // Reset to first proxy

    toast.success(`Saved ${proxyList.length} proxies`);
  };

  const handleProxyEnabledChange = (checked: boolean) => {
    setProxyEnabled(checked);

    if (user) {
      localStorage.setItem(`${user.id}_proxyEnabled`, checked.toString());
    }

    toast.info(`Proxies ${checked ? 'enabled' : 'disabled'}`);
  };

  // Validate proxy format
  const isValidProxy = (proxy: string): boolean => {
    const parts = proxy.split(':');

    // Check for hostname:port format
    if (parts.length === 2) {
      return parts[0].trim() !== '' && /^\d+$/.test(parts[1]) && parseInt(parts[1]) > 0 && parseInt(parts[1]) <= 65535;
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

  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Proxy Settings</CardTitle>
            <CardDescription>
              Configure proxies for your card checking requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <Switch
                checked={proxyEnabled}
                onCheckedChange={handleProxyEnabledChange}
                id="proxy-enabled"
              />
              <Label htmlFor="proxy-enabled">Enable proxies</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxy-timeout">Proxy Timeout (ms)</Label>
              <Input
                type="number"
                id="proxy-timeout"
                value={proxyTimeout}
                onChange={(e) => {
                  const value = e.target.value;
                  setProxyTimeout(value);
                  if (user) {
                    localStorage.setItem(`${user.id}_proxyTimeout`, value);
                  }
                }}
                disabled={!proxyEnabled}
                min="1000"
                max="30000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxies">Proxy List (one per line)</Label>
              <Textarea
                id="proxies"
                placeholder="ip:port or hostname:port:username:password"
                rows={8}
                value={proxies}
                onChange={(e) => setProxies(e.target.value)}
                disabled={!proxyEnabled}
                className="font-mono"
              />
              <div className="text-xs text-muted-foreground">
                Supported formats:<br />
                • <span className="font-semibold">ip:port</span> (Example: 192.168.1.1:8080)<br />
                • <span className="font-semibold">hostname:port:username:password</span> (Example: proxy.example.com:8080:username:password)<br />
                Add one proxy per line. The system will rotate through them automatically.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={handleSaveProxies} disabled={!proxyEnabled || !proxies.trim()}>
                Save Proxies
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!user) {
                    toast.error('You must be logged in to test proxies');
                    return;
                  }

                  const nextProxy = getNextProxy(user.id);
                  if (nextProxy) {
                    toast.success(`Next proxy: ${nextProxy}`);
                    toast.info('Proxy rotation is working correctly');
                  } else {
                    toast.error('No proxies available or proxies are disabled');
                  }
                }}
                disabled={!proxyEnabled || !proxies.trim()}
              >
                Test Proxy Rotation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
