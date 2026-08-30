Research Report: Designing a Des Moines Insider Events & Restaurants API and ChatGPT Integration
Project objectives
Des Moines Insider wants to allow ChatGPT users to explore local events and restaurants directly within ChatGPT. The vision is to create a RESTful API that exposes more than 330 current events and a wide range of restaurant information for the Des Moines, Iowa region. Users should be able to search for events and restaurants, view details such as venue, schedule, menu items and reviews, submit their own events or restaurants and leave ratings. The API will serve as the backend for a ChatGPT plug‑in so that queries about local happenings can be satisfied without leaving the chat. Since the service must work across mobile and desktop environments, the API needs to be stateless and responsive.
General API design considerations
Use REST principles and resource‑oriented URIs
Experts advise designing Web APIs using RESTful principles because they keep services simple, scalable and interoperable. In a REST architecture, URIs represent resources rather than actions, and clients interact with those resources using standard HTTP verbs. Microsoft’s guidance explains that REST services should use a uniform interface based on standard HTTP methods (GET, POST, PUT, PATCH, DELETE), return resource representations in JSON or XML, and avoid keeping session state on the server[1]. URIs should be noun‑based (e.g., /events, /restaurants) and hierarchical; nested resources can represent relationships (e.g., /events/{eventId}/ticket‑classes)[2]. The restfulapi.net naming guide similarly stresses using plural nouns for collections (/users, /orders) and using forward slashes to indicate hierarchy[3]. Avoid verbs in paths—for example, /events/123 with a DELETE method conveys that the event should be deleted[4].
Follow consistent conventions and documentation
Postman’s API design article notes that a well‑designed API is easy to understand and uses consistent naming and parameter conventions across endpoints[5]. Clearly documenting every resource, method, parameter and path ensures that developers and ChatGPT can interact with the API correctly. Postman also recommends defining the specification before implementation, validating assumptions with mocks and tests, and including built‑in security (e.g., authentication, rate limiting, encryption)[5]. These practices will ensure that the Des Moines Insider API is maintainable and secure.
Event API design
Core resources and endpoints
Events are the primary resource. Use a plural path (/events) for the collection and /events/{eventId} for individual events. For ticket classes and other related resources, nested paths can be used: /events/{eventId}/ticket‑classes, /events/{eventId}/venues, etc. The Eventbrite API demonstrates how expansions can return related information in a single call; ?expand=venue,organizer,format,category,subcategory,ticket_classes returns the venue, organizer, format, category and ticket class information in one response[6]. Adopting a similar mechanism will allow clients to decide how much data to fetch. Suggested endpoints include:

1. List events: GET /events returns a paginated list. Query parameters should include status (e.g., live, draft, ended) and time_filter (past, current_future, all) like Eventbrite’s listing function[7]. Filters for date range, venue or category may also be included.
2. Create event: POST /events accepts JSON with title, description, start/end times, venue, capacity, pricing and optional images. Authentication is required.
3. Retrieve event details: GET /events/{eventId} returns details; optional expand query parameters allow inclusion of venue, organizer or ticket classes as in Eventbrite[6]. Response fields should include ID, name, description, start and end times, status, categories, ticket availability, and external links.
4. Update event: PATCH /events/{eventId} updates partial fields; PUT may replace the resource. Only authorized users (event organizers or administrators) may perform updates.
5. Delete event: DELETE /events/{eventId} removes an event. Hard deletes should be limited; consider soft deletion or cancellation status.
6. Submit rating or review: POST /events/{eventId}/reviews accepts a star rating (e.g., 1‑5) and optional textual feedback. Clients may fetch reviews via GET /events/{eventId}/reviews. Each review object should include rating, text, timestamp and anonymized user reference.
   Data model and query parameters
   The API should capture structured data for events: title, description, venue (with address and geographic coordinates), start and end times, price range, categories, ticket availability, and organizer information. When listing events, provide filters for date range, price range, location radius, and categories to ensure users can find relevant events. Expandable fields allow clients to avoid multiple round trips; for example, including ticket classes returns details about ticket quantities and sales windows similar to Eventbrite’s ticket_classes expansion[6]. Use pagination parameters (page, limit) to restrict result size.
   Managing event status and availability
   Events may have statuses such as draft, live, started, ended or canceled. The Eventbrite API shows how the status parameter can be used to list events in particular states[7]. The Des Moines Insider API should support updating status via PATCH /events/{eventId} and filtering by status in listing queries. This allows ChatGPT to answer queries like “What concerts are happening this weekend?” or “What events were recently canceled?”
   Restaurant API design
   Core resources and endpoints
   The restaurant API will enable search, details retrieval, booking and user reviews for local restaurants. Endpoints should include:
7. List/search restaurants: GET /restaurants with query parameters similar to the Yelp Fusion API’s business search. Parameters may include term (keyword), location (city or neighbourhood), latitude/longitude, radius, categories (e.g., “Mexican”, “Seafood”), price (1–4) and limit/offset for pagination[8]. Provide sorting options (rating, distance) and filters for open now or reservation availability.
8. Create restaurant: POST /restaurants allows authorized restaurant owners to add a new listing with name, address, phone number, operating hours, price range, description, images and categories. Authentication and validation are required.
9. Retrieve restaurant details: GET /restaurants/{restaurantId} returns details such as name, address, contact information, hours, price range, categories, coordinates, images, rating summary and number of reviews. The Yelp API’s business details endpoint returns similar data, including hours, location, photos, attributes, rating and review count[9].
10. Update restaurant: PATCH /restaurants/{restaurantId} for partial updates and PUT for full replacements; restricted to authorized owners or administrators.
11. Delete restaurant: DELETE /restaurants/{restaurantId} to remove a listing (soft delete recommended).
12. Restaurant reviews: POST /restaurants/{restaurantId}/reviews allows users to submit ratings and comments; GET /restaurants/{restaurantId}/reviews retrieves reviews with pagination. Each review should include a star rating, text, timestamp and anonymized user reference. Yelp’s reviews endpoint returns up to three review excerpts; the Des Moines Insider API can return more but should support limiting to avoid large responses[9].
13. Bookings: Inspired by reservation platforms such as OpenTable and Resy, support a bookings endpoint: POST /restaurants/{restaurantId}/reservations with date, time, party size and contact info. The API should respond with availability or suggest alternate times. According to Altexsoft’s overview, OpenTable’s APIs return restaurant name, address, latitude/longitude, phone number and a reservation link, while Resy’s API exposes available reservations and details about free seats and price ranges[10][11]. These features can guide the design of the bookings resource.
    Additional features and data
    The Postman restaurant template notes that a comprehensive restaurant API should provide endpoints for bookings, menu items and orders[12]. For Des Moines Insider, menu items could be optional; if implemented, GET /restaurants/{restaurantId}/menu could return menu sections, dishes, descriptions and prices, and POST /restaurants/{restaurantId}/orders could allow pre‑ordering. The template also suggests customizing the API to include user authentication, reviews and ratings, and emphasizes steps such as adding authentication, customizing endpoints, and testing thoroughly[13]. Including these features will make the API robust and future‑proof.
    Search and recommendation
    Using parameters like term, categories and location coordinates (latitude/longitude) provides flexibility for search queries. The Yelp API warns that using coordinates can provide more precise results, but location strings are easier for users and can be geocoded by the API[14][15]. Implementing both options ensures ChatGPT can handle queries like “find Thai restaurants near the Des Moines River” or “restaurants within 5 km of downtown”. Responses should return standardized JSON objects for easy parsing[8].
    Handling user submissions and ratings
    Des Moines Insider wants users to submit new events or restaurants and rate existing ones. To support this, the API should include user and authentication resources:
    • User registration/login: POST /users creates a new user account; POST /auth/login returns a token. Security measures such as password hashing and HTTPS should be mandatory.
    • Authentication: Each create/update/delete or rating action must require a valid token. Rate limiting should prevent abuse.
    • Review moderation: When users submit reviews, flag offensive language or duplicates. Provide DELETE /events/{eventId}/reviews/{reviewId} or equivalent endpoints for moderators.
    • Submission workflow: For events or restaurants submitted by users, set an initial status of pending_approval. Administrators can approve or reject via PATCH /events/{eventId} or PATCH /restaurants/{restaurantId}.
    Security and authentication
    The API should use HTTPS for all communications and implement authentication using bearer tokens. Yelp’s API uses an API key as a bearer token; some partner APIs also support OAuth[14]. For the Des Moines Insider API, implement token‑based authentication (e.g., JSON Web Tokens) to secure endpoints. Provide scopes or roles (admin, owner, user) to restrict actions. Limit response size and enforce rate limits to avoid denial‑of‑service attacks.
    ChatGPT plugin integration
    To expose the API to ChatGPT, follow OpenAI’s plugin guidelines. Create an ai-plugin.json manifest at /.well-known/ai-plugin.json with the plugin’s name, description and authentication type. Provide an OpenAPI (Swagger) specification at /openapi.yaml describing each endpoint with clear, plain‑English descriptions. Pluralsight’s guide explains that the manifest tells ChatGPT where to find the OpenAPI spec and what authentication to use[16]. The plugin should have a small number of high‑value endpoints; Blobr recommends grouping use cases and limiting endpoints to 3‑6 to reduce complexity[17]. This means the ChatGPT plugin might only expose search and detail endpoints for events and restaurants and a rating endpoint, while administrative functions remain private. Provide concise descriptions and examples in the OpenAPI spec so ChatGPT can construct valid requests.
    Implementation recommendations
    • Versioning: Use URI versioning (/v1/events) to allow future changes without breaking clients.
    • Consistent response format: Return JSON objects with predictable keys. Include metadata (e.g., total count, page number) for list endpoints.
    • Pagination and filtering: Provide limit, offset and filter parameters to control response size. Use enumerated values for status or categories.
    • Cross‑platform support: Ensure the API is stateless and uses standard HTTP so that mobile and desktop clients can access it seamlessly. Avoid cookies for session state; rely on tokens in headers.
    • Documentation: Host interactive documentation (e.g., Swagger UI) to allow developers to test endpoints. Provide sample requests and responses. Postman’s template suggests reviewing the blueprint, customizing endpoints to match requirements and thoroughly testing the API[13].
    Visual overview
    The following diagram summarizes how the ChatGPT plug‑in interacts with the Des Moines Insider event and restaurant APIs. ChatGPT calls the plug‑in, which forwards requests to the appropriate service (event or restaurant). Each service implements listing and detail retrieval as well as submission/rating endpoints.

Conclusion
By adhering to RESTful design principles and leveraging best practices from established APIs such as Eventbrite, Yelp and leading reservation platforms, the Des Moines Insider API can provide a robust foundation for delivering local event and restaurant information to ChatGPT users. Thoughtful resource naming, clear documentation and strict authentication will ensure that the API is easy to use and secure. Incorporating user submissions and ratings while moderating content will encourage community engagement. With an optimized ChatGPT plug‑in exposing key search and detail endpoints, users will be able to discover upcoming events, book tables and explore local eateries without leaving their chat session, enhancing the Des Moines Insider experience across mobile and desktop platforms.

---

[1] [2] Web API Design Best Practices - Azure Architecture Center | Microsoft Learn
https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
[3] [4] REST API URI Naming Conventions and Best Practices
https://restfulapi.net/resource-naming/
[5] What is API Design? Principles & Best Practices | Postman
https://www.postman.com/api-platform/api-design/
[6] [7] Getting Information on Events - Documentation | Eventbrite Platform
https://www.eventbrite.com/platform/docs/events
[8] [9] [14] [15] Location-Based Applications Thrive with the Yelp API | Zuplo Learning Center
https://zuplo.com/learning-center/yelp-api
[10] [11] Online Restaurant Reservation Systems: APIs for Location Dis
https://www.altexsoft.com/blog/online-restaurant-reservation-landscape-location-discovery-table-booking-delivery-and-reviews/
[12] [13] Restaurant API Collection Template | Postman
https://www.postman.com/templates/collections/restaurant-api/
[16] How to make a ChatGPT plugin | Online Courses, Learning Paths, and Certifications - Pluralsight
https://www.pluralsight.com/resources/blog/software-development/how-make-chatgpt-plugin
[17] Optimizing APIs for ChatGPT Plugin
https://www.blobr.io/post/optimize-apis-chatgpt-plugin
