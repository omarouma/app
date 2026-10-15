# GaGa 2.8.3 screen and release audit

## Coverage and limits
Source-level inventory and layout/interaction risk scan across the feature screen files below. This is not a signed-in walkthrough of every screen. The native emulator checks cover shared UI and Today, plus new 320dp chat header and enlarged-label button cases. Real-account two-device calls, push, media, sharing, physical keyboard/insets and production backend acceptance remain outstanding.

## Fixes included
- Constrained avatar/title layout, density-aware header height, compact call menu and selection action menu (PR #87).
- Shared primary/secondary and account sign-out buttons grow with wrapped or enlarged labels.
- Email verification and unsupported-phone recovery content can scroll when keyboard or text consumes vertical space.
- Notification toolbar mark-all-read uses a compact accessible icon; bulk actions scroll horizontally.
- Update checks retry transient registry failures and do not mark a release notified when app/system/channel notification settings prevent posting.
- New release 2.8.3/code58; preserve approved signing identity and immutable, hash-verified update publication.

## Remaining implementations (not silently presented as live)
- China Direct supplier pricing, checkout, fulfilment and tracking remain preview-only.
- Business/team workspaces, premium billing and delivery services remain explicitly Coming soon.
- Full Bangla/Chinese localization and full screen-by-screen design parity require more work.
- Device acceptance of incoming calls/background push, account switching and shared records remains necessary.
- Future unattended CI signing-secret setup and Google Play account rollout are not completed by a local release signature.

## Screen source inventory
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/intro/IntroductionScreen.kt`
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/login/LoginScreen.kt`
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/otp/OtpScreen.kt`
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/recovery/ResetPasswordScreen.kt`
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/register/RegisterScreen.kt`
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/splash/SplashScreen.kt`
- `android-native/feature/auth/src/main/kotlin/app/gagachat/feature/auth/presentation/welcome/WelcomeScreen.kt`
- `android-native/feature/calls/src/main/kotlin/app/gagachat/feature/calls/presentation/ActiveCallScreen.kt`
- `android-native/feature/calls/src/main/kotlin/app/gagachat/feature/calls/presentation/CallHistoryScreen.kt`
- `android-native/feature/chat/src/main/kotlin/app/gagachat/feature/chat/presentation/ChatInfoScreen.kt`
- `android-native/feature/chat/src/main/kotlin/app/gagachat/feature/chat/presentation/ChatScreen.kt`
- `android-native/feature/contacts/src/main/kotlin/app/gagachat/feature/contacts/presentation/ContactsScreen.kt`
- `android-native/feature/dailylife/src/main/kotlin/app/gagachat/feature/dailylife/DailyLifeScreen.kt`
- `android-native/feature/dailylife/src/main/kotlin/app/gagachat/feature/dailylife/SafeScreen.kt`
- `android-native/feature/groups/src/main/kotlin/app/gagachat/feature/groups/CreateGroupScreen.kt`
- `android-native/feature/groups/src/main/kotlin/app/gagachat/feature/groups/GroupInfoScreen.kt`
- `android-native/feature/groups/src/main/kotlin/app/gagachat/feature/groups/GroupsScreen.kt`
- `android-native/feature/home/src/main/kotlin/app/gagachat/feature/home/presentation/HomeScreen.kt`
- `android-native/feature/home/src/main/kotlin/app/gagachat/feature/home/presentation/MoreScreen.kt`
- `android-native/feature/onboarding/src/main/kotlin/app/gagachat/feature/onboarding/PermissionsScreen.kt`
- `android-native/feature/onboarding/src/main/kotlin/app/gagachat/feature/onboarding/PrivacyPreferencesScreen.kt`
- `android-native/feature/onboarding/src/main/kotlin/app/gagachat/feature/onboarding/ProfileSetupScreen.kt`
- `android-native/feature/onboarding/src/main/kotlin/app/gagachat/feature/onboarding/WelcomeCompleteScreen.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/DiscoverScreen.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/PeopleScreen.kt`
- `android-native/feature/profile/src/main/kotlin/app/gagachat/feature/profile/presentation/ProfileScreen.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/AddByCodeScreen.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/MyQrScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/AppUpdateScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/BlockedUsersScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/EditProfileScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/GettingStartedScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/HelpSupportScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/NotificationInboxScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/SavedMessagesScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/SettingsCenterScreens.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/SettingsScreen.kt`
- `android-native/feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/SettingsSubScreens.kt`
- `android-native/feature/wallet/src/main/kotlin/app/gagachat/feature/wallet/SendCoinsScreen.kt`
- `android-native/feature/wallet/src/main/kotlin/app/gagachat/feature/wallet/WalletScreen.kt`
