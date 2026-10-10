package app.gagachat.feature.auth.presentation.welcome

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.preferences.AppIntroPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Records first-run intro progress (Master Spec §C — startup journey).
 *
 * Kept deliberately tiny: the Welcome and Introduction screens are purely
 * presentational, so the only state they own is "has the user already seen
 * this?" — persisted install-wide via [AppIntroPreferences].
 */
@HiltViewModel
class WelcomeViewModel @Inject constructor(
    private val introPreferences: AppIntroPreferences,
) : ViewModel() {

    /** Called once the Welcome screen has been displayed. */
    fun onWelcomeShown() {
        viewModelScope.launch { introPreferences.markWelcomeSeen() }
    }

    /** Called when the user finishes or skips the Introduction tour. */
    fun onIntroPassed() {
        viewModelScope.launch { introPreferences.markIntroComplete() }
    }
}
