import SwiftUI
import os
import CryptoKit
import ImageIO

/// Async image with two-tier cache: NSCache (memory) + FileManager (disk).
///
/// - Memory cache: 50 MB, instant (< 1 frame)
/// - Disk cache: 200 MB, fast (1-2 frames)
/// - Network: placeholder shown while loading
struct CachedAsyncImage<Placeholder: View>: View {
    let url: String?
    /// When true (default), images are decoded at most to the device's native
    /// screen width (IOS-POLISH-001), so we never hold a bitmap larger than we
    /// can display. Set false for a zoomable full-screen viewer that needs the
    /// full resolution. Full-quality bytes are always kept on disk regardless.
    var downsamples: Bool = true
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var thumbnail: UIImage?
    @State private var isLoading = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipped()
                    .transition(reduceMotion ? .opacity : .opacity.animation(.easeIn(duration: 0.25)))
            } else if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .clipped()
                    .blur(radius: 12)
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

        // Cap decode size to the device's native width unless full-res is asked
        // for (zoomable viewer). nil == no downsampling.
        let maxPixels: CGFloat? = downsamples ? UIScreen.main.nativeBounds.width : nil

        // 1. Memory cache (instant)
        if let cached = ImageCache.shared.getFromMemory(urlString) {
            image = cached
            isLoading = false
            return
        }

        // 2. Disk cache (fast) — decode at display size on read
        if let diskCached = await ImageCache.shared.getFromDisk(urlString, maxPixelSize: maxPixels) {
            ImageCache.shared.setMemory(diskCached, for: urlString, cost: diskCached.approxMemoryCost)
            image = diskCached
            isLoading = false
            return
        }

        // 3. Network — generate blur-up thumbnail while full image loads
        isLoading = true

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            // Decode at most to the display cap; keeps the in-memory bitmap small
            // for oversized source images (a 3000x2000 photo no longer allocates
            // ~24 MB for a list thumbnail).
            if let uiImage = ImageDownsampler.decode(data, maxPixelSize: maxPixels) {
                // Show tiny blurred thumbnail first for progressive feel
                if thumbnail == nil {
                    thumbnail = Self.generateThumbnail(from: uiImage)
                }

                ImageCache.shared.setMemory(uiImage, for: urlString, cost: uiImage.approxMemoryCost)
                let ttl = Self.cacheTTL(from: response)
                // Store the ORIGINAL bytes on disk (full quality); we re-decode
                // at the display cap on read.
                await ImageCache.shared.setDisk(data, for: urlString, ttl: ttl)

                // Crossfade to full image
                withAnimation(.easeIn(duration: 0.25)) {
                    image = uiImage
                }

                // Release thumbnail from memory
                thumbnail = nil
            }
        } catch {
            // Silently fail — placeholder shown
        }

        isLoading = false
    }

    /// Generate a tiny thumbnail for blur-up effect (12x12 then scaled up).
    private static func generateThumbnail(from image: UIImage) -> UIImage? {
        let size = CGSize(width: 12, height: 12)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    /// Extract max-age from Cache-Control header, default to 7 days.
    private static func cacheTTL(from response: URLResponse) -> TimeInterval {
        guard let httpResponse = response as? HTTPURLResponse,
              let cacheControl = httpResponse.value(forHTTPHeaderField: "Cache-Control"),
              let maxAgeRange = cacheControl.range(of: #"max-age=(\d+)"#, options: .regularExpression),
              let seconds = Int(cacheControl[maxAgeRange].split(separator: "=").last ?? "") else {
            return 7 * 24 * 60 * 60 // 7 days default
        }
        return TimeInterval(seconds)
    }
}

// MARK: - Two-Tier Image Cache

final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()

    // Memory tier
    private let memoryCache = NSCache<NSString, UIImage>()

    // Disk tier
    private let diskCacheDir: URL
    private let maxDiskBytes: Int = 200 * 1024 * 1024 // 200 MB
    private let diskQueue = DispatchQueue(label: "com.desmoines.aipulse.imagecache", qos: .utility)

    private init() {
        memoryCache.countLimit = 200
        memoryCache.totalCostLimit = 50 * 1024 * 1024 // 50 MB

        // Avoid force-unwrapping in a launch-path singleton (IOS-AUDIT-PERF-012);
        // fall back to the temp dir if the caches dir is somehow unavailable.
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        // v2: prior versions hashed with `key.utf8.hex.prefix(64)`, which is a
        // 32-byte URL prefix — every Supabase storage URL collides. New
        // directory name ensures clients with poisoned v1 caches start fresh.
        diskCacheDir = caches.appendingPathComponent("ImageDiskCache_v2", isDirectory: true)
        try? FileManager.default.createDirectory(at: diskCacheDir, withIntermediateDirectories: true)
        // Best-effort cleanup of the broken v1 directory.
        try? FileManager.default.removeItem(at: caches.appendingPathComponent("ImageDiskCache", isDirectory: true))

        // Prune on init (background)
        diskQueue.async { [weak self] in
            self?.pruneDiskIfNeeded()
        }

        // Release memory under pressure (NSCache evicts opportunistically, not
        // reliably under jetsam pressure) and re-prune disk across long sessions
        // (PERF-001).
        registerLifecycleObservers()
    }

    /// Drop the in-memory image cache on memory warnings and re-prune the disk
    /// cache when the app backgrounds. Block-based observers are retained by the
    /// notification center for the lifetime of this singleton.
    private func registerLifecycleObservers() {
        let center = NotificationCenter.default
        center.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            // Images are reloaded from the disk tier on next access, so dropping
            // the memory tier is safe and frees resident bitmaps immediately.
            self?.memoryCache.removeAllObjects()
        }
        center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.diskQueue.async { [weak self] in
                self?.pruneDiskIfNeeded()
            }
        }
    }

    // MARK: - Memory

    func getFromMemory(_ key: String) -> UIImage? {
        memoryCache.object(forKey: key as NSString)
    }

    func setMemory(_ image: UIImage, for key: String, cost: Int = 0) {
        if cost > 0 {
            memoryCache.setObject(image, forKey: key as NSString, cost: cost)
        } else {
            memoryCache.setObject(image, forKey: key as NSString)
        }
    }

    // MARK: - Disk

    /// Reads a cached image from disk, decoding it at `maxPixelSize` (nil = full
    /// resolution). The full-quality bytes stay on disk; only the returned
    /// in-memory bitmap is downsampled.
    func getFromDisk(_ key: String, maxPixelSize: CGFloat? = nil) async -> UIImage? {
        let fileURL = diskFileURL(for: key)
        let metaURL = diskMetaURL(for: key)

        return await withCheckedContinuation { continuation in
            diskQueue.async {
                guard FileManager.default.fileExists(atPath: fileURL.path),
                      let metaData = try? Data(contentsOf: metaURL),
                      let meta = try? JSONDecoder().decode(DiskCacheMeta.self, from: metaData) else {
                    continuation.resume(returning: nil)
                    return
                }

                // Check expiry
                if Date() > meta.expiresAt {
                    try? FileManager.default.removeItem(at: fileURL)
                    try? FileManager.default.removeItem(at: metaURL)
                    continuation.resume(returning: nil)
                    return
                }

                guard let data = try? Data(contentsOf: fileURL),
                      let image = ImageDownsampler.decode(data, maxPixelSize: maxPixelSize) else {
                    continuation.resume(returning: nil)
                    return
                }

                continuation.resume(returning: image)
            }
        }
    }

    func setDisk(_ data: Data, for key: String, ttl: TimeInterval) async {
        let fileURL = diskFileURL(for: key)
        let metaURL = diskMetaURL(for: key)
        let meta = DiskCacheMeta(expiresAt: Date().addingTimeInterval(ttl))

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            diskQueue.async {
                try? data.write(to: fileURL, options: .atomic)
                if let metaData = try? JSONEncoder().encode(meta) {
                    try? metaData.write(to: metaURL, options: .atomic)
                }
                continuation.resume()
            }
        }
    }

    // MARK: - Pruning

    private func pruneDiskIfNeeded() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: diskCacheDir, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]) else { return }

        // Calculate total size
        var entries: [(url: URL, size: Int, modified: Date)] = []
        var totalSize = 0

        for file in files where file.pathExtension != "meta" {
            guard let attrs = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey]),
                  let size = attrs.fileSize,
                  let modified = attrs.contentModificationDate else { continue }
            entries.append((file, size, modified))
            totalSize += size
        }

        // If under limit, nothing to do
        guard totalSize > maxDiskBytes else { return }

        // LRU eviction: sort by oldest first, remove until under limit
        entries.sort { $0.modified < $1.modified }

        for entry in entries {
            guard totalSize > maxDiskBytes else { break }
            try? fm.removeItem(at: entry.url)
            let metaURL = entry.url.appendingPathExtension("meta")
            try? fm.removeItem(at: metaURL)
            totalSize -= entry.size
        }

        AppLogger.cache.info("Image cache pruned to \(totalSize / 1024 / 1024) MB")
    }

    // MARK: - Helpers

    private func diskFileURL(for key: String) -> URL {
        // SHA256 of the full URL — collision-resistant. The previous
        // implementation hex-encoded the UTF-8 bytes and truncated to 64
        // chars (32 bytes), so any URLs sharing a 32-byte prefix (every
        // Supabase storage URL!) mapped to the same disk file, causing one
        // restaurant's image to be served for many others.
        let digest = SHA256.hash(data: Data(key.utf8))
        let hash = digest.map { String(format: "%02x", $0) }.joined()
        return diskCacheDir.appendingPathComponent(hash)
    }

    private func diskMetaURL(for key: String) -> URL {
        diskFileURL(for: key).appendingPathExtension("meta")
    }
}

// MARK: - Disk Cache Metadata

private struct DiskCacheMeta: Codable {
    let expiresAt: Date
}

// MARK: - Downsampling (IOS-POLISH-001)

/// Decodes image data at a bounded pixel size using ImageIO, so we never hold a
/// decoded bitmap larger than we can display. Falls back to a plain decode on
/// any failure (and when `maxPixelSize` is nil, e.g. the zoomable viewer).
enum ImageDownsampler {
    static func decode(_ data: Data, maxPixelSize: CGFloat?) -> UIImage? {
        guard let maxPixelSize, maxPixelSize > 0 else {
            return UIImage(data: data)
        }
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return UIImage(data: data)
        }
        let thumbOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            // Bake in EXIF orientation so the result is upright.
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            // ImageIO never upscales past the source, so small images are untouched.
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbOptions as CFDictionary) else {
            return UIImage(data: data)
        }
        return UIImage(cgImage: cgImage)
    }
}

private extension UIImage {
    /// Approximate decoded byte size, used as the NSCache cost so the memory
    /// cache's totalCostLimit is meaningful.
    var approxMemoryCost: Int {
        guard let cg = cgImage else { return 0 }
        return cg.bytesPerRow * cg.height
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
