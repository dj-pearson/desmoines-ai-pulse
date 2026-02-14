import SwiftUI

/// Async image with in-memory cache and placeholder support.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: String?
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = true

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else if isLoading {
                placeholder()
                    .overlay {
                        if url != nil {
                            ProgressView()
                                .tint(.white.opacity(0.5))
                        }
                    }
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let urlString = url, let url = URL(string: urlString) else {
            isLoading = false
            return
        }

        // Check cache
        if let cached = ImageCache.shared.get(urlString) {
            image = cached
            isLoading = false
            return
        }

        isLoading = true

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let uiImage = UIImage(data: data) {
                ImageCache.shared.set(uiImage, for: urlString)
                image = uiImage
            }
        } catch {
            // Silently fail — placeholder will be shown
        }

        isLoading = false
    }
}

// MARK: - Image Cache

final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()

    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 200
        cache.totalCostLimit = 100 * 1024 * 1024 // 100 MB
    }

    func get(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func set(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
    }
}

// MARK: - Convenience init without placeholder

extension CachedAsyncImage where Placeholder == Color {
    init(url: String?) {
        self.url = url
        self.placeholder = { Color(.systemGray5) }
    }
}

#Preview {
    CachedAsyncImage(url: nil) {
        Rectangle().fill(Color.blue.opacity(0.2))
    }
    .frame(width: 200, height: 150)
    .clipShape(RoundedRectangle(cornerRadius: 12))
}
