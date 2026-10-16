package app.gagachat.core.ui.i18n

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * In-app localization (Master Spec §C — language selection & persistence).
 *
 * The app supports English, Bengali and Chinese. Android string resources are
 * still used for a handful of process-level strings (notification channel, app
 * lock), but the Compose surfaces read their copy from this typed table so the
 * language can be switched at runtime without a resource re-resolve and so the
 * translation set can be asserted complete in a unit test.
 *
 * Adding a language means adding a [GagaStrings] instance and listing its code in
 * [GagaLanguages.supported]; [GagaStringsTest] fails the build if any language is
 * missing a key, which enforces the release rule "complete translations only".
 */
object GagaLanguages {
    const val ENGLISH = "en"
    const val BENGALI = "bn"
    const val CHINESE = "zh"

    /** Every language offered in the picker, in display order. */
    val supported: List<String> = listOf(ENGLISH, BENGALI, CHINESE)
}

/**
 * All user-facing copy for the app's primary navigation and settings chrome.
 *
 * Kept as a flat data class (rather than a map) so a missing translation is a
 * compile error at the call site and a test failure at build time.
 */
data class GagaStrings(
    // Bottom navigation
    val navChats: String,
    val navPeople: String,
    val navCalls: String,
    val navToday: String,
    val navMe: String,

    // Settings hub
    val settingsTitle: String,
    val settingsSearchPlaceholder: String,
    val sectionAccount: String,
    val accountMyProfile: String,
    val accountEditProfile: String,
    val accountEditProfileSubtitle: String,
    val viewPlannedFeatures: String,
    val hidePlannedFeatures: String,
    val sectionPlannedFeatures: String,
    val settingsNoMatchTemplate: String,
    val settingsResultsOneTemplate: String,
    val settingsResultsManyTemplate: String,
    val signOut: String,
    val deleteAccount: String,
    val deleteAccountSubtitle: String,
    val soonBadge: String,

    // Settings sections
    val sectionPrivacySecurity: String,
    val sectionChatsNotifications: String,
    val sectionTodayDailyLife: String,
    val sectionPeople: String,
    val sectionDeviceData: String,
    val sectionHelpAbout: String,
    val sectionComingSoon: String,

    // Privacy & Security entries
    val privacyTitle: String,
    val privacySubtitle: String,
    val securityTitle: String,
    val securitySubtitle: String,
    val blockedUsersTitle: String,
    val blockedUsersSubtitle: String,
    val antiSpamTitle: String,
    val antiSpamSubtitle: String,
    val safeTitle: String,
    val safeSubtitle: String,

    // Chats & Notifications entries
    val notificationsTitle: String,
    val notificationsSubtitle: String,
    val chatsTitle: String,
    val chatsSubtitle: String,
    val callsTitle: String,
    val callsSubtitle: String,
    val searchDiscoveryTitle: String,
    val searchDiscoverySubtitle: String,

    // GaGa Today & Daily Life entries
    val routinesTitle: String,
    val routinesSubtitle: String,
    val aiAssistantTitle: String,
    val aiAssistantSubtitle: String,
    val dashboardTitle: String,
    val dashboardSubtitle: String,

    // People entries
    val peopleContactsTitle: String,
    val peopleContactsSubtitle: String,

    // Device & Data entries
    val appearanceTitle: String,
    val appearanceSubtitle: String,
    val dataStorageTitle: String,
    val dataStorageSubtitle: String,
    val networkTitle: String,
    val networkSubtitle: String,
    val multiDeviceTitle: String,
    val multiDeviceSubtitle: String,
    val backupTitle: String,
    val backupSubtitle: String,
    val widgetsTitle: String,
    val widgetsSubtitle: String,
    val languageTitle: String,
    val languageSubtitle: String,
    val accessibilityTitle: String,
    val accessibilitySubtitle: String,
    val appPermissionsTitle: String,
    val appPermissionsSubtitle: String,

    // Help & About entries
    val gettingStartedTitle: String,
    val gettingStartedSubtitle: String,
    val helpSupportTitle: String,
    val helpSupportSubtitle: String,
    val troubleshootingTitle: String,
    val troubleshootingSubtitle: String,
    val aboutTitle: String,
    val aboutSubtitle: String,

    // Coming soon entries
    val businessTitle: String,
    val businessSubtitle: String,
    val premiumTitle: String,
    val premiumSubtitle: String,
    val deliveryTitle: String,
    val deliverySubtitle: String,

    // Language screen
    val languageScreenSectionHeader: String,
    val languageSavedNote: String,
) {
    /** "No settings match "query"" with the query interpolated. */
    fun settingsNoMatch(query: String): String = settingsNoMatchTemplate.format(query)

    /** "N RESULT(S)" with correct singular/plural copy for the language. */
    fun settingsResults(count: Int): String =
        (if (count == 1) settingsResultsOneTemplate else settingsResultsManyTemplate).format(count)
}

val EnglishStrings = GagaStrings(
    navChats = "Chats",
    navPeople = "People",
    navCalls = "Calls",
    navToday = "Today",
    navMe = "Me",

    settingsTitle = "Settings",
    settingsSearchPlaceholder = "Search settings",
    sectionAccount = "ACCOUNT",
    accountMyProfile = "My profile",
    accountEditProfile = "Edit profile",
    accountEditProfileSubtitle = "Name, username, bio, photo",
    viewPlannedFeatures = "View planned features",
    hidePlannedFeatures = "Hide planned features",
    sectionPlannedFeatures = "PLANNED FEATURES",
    settingsNoMatchTemplate = "No settings match \"%s\"",
    settingsResultsOneTemplate = "%d RESULT",
    settingsResultsManyTemplate = "%d RESULTS",
    signOut = "Sign out",
    deleteAccount = "Delete account",
    deleteAccountSubtitle = "Permanently remove your account and data",
    soonBadge = "Soon",

    sectionPrivacySecurity = "Privacy & Security",
    sectionChatsNotifications = "Chats & Notifications",
    sectionTodayDailyLife = "GaGa Today & Daily Life",
    sectionPeople = "People",
    sectionDeviceData = "Device & Data",
    sectionHelpAbout = "Help & About",
    sectionComingSoon = "Coming soon",

    privacyTitle = "Privacy",
    privacySubtitle = "Read receipts, last seen and blocked users",
    securityTitle = "Security & devices",
    securitySubtitle = "App lock, sessions and account protection",
    blockedUsersTitle = "Blocked users",
    blockedUsersSubtitle = "People you've blocked",
    antiSpamTitle = "Anti-spam & trust",
    antiSpamSubtitle = "Spam, scam warnings and reporting",
    safeTitle = "GaGa Safe & location",
    safeSubtitle = "SOS, check-ins and location sharing",

    notificationsTitle = "Notifications",
    notificationsSubtitle = "Messages, groups, calls, previews and sounds",
    chatsTitle = "Chats & messaging",
    chatsSubtitle = "Sending, media and history defaults",
    callsTitle = "Calls",
    callsSubtitle = "Call handling, audio routing and diagnostics",
    searchDiscoveryTitle = "Search & discovery",
    searchDiscoverySubtitle = "Search scope, filters and history",

    routinesTitle = "Daily routines & habits",
    routinesSubtitle = "Briefings, goals, focus and planning",
    aiAssistantTitle = "GaGa AI Assistant",
    aiAssistantSubtitle = "Assistant, suggestions and personalization",
    dashboardTitle = "Dashboard & navigation",
    dashboardSubtitle = "Default tab, layout and formats",

    peopleContactsTitle = "People & contacts",
    peopleContactsSubtitle = "Requests, findability and contact sync",

    appearanceTitle = "Appearance",
    appearanceSubtitle = "Theme and chat background",
    dataStorageTitle = "Data & storage",
    dataStorageSubtitle = "Auto-download, quality and cache",
    networkTitle = "Network & performance",
    networkSubtitle = "Data saver, battery and quality",
    multiDeviceTitle = "Multi-device & sync",
    multiDeviceSubtitle = "Devices, sessions and synchronization",
    backupTitle = "Backup & restore",
    backupSubtitle = "Backups, restore and migration",
    widgetsTitle = "Widgets & shortcuts",
    widgetsSubtitle = "Home screen widgets and quick actions",
    languageTitle = "Language",
    languageSubtitle = "App display language",
    accessibilityTitle = "Accessibility",
    accessibilitySubtitle = "Text size and display options",
    appPermissionsTitle = "App permissions",
    appPermissionsSubtitle = "Camera, microphone, contacts, media and more",

    gettingStartedTitle = "Getting started",
    gettingStartedSubtitle = "Revisit GaGa's three advantages and quick tips",
    helpSupportTitle = "Help & support",
    helpSupportSubtitle = "FAQs and contact support",
    troubleshootingTitle = "Troubleshooting",
    troubleshootingSubtitle = "Diagnostics and connection tests",
    aboutTitle = "About GaGa Chat",
    aboutSubtitle = "Version and legal information",

    businessTitle = "Business & team",
    businessSubtitle = "Workspaces, roles and shared tools",
    premiumTitle = "Premium & subscription",
    premiumSubtitle = "Plans and billing",
    deliveryTitle = "Delivery & services",
    deliverySubtitle = "Local services and deliveries",

    languageScreenSectionHeader = "APP LANGUAGE",
    languageSavedNote = "Your choice is saved on this device.",
)

val BengaliStrings = GagaStrings(
    navChats = "চ্যাট",
    navPeople = "লোকজন",
    navCalls = "কল",
    navToday = "আজ",
    navMe = "আমি",

    settingsTitle = "সেটিংস",
    settingsSearchPlaceholder = "সেটিংস খুঁজুন",
    sectionAccount = "অ্যাকাউন্ট",
    accountMyProfile = "আমার প্রোফাইল",
    accountEditProfile = "প্রোফাইল সম্পাদনা",
    accountEditProfileSubtitle = "নাম, ব্যবহারকারীনাম, বায়ো, ছবি",
    viewPlannedFeatures = "পরিকল্পিত ফিচার দেখুন",
    hidePlannedFeatures = "পরিকল্পিত ফিচার লুকান",
    sectionPlannedFeatures = "পরিকল্পিত ফিচার",
    settingsNoMatchTemplate = "\"%s\" এর সাথে কোনো সেটিং মেলেনি",
    settingsResultsOneTemplate = "%d টি ফলাফল",
    settingsResultsManyTemplate = "%d টি ফলাফল",
    signOut = "সাইন আউট",
    deleteAccount = "অ্যাকাউন্ট মুছুন",
    deleteAccountSubtitle = "আপনার অ্যাকাউন্ট ও ডেটা স্থায়ীভাবে মুছে ফেলুন",
    soonBadge = "শীঘ্রই",

    sectionPrivacySecurity = "গোপনীয়তা ও নিরাপত্তা",
    sectionChatsNotifications = "চ্যাট ও বিজ্ঞপ্তি",
    sectionTodayDailyLife = "গাগা টুডে ও দৈনন্দিন জীবন",
    sectionPeople = "লোকজন",
    sectionDeviceData = "ডিভাইস ও ডেটা",
    sectionHelpAbout = "সহায়তা ও পরিচিতি",
    sectionComingSoon = "শীঘ্রই আসছে",

    privacyTitle = "গোপনীয়তা",
    privacySubtitle = "রিড রিসিট, সর্বশেষ দেখা এবং ব্লক করা ব্যবহারকারী",
    securityTitle = "নিরাপত্তা ও ডিভাইস",
    securitySubtitle = "অ্যাপ লক, সেশন এবং অ্যাকাউন্ট সুরক্ষা",
    blockedUsersTitle = "ব্লক করা ব্যবহারকারী",
    blockedUsersSubtitle = "আপনি যাদের ব্লক করেছেন",
    antiSpamTitle = "অ্যান্টি-স্প্যাম ও বিশ্বাস",
    antiSpamSubtitle = "স্প্যাম, প্রতারণার সতর্কতা ও রিপোর্ট",
    safeTitle = "গাগা সেফ ও লোকেশন",
    safeSubtitle = "SOS, চেক-ইন এবং লোকেশন শেয়ারিং",

    notificationsTitle = "বিজ্ঞপ্তি",
    notificationsSubtitle = "বার্তা, গ্রুপ, কল, প্রিভিউ ও শব্দ",
    chatsTitle = "চ্যাট ও মেসেজিং",
    chatsSubtitle = "পাঠানো, মিডিয়া ও ইতিহাসের ডিফল্ট",
    callsTitle = "কল",
    callsSubtitle = "কল পরিচালনা, অডিও রাউটিং ও ডায়াগনস্টিকস",
    searchDiscoveryTitle = "সার্চ ও আবিষ্কার",
    searchDiscoverySubtitle = "সার্চের পরিধি, ফিল্টার ও ইতিহাস",

    routinesTitle = "দৈনিক রুটিন ও অভ্যাস",
    routinesSubtitle = "ব্রিফিং, লক্ষ্য, ফোকাস ও পরিকল্পনা",
    aiAssistantTitle = "গাগা এআই সহকারী",
    aiAssistantSubtitle = "সহকারী, পরামর্শ ও ব্যক্তিগতকরণ",
    dashboardTitle = "ড্যাশবোর্ড ও নেভিগেশন",
    dashboardSubtitle = "ডিফল্ট ট্যাব, লেআউট ও ফরম্যাট",

    peopleContactsTitle = "লোকজন ও পরিচিতি",
    peopleContactsSubtitle = "অনুরোধ, খুঁজে পাওয়া এবং পরিচিতি সিঙ্ক",

    appearanceTitle = "চেহারা",
    appearanceSubtitle = "থিম ও চ্যাট ব্যাকগ্রাউন্ড",
    dataStorageTitle = "ডেটা ও স্টোরেজ",
    dataStorageSubtitle = "অটো-ডাউনলোড, গুণমান ও ক্যাশে",
    networkTitle = "নেটওয়ার্ক ও পারফরম্যান্স",
    networkSubtitle = "ডেটা সেভার, ব্যাটারি ও গুণমান",
    multiDeviceTitle = "মাল্টি-ডিভাইস ও সিঙ্ক",
    multiDeviceSubtitle = "ডিভাইস, সেশন ও সিঙ্ক্রোনাইজেশন",
    backupTitle = "ব্যাকআপ ও রিস্টোর",
    backupSubtitle = "ব্যাকআপ, রিস্টোর ও মাইগ্রেশন",
    widgetsTitle = "উইজেট ও শর্টকাট",
    widgetsSubtitle = "হোম স্ক্রিন উইজেট ও দ্রুত অ্যাকশন",
    languageTitle = "ভাষা",
    languageSubtitle = "অ্যাপের প্রদর্শন ভাষা",
    accessibilityTitle = "অ্যাক্সেসিবিলিটি",
    accessibilitySubtitle = "টেক্সট সাইজ ও ডিসপ্লে অপশন",
    appPermissionsTitle = "অ্যাপ অনুমতি",
    appPermissionsSubtitle = "ক্যামেরা, মাইক্রোফোন, পরিচিতি, মিডিয়া এবং আরও",

    gettingStartedTitle = "শুরু করা",
    gettingStartedSubtitle = "গাগার তিনটি সুবিধা ও দ্রুত টিপস আবার দেখুন",
    helpSupportTitle = "সহায়তা ও সাপোর্ট",
    helpSupportSubtitle = "সাধারণ প্রশ্ন ও সাপোর্টে যোগাযোগ",
    troubleshootingTitle = "সমস্যা সমাধান",
    troubleshootingSubtitle = "ডায়াগনস্টিকস ও সংযোগ পরীক্ষা",
    aboutTitle = "গাগা চ্যাট সম্পর্কে",
    aboutSubtitle = "সংস্করণ ও আইনি তথ্য",

    businessTitle = "ব্যবসা ও টিম",
    businessSubtitle = "ওয়ার্কস্পেস, ভূমিকা ও শেয়ার্ড টুল",
    premiumTitle = "প্রিমিয়াম ও সাবস্ক্রিপশন",
    premiumSubtitle = "প্ল্যান ও বিলিং",
    deliveryTitle = "ডেলিভারি ও সেবা",
    deliverySubtitle = "স্থানীয় সেবা ও ডেলিভারি",

    languageScreenSectionHeader = "অ্যাপের ভাষা",
    languageSavedNote = "আপনার পছন্দ এই ডিভাইসে সংরক্ষিত হয়।",
)

val ChineseStrings = GagaStrings(
    navChats = "聊天",
    navPeople = "通讯录",
    navCalls = "通话",
    navToday = "今天",
    navMe = "我",

    settingsTitle = "设置",
    settingsSearchPlaceholder = "搜索设置",
    sectionAccount = "账户",
    accountMyProfile = "我的资料",
    accountEditProfile = "编辑资料",
    accountEditProfileSubtitle = "姓名、用户名、简介、照片",
    viewPlannedFeatures = "查看计划中的功能",
    hidePlannedFeatures = "隐藏计划中的功能",
    sectionPlannedFeatures = "计划中的功能",
    settingsNoMatchTemplate = "没有与“%s”匹配的设置",
    settingsResultsOneTemplate = "%d 个结果",
    settingsResultsManyTemplate = "%d 个结果",
    signOut = "退出登录",
    deleteAccount = "删除账户",
    deleteAccountSubtitle = "永久删除你的账户和数据",
    soonBadge = "即将推出",

    sectionPrivacySecurity = "隐私与安全",
    sectionChatsNotifications = "聊天与通知",
    sectionTodayDailyLife = "GaGa 今天与日常生活",
    sectionPeople = "联系人",
    sectionDeviceData = "设备与数据",
    sectionHelpAbout = "帮助与关于",
    sectionComingSoon = "即将推出",

    privacyTitle = "隐私",
    privacySubtitle = "已读回执、最后上线时间和已屏蔽用户",
    securityTitle = "安全与设备",
    securitySubtitle = "应用锁、会话和账户保护",
    blockedUsersTitle = "已屏蔽用户",
    blockedUsersSubtitle = "你已屏蔽的人",
    antiSpamTitle = "反垃圾与信任",
    antiSpamSubtitle = "垃圾信息、诈骗警告和举报",
    safeTitle = "GaGa 安全与位置",
    safeSubtitle = "SOS、签到和位置共享",

    notificationsTitle = "通知",
    notificationsSubtitle = "消息、群组、通话、预览和声音",
    chatsTitle = "聊天与消息",
    chatsSubtitle = "发送、媒体和历史默认设置",
    callsTitle = "通话",
    callsSubtitle = "通话处理、音频路由和诊断",
    searchDiscoveryTitle = "搜索与发现",
    searchDiscoverySubtitle = "搜索范围、筛选和历史",

    routinesTitle = "日常习惯",
    routinesSubtitle = "简报、目标、专注和计划",
    aiAssistantTitle = "GaGa AI 助手",
    aiAssistantSubtitle = "助手、建议和个性化",
    dashboardTitle = "仪表板与导航",
    dashboardSubtitle = "默认标签、布局和格式",

    peopleContactsTitle = "联系人与通讯录",
    peopleContactsSubtitle = "请求、可查找性和联系人同步",

    appearanceTitle = "外观",
    appearanceSubtitle = "主题和聊天背景",
    dataStorageTitle = "数据与存储",
    dataStorageSubtitle = "自动下载、质量和缓存",
    networkTitle = "网络与性能",
    networkSubtitle = "省流量、电池和质量",
    multiDeviceTitle = "多设备与同步",
    multiDeviceSubtitle = "设备、会话和同步",
    backupTitle = "备份与恢复",
    backupSubtitle = "备份、恢复和迁移",
    widgetsTitle = "小组件与快捷方式",
    widgetsSubtitle = "主屏幕小组件和快捷操作",
    languageTitle = "语言",
    languageSubtitle = "应用显示语言",
    accessibilityTitle = "无障碍",
    accessibilitySubtitle = "文字大小和显示选项",
    appPermissionsTitle = "应用权限",
    appPermissionsSubtitle = "相机、麦克风、联系人、媒体等",

    gettingStartedTitle = "快速上手",
    gettingStartedSubtitle = "重温 GaGa 的三大优势和小技巧",
    helpSupportTitle = "帮助与支持",
    helpSupportSubtitle = "常见问题和联系支持",
    troubleshootingTitle = "故障排除",
    troubleshootingSubtitle = "诊断和连接测试",
    aboutTitle = "关于 GaGa Chat",
    aboutSubtitle = "版本和法律信息",

    businessTitle = "企业与团队",
    businessSubtitle = "工作区、角色和共享工具",
    premiumTitle = "高级版与订阅",
    premiumSubtitle = "套餐和账单",
    deliveryTitle = "配送与服务",
    deliverySubtitle = "本地服务和配送",

    languageScreenSectionHeader = "应用语言",
    languageSavedNote = "你的选择已保存在此设备上。",
)

/**
 * The translation table for the active language. Provided once near the root of
 * the composition (see [app.gagachat.core.ui.theme.GagaTheme]) and read by every
 * surface that shows localized copy.
 */
val LocalGagaStrings = staticCompositionLocalOf { EnglishStrings }

/** Resolves a persisted language code to its [GagaStrings] table. */
fun gagaStringsFor(languageCode: String): GagaStrings = when (languageCode) {
    GagaLanguages.BENGALI -> BengaliStrings
    GagaLanguages.CHINESE -> ChineseStrings
    else -> EnglishStrings
}
