![Telegram Mini App Studio](https://github.com/erfanmola/TMA-Studio/blob/master/resources/cover.png?raw=true)

# Telegram Mini App Studio
The ultimate development and testing environment for Telegram Mini Apps. Build, test, and debug your apps locally with full support for Telegram's features, including Mini Apps 2.0 compatibility. You can the watch the [full usage demo](https://github.com/erfanmola/TMA-Studio/raw/refs/heads/master/resources/demo.mp4).

## Features

- **Local Testing**
  Test your Mini Apps locally without the need for HTTPS or tunneling solutions like ngrok.

- **Simulated Telegram Environments**
  Experience Telegram Android and iOS environments with support for popups, haptics, QR scanners, buttons, and more.

- **Mini Apps 2.0 Ready**
  Fully compatible with the latest Mini Apps 2.0 features and updates.

- **Mock User Data**
  Simulate user interactions with customizable mock data for efficient debugging.

- **Event and Method Support**
  Supports over 90% of Telegram Mini App events and methods, with ongoing development.

- **Token and InitData Simulation**
  Sign and verify `initData` using a bot token, just like Telegram’s backend.

![DPXWallet Demo](https://github.com/erfanmola/TMA-Studio/blob/master/resources/demo-2.png?raw=true)

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
### Phase 1
This phase has started from October 2024 and ended until January 2025.
- [x] Setup base project and essentials
- [x] Add support for Telegram Android and iOS platforms.
### Phase 2
This phase is planned for early to mid 2025.
- [ ] Full compatibility with Telegram Mini Apps 2.0.
- [ ] Add support for Telegram Desktop, WebK, and WebA platforms.
- [ ] Add support for auto-updates in app and streamline release process.
### Phase 3
This phase is planned for mid to late 2025.
- [ ] Improve mock data customization and support real user account login.
- [ ] Support `*` marked features that require real user account.

## License
This project is licensed under the MIT License.

## Contact
Have questions or suggestions? Feel free to reach out!

Telegram: [@Eyfan](https://t.me/Eyfan)

Email: [hi@erfanxd.ir](mailto:hi@erfanxd.ir)
