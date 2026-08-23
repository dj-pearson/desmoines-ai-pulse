import SwiftUI

/// Full-screen image viewer with pinch-to-zoom, double-tap zoom, and swipe-down-to-dismiss.
struct FullScreenImageViewer: View {
    let imageUrl: String?
    @Binding var isPresented: Bool

    /// What the image is of (IOS-AUDIT-UX-052 AC2).
    ///
    /// Defaults to a generic string so no call site breaks, but every real one
    /// passes the subject - without it VoiceOver announced nothing at all for a
    /// view whose entire content is one image.
    var accessibilityDescription: String = "Image"

    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var dragOffset: CGSize = .zero
    @State private var backgroundOpacity: Double = 1.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let minScale: CGFloat = 0.5
    private let maxScale: CGFloat = 5.0
    private let dismissThreshold: CGFloat = 150

    /// Settle animation for zoom/pan/dismiss — linear & quick under Reduce Motion
    /// (IOS-COMPLY-003) so the spring bounce doesn't fire for motion-sensitive users.
    private var settle: Animation {
        reduceMotion ? .linear(duration: 0.1) : .spring(duration: 0.3)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black
                    .opacity(backgroundOpacity)
                    .ignoresSafeArea()

                // Image — full resolution (downsamples:false) so pinch-to-zoom
                // stays sharp at up to 5x (IOS-POLISH-001).
                CachedAsyncImage(url: imageUrl, downsamples: false) {
                    ProgressView()
                        .tint(.white)
                }
                .aspectRatio(contentMode: .fit)
                // IOS-AUDIT-UX-052 AC2. Pinch and double-tap are the only ways to
                // zoom, and neither exists for a VoiceOver user - the adjustable
                // action is what makes the feature reachable at all, rather than
                // a nicety on top of it.
                .accessibilityElement()
                .accessibilityLabel(accessibilityDescription)
                .accessibilityValue("Zoomed \(Int(scale.rounded() * 100)) percent")
                .accessibilityHint("Swipe up or down to zoom")
                .accessibilityAdjustableAction { direction in
                    let step: CGFloat = 0.5
                    switch direction {
                    case .increment: scale = min(scale + step, maxScale)
                    case .decrement: scale = max(scale - step, 1.0)
                    @unknown default: break
                    }
                    lastScale = scale
                    // Recentre when zoomed back out, matching what the pinch
                    // gesture does on end - otherwise the image can be left
                    // panned off-screen with no way to bring it back.
                    if scale <= 1.0 {
                        offset = .zero
                        lastOffset = .zero
                    }
                }
                .scaleEffect(scale)
                .offset(x: offset.width, y: offset.height + dragOffset.height)
                .gesture(
                    MagnifyGesture()
                        .onChanged { value in
                            let newScale = lastScale * value.magnification
                            scale = min(max(newScale, minScale), maxScale)
                        }
                        .onEnded { _ in
                            withAnimation(settle) {
                                if scale < 1.0 {
                                    scale = 1.0
                                }
                                lastScale = scale
                                if scale <= 1.0 {
                                    offset = .zero
                                    lastOffset = .zero
                                }
                            }
                        }
                )
                .simultaneousGesture(
                    DragGesture()
                        .onChanged { value in
                            if scale <= 1.0 {
                                // Swipe-down-to-dismiss
                                dragOffset = CGSize(width: 0, height: max(0, value.translation.height))
                                backgroundOpacity = Double(1.0 - (dragOffset.height / 400))
                            } else {
                                // Pan around zoomed image
                                offset = CGSize(
                                    width: lastOffset.width + value.translation.width,
                                    height: lastOffset.height + value.translation.height
                                )
                            }
                        }
                        .onEnded { value in
                            if scale <= 1.0 {
                                if dragOffset.height > dismissThreshold {
                                    dismiss()
                                } else {
                                    withAnimation(settle) {
                                        dragOffset = .zero
                                        backgroundOpacity = 1.0
                                    }
                                }
                            } else {
                                lastOffset = offset
                            }
                        }
                )
                .onTapGesture(count: 2) {
                    withAnimation(settle) {
                        if scale > 1.0 {
                            scale = 1.0
                            lastScale = 1.0
                            offset = .zero
                            lastOffset = .zero
                        } else {
                            scale = 2.5
                            lastScale = 2.5
                        }
                    }
                }

                // Close button
                VStack {
                    HStack {
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, .white.opacity(0.3))
                        }
                        .padding()
                        .minHitTarget()
                        .accessibilityLabel("Close image viewer")
                    }
                    Spacer()
                }
            }
        }
        .statusBarHidden()
    }

    private func dismiss() {
        withAnimation(.easeOut(duration: 0.2)) {
            backgroundOpacity = 0
            dragOffset = CGSize(width: 0, height: 500)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            isPresented = false
        }
    }
}

#Preview {
    FullScreenImageViewer(imageUrl: nil, isPresented: .constant(true))
}
