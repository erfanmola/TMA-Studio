import { onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useSettings } from "../contexts/SettingsContext";

const IndexPage = () => {
	const { settings } = useSettings();
	const navigate = useNavigate();

	onMount(async () => {
		if (await settings?.get("intro_done")) {
			navigate("/main", { replace: true });
		} else {
			navigate("/welcome", { replace: true });
		}
	});

	return <></>;
};

export default IndexPage;
