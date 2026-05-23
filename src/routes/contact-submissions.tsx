import { PageMeta } from "~/components/shared/PageMeta";
import {
	ContactSubmissionsView,
	preloadContactSubmissions,
} from "~/features/superadmin/ContactSubmissionsPage";

export const route = { preload: preloadContactSubmissions };

export default function ContactSubmissionsRoute() {
	return (
		<>
			<PageMeta page="contactSubmissions" />
			<ContactSubmissionsView />
		</>
	);
}
