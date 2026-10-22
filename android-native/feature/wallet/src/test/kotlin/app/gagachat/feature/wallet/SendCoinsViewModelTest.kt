package app.gagachat.feature.wallet

import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.WalletRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.model.User
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SendCoinsViewModelTest {
    @Test fun repeatedConfirmationBeforeCoroutineRunsSendsOnce() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val wallet = mockk<WalletRepository>()
            val friends = mockk<FriendsRepository>(relaxed = true)
            every { friends.friends } returns MutableStateFlow(emptyList<Friend>())
            coEvery { wallet.sendCoins(any(), any(), any(), any()) } returns app.gagachat.core.common.result.AppResult.Success(app.gagachat.core.model.Wallet("wallet", "sender", 90))
            val friend = mockk<Friend>()
            val user = mockk<User>()
            every { friend.user } returns user
            every { user.id } returns "recipient"
            every { user.displayName } returns "Recipient"
            val vm = SendCoinsViewModel(wallet, friends)
            vm.select(friend)
            vm.onAmountChange("10")
            vm.requestConfirmation()
            vm.send {}
            vm.send {}
            runCurrent()
            coVerify(exactly = 1) { wallet.sendCoins("recipient", "Recipient", 10, null) }
        } finally { Dispatchers.resetMain() }
    }

    @Test fun sendWithoutConfirmationDoesNotCallRepository() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val wallet = mockk<WalletRepository>()
            val friends = mockk<FriendsRepository>(relaxed = true)
            every { friends.friends } returns MutableStateFlow(emptyList<Friend>())
            val friend = mockk<Friend>()
            val vm = SendCoinsViewModel(wallet, friends)
            vm.select(friend)
            vm.onAmountChange("10")
            vm.send {}
            runCurrent()
            coVerify(exactly = 0) { wallet.sendCoins(any(), any(), any(), any()) }
        } finally { Dispatchers.resetMain() }
    }
}
