import { useState, useEffect, useCallback } from "react";
import { useAuthState } from "@/contexts/AuthContext";
import { useUserRole, UserRole, ManagedUser, USERS_PAGE_SIZE } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, Crown, UserCheck, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

export default function UserRoleManager() {
  // The signed-in user has to be passed in: useUserRole() with no user
  // resolves 'user', so a root_admin was offered only the moderator options.
  const { user: currentUser } = useAuthState();
  const {
    isRootAdmin,
    canManageUsers,
    getAllUsers,
    assignRole,
    isLoading: roleLoading,
  } = useUserRole(currentUser);
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const mayManage = !roleLoading && canManageUsers();
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getAllUsers(page);
      setUsers(result.users);
      setTotal(result.total);
    } catch {
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
    // getAllUsers is recreated every render; page is the only real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setIsUpdating(userId);
      await assignRole(userId, newRole);
      
      setUsers(prev => prev.map(user =>
        user.user_id === userId
          ? { ...user, role: newRole }
          : user
      ));

      toast({
        title: "Role Updated",
        description: `User role has been updated to ${newRole}`,
      });
    } catch (error) {
      // assign-role says why it refused (e.g. an admin changing an admin).
      toast({
        title: "Role not changed",
        description: error instanceof Error ? error.message : "Failed to update user role",
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
        return <SpriteIcon name="users" className="h-4 w-4" />;
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

  // canManageUsers is a function, so `if (canManageUsers)` was always true and,
  // as an effect dependency, changed every render and refetched in a loop.
  useEffect(() => {
    if (mayManage) {
      fetchUsers();
    }
  }, [mayManage, fetchUsers]);

  if (!roleLoading && !mayManage) {
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
            <SpriteIcon name="users" className="h-5 w-5" />
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
          <SpriteIcon name="users" className="h-5 w-5" />
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
                  {getRoleIcon(user.role)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {user.first_name} {user.last_name}
                    </span>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {user.role.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-500">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={user.role}
                  onValueChange={(value: UserRole) => handleRoleChange(user.user_id, value)}
                  disabled={isUpdating === user.user_id || getAvailableRoles(user.role).length === 1}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableRoles(user.role).map((role) => (
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

          {total > USERS_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} users)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || isLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {users.length === 0 && (
            <div className="text-center py-8">
              <SpriteIcon name="users" className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
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