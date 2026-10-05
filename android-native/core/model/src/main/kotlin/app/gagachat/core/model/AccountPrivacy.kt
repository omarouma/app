package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class PrivacyAudience(val label: String) {
    EVERYONE("Everyone"), FRIENDS("Friends"), NOBODY("Nobody"),
    ONLY_ME("Only me"), SAME_AS_LAST_SEEN("Same as last seen"),
    REQUESTS("Message requests"), APPROVAL("Approval required"),
}

/** Account-wide policy. Defaults also apply when an account has no saved row. */
@Serializable
data class AccountPrivacy(
    @SerialName("last_seen") val lastSeen: PrivacyAudience = PrivacyAudience.FRIENDS,
    @SerialName("online_status") val onlineStatus: PrivacyAudience = PrivacyAudience.SAME_AS_LAST_SEEN,
    @SerialName("profile_photo") val profilePhoto: PrivacyAudience = PrivacyAudience.FRIENDS,
    val bio: PrivacyAudience = PrivacyAudience.FRIENDS,
    @SerialName("friend_list") val friendList: PrivacyAudience = PrivacyAudience.ONLY_ME,
    val phone: PrivacyAudience = PrivacyAudience.ONLY_ME,
    val email: PrivacyAudience = PrivacyAudience.ONLY_ME,
    val messages: PrivacyAudience = PrivacyAudience.FRIENDS,
    val calls: PrivacyAudience = PrivacyAudience.FRIENDS,
    @SerialName("group_invitations") val groupInvitations: PrivacyAudience = PrivacyAudience.APPROVAL,
    @SerialName("read_receipts") val readReceipts: Boolean = true,
    @SerialName("typing_indicator") val typingIndicator: Boolean = true,
    @SerialName("discover_phone") val discoverPhone: Boolean = false,
    @SerialName("discover_email") val discoverEmail: Boolean = false,
    @SerialName("discover_id") val discoverId: Boolean = true,
    @SerialName("recommendations") val recommendations: Boolean = false,
)
