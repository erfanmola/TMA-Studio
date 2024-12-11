import "./Welcome.scss";

import DotPattern from "../components/DotPattern";
import { LetterPullup } from "../components/LetterPullup";
import { useSettings } from "../contexts/SettingsContext";

const WelcomePage = () => {
	const { settings } = useSettings();
	// const navigate = useNavigate();

	// window.electron.ipcRenderer.

	const onClickButtonStart = async () => {
		settings.set("intro_done", true);
		window.electron.ipcRenderer.sendSync("skip-intro");
		// navigate("/main", { replace: true });
	};

	return (
		<main id="container-page-welcome">
			<DotPattern blurRadius={250} distance={16} size={1.25} opacity={0.25} />

			<LetterPullup words="Welcome to TMA Studio" />

			<button
				onClick={onClickButtonStart}
				type="button"
				class="button-primary animate__bounceIn"
			>
				Let's Start
			</button>
		</main>
	);
};

export default WelcomePage;
