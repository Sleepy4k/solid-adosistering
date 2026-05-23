import { cache, createAsync } from "@solidjs/router";
import { DEFAULT_WEB_CONFIG } from "~/constants/landing";
import {
	ColabSection,
	ContactSection,
	DirectorViewSection,
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
import { getWebConfig } from "~/server/actions/index";

const loadLandingConfig = cache(() => getWebConfig(), "landing-web-config");

export const route = { preload: () => loadLandingConfig(), prerender: true };

export default function LandingRoute() {
	const config = createAsync(() => loadLandingConfig());
	const webConfig = () => ({ ...DEFAULT_WEB_CONFIG, ...(config() ?? {}) });

	return (
		<LandingLayout config={webConfig()}>
			<HeroSection config={webConfig()} />
			<PreviewSection />
			<ProblemsSection />
			<FieldInsightSection />
			<SolutionSection />
			<FeaturesGrid />
			<StatsSection />
			<UseCasesSection />
			<ContactSection />
			<DirectorViewSection />
			<MitraSection />
			<ColabSection />
		</LandingLayout>
	);
}
