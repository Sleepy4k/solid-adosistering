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
import { redirectIfLoggedIn } from "~/server/auth";
import { loadWebConfig, useWebConfig } from "~/lib/shared/webConfig";

export const route = {
	preload: () => {
		redirectIfLoggedIn();
		return loadWebConfig();
	},
	prerender: false,
};

export default function LandingRoute() {
	const webConfig = useWebConfig();

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
