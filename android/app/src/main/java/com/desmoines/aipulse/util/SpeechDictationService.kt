package com.desmoines.aipulse.util

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wraps Android SpeechRecognizer for in-app dictation. Mirrors iOS
 * SpeechDictationService.swift — same Status states, same partial-result
 * streaming.
 *
 * IOS-DISCOVER-2026-007.
 */
@Singleton
class SpeechDictationService @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {

    sealed class Status {
        data object Idle : Status()
        data object Listening : Status()
        data object Denied : Status()
        data object Unavailable : Status()
        data class Error(val message: String) : Status()
    }

    private val _status = MutableStateFlow<Status>(Status.Idle)
    val status: StateFlow<Status> = _status.asStateFlow()

    private val _transcript = MutableStateFlow("")
    val transcript: StateFlow<String> = _transcript.asStateFlow()

    private var recognizer: SpeechRecognizer? = null

    val isListening: Boolean get() = _status.value is Status.Listening

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun start() {
        if (_status.value is Status.Listening) return
        if (!isAvailable()) {
            _status.value = Status.Unavailable
            return
        }
        val sr = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = sr
        sr.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                _status.value = Status.Listening
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                _status.value = when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> Status.Denied
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> Status.Error("Recognizer busy")
                    SpeechRecognizer.ERROR_NETWORK -> Status.Error("Network error")
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> Status.Error("Network timeout")
                    SpeechRecognizer.ERROR_NO_MATCH -> Status.Idle
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> Status.Idle
                    SpeechRecognizer.ERROR_CLIENT -> Status.Idle
                    else -> Status.Error("Speech recognition failed (code $error)")
                }
                cleanup()
            }
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.firstOrNull()?.let { _transcript.value = it }
                _status.value = Status.Idle
                cleanup()
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.firstOrNull()?.let { _transcript.value = it }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        _transcript.value = ""
        try {
            sr.startListening(intent)
        } catch (e: SecurityException) {
            _status.value = Status.Denied
            cleanup()
        } catch (e: Exception) {
            _status.value = Status.Error(e.message ?: "Failed to start dictation")
            cleanup()
        }
    }

    fun stop() {
        recognizer?.stopListening()
        if (_status.value is Status.Listening) _status.value = Status.Idle
    }

    fun cancel() {
        recognizer?.cancel()
        cleanup()
        if (_status.value is Status.Listening) _status.value = Status.Idle
    }

    private fun cleanup() {
        recognizer?.destroy()
        recognizer = null
    }

    fun reset() {
        _transcript.value = ""
        _status.value = Status.Idle
    }
}
