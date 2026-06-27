package com.desmoines.aipulse.di

import com.desmoines.aipulse.data.repository.AskPulseRepository
import com.desmoines.aipulse.data.repository.AskPulseRepositoryImpl
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.AttractionsRepositoryImpl
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.AuthRepositoryImpl
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.EventsRepositoryImpl
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.FavoritesRepositoryImpl
import com.desmoines.aipulse.data.repository.ForYouRepository
import com.desmoines.aipulse.data.repository.ForYouRepositoryImpl
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepositoryImpl
import com.desmoines.aipulse.data.repository.ArticlesRepository
import com.desmoines.aipulse.data.repository.ArticlesRepositoryImpl
import com.desmoines.aipulse.data.repository.DealsRepository
import com.desmoines.aipulse.data.repository.DealsRepositoryImpl
import com.desmoines.aipulse.data.repository.SavedSearchRepository
import com.desmoines.aipulse.data.repository.SavedSearchRepositoryImpl
import com.desmoines.aipulse.data.repository.SurpriseMeRepository
import com.desmoines.aipulse.data.repository.SurpriseMeRepositoryImpl
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import com.desmoines.aipulse.data.repository.TripPlannerRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Hilt module for binding repository interfaces to their implementations.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    abstract fun bindEventsRepository(impl: EventsRepositoryImpl): EventsRepository

    @Binds
    abstract fun bindRestaurantsRepository(impl: RestaurantsRepositoryImpl): RestaurantsRepository

    @Binds
    abstract fun bindAttractionsRepository(impl: AttractionsRepositoryImpl): AttractionsRepository

    @Binds
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    abstract fun bindFavoritesRepository(impl: FavoritesRepositoryImpl): FavoritesRepository

    @Binds
    abstract fun bindSurpriseMeRepository(impl: SurpriseMeRepositoryImpl): SurpriseMeRepository

    @Binds
    abstract fun bindSavedSearchRepository(impl: SavedSearchRepositoryImpl): SavedSearchRepository

    @Binds
    abstract fun bindArticlesRepository(impl: ArticlesRepositoryImpl): ArticlesRepository

    @Binds
    abstract fun bindDealsRepository(impl: DealsRepositoryImpl): DealsRepository

    @Binds
    abstract fun bindAskPulseRepository(impl: AskPulseRepositoryImpl): AskPulseRepository

    @Binds
    abstract fun bindForYouRepository(impl: ForYouRepositoryImpl): ForYouRepository

    @Binds
    abstract fun bindTripPlannerRepository(impl: TripPlannerRepositoryImpl): TripPlannerRepository
}
