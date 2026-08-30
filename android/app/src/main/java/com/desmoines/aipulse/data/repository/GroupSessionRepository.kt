package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.SessionParticipant
import com.desmoines.aipulse.data.model.SwipeSession
import com.desmoines.aipulse.data.model.SwipeSessionMatch
import com.desmoines.aipulse.data.remote.GroupSessionRemoteDataSource
import javax.inject.Inject
import javax.inject.Singleton

/** Hosts / joins group swipe sessions and resolves mutual matches. */
interface GroupSessionRepository {
    suspend fun createSession(hostUserId: String, mode: String): Result<SwipeSession>
    suspend fun joinByCode(code: String, userId: String, displayName: String?): Result<SwipeSession>
    suspend fun fetchSession(sessionId: String): Result<SwipeSession?>
    suspend fun fetchParticipants(sessionId: String): Result<List<SessionParticipant>>
    suspend fun fetchMatches(sessionId: String): Result<List<SwipeSessionMatch>>
    suspend fun endSession(sessionId: String): Result<Unit>
}

@Singleton
class GroupSessionRepositoryImpl @Inject constructor(
    private val remote: GroupSessionRemoteDataSource,
) : GroupSessionRepository {

    override suspend fun createSession(hostUserId: String, mode: String): Result<SwipeSession> =
        runCatching {
            val session = remote.createSession(hostUserId, mode)
            // Host is also a participant.
            remote.addParticipant(session.id, hostUserId, displayName = null)
            session
        }

    override suspend fun joinByCode(code: String, userId: String, displayName: String?): Result<SwipeSession> =
        runCatching {
            val session = remote.fetchByCode(code)
                ?: throw IllegalStateException("No session found for that code.")
            if (!session.isLive()) throw IllegalStateException("That session has ended or expired.")
            remote.addParticipant(session.id, userId, displayName)
            session
        }

    override suspend fun fetchSession(sessionId: String): Result<SwipeSession?> =
        runCatching { remote.fetchSession(sessionId) }

    override suspend fun fetchParticipants(sessionId: String): Result<List<SessionParticipant>> =
        runCatching { remote.fetchParticipants(sessionId) }

    override suspend fun fetchMatches(sessionId: String): Result<List<SwipeSessionMatch>> =
        runCatching { remote.fetchMatches(sessionId) }

    override suspend fun endSession(sessionId: String): Result<Unit> =
        runCatching { remote.endSession(sessionId) }
}
