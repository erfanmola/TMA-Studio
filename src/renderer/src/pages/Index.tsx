import { useNavigate } from "@solidjs/router";
import { useSettings } from "../contexts/SettingsContext";

const IndexPage = () => {
	const { settings } = useSettings();
	const navigate = useNavigate();

	if (settings.get("preferences.intro.skip")) {
		navigate("/main", { replace: true });
	} else {
		navigate("/welcome", { replace: true });
	}

	return <></>;
};

export default IndexPage;
