import type { Role } from "@prisma/client";

export type MyProfile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  profile: {
    whatsapp: string | null;
    nickname: string | null;
    gender: string | null;
    address: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    postalCode: string | null;
    deviceUsername: string | null;
    apiKey: string | null;
  } | null;
};
