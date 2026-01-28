/**
 * Security Layer Types
 *
 * Defense-in-depth security model with 4 layers:
 * 1. Authentication - WHO are you?
 * 2. Authorization - WHAT can you do?
 * 3. Resource Ownership - IS this yours?
 * 4. Database RLS - FINAL enforcement
 */

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

export type UserRole = 'user' | 'moderator' | 'admin' | 'root_admin';

/**
 * Role hierarchy levels (higher = more privileges)
 * Used for role-level based permission checks
 */
export const ROLE_LEVELS: Record<UserRole, number> = {
  user: 1,
  moderator: 5,
  admin: 10,
  root_admin: 100,
} as const;

/**
 * Get the numeric level for a role
 */
export function getRoleLevel(role: UserRole | undefined): number {
  return role ? ROLE_LEVELS[role] ?? 0 : 0;
}

// =============================================================================
// PERMISSION DEFINITIONS
// =============================================================================

/**
 * Permission scopes define resource boundaries
 * - 'own' = user's own resources
 * - 'any' = any resource (admin)
 * - 'team' = team/tenant resources
 */
export type PermissionScope = 'own' | 'any' | 'team';

/**
 * Permission actions
 */
export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'manage';

/**
 * Permission format: "resource.action.scope"
 * Examples:
 * - events.view.any - View any event
 * - events.create.own - Create own events
 * - users.manage.any - Manage any user (admin)
 */
export type Permission = string;

/**
 * All available permissions in the system
 */
export const PERMISSIONS = {
  // Event permissions
  EVENTS_VIEW_ANY: 'events.view.any',
  EVENTS_CREATE_OWN: 'events.create.own',
  EVENTS_UPDATE_OWN: 'events.update.own',
  EVENTS_DELETE_OWN: 'events.delete.own',
  EVENTS_UPDATE_ANY: 'events.update.any',
  EVENTS_DELETE_ANY: 'events.delete.any',
  EVENTS_FEATURE: 'events.feature.any',

  // Restaurant permissions
  RESTAURANTS_VIEW_ANY: 'restaurants.view.any',
  RESTAURANTS_CREATE_OWN: 'restaurants.create.own',
  RESTAURANTS_UPDATE_OWN: 'restaurants.update.own',
  RESTAURANTS_DELETE_OWN: 'restaurants.delete.own',
  RESTAURANTS_UPDATE_ANY: 'restaurants.update.any',
  RESTAURANTS_DELETE_ANY: 'restaurants.delete.any',
  RESTAURANTS_CLAIM: 'restaurants.claim.own',

  // Attraction permissions
  ATTRACTIONS_VIEW_ANY: 'attractions.view.any',
  ATTRACTIONS_CREATE_OWN: 'attractions.create.own',
  ATTRACTIONS_UPDATE_OWN: 'attractions.update.own',
  ATTRACTIONS_DELETE_OWN: 'attractions.delete.own',
  ATTRACTIONS_UPDATE_ANY: 'attractions.update.any',
  ATTRACTIONS_DELETE_ANY: 'attractions.delete.any',

  // User content permissions
  FAVORITES_VIEW_OWN: 'favorites.view.own',
  FAVORITES_CREATE_OWN: 'favorites.create.own',
  FAVORITES_DELETE_OWN: 'favorites.delete.own',

  REVIEWS_VIEW_ANY: 'reviews.view.any',
  REVIEWS_CREATE_OWN: 'reviews.create.own',
  REVIEWS_UPDATE_OWN: 'reviews.update.own',
  REVIEWS_DELETE_OWN: 'reviews.delete.own',
  REVIEWS_DELETE_ANY: 'reviews.delete.any',

  DISCUSSIONS_VIEW_ANY: 'discussions.view.any',
  DISCUSSIONS_CREATE_OWN: 'discussions.create.own',
  DISCUSSIONS_UPDATE_OWN: 'discussions.update.own',
  DISCUSSIONS_DELETE_OWN: 'discussions.delete.own',
  DISCUSSIONS_DELETE_ANY: 'discussions.delete.any',

  // Campaign/Advertising permissions
  CAMPAIGNS_VIEW_OWN: 'campaigns.view.own',
  CAMPAIGNS_VIEW_TEAM: 'campaigns.view.team',
  CAMPAIGNS_CREATE_OWN: 'campaigns.create.own',
  CAMPAIGNS_UPDATE_OWN: 'campaigns.update.own',
  CAMPAIGNS_DELETE_OWN: 'campaigns.delete.own',
  CAMPAIGNS_VIEW_ANY: 'campaigns.view.any',
  CAMPAIGNS_UPDATE_ANY: 'campaigns.update.any',

  // Profile/Account permissions
  PROFILE_VIEW_OWN: 'profile.view.own',
  PROFILE_UPDATE_OWN: 'profile.update.own',
  PROFILE_DELETE_OWN: 'profile.delete.own',

  // Trip Planner permissions
  TRIP_PLANNER_VIEW_OWN: 'trip_planner.view.own',
  TRIP_PLANNER_CREATE_OWN: 'trip_planner.create.own',
  TRIP_PLANNER_UPDATE_OWN: 'trip_planner.update.own',
  TRIP_PLANNER_DELETE_OWN: 'trip_planner.delete.own',

  // Admin permissions
  ADMIN_DASHBOARD_VIEW: 'admin.dashboard.view',
  ADMIN_USERS_VIEW: 'admin.users.view',
  ADMIN_USERS_UPDATE: 'admin.users.update',
  ADMIN_USERS_DELETE: 'admin.users.delete',
  ADMIN_USERS_MANAGE: 'admin.users.manage',
  ADMIN_CONTENT_MODERATE: 'admin.content.moderate',
  ADMIN_ANALYTICS_VIEW: 'admin.analytics.view',
  ADMIN_SETTINGS_VIEW: 'admin.settings.view',
  ADMIN_SETTINGS_UPDATE: 'admin.settings.update',
  ADMIN_SECURITY_MANAGE: 'admin.security.manage',
  ADMIN_AUDIT_LOG_VIEW: 'admin.audit_log.view',
} as const;

// =============================================================================
// ROLE-PERMISSION MAPPING
// =============================================================================

/**
 * Permissions granted to each role
 * Permissions are cumulative (higher roles get all lower role permissions)
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [
    // View public content
    PERMISSIONS.EVENTS_VIEW_ANY,
    PERMISSIONS.RESTAURANTS_VIEW_ANY,
    PERMISSIONS.ATTRACTIONS_VIEW_ANY,
    PERMISSIONS.REVIEWS_VIEW_ANY,
    PERMISSIONS.DISCUSSIONS_VIEW_ANY,

    // Own content management
    PERMISSIONS.FAVORITES_VIEW_OWN,
    PERMISSIONS.FAVORITES_CREATE_OWN,
    PERMISSIONS.FAVORITES_DELETE_OWN,
    PERMISSIONS.REVIEWS_CREATE_OWN,
    PERMISSIONS.REVIEWS_UPDATE_OWN,
    PERMISSIONS.REVIEWS_DELETE_OWN,
    PERMISSIONS.DISCUSSIONS_CREATE_OWN,
    PERMISSIONS.DISCUSSIONS_UPDATE_OWN,
    PERMISSIONS.DISCUSSIONS_DELETE_OWN,

    // Profile
    PERMISSIONS.PROFILE_VIEW_OWN,
    PERMISSIONS.PROFILE_UPDATE_OWN,
    PERMISSIONS.PROFILE_DELETE_OWN,

    // Trip planner
    PERMISSIONS.TRIP_PLANNER_VIEW_OWN,
    PERMISSIONS.TRIP_PLANNER_CREATE_OWN,
    PERMISSIONS.TRIP_PLANNER_UPDATE_OWN,
    PERMISSIONS.TRIP_PLANNER_DELETE_OWN,

    // Campaigns (own)
    PERMISSIONS.CAMPAIGNS_VIEW_OWN,
    PERMISSIONS.CAMPAIGNS_CREATE_OWN,
    PERMISSIONS.CAMPAIGNS_UPDATE_OWN,
    PERMISSIONS.CAMPAIGNS_DELETE_OWN,

    // Business features
    PERMISSIONS.RESTAURANTS_CLAIM,
  ],

  moderator: [
    // Inherits all user permissions (handled by hasPermission logic)

    // Content moderation
    PERMISSIONS.ADMIN_CONTENT_MODERATE,
    PERMISSIONS.REVIEWS_DELETE_ANY,
    PERMISSIONS.DISCUSSIONS_DELETE_ANY,

    // Event management
    PERMISSIONS.EVENTS_CREATE_OWN,
    PERMISSIONS.EVENTS_UPDATE_OWN,
    PERMISSIONS.EVENTS_DELETE_OWN,

    // View team campaigns
    PERMISSIONS.CAMPAIGNS_VIEW_TEAM,
  ],

  admin: [
    // Inherits all moderator permissions (handled by hasPermission logic)

    // Full content management
    PERMISSIONS.EVENTS_UPDATE_ANY,
    PERMISSIONS.EVENTS_DELETE_ANY,
    PERMISSIONS.EVENTS_FEATURE,
    PERMISSIONS.RESTAURANTS_UPDATE_ANY,
    PERMISSIONS.RESTAURANTS_DELETE_ANY,
    PERMISSIONS.RESTAURANTS_CREATE_OWN,
    PERMISSIONS.ATTRACTIONS_UPDATE_ANY,
    PERMISSIONS.ATTRACTIONS_DELETE_ANY,
    PERMISSIONS.ATTRACTIONS_CREATE_OWN,

    // Campaign management
    PERMISSIONS.CAMPAIGNS_VIEW_ANY,
    PERMISSIONS.CAMPAIGNS_UPDATE_ANY,

    // Admin features
    PERMISSIONS.ADMIN_DASHBOARD_VIEW,
    PERMISSIONS.ADMIN_USERS_VIEW,
    PERMISSIONS.ADMIN_USERS_UPDATE,
    PERMISSIONS.ADMIN_ANALYTICS_VIEW,
    PERMISSIONS.ADMIN_AUDIT_LOG_VIEW,
  ],

  root_admin: [
    // Inherits all admin permissions (handled by hasPermission logic)

    // User management
    PERMISSIONS.ADMIN_USERS_DELETE,
    PERMISSIONS.ADMIN_USERS_MANAGE,

    // Settings & Security
    PERMISSIONS.ADMIN_SETTINGS_VIEW,
    PERMISSIONS.ADMIN_SETTINGS_UPDATE,
    PERMISSIONS.ADMIN_SECURITY_MANAGE,
  ],
};

// =============================================================================
// SECURITY CONTEXT
// =============================================================================

/**
 * Security context containing user authentication and authorization data
 */
export interface SecurityContext {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;

  /** User ID (from auth.uid()) */
  userId: string | null;

  /** User's email */
  email: string | null;

  /** User's role */
  role: UserRole;

  /** User's role level */
  roleLevel: number;

  /** User's permissions */
  permissions: Permission[];

  /** Tenant/organization ID (if applicable) */
  tenantId?: string;

  /** Session ID */
  sessionId?: string;

  /** IP address (for audit logging) */
  ipAddress?: string;

  /** User agent (for audit logging) */
  userAgent?: string;
}

/**
 * Create an empty/anonymous security context
 */
export function createAnonymousContext(): SecurityContext {
  return {
    isAuthenticated: false,
    userId: null,
    email: null,
    role: 'user',
    roleLevel: 0,
    permissions: [],
  };
}

// =============================================================================
// SECURITY CHECK RESULTS
// =============================================================================

/**
 * Result of a security check
 */
export interface SecurityCheckResult {
  /** Whether the check passed */
  allowed: boolean;

  /** Error code if denied */
  errorCode?: SecurityErrorCode;

  /** Human-readable reason if denied */
  reason?: string;

  /** Which layer denied the request */
  deniedByLayer?: SecurityLayer;
}

export type SecurityLayer = 'authentication' | 'authorization' | 'ownership' | 'rls';

export type SecurityErrorCode =
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'INSUFFICIENT_ROLE'
  | 'PERMISSION_DENIED'
  | 'NOT_OWNER'
  | 'TENANT_MISMATCH'
  | 'RLS_DENIED'
  | 'RATE_LIMITED'
  | 'IP_BLOCKED'
  | 'ACCOUNT_LOCKED';

// =============================================================================
// RESOURCE OWNERSHIP
// =============================================================================

/**
 * Resource types that support ownership checking
 */
export type OwnableResource =
  | 'event'
  | 'restaurant'
  | 'attraction'
  | 'review'
  | 'rating'
  | 'favorite'
  | 'discussion'
  | 'discussion_reply'
  | 'photo'
  | 'campaign'
  | 'advertisement'
  | 'profile'
  | 'trip_plan'
  | 'saved_search'
  | 'event_alert';

/**
 * Ownership check configuration
 */
export interface OwnershipConfig {
  /** The resource type */
  resourceType: OwnableResource;

  /** The column name that stores the owner ID (default: 'user_id') */
  ownerColumn?: string;

  /** The column name that stores the tenant ID (if applicable) */
  tenantColumn?: string;

  /** Allow team members to access (for campaigns, etc.) */
  allowTeamAccess?: boolean;

  /** Allow admins to bypass ownership check */
  adminBypass?: boolean;
}

/**
 * Default ownership column mappings
 */
export const OWNERSHIP_COLUMNS: Record<OwnableResource, string> = {
  event: 'created_by',
  restaurant: 'claimed_by',
  attraction: 'created_by',
  review: 'user_id',
  rating: 'user_id',
  favorite: 'user_id',
  discussion: 'user_id',
  discussion_reply: 'user_id',
  photo: 'user_id',
  campaign: 'user_id',
  advertisement: 'campaign_id', // Linked via campaign
  profile: 'id', // profile.id = user.id
  trip_plan: 'user_id',
  saved_search: 'user_id',
  event_alert: 'user_id',
};

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Security event types for audit logging
 */
export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_change'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'permission_denied'
  | 'ownership_denied'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  | 'admin_action'
  | 'role_change'
  | 'data_export'
  | 'data_delete';

/**
 * Security audit log entry
 */
export interface SecurityAuditEntry {
  /** Event type */
  eventType: SecurityEventType;

  /** User who triggered the event */
  userId?: string;

  /** IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** Resource type affected */
  resourceType?: string;

  /** Resource ID affected */
  resourceId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Timestamp */
  timestamp?: Date;
}
