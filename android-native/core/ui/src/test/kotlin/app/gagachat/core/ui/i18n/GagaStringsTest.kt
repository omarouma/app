package app.gagachat.core.ui.i18n

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Guards the release rule "complete translations only" (RELEASE_ACCEPTANCE §11):
 * every language offered in the picker must translate every key, and no key may
 * be blank. Adding a language without a full table — or adding a key and
 * forgetting a language — fails here.
 */
class GagaStringsTest {

    private val allLanguages: Map<String, GagaStrings> = mapOf(
        GagaLanguages.ENGLISH to EnglishStrings,
        GagaLanguages.BENGALI to BengaliStrings,
        GagaLanguages.CHINESE to ChineseStrings,
    )

    /** Reflects the non-blank String getters of the table, keyed by property name. */
    private fun stringProperties(s: GagaStrings): Map<String, String> =
        GagaStrings::class.java.methods
            .filter {
                it.parameterCount == 0 &&
                    it.returnType == String::class.java &&
                    it.name.startsWith("get")
            }
            .associate {
                it.name.removePrefix("get").replaceFirstChar { c -> c.lowercase() } to
                    (it.invoke(s) as String)
            }

    @Test
    fun `every supported language resolves to a table`() {
        assertThat(GagaLanguages.supported).containsExactly(
            GagaLanguages.ENGLISH,
            GagaLanguages.BENGALI,
            GagaLanguages.CHINESE,
        )
        GagaLanguages.supported.forEach { code ->
            assertThat(gagaStringsFor(code)).isNotNull()
        }
    }

    @Test
    fun `unknown language code falls back to english`() {
        assertThat(gagaStringsFor("fr")).isEqualTo(EnglishStrings)
        assertThat(gagaStringsFor("")).isEqualTo(EnglishStrings)
    }

    @Test
    fun `every language translates every key`() {
        val englishKeys = stringProperties(EnglishStrings).keys
        assertThat(englishKeys).isNotEmpty()
        allLanguages.forEach { (code, table) ->
            val props = stringProperties(table)
            assertThat(props.keys).isEqualTo(englishKeys)
            props.forEach { (key, value) ->
                assertThat("$code.$key").isNotEmpty()
                assertThat(value.trim()).isNotEmpty()
            }
        }
    }

    @Test
    fun `navigation labels are localized for bengali and chinese`() {
        assertThat(BengaliStrings.navChats).isNotEqualTo(EnglishStrings.navChats)
        assertThat(BengaliStrings.navMe).isNotEqualTo(EnglishStrings.navMe)
        assertThat(ChineseStrings.navChats).isNotEqualTo(EnglishStrings.navChats)
        assertThat(ChineseStrings.navMe).isNotEqualTo(EnglishStrings.navMe)
        // Bengali and Chinese must not collapse to the same string.
        assertThat(BengaliStrings.navPeople).isNotEqualTo(ChineseStrings.navPeople)
    }

    @Test
    fun `settings result copy pluralises for english`() {
        assertThat(EnglishStrings.settingsResults(1)).isEqualTo("1 RESULT")
        assertThat(EnglishStrings.settingsResults(3)).isEqualTo("3 RESULTS")
        assertThat(ChineseStrings.settingsResults(3)).isEqualTo("3 个结果")
        assertThat(BengaliStrings.settingsResults(1)).isEqualTo("1 টি ফলাফল")
    }

    @Test
    fun `settings no-match interpolates the query`() {
        assertThat(EnglishStrings.settingsNoMatch("wifi")).contains("wifi")
        assertThat(BengaliStrings.settingsNoMatch("wifi")).contains("wifi")
        assertThat(ChineseStrings.settingsNoMatch("wifi")).contains("wifi")
    }
}
