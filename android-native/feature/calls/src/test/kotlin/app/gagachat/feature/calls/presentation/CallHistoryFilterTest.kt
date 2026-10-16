package app.gagachat.feature.calls.presentation

import app.gagachat.core.model.*
import org.junit.Assert.*
import org.junit.Test

class CallHistoryFilterTest {
    private val incoming = CallSession("in", "chat", "peer", status = CallStatus.MISSED)
    @Test fun outgoingUnansweredCallIsNotAnIncomingMissedCall() {
        assertTrue(matchesCallFilter(incoming, CallHistoryFilter.MISSED))
        assertFalse(matchesCallFilter(incoming.copy(isOutgoing = true), CallHistoryFilter.MISSED))
    }
    @Test fun mediaAndDirectionFiltersUseActualCallFields() {
        val video = incoming.copy(type = CallType.VIDEO, isOutgoing = true)
        assertTrue(matchesCallFilter(video, CallHistoryFilter.VIDEO))
        assertTrue(matchesCallFilter(video, CallHistoryFilter.OUTGOING))
        assertFalse(matchesCallFilter(video, CallHistoryFilter.VOICE))
        assertFalse(matchesCallFilter(video, CallHistoryFilter.INCOMING))
    }
}
