package app.gagachat.core.model

import java.math.BigDecimal

/** Unsigned native-asset request. The external wallet validates, quotes fees and signs. */
data class WalletTransferDraft(val network:String,val recipient:String,val amount:String) {
 fun uri():String {
  require(amount.matches(Regex("[0-9]{1,18}(\\.[0-9]{1,18})?"))) { "Enter an exact positive amount" }
  val value=BigDecimal(amount)
  require(value.signum()>0) { "Amount must be positive" }
  return when(network) {
   "ethereum","bsc" -> {
    require(recipient.matches(Regex("0x[0-9a-fA-F]{40}")) && !recipient.matches(Regex("0x0{40}"))) { "Enter an EVM address" }
    val units=value.movePointRight(18).toBigIntegerExact().toString()
    "ethereum:pay-$recipient@${if(network=="bsc") 56 else 1}?value=$units"
   }
   "bitcoin" -> {
    require(recipient.matches(Regex("bc1[qp][023456789acdefghjklmnpqrstuvwxyz]{11,87}"))) { "Enter a Bitcoin mainnet address" }
    value.movePointRight(8).toBigIntegerExact()
    "bitcoin:$recipient?amount=${value.stripTrailingZeros().toPlainString()}"
   }
   else -> error("Wallet signing is not connected for this network")
  }
 }
}
