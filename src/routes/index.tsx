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
import { PageMeta } from "~/components/shared/PageMeta";

export const route = {
  preload: () => {
    void getOptionalUser();
    return loadWebConfig();
  },
};

export default function LandingRoute() {
  const webConfig = useWebConfig();
  const user = createAsync(() => getOptionalUser());

  return (
    <LandingLayout config={webConfig()} user={user() ?? null}>
      <PageMeta page="landing" indexable />
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
