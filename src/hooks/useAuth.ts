import { useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  role: "admin" | "user";
  name: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
  });

  useEffect(() => {
    // Mock authentication check - replace with real auth
    const checkAuth = () => {
      const storedUser = localStorage.getItem("auth_user");
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          setAuthState({
            user,
            isLoading: false,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
          });
        } catch (error) {
          localStorage.removeItem("auth_user");
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
          });
        }
      } else {
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
        });
      }
    };

    // Simulate loading delay
    setTimeout(checkAuth, 100);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Mock login - replace with real authentication
    if (email === "admin@desmoines.ai" && password === "admin123") {
      const user: User = {
        id: "1",
        email,
        role: "admin",
        name: "Admin User",
      };

      localStorage.setItem("auth_user", JSON.stringify(user));
      setAuthState({
        user,
        isLoading: false,
        isAuthenticated: true,
        isAdmin: true,
      });
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem("auth_user");
    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
    });
  };

  const requireAdmin = () => {
    if (!authState.isAdmin) {
      throw new Error("Admin access required");
    }
  };

  return {
    ...authState,
    login,
    logout,
    requireAdmin,
  };
}
