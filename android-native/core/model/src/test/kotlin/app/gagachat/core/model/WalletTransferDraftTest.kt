package app.gagachat.core.model

import org.junit.Assert.*
import org.junit.Test

class WalletTransferDraftTest {
 private val address="0x1111111111111111111111111111111111111111"
 @Test fun evmRequestsPinChainAndExactBaseUnits() {
  assertEquals("ethereum:pay-$address@56?value=1",WalletTransferDraft("bsc",address,"0.000000000000000001").uri())
  assertEquals("ethereum:pay-$address@1?value=1000000000000000000",WalletTransferDraft("ethereum",address,"1").uri())
 }
 @Test fun rejectsInjectionInvalidNetworksAndUnrepresentableAmounts() {
  for(draft in listOf(WalletTransferDraft("bsc",address+"?value=999","1"),WalletTransferDraft("ton",address,"1"),WalletTransferDraft("ethereum",address,"0"),WalletTransferDraft("ethereum",address,"1e9"),WalletTransferDraft("bitcoin","bc1q"+"q".repeat(38),"0.000000001"))) {
   assertTrue(runCatching{draft.uri()}.isFailure)
  }
 }
}
