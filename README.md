# Telegram Mini App Studio

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

## Roadmap
The project's roadmap will be described here.
