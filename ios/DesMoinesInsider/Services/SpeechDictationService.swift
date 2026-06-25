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

    /// Convenience for SwiftUI bindings — true when actively recording.
    var statusIsListening: Bool {
        if case .listening = status { return true }
        return false
    }

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private init() {}

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
            status = .listening

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                Task { @MainActor in
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                        if result.isFinal {
                            self.stop()
                        }
                    }
                    if let error {
                        self.status = .error(error.localizedDescription)
                        self.stop()
                    }
                }
            }
        } catch {
            status = .error(error.localizedDescription)
        }
    }

    func stop() {
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
