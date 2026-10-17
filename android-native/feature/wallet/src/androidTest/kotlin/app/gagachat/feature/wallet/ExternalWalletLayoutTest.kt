package app.gagachat.feature.wallet

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Rule
import org.junit.Test

class ExternalWalletLayoutTest {
 @get:Rule val compose=createComposeRule()
 @Test fun transferRequiresReviewBeforeOpeningAnyWallet() {
  compose.setContent { GagaTheme { TransferRequestDialog("bsc",{}) } }
  compose.onNodeWithText("Recipient address").performTextInput("0x1111111111111111111111111111111111111111")
  compose.onNodeWithText("Amount (BNB)").performTextInput("0.000000000000000001")
  compose.onNodeWithText("Review").performClick()
  compose.onNodeWithText("Review wallet request").assertIsDisplayed()
  compose.onNodeWithText("0.000000000000000001 BNB").assertIsDisplayed()
  compose.onNodeWithText("Open external wallet").assertIsDisplayed()
  // Deliberately do not launch or authorize an external transaction.
 }
 @Test fun invalidRequestCannotReachWalletHandoff() {
  compose.setContent { GagaTheme(darkTheme=true,textScale=2f) { TransferRequestDialog("ethereum",{}) } }
  compose.onNodeWithText("Review").performClick()
  compose.onNodeWithText("Open external wallet").assertDoesNotExist()
  compose.onNodeWithText("Enter an exact positive amount").assertIsDisplayed()
 }
}
