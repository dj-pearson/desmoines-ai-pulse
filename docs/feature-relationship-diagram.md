# Feature Relationship Diagrams

This document contains Mermaid diagrams showing how features connect in Des Moines AI Pulse.

---

## Current State: Disconnected Features

```mermaid
graph TB
    Home[Homepage Hub]

    %% Main Content Features
    Events[Events Browser]
    Restaurants[Restaurants]
    Attractions[Attractions]
    Playgrounds[Playgrounds]
    Articles[Articles]

    %% Detail Pages
    EventDetail[Event Details]
    RestDetail[Restaurant Details]

    %% Isolated Features
    Social[Social Hub<br/>friends/groups/forums]
    Gamify[Gamification<br/>XP/Badges/Leaderboard]
    Profile[Profile<br/>MISSING PAGE]
    Dashboard[Dashboard<br/>MISSING PAGE]
    Favorites[Favorites View<br/>MISSING PAGE]
    RealTime[Real-Time Updates<br/>ISOLATED]
    Weekend[Weekend Guide<br/>MINIMAL]

    %% Business Features
    Business[Business Partnership]
    Advertise[Advertising]
    Campaigns[Campaign Manager]

    %% Admin
    Admin[Admin Dashboard<br/>MONOLITH]

    %% Connections
    Home --> Events
    Home --> Restaurants
    Home --> Attractions
    Home --> Playgrounds
    Home --> Articles

    Events --> EventDetail
    Restaurants --> RestDetail

    EventDetail -.weak.-> Social

    %% Isolated clusters
    Social -.-> Gamify

    Business --> Advertise
    Advertise --> Campaigns

    %% Styling
    classDef isolated fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    classDef missing fill:#ffeeee,stroke:#ff0000,stroke-width:3px,stroke-dasharray: 5 5
    classDef weak fill:#ffffcc,stroke:#ffaa00,stroke-width:2px

    class Social,Gamify,RealTime,Weekend isolated
    class Profile,Dashboard,Favorites missing
    class Business,Advertise weak
```

---

## Recommended State: Interconnected Ecosystem

```mermaid
graph TB
    %% Top Navigation Layer
    Nav[Main Navigation]

    %% Primary Hubs
    Home[Homepage]
    ProfileHub[Profile Hub<br/>NEW UNIFIED]
    BusinessHub[Business Hub<br/>NEW UNIFIED]
    Admin[Admin Hub<br/>REORGANIZED]

    %% Content Features
    Events[Events]
    Restaurants[Restaurants]
    Attractions[Attractions]
    Playgrounds[Playgrounds]

    %% Profile Tabs
    Favorites[My Favorites<br/>NEW TAB]
    Calendar[My Calendar<br/>INTEGRATED]
    MyEvents[My Events<br/>Submissions]
    Settings[Settings<br/>NEW]
    History[Visit History<br/>NEW]

    %% Detail Pages with Embedded Features
    EventDetail[Event Details<br/>+ Social Hub<br/>+ Friends Attending<br/>+ XP Actions]
    RestDetail[Restaurant Details<br/>+ Real-Time Status<br/>+ Reviews<br/>+ XP Actions]

    %% Engagement Layer - Now Embedded
    SocialEmbed[Social Features<br/>EMBEDDED EVERYWHERE]
    GamifyEmbed[Gamification<br/>EMBEDDED EVERYWHERE]
    RealTimeEmbed[Real-Time Updates<br/>EMBEDDED IN CONTENT]

    %% Business Features
    BizDash[Business Dashboard]
    Partnership[Partnership]
    AdvertiseTab[Advertising]
    Analytics[Analytics]

    %% Navigation connections
    Nav --> Home
    Nav --> ProfileHub
    Nav --> BusinessHub
    Nav --> Admin

    %% Home to Content
    Home --> Events
    Home --> Restaurants
    Home --> Attractions
    Home --> Playgrounds

    %% Content to Details with embedded features
    Events --> EventDetail
    Restaurants --> RestDetail

    %% Profile Hub integration
    ProfileHub --> Favorites
    ProfileHub --> Calendar
    ProfileHub --> MyEvents
    ProfileHub --> Settings
    ProfileHub --> History

    %% Bidirectional connections (double arrows)
    EventDetail <-->|Save/View| Favorites
    RestDetail <-->|Save/View| Favorites
    EventDetail <-->|Add| Calendar
    EventDetail <-->|Friends| SocialEmbed
    EventDetail <-->|XP Earn| GamifyEmbed
    RestDetail <-->|Status| RealTimeEmbed
    RestDetail <-->|XP Earn| GamifyEmbed

    %% Business Hub structure
    BusinessHub --> BizDash
    BusinessHub --> Partnership
    BusinessHub --> AdvertiseTab
    BusinessHub --> Analytics
    BusinessHub --> MyEvents

    %% Cross-connections
    Favorites -.->|Quick Access| Events
    Calendar -.->|Sync| Events
    History -.->|Return Visit| Restaurants

    %% Styling
    classDef new fill:#ccffcc,stroke:#00aa00,stroke-width:3px
    classDef enhanced fill:#cce5ff,stroke:#0066cc,stroke-width:2px
    classDef hub fill:#ffe6cc,stroke:#ff8800,stroke-width:3px

    class ProfileHub,BusinessHub,Favorites,Settings,History new
    class EventDetail,RestDetail,SocialEmbed,GamifyEmbed,RealTimeEmbed enhanced
    class Home,Nav,Admin hub
```

---

## User Journey: Event Discovery (Current vs. Recommended)

### Current Flow (Limited Connections)

```mermaid
graph LR
    Start([User Visits Site])
    Search[Search Events]
    Results[Browse Results]
    Details[View Event]
    End([Leave Site])

    Start --> Search
    Search --> Results
    Results --> Details
    Details --> End

    %% Missed opportunities
    Details -.missed.-> Save[Save to Favorites<br/>NO PAGE TO VIEW]
    Details -.missed.-> Friends[See Friends<br/>WEAK INTEGRATION]
    Details -.missed.-> XP[Earn XP<br/>HIDDEN]

    classDef missed fill:#ffcccc,stroke:#ff0000,stroke-dasharray: 5 5
    class Save,Friends,XP missed
```

### Recommended Flow (Rich Connections)

```mermaid
graph TB
    Start([User Visits Site])
    Search[Search Events]
    Results[Browse Results<br/>+ Friend Activity<br/>+ Trending Badge]
    Details[View Event Details<br/>+ Social Hub<br/>+ Friends Attending]

    %% Multiple exit paths
    Save[Save to Favorites]
    Calendar[Add to Calendar]
    Share[Share with Friends]
    Group[Plan with Group]
    Earn[Earn XP +50]
    Related[View Related Events]
    Profile[View in Profile]
    Return([Return to Browse])

    Start --> Search
    Search --> Results
    Results --> Details

    Details --> Save
    Details --> Calendar
    Details --> Share
    Details --> Group
    Details --> Earn
    Details --> Related

    Save --> Profile
    Calendar --> Profile
    Earn --> Profile

    Profile --> Return
    Related --> Results
    Group --> Details

    classDef engaged fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    class Save,Calendar,Share,Group,Earn,Related engaged
```

---

## Business User Journey (Current vs. Recommended)

### Current Flow (Confusing Path)

```mermaid
graph TB
    Start([Business Owner Visits])
    Signup[Sign Up<br/>Select Business Type]
    Verify[Email Verification]

    %% Disconnected next steps
    Lost([Where do I go?])

    Partner[Find Partnership Page<br/>HARD TO DISCOVER]
    Submit[Submit Event<br/>SEPARATE FLOW]
    Ads[Create Ad<br/>SEPARATE BUTTON]

    Signup --> Verify
    Verify --> Lost

    Lost -.eventually.-> Partner
    Lost -.eventually.-> Submit
    Lost -.eventually.-> Ads

    classDef problem fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    class Lost problem
```

### Recommended Flow (Clear Onboarding)

```mermaid
graph TB
    Start([Business Owner Visits])
    Signup[Sign Up<br/>Select Business Account]
    Verify[Email Verification]
    Welcome[Welcome to Business Hub<br/>GUIDED ONBOARDING]

    Hub[Business Dashboard]

    %% Clear next steps
    Profile[Complete Profile]
    Partner[Choose Partnership Tier]
    Submit[Submit First Event]
    Ads[Launch Ad Campaign]
    Analytics[View Analytics]

    Start --> Signup
    Signup --> Verify
    Verify --> Welcome
    Welcome --> Hub

    Hub --> Profile
    Hub --> Partner
    Hub --> Submit
    Hub --> Ads
    Hub --> Analytics

    Profile --> Partner
    Partner --> Ads
    Submit --> Analytics
    Ads --> Analytics

    Analytics --> Hub

    classDef success fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    class Welcome,Hub success
```

---

## Feature Integration Layers

```mermaid
graph TD
    subgraph Navigation Layer
        Nav[Main Navigation<br/>Events | Restaurants | Attractions]
    end

    subgraph Content Layer
        Events[Events Browser]
        Restaurants[Restaurant Directory]
        Details[Detail Pages]
    end

    subgraph Engagement Layer
        Social[Social<br/>Friends/Groups]
        Gamify[Gamification<br/>XP/Badges]
        RealTime[Real-Time<br/>Status Updates]
        AI[AI Recommendations]
    end

    subgraph Personal Layer
        Profile[Profile Hub]
        Favorites[Favorites]
        Calendar[Calendar]
        History[History]
    end

    subgraph Business Layer
        BizHub[Business Hub]
        Partnership[Partnership]
        Advertising[Advertising]
        Analytics[Analytics]
    end

    subgraph Admin Layer
        AdminHub[Admin Hub]
    end

    %% Layer connections
    Nav --> Content Layer
    Content Layer <--> Engagement Layer
    Content Layer <--> Personal Layer
    Engagement Layer <--> Personal Layer
    Content Layer --> Business Layer

    Business Layer -.-> AdminHub
    Content Layer -.-> AdminHub

    classDef layer1 fill:#e6f3ff,stroke:#0066cc
    classDef layer2 fill:#fff0e6,stroke:#ff8800
    classDef layer3 fill:#e6ffe6,stroke:#00aa00
    classDef layer4 fill:#f0e6ff,stroke:#8800cc

    class Events,Restaurants,Details layer1
    class Social,Gamify,RealTime,AI layer2
    class Profile,Favorites,Calendar,History layer3
    class BizHub,Partnership,Advertising,Analytics layer4
```

---

## Component Dependency Graph (High-Level)

```mermaid
graph LR
    subgraph Core Services
        Auth[Authentication]
        DB[Supabase Database]
        API[External APIs]
    end

    subgraph Shared Components
        Header[Header/Navigation]
        Search[Search System]
        Maps[Map Integration]
        Filters[Filter System]
    end

    subgraph Content Components
        EventCard[Event Cards]
        RestCard[Restaurant Cards]
        DetailModal[Detail Modals]
    end

    subgraph Feature Components
        SocialComp[Social Components]
        GamifyComp[Gamification Components]
        ProfileComp[Profile Components]
        BizComp[Business Components]
    end

    subgraph Pages
        HomePage[Homepage]
        EventsPage[Events Page]
        ProfilePage[Profile Page - NEW]
        BizPage[Business Page - NEW]
    end

    %% Dependencies
    Auth --> Header
    Auth --> ProfileComp
    Auth --> BizComp

    DB --> Auth
    DB --> EventCard
    DB --> RestCard
    DB --> SocialComp

    API --> EventCard
    API --> RestCard
    API --> Maps

    Header --> Pages
    Search --> Pages
    Filters --> EventsPage

    EventCard --> DetailModal
    RestCard --> DetailModal

    DetailModal --> SocialComp
    DetailModal --> GamifyComp

    ProfileComp --> ProfilePage
    BizComp --> BizPage

    classDef core fill:#ffe6e6,stroke:#cc0000,stroke-width:2px
    classDef shared fill:#e6f3ff,stroke:#0066cc,stroke-width:2px
    classDef feature fill:#fff0e6,stroke:#ff8800,stroke-width:2px

    class Auth,DB,API core
    class Header,Search,Maps,Filters shared
    class SocialComp,GamifyComp,ProfileComp,BizComp feature
```

---

## Priority Implementation Roadmap

```mermaid
gantt
    title Feature Integration Roadmap
    dateFormat  YYYY-MM-DD

    section Phase 1: Foundation
    Create Profile Hub           :p1a, 2025-11-10, 7d
    Build Favorites View         :p1b, 2025-11-12, 5d
    Fix Navigation Links         :p1c, 2025-11-15, 3d

    section Phase 2: Integration
    Embed Real-Time in Details   :p2a, 2025-11-18, 5d
    Add Open Now Filter          :p2b, 2025-11-20, 3d
    Show XP in Header            :p2c, 2025-11-22, 3d
    Gamification Toast           :p2d, 2025-11-24, 2d

    section Phase 3: Business
    Create Business Hub          :p3a, 2025-11-25, 7d
    Connect Signup Flow          :p3b, 2025-11-27, 5d
    Campaign Analytics Widget    :p3c, 2025-12-01, 4d

    section Phase 4: Social
    Complete Trending Tab        :p4a, 2025-12-03, 5d
    Complete Nearby Tab          :p4b, 2025-12-06, 5d
    Integrate EventSocialHub     :p4c, 2025-12-08, 4d

    section Phase 5: Content
    Weekend Planning Wizard      :p5a, 2025-12-10, 6d
    Display Trending Content     :p5b, 2025-12-13, 3d
    Seasonal Content             :p5c, 2025-12-15, 3d

    section Phase 6: Optimization
    Split Admin Dashboard        :p6a, 2025-12-16, 5d
    Performance Optimization     :p6b, 2025-12-19, 4d
    User Testing                 :p6c, 2025-12-22, 3d
```

---

## How to Use These Diagrams

1. **View in GitHub**: These Mermaid diagrams render automatically in GitHub's markdown preview
2. **Local Viewing**: Use a Mermaid-compatible markdown viewer
3. **Export**: Use tools like [Mermaid Live Editor](https://mermaid.live) to export as PNG/SVG
4. **Edit**: Modify the Mermaid syntax to reflect implementation changes

---

**Last Updated:** November 8, 2025
