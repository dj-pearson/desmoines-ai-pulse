import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import UserRoleManager from "@/components/UserRoleManager";
import AdminSystemControls from "@/components/AdminSystemControls";
import AdminApplicationSettings from "@/components/AdminApplicationSettings";
import {
  Users,
  Server,
  Cog,
} from "lucide-react";

const SYSTEM_TABS = [
  { id: "users", label: "User Management", icon: Users },
  { id: "system", label: "System Controls", icon: Server },
  { id: "settings", label: "Settings", icon: Cog },
];

export default function AdminSystem() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("System Settings");
  const [activeTab, setActiveTab] = useState("users");

  const canManageUsers = () => ["admin", "root_admin"].includes(userRole);
  const canManageContent = () =>
    ["moderator", "admin", "root_admin"].includes(userRole);

  if (!canManageContent()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access system settings.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        {/* Tab Navigation */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {SYSTEM_TABS.map((tab) => {
              const Icon = tab.icon;
              // Hide user management tab if user doesn't have permission
              if (tab.id === "users" && !canManageUsers()) return null;
              if (tab.id === "system" && !canManageUsers()) return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        {canManageUsers() && activeTab === "users" && <UserRoleManager />}

        {canManageUsers() && activeTab === "system" && <AdminSystemControls />}

        {activeTab === "settings" && <AdminApplicationSettings />}
      </div>
    </div>
  );
}
