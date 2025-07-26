import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthDebug() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const testConnection = async () => {
    addResult("🔍 Testing Supabase connection...");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        addResult(`❌ Connection error: ${error.message}`);
      } else {
        addResult(
          `✅ Connection successful. Current session: ${
            data.session ? "Active" : "None"
          }`
        );
        if (data.session?.user) {
          addResult(`👤 Current user: ${data.session.user.email}`);
        }
      }
    } catch (err) {
      addResult(`❌ Connection failed: ${err}`);
    }
  };

  const testLogin = async () => {
    if (!email || !password) {
      addResult("❌ Please enter email and password");
      return;
    }

    addResult(`🔐 Testing login with: ${email}`);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        addResult(`❌ Login error: ${error.message}`);
        addResult(`📋 Error details: ${JSON.stringify(error, null, 2)}`);
      } else {
        addResult(`✅ Login successful!`);
        addResult(`👤 User: ${data.user?.email}`);
        addResult(
          `📋 User metadata: ${JSON.stringify(
            data.user?.user_metadata,
            null,
            2
          )}`
        );
        addResult(
          `📋 App metadata: ${JSON.stringify(data.user?.app_metadata, null, 2)}`
        );

        // Test admin check
        const adminEmails = [
          "admin@desmoines.ai",
          "admin@desmoinesinsider.com",
          "pearson.performance@gmail.com",
        ];
        const isAdmin =
          data.user?.email && adminEmails.includes(data.user.email);
        addResult(`🔐 Admin status: ${isAdmin ? "YES" : "NO"}`);
      }
    } catch (err) {
      addResult(`❌ Login exception: ${err}`);
    }
  };

  const testLogout = async () => {
    addResult("🚪 Testing logout...");
    try {
      await supabase.auth.signOut();
      addResult("✅ Logout successful");
    } catch (err) {
      addResult(`❌ Logout failed: ${err}`);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>🔧 Authentication Debug Tool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={testConnection} variant="outline">
            Test Connection
          </Button>
          <Button onClick={testLogin} disabled={!email || !password}>
            Test Login
          </Button>
          <Button onClick={testLogout} variant="outline">
            Test Logout
          </Button>
          <Button onClick={clearResults} variant="destructive">
            Clear
          </Button>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
          <h3 className="font-semibold mb-2">Debug Results:</h3>
          {results.length === 0 ? (
            <p className="text-gray-500">
              No results yet. Click a button to test.
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((result, index) => (
                <div key={index} className="text-sm font-mono">
                  {result}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
