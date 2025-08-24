import { useState, useEffect } from "react";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Crown, UserCheck, AlertTriangle } from "lucide-react";

interface UserProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  user_role: UserRole;
  created_at: string;
}

export default function UserRoleManager() {
  const { isRootAdmin, canManageUsers, getAllUsers, assignRole } = useUserRole();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const userData = await getAllUsers();
      setUsers(userData as UserProfile[]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setIsUpdating(userId);
      await assignRole(userId, newRole);
      
      // Update local state
      setUsers(prev => prev.map(user => 
        user.user_id === userId 
          ? { ...user, user_role: newRole }
          : user
      ));

      toast({
        title: "Role Updated",
        description: `User role has been updated to ${newRole}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'root_admin':
        return <Crown className="h-4 w-4" />;
      case 'admin':
        return <Shield className="h-4 w-4" />;
      case 'moderator':
        return <UserCheck className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'root_admin':
        return "default";
      case 'admin':
        return "destructive";
      case 'moderator':
        return "secondary";
      default:
        return "outline";
    }
  };

  const getAvailableRoles = (currentRole: UserRole): UserRole[] => {
    if (isRootAdmin()) {
      return ['user', 'moderator', 'admin', 'root_admin'];
    }
    // Regular admins cannot assign root_admin or modify other admins
    if (currentRole === 'root_admin' || currentRole === 'admin') {
      return [currentRole]; // Cannot modify
    }
    return ['user', 'moderator'];
  };

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
    }
  }, [canManageUsers]);

  if (!canManageUsers) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-neutral-600">
            You don't have permission to manage user roles.
          </p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Role Management
          </CardTitle>
          <CardDescription>Loading users...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Role Management
        </CardTitle>
        <CardDescription>
          Manage user roles and permissions. {isRootAdmin() ? "As root admin, you have full control." : "You can assign moderator roles to users."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.user_id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  {getRoleIcon(user.user_role)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {user.first_name} {user.last_name}
                    </span>
                    <Badge variant={getRoleBadgeVariant(user.user_role)}>
                      {user.user_role.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-500">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={user.user_role}
                  onValueChange={(value: UserRole) => handleRoleChange(user.user_id, value)}
                  disabled={isUpdating === user.user_id || getAvailableRoles(user.user_role).length === 1}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableRoles(user.user_role).map((role) => (
                      <SelectItem key={role} value={role}>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(role)}
                          {role.replace('_', ' ')}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {isUpdating === user.user_id && (
                  <div className="text-sm text-neutral-500">Updating...</div>
                )}
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-500">No users found</p>
              <Button variant="outline" onClick={fetchUsers} className="mt-4">
                Refresh
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}