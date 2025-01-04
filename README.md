![Telegram Mini App Studio](https://github.com/erfanmola/TMA-Studio/blob/master/resources/cover.png?raw=true)

# Telegram Mini App Studio
The ultimate development and testing environment for Telegram Mini Apps. Build, test, and debug your apps locally with full support for Telegram's features, including Mini Apps 2.0 compatibility. You can the watch the [full usage demo](https://github.com/erfanmola/TMA-Studio/raw/refs/heads/master/resources/demo-2-4k-60FPS.mp4).

## Features

- **Local Testing**: Test your Mini Apps locally without the need for HTTPS or tunneling solutions like ngrok.

- **Simulated Telegram Environments**: Experience Telegram Android and iOS environments with support for popups, haptic feedback with virtual device shakes, QR scanners, buttons, and more.

- **Feature-rich Developer Console**: Integrated Chrome DevTools console for debugging every simulated environment.

- **Mini Apps 2.0 Ready**: Fully compatible with the latest Mini Apps 2.0 features and updates. (WIP, Phase 2)

- **Mock User Data**: Simulate user interactions with customizable mock data for efficient debugging. Switch between user profiles with unique data for more robust app testing.

- **Event and Method Support**: Supports over 90% of Telegram Mini App events and methods, with ongoing development.

- **Token and InitData Simulation**: Sign and verify `initData` using a bot token, just like Telegram’s backend.

- **Native-looking Floating Windows**: Emulates the floating Mini App window experience, akin to mobile emulators.

- **Familiar Developer UI**: Inspired by VSCode with multiple tabs and projects, enhancing productivity.

![DPXWallet Demo](https://github.com/erfanmola/TMA-Studio/blob/master/resources/demo-2.png?raw=true)

![TMA Studio Sample Demo](https://github.com/erfanmola/TMA-Studio/blob/master/resources/demo-3.png?raw=true)

![Simplist Floating Demo](https://github.com/erfanmola/TMA-Studio/blob/master/resources/demo-4.png?raw=true)

https://github.com/user-attachments/assets/c6f3f79c-d56d-4329-86f2-8a8d7acb68ae

---

## Platforms Support
- [x] Telegram Android
- [x] Telegram iOS
- [ ] Telegram Desktop
- [ ] Telegram WebK
- [ ] Telegram WebA

## Parameters Support
- [x] initData
- [x] initDataUnsafe
- [x] version
- [x] platform
- [x] colorScheme
- [x] themeParams
- [x] isExpanded
- [x] viewportHeight
- [x] viewportStableHeight
- [x] headerColor
- [x] backgroundColor
- [x] bottomBarColor
- [x] isClosingConfirmationEnabled
- [x] isVerticalSwipesEnabled

## Managers Support
- [x] BackButton
- [x] MainButton
- [x] SecondaryButton
- [x] SettingsButton
- [x] HapticFeedback
- [ ] CloudStorage*
- [ ] BiometricManager

## Methods Support
- [x] isVersionAtLeast
- [x] setHeaderColor
- [x] setBackgroundColor
- [x] setBottomBarColor
- [x] enableClosingConfirmation
- [x] disableClosingConfirmation
- [x] enableVerticalSwipes
- [x] disableVerticalSwipes
- [x] onEvent
- [x] offEvent
- [ ] sendData*
- [ ] switchInlineQuery*
- [ ] openLink
- [ ] openTelegramLink
- [ ] openInvoice
- [x] shareToStory
- [x] showPopup
- [x] showAlert
- [x] showConfirm
- [x] showScanQrPopup
- [x] closeScanQrPopup
- [x] readTextFromClipboard
- [x] requestWriteAccess
- [x] requestContact
- [x] ready
- [x] expand
- [x] close

## Events Support
- [x] themeChanged
- [x] viewportChanged
- [x] mainButtonClicked
- [x] secondaryButtonClicked
- [x] backButtonClicked
- [x] settingsButtonClicked
- [ ] invoiceClosed
- [x] popupClosed
- [x] qrTextReceived
- [x] scanQrPopupClosed
- [x] clipboardTextReceived
- [x] writeAccessRequested
- [x] contactRequested
- [ ] biometricManagerUpdated
- [ ] biometricAuthRequested
- [ ] biometricTokenUpdated

## Custom Methods
- [ ] getRequestedContact*
- [ ] saveStorageValue*
- [ ] getStorageValues*
- [ ] deleteStorageValues*
- [ ] getStorageKeys*

**Note:** Items specified with `*` require a proper MTProto client up and running to communicate with real Telegram servers. This feature is not available right now, but planned to be implemented and logged in via a real Telegram Account.

---

## Roadmap
### Phase 1 (Completed)
This phase has started from October 2024 and ended until January 2025.
- [x] Setup base project and essentials
- [x] Add support for Telegram Android and iOS platforms.
### Phase 2 (WIP)
This phase is planned for early to mid 2025.
- [ ] Full compatibility with Telegram Mini Apps 2.0.
- [ ] Add support for Telegram Desktop, WebK, and WebA platforms.
- [x] Add support for auto-updates in app and streamline release process.
### Phase 3 (Planned)
This phase is planned for mid to late 2025.
- [ ] Improve mock data customization and support real user account login.
- [ ] Support `*` marked features that require real user account.

## Contribution Guidelines

We welcome contributions from the community! Whether you're fixing bugs, implementing features, or improving documentation, your help is greatly appreciated. Follow these steps and guidelines to contribute effectively:

### Prerequisites
1. **Node Package Manager**: We recommend using **pnpm** over npm for managing dependencies, as it ensures better performance and workspace handling.
   - Install pnpm globally if you haven't already:
     ```bash
     npm install -g pnpm
     ```
2. **Code Formatting and Linting**:
   We use **Biome.js** as the linter and formatter for the project.
   - Install the **Biome.js** VSCode extension for consistent linting and formatting in your editor.
   - Ensure that your code is formatted and linted before submitting a pull request (PR).

3. **Tech Stack**:
   - The project is built with **Electron**, **Vite**, and **SolidJS** for a modern, fast development workflow.

---

### Steps to Contribute

1. **Clone the Repository**:
   - Fork the repository to your account.
   - Clone your forked repo:
     ```bash
     git clone https://github.com/erfanmola/TMA-Studio.git
     cd TMA-Studio
     ```

2. **Install Dependencies**:
   - Use pnpm to install all dependencies:
     ```bash
     pnpm install
     ```

3. **Development**:
   - Start the development server:
     ```bash
     pnpm dev
     ```

4. **Building the Project**:
   - Build the project for all major platforms:
     - **Mac**:
       ```bash
       pnpm build:mac
       ```
     - **Windows**:
       ```bash
       pnpm build:win
       ```
     - **Linux**:
       ```bash
       pnpm build:linux
       ```

5. **Linting and Formatting**:
   - Run the linter to ensure the code adheres to project standards:
     ```bash
     pnpm lint
     ```
   - Make sure your code passes all linting checks before submitting a PR.

### Commands Overview
| Command           | Description                                    |
|-------------------|------------------------------------------------|
| `pnpm install`    | Installs all dependencies.                    |
| `pnpm dev`        | Starts the development environment.           |
| `pnpm build`      | Builds the project for production.            |
| `pnpm lint`       | Lints and formats the codebase using Biome.js.|
| `pnpm build:mac`  | Builds the project for macOS.                 |
| `pnpm build:win`  | Builds the project for Windows.               |
| `pnpm build:linux`| Builds the project for Linux.                 |

---

## License
This project is licensed under the MIT License.

## Contact
Have questions or suggestions? Feel free to reach out!

Telegram: [@Eyfan](https://t.me/Eyfan)

Email: [hi@erfanxd.ir](mailto:hi@erfanxd.ir)
