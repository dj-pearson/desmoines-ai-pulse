import UIKit
import Capacitor
import WebKit

/**
 * MainViewController
 *
 * Subclasses CAPBridgeViewController to customise the WKWebView configuration
 * before the web layer is loaded. This is the recommended Capacitor pattern for
 * properties that are not exposed through capacitor.config.ts.
 *
 * To activate: open Main.storyboard, select the ViewController scene, open the
 * Identity Inspector (⌥⌘3), and change the Custom Class from
 * "CAPBridgeViewController" to "MainViewController".
 */
class MainViewController: CAPBridgeViewController {

    // MARK: - WKWebView Configuration

    override func webViewConfiguration(for instanceConfiguration: CAPInstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)

        // ----------------------------------------------------------------
        // Allow HTML5 <video> to play inline (without entering fullscreen).
        // Required for WebVTT caption and audio-description tracks to work
        // inside the WKWebView on iPhone and iPad.
        // ----------------------------------------------------------------
        configuration.allowsInlineMediaPlayback = true

        // Do not require a user gesture to begin playback (mirrors web behaviour).
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // ----------------------------------------------------------------
        // iPad: allow Picture-in-Picture so users can continue watching
        // while browsing other content.
        // ----------------------------------------------------------------
        configuration.allowsPictureInPictureMediaPlayback = true

        return configuration
    }
}
