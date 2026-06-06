import {
  ColabSection,
  ContactSection,
  FeaturesGrid,
  FieldInsightSection,
  HeroSection,
  MitraSection,
  PreviewSection,
  ProblemsSection,
  SolutionSection,
  StatsSection,
  UseCasesSection,
} from "~/features/landing/sections";
import LandingLayout from "~/layouts/LandingLayout";
import { getOptionalUser } from "~/server/auth";
import { loadWebConfig, useWebConfig } from "~/lib/shared/webConfig";
import { createAsync } from "@solidjs/router";

export const route = {
  preload: () => {
    void getOptionalUser();
    return loadWebConfig();
  },
  prerender: true,
};

export default function LandingRoute() {
  const webConfig = useWebConfig();
  const user = createAsync(() => getOptionalUser());

  return (
    <LandingLayout config={webConfig()} user={user() ?? null}>
      <HeroSection config={webConfig()} />
      <PreviewSection />
      <ProblemsSection />
      <FieldInsightSection />
      <SolutionSection />
      <FeaturesGrid />
      <StatsSection />
      <UseCasesSection />
      <ContactSection />
      <MitraSection />
      <ColabSection />
    </LandingLayout>
  );
}
