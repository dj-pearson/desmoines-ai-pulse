import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="touch-target w-9 px-0 transition-all duration-200 hover:scale-110 hover:rotate-12 hover:bg-accent/50"
          aria-label="Toggle theme"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all duration-300 ease-out dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all duration-300 ease-out dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end"
        className="bg-background border border-border shadow-lg z-50 animate-slide-down"
      >
        <DropdownMenuItem 
          onClick={() => setTheme("light")}
          className={`transition-all duration-200 hover:scale-105 ${theme === "light" ? "bg-accent" : ""}`}
        >
          <Sun className="mr-2 h-4 w-4 transition-transform duration-200 hover:rotate-12" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("dark")}
          className={`transition-all duration-200 hover:scale-105 ${theme === "dark" ? "bg-accent" : ""}`}
        >
          <Moon className="mr-2 h-4 w-4 transition-transform duration-200 hover:-rotate-12" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("system")}
          className={`transition-all duration-200 hover:scale-105 ${theme === "system" ? "bg-accent" : ""}`}
        >
          <Monitor className="mr-2 h-4 w-4 transition-transform duration-200 hover:scale-110" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}