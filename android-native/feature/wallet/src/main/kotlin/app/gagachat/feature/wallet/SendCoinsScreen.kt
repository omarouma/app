package app.gagachat.feature.wallet

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens

/** Send coins to a friend (Master Spec §C). */
@Composable
fun SendCoinsScreen(
    onSent: () -> Unit,
    onBack: () -> Unit,
    viewModel: SendCoinsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "Send coins", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8)) {
                GagaTextField(
                    value = state.amountText,
                    onValueChange = viewModel::onAmountChange,
                    label = "Amount (coins)",
                    leadingIcon = Icons.Filled.AttachMoney,
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Next,
                )
                Spacer(Modifier.height(GagaDimens.space12))
                GagaTextField(
                    value = state.note,
                    onValueChange = viewModel::onNoteChange,
                    label = "Note (optional)",
                    leadingIcon = Icons.Filled.Notes,
                    imeAction = ImeAction.Done,
                )
            }

            GagaSectionHeader("To (${state.selected?.user?.displayName ?: "choose a friend"})")

            LazyColumn(modifier = Modifier.weight(1f)) {
                items(state.friends, key = { it.user.id }) { friend ->
                    val selected = state.selected?.user?.id == friend.user.id
                    GagaListRow(
                        title = friend.user.displayName,
                        subtitle = friend.user.username?.let { "@$it" },
                        avatar = { GagaAvatar(imageUrl = friend.user.avatar, name = friend.user.displayName) },
                        trailing = {
                            Checkbox(checked = selected, onCheckedChange = { viewModel.select(friend) })
                        },
                        onClick = { viewModel.select(friend) },
                    )
                }
                if (state.friends.isEmpty()) {
                    item {
                        Text(
                            text = "You have no friends to send coins to yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(GagaDimens.space16),
                        )
                    }
                }
            }

            if (state.error != null) {
                Text(
                    text = state.error!!,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = GagaDimens.space16),
                )
            }

            GagaPrimaryButton(
                text = "Send",
                onClick = { viewModel.send(onSent) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(GagaDimens.space16),
                enabled = state.canSend,
                loading = state.isSending,
            )
        }
    }
}
