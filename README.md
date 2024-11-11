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
- [ ] MainButton
- [ ] SecondaryButton
- [ ] SettingsButton
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
- [ ] enableVerticalSwipes*
- [ ] disableVerticalSwipes*
- [x] onEvent
- [x] offEvent
- [ ] sendData*
- [ ] switchInlineQuery*
- [ ] openLink*
- [ ] openTelegramLink*
- [ ] openInvoice*
- [ ] shareToStory*
- [x] showPopup
- [x] showAlert
- [x] showConfirm
- [x] showScanQrPopup
- [x] closeScanQrPopup
- [ ] readTextFromClipboard
- [ ] requestWriteAccess
- [ ] requestContact
- [ ] ready
- [x] expand
- [x] close

## Events Support
- [x] themeChanged
- [x] viewportChanged
- [ ] mainButtonClicked
- [ ] secondaryButtonClicked
- [x] backButtonClicked
- [ ] settingsButtonClicked
- [ ] invoiceClosed
- [x] popupClosed
- [x] qrTextReceived
- [x] scanQrPopupClosed
- [ ] clipboardTextReceived
- [ ] writeAccessRequested
- [ ] contactRequested
- [ ] biometricManagerUpdated
- [ ] biometricAuthRequested
- [ ] biometricTokenUpdated
