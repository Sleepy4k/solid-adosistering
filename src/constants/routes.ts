export const ROUTES = {
  home: "/",
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  irrigationHistory: "/irrigation-history",
  statistics: "/statistics",
  userManagement: "/user-management",
  userCreate: "/user-management/create",
  regionManagement: "/region-management",
  mapConfiguration: "/map-configuration",
  systemLog: "/system-log",
  settings: "/settings",
  profile: "/profile",
  helpCenter: "/help-center",
} as const;

export const PUBLIC_ROUTES = [ROUTES.login, ROUTES.forgotPassword, ROUTES.resetPassword] as const;
