import Foundation
import Supabase

/// Fetches published articles/guides from Supabase, matching the web app's
/// `useArticles` hook + `/articles` query (status = 'published', newest first).
actor ArticlesService {
    static let shared = ArticlesService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    struct ArticlesQuery {
        var searchText: String?
        /// Category filter. `nil` / empty means "all".
        var category: String?
        var limit: Int = Config.defaultPageSize
        var offset: Int = 0
    }

    struct ArticlesResponse {
        let articles: [Article]
        let totalCount: Int
        let hasMore: Bool
    }

    // MARK: - List

    func fetchArticles(query: ArticlesQuery = ArticlesQuery()) async throws -> ArticlesResponse {
        try await withRetry { [self] in try await _fetchArticles(query: query) }
    }

    private func _fetchArticles(query: ArticlesQuery) async throws -> ArticlesResponse {
        let client = try db()
        var request = client
            .from("articles")
            .select("*", head: false, count: .exact)
            // RLS already restricts SELECT to published, but be explicit so the
            // contract is obvious and the query is correct even with a wider key.
            .eq("status", value: "published")

        if let search = query.searchText, !search.isEmpty {
            request = request.or("title.ilike.%\(search)%,excerpt.ilike.%\(search)%,category.ilike.%\(search)%")
        }

        if let category = query.category, !category.isEmpty {
            request = request.eq("category", value: category)
        }

        let finalRequest = request
            // Match the web ordering: most recently published first, with a
            // stable secondary key for rows missing published_at.
            .order("published_at", ascending: false, nullsFirst: false)
            .order("created_at", ascending: false)
            .range(from: query.offset, to: query.offset + query.limit - 1)

        let response = try await finalRequest.execute()
        let articles = try JSONDecoder().decode([Article].self, from: response.data)
        let total = response.count ?? articles.count

        return ArticlesResponse(
            articles: articles,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Single

    func fetchArticle(id: String) async throws -> Article {
        try await withRetry { [self] in
            let client = try db()
            let article: Article = try await client
                .from("articles")
                .select()
                .eq("id", value: id)
                .single()
                .execute()
                .value
            return article
        }
    }

    func fetchArticle(slug: String) async throws -> Article {
        try await withRetry { [self] in
            let client = try db()
            let article: Article = try await client
                .from("articles")
                .select()
                .eq("slug", value: slug)
                .single()
                .execute()
                .value
            return article
        }
    }

    // MARK: - Related

    /// Related-content rail (same category, newest, excluding the current one).
    /// Fails soft — a related rail is never worth surfacing an error for.
    func fetchRelated(category: String?, excludingId: String, limit: Int = 4) async -> [Article] {
        guard let client = try? db() else { return [] }
        do {
            var request = client
                .from("articles")
                .select()
                .eq("status", value: "published")
                .neq("id", value: excludingId)
            if let category, !category.isEmpty {
                request = request.eq("category", value: category)
            }
            let articles: [Article] = try await request
                .order("published_at", ascending: false, nullsFirst: false)
                .limit(limit)
                .execute()
                .value
            return articles
        } catch {
            return []
        }
    }

    // MARK: - View count

    /// Best-effort view-count increment (parity with the web reader). Reads the
    /// current count then writes +1; never throws into the UI.
    func incrementViewCount(id: String, current: Int?) async {
        guard let client = try? db() else { return }
        struct CountRow: Decodable { let view_count: Int? }
        struct UpdateRow: Encodable { let view_count: Int }
        do {
            let count: Int
            if let current {
                count = current
            } else {
                let row: CountRow = try await client
                    .from("articles").select("view_count").eq("id", value: id)
                    .single().execute().value
                count = row.view_count ?? 0
            }
            try await client
                .from("articles")
                .update(UpdateRow(view_count: count + 1))
                .eq("id", value: id)
                .execute()
        } catch {
            // View counting is non-critical; ignore failures (RLS on anon, etc.).
        }
    }

    // MARK: - Categories

    /// Distinct categories present in published articles, for the filter chips.
    /// Fails soft to an empty list so the screen still renders ("All" only).
    ///
    /// Server-side since IOS-AUDIT-PERF-025. The trimming and empty-filtering
    /// that used to happen here now happens in SQL, which is also why the
    /// Restaurants sheet stopped being the odd one out - it did no trimming at
    /// all, so a whitespace-only value rendered as a blank chip.
    func fetchCategories() async -> [String] {
        guard let client = try? db() else { return [] }
        return (try? await FilterValues.fetch(source: .articleCategory, client: client)) ?? []
    }
}
