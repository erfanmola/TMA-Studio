import "./Header.scss";

import { activeUserId, setActiveUserId, users } from "../utils/user";

import { AiOutlineUser } from "solid-icons/ai";
import { BsCheckLg } from "solid-icons/bs";
import { FiBox } from "solid-icons/fi";
import GHButton from "./GHButton";
import { Select } from "@kobalte/core/select";
import { createSignal } from "solid-js";
import { onMount } from "solid-js";

const [ghStars, setGHStars] = createSignal(0);
const ghRepoURL = "https://github.com/erfanmola/TMA-Studio";

const Header = () => {
	onMount(async () => {
		if (ghStars() === 0) {
			try {
				const request = await fetch(
					ghRepoURL.replace("github.com/", "api.github.com/repos/"),
				);
				const result = await request.json();

				if (result && "stargazers_count" in result) {
					setGHStars(result.stargazers_count);
				}
			} catch (e) {}
		}
	});

	return (
		<header id="header-main">
			<div>
				<FiBox />
				<GHButton stars={ghStars()} url={ghRepoURL} />
			</div>

			<div>
				<Select
					options={[
						{
							value: "none",
							label: "None",
						},
						...users().map((user) => ({
							value: user.id,
							label: user.first_name,
						})),
					]}
					value={{
						label:
							users().find((item) => item.id === activeUserId())?.first_name ??
							"none",
						value: activeUserId(),
					}}
					onChange={(e) => setActiveUserId(e?.value ?? "none")}
					placeholder="Select User"
					optionValue="value"
					itemComponent={(props) => (
						<Select.Item item={props.item} class="select__item">
							<Select.ItemLabel>{props.item.rawValue.label}</Select.ItemLabel>
							<Select.ItemIndicator class="select__item-indicator">
								<BsCheckLg />
							</Select.ItemIndicator>
						</Select.Item>
					)}
				>
					<Select.Trigger class="select__trigger">
						<Select.Value class="select__value">
							{/* @ts-ignore */}
							{(state) => state.selectedOption().label}
						</Select.Value>
						<Select.Icon class="select__icon">
							<AiOutlineUser />
						</Select.Icon>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select__content">
							<Select.Listbox class="select__listbox" />
						</Select.Content>
					</Select.Portal>
				</Select>
			</div>
		</header>
	);
};

export default Header;
