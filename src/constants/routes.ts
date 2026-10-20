export const ROUTES = {
  landing: "/",
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  home: "/dashboard",
  dashboard: "/dashboard",
  irrigationHistory: "/irrigation-history",
  statistics: "/statistics",
  userManagement: "/user-management",
  userCreate: "/user-management/create",
  regionManagement: "/region-management",
  mapConfiguration: "/map-configuration",
  systemLog: "/system-log",
  authLog: "/auth-log",
  contactSubmissions: "/contact-submissions",
  settings: "/settings",
  profile: "/profile",
  helpCenter: "/help-center",
  superadmin: "/superadmin",
  adminView: "/admin-view",
  cmsTestimonials: "/superadmin/testimonials",
  cmsLocations: "/superadmin/locations",
  cmsPartners: "/superadmin/partners",
  cmsSubscribers: "/superadmin/subscribers",
} as const;

export const PUBLIC_ROUTES = [ROUTES.landing, ROUTES.login, ROUTES.forgotPassword, ROUTES.resetPassword] as const;

/**
 * Prefixes that require an authenticated session. Unknown paths deliberately
 * fall through to the catch-all 404 route instead of being redirected to login,
 * which keeps broken URLs out of the auth flow and lets crawlers see a real 404.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  ROUTES.dashboard,
  ROUTES.irrigationHistory,
  ROUTES.statistics,
  ROUTES.userManagement,
  ROUTES.regionManagement,
  ROUTES.mapConfiguration,
  ROUTES.systemLog,
  ROUTES.authLog,
  ROUTES.contactSubmissions,
  ROUTES.settings,
  ROUTES.profile,
  ROUTES.helpCenter,
  ROUTES.superadmin,
  ROUTES.adminView,
] as const;
