import Foundation
import Speech
import AVFoundation

/// Wraps SFSpeechRecognizer for in-app dictation. Used by the SearchView mic
/// button so users can dictate filter terms without typing. Falls back
/// gracefully when the user denies microphone or speech permission, with a
/// one-tap settings deep-link.
///
/// IOS-DISCOVER-2026-007.
@MainActor
@Observable
final class SpeechDictationService {
    static let shared = SpeechDictationService()

    enum Status {
        case idle
        case listening
        case denied
        case unavailable
        case error(String)
    }

    private(set) var status: Status = .idle
    private(set) var transcript: String = ""
    /// The transcript of the last session that finished on its own. The
    /// search screen commits it (IOS-DD-SEARCH-13).
    private(set) var lastFinalTranscript: String?

    /// Convenience for SwiftUI bindings — true when actively recording.
    var statusIsListening: Bool {
        if case .listening = status { return true }
        return false
    }

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    /// Bumped by every start(). A recognition callback carries the generation
    /// it was started under and is dropped once a newer session exists: a
    /// late isFinal or cancel error from session A used to stop session B
    /// (IOS-DD-SEARCH-13).
    private var generation = 0
    /// The generation the user stopped. Its trailing cancellation error is
    /// expected and must not show as a failure.
    private var stoppedGeneration: Int?

    /// Words dictation should prefer: area names, categories and venues
    /// people search for.
    static let vocabulary: [String] = LocationArea.allCases.map(\.rawValue)
        + EventCategory.allCases.map(\.displayName)
        + ["Hoyt Sherman", "Wells Fargo Arena", "Jordan Creek", "Court Avenue", "Principal Park",
           "Blank Park Zoo", "Science Center of Iowa", "Des Moines Art Center"]

    private init() {}

    static func shouldApply(callbackGeneration: Int, current: Int) -> Bool {
        callbackGeneration == current
    }

    /// Both permissions granted, read without prompting.
    static func permissionsGranted() -> Bool {
        SFSpeechRecognizer.authorizationStatus() == .authorized
            && AVAudioApplication.shared.recordPermission == .granted
    }

    /// Leaves `.denied` once the user has granted access in Settings. It used
    /// to change only inside start(), which the mic button never called while
    /// denied, so the button stayed crossed out until relaunch.
    func refreshPermissionStatus() {
        if case .denied = status, Self.permissionsGranted() {
            status = .idle
        }
    }

    func toggle() async {
        switch status {
        case .listening:
            stop()
        default:
            await start()
        }
    }

    func start() async {
        // Permission gates
        let speechAuth = await requestSpeechAuth()
        guard speechAuth == .authorized else {
            status = .denied
            return
        }
        let micAuth = await requestMicrophoneAuth()
        guard micAuth else {
            status = .denied
            return
        }
        guard let recognizer, recognizer.isAvailable else {
            status = .unavailable
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .search
            request.contextualStrings = Self.vocabulary
            // Prefer on-device recognition where supported so recorded audio
            // never leaves the device — keeps the privacy posture clean and
            // avoids declaring Audio Data collection (IOS-AUDIT-SEC-009).
            if recognizer.supportsOnDeviceRecognition {
                request.requiresOnDeviceRecognition = true
            }
            self.request = request

            let inputNode = audioEngine.inputNode
            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
                request.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()

            transcript = ""
            lastFinalTranscript = nil
            status = .listening
            generation += 1
            let gen = generation

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                Task { @MainActor in
                    guard SpeechDictationService.shouldApply(callbackGeneration: gen, current: self.generation) else { return }
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                        if result.isFinal {
                            self.lastFinalTranscript = self.transcript
                            self.stop(userInitiated: false)
                        }
                    }
                    if let error {
                        // After the user's own stop, the task ends with a
                        // cancellation error; that is not a failure.
                        if self.stoppedGeneration == gen { return }
                        self.status = .error(error.localizedDescription)
                        self.stop(userInitiated: false)
                    }
                }
            }
        } catch {
            status = .error(error.localizedDescription)
            // The session was already activated above, so a throw from
            // audioEngine.start() - route contention, an interruption, another
            // app holding the mic - would otherwise leave .record + .duckOthers
            // engaged with a tap still installed: the exact symptom this story
            // is about, on the one path stop() was never reached from
            // (IOS-AUDIT-PERF-016 AC3).
            //
            // Safe to call here: stop() only resets status when it is
            // .listening, so the error set on the line above survives, and both
            // removing an uninstalled tap and stopping an unstarted engine are
            // no-ops.
            stop()
        }
    }

    func stop(userInitiated: Bool = true) {
        if userInitiated { stoppedGeneration = generation }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        // Deactivate the recording session so the mic hardware is released and
        // other apps' audio un-ducks — otherwise the session stays active and
        // drains battery until the app is killed (IOS-AUDIT-PERF-016).
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            #if DEBUG
            AppLogger.general.warning("Failed to deactivate audio session: \(error.localizedDescription)")
            #endif
        }
        if case .listening = status {
            status = .idle
        }
    }

    // MARK: - Permissions

    private func requestSpeechAuth() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    private func requestMicrophoneAuth() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    /// Open Settings → app permissions. The mic button shows a "Settings"
    /// affordance when status == .denied so users can fix permission denial
    /// without leaving the search context.
    @MainActor
    static func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

import UIKit
